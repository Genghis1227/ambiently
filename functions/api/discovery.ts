// Cloudflare Pages Function: /functions/api/discovery.ts
// Zero-API-key Wikimedia "On This Day" history feed proxy with curated offline fallback

import {
  fetchExternal,
  refuseOtherSites,
} from '../_shared/fetchExternal';
import type {
  DailyDiscoveryApiPayload,
  DiscoveryHistoryEvent,
} from '../../src/types/phase3Widgets';
import { getFallbackHistoryEventsForDate } from '../../src/utils/dailyDiscoveryData';

interface PagesContext {
  request: Request;
}

const ALLOWED_DISCOVERY_HOSTS = ['api.wikimedia.org', 'en.wikipedia.org'];
const DISCOVERY_HEADERS = {
  'User-Agent': 'Ambiently-Display/1.0 (+https://dashboard.trinhism.com)',
  Accept: 'application/json',
};

const DISCOVERY_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_DISCOVERY_CACHE = 48;

interface CachedDiscoveryEntry {
  events: DiscoveryHistoryEvent[];
  expiresAt: number;
}

const discoveryCache = new Map<string, CachedDiscoveryEntry>();

function sanitizeWikipediaPageUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === 'en.wikipedia.org') {
      return parsed.toString();
    }
  } catch {
    // Ignore malformed URLs
  }
  return undefined;
}

function sanitizeWikimediaThumbnailUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  try {
    const parsed = new URL(raw.trim());
    if (parsed.protocol === 'https:' && parsed.hostname.toLowerCase() === 'upload.wikimedia.org') {
      return parsed.toString();
    }
  } catch {
    // Ignore malformed URLs
  }
  return undefined;
}

export function parseWikimediaOnThisDayPayload(payload: any): DiscoveryHistoryEvent[] {
  const sourceList =
    Array.isArray(payload?.selected) && payload.selected.length > 0
      ? payload.selected
      : Array.isArray(payload?.events)
        ? payload.events
        : [];

  const events: DiscoveryHistoryEvent[] = [];
  const seen = new Set<string>();

  for (const item of sourceList) {
    if (!item || typeof item !== 'object') continue;
    const year = Number(item.year);
    const text = typeof item.text === 'string' ? item.text.trim() : '';
    if (!Number.isInteger(year) || year <= 0 || !text) continue;

    const dedupeKey = `${year}:${text}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const firstPage = Array.isArray(item.pages) ? item.pages[0] : undefined;
    const rawTitle = firstPage?.titles?.normalized || firstPage?.title;
    const articleTitle =
      typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim() : undefined;
    const articleUrl = sanitizeWikipediaPageUrl(firstPage?.content_urls?.desktop?.page);
    const thumbnailUrl = sanitizeWikimediaThumbnailUrl(firstPage?.thumbnail?.source);

    events.push({
      year,
      text,
      ...(articleTitle ? { articleTitle } : {}),
      ...(articleUrl ? { articleUrl } : {}),
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
    });

    if (events.length >= 12) break;
  }

  return events;
}

function parseMonthDayParams(url: URL, now: Date): { month: number; day: number } | null {
  const rawMonth = url.searchParams.get('month');
  const rawDay = url.searchParams.get('day');

  const month = rawMonth === null ? now.getMonth() + 1 : Number(rawMonth);
  const day = rawDay === null ? now.getDate() : Number(rawDay);

  if (
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12 ||
    !Number.isInteger(day) ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }

  const maxDaysInMonth = month === 2 ? 29 : [4, 6, 9, 11].includes(month) ? 30 : 31;
  if (day > maxDaysInMonth) return null;

  return { month, day };
}

function setCachedDiscovery(key: string, events: DiscoveryHistoryEvent[], expiresAt: number): void {
  if (discoveryCache.has(key)) {
    discoveryCache.delete(key);
  } else if (discoveryCache.size >= MAX_DISCOVERY_CACHE) {
    const oldestKey = discoveryCache.keys().next().value;
    if (oldestKey !== undefined) discoveryCache.delete(oldestKey);
  }
  discoveryCache.set(key, { events, expiresAt });
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const refused = refuseOtherSites(context.request);
  if (refused) return refused;

  const url = new URL(context.request.url);
  const now = new Date();
  const parsedDate = parseMonthDayParams(url, now);

  if (!parsedDate) {
    return new Response(JSON.stringify({ error: 'Invalid month or day parameter.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { month, day } = parsedDate;
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const cacheKey = `${mm}-${dd}`;
  const nowMs = now.getTime();

  const cached = discoveryCache.get(cacheKey);
  if (cached && cached.expiresAt > nowMs && cached.events.length > 0) {
    const body: DailyDiscoveryApiPayload = {
      month,
      day,
      source: 'wikimedia',
      events: cached.events,
      updatedAt: new Date(nowMs).toISOString(),
    };
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  const upstreamUrls = [
    `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/selected/${mm}/${dd}`,
    `https://en.wikipedia.org/api/rest_v1/feed/onthisday/selected/${mm}/${dd}`,
  ];

  for (const targetUrl of upstreamUrls) {
    try {
      const res = await fetchExternal(targetUrl, {
        maxBytes: 2 * 1024 * 1024,
        timeoutMs: 8000,
        allowedHosts: ALLOWED_DISCOVERY_HOSTS,
        headers: DISCOVERY_HEADERS,
      });
      if (!res.ok) continue;
      const payload = JSON.parse(res.text);
      const events = parseWikimediaOnThisDayPayload(payload);
      if (events.length > 0) {
        setCachedDiscovery(cacheKey, events, nowMs + DISCOVERY_CACHE_TTL_MS);
        const body: DailyDiscoveryApiPayload = {
          month,
          day,
          source: 'wikimedia',
          events,
          updatedAt: new Date(nowMs).toISOString(),
        };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600',
          },
        });
      }
    } catch {
      // Fall through to next endpoint or curated offline fallback pack
    }
  }

  const fallbackBody: DailyDiscoveryApiPayload = {
    month,
    day,
    source: 'fallback',
    events: getFallbackHistoryEventsForDate(month, day),
    updatedAt: new Date(nowMs).toISOString(),
  };

  return new Response(JSON.stringify(fallbackBody), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
