// Client service to fetch and normalize calendar and RSS feeds

export interface CalendarEvent {
  uid: string;
  calendarId: string;
  calendarName: string;
  color: string;
  summary: string;
  description?: string;
  location?: string;
  start: string; // ISO string
  end?: string;  // ISO string
  isAllDay: boolean;
}

export interface CalendarSource {
  id: string;
  name: string;
  url: string; // webcal:// or https:// .ics
  color: string;
  enabled: boolean;
}

export function normalizeCalendarUrl(rawUrl: string): { url: string; warning?: string; isConverted?: boolean } {
  const url = rawUrl.trim();
  if (!url) return { url: '' };

  // Convert webcal:// or webcals:// to https://
  if (url.startsWith('webcal://')) {
    return {
      url: 'https://' + url.slice('webcal://'.length),
      isConverted: true,
    };
  }
  if (url.startsWith('webcals://')) {
    return {
      url: 'https://' + url.slice('webcals://'.length),
      isConverted: true,
    };
  }

  // Detect user pasting Google Calendar web browser URL (u/0/r)
  if (
    url.includes('calendar.google.com/calendar/u/') ||
    (url.includes('calendar.google.com/calendar/r') && !url.includes('.ics'))
  ) {
    return {
      url,
      warning:
        "This is your Google Calendar browser link. In Google Calendar Settings under 'Integrate calendar', copy the 'Secret address in iCal format' (.ics).",
    };
  }

  // Detect Google Calendar embed URL and convert to public iCal feed
  const embedMatch = url.match(/calendar\.google\.com\/calendar\/embed\?.*?src=([^&]+)/);
  if (embedMatch && embedMatch[1]) {
    const calendarId = decodeURIComponent(embedMatch[1]);
    return {
      url: `https://calendar.google.com/calendar/ical/${encodeURIComponent(calendarId)}/public/basic.ics`,
      isConverted: true,
    };
  }

  return { url };
}

function canonicalizeCalendarUrl(rawUrl: string): string {
  return normalizeCalendarUrl(rawUrl).url.trim();
}

// Dual-seed FNV-1a hash so secret private calendar URLs are never stored as plain-text localStorage key names
function hashCalendarKey(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c;
    h2 = Math.imul(h2, 0x811c9dc5);
  }
  return `${(h1 >>> 0).toString(36)}_${(h2 >>> 0).toString(36)}`;
}

export interface RssArticle {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

interface RawCalendarEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end?: string;
  isAllDay: boolean;
}

export const CALENDAR_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes recommended refresh frequency
const MAX_CALENDAR_CACHE_KEYS = 12; // Supports up to 12 distinct multi-canvas Calendar widgets without eviction
const MAX_URL_CACHE_KEYS = 16; // Shared per-URL cache across all canvases, color edits, and feed tests

const memoryCalendarCache = new Map<string, { timestamp: number; events: CalendarEvent[] }>();
const memoryUrlEventCache = new Map<string, { timestamp: number; events: RawCalendarEvent[] }>();

function sortCalendarEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    const parseTime = (dateStr: string, isAllDay?: boolean) => {
      if (isAllDay) {
        const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (match) {
          return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0).getTime();
        }
      }
      return new Date(dateStr).getTime();
    };
    return parseTime(a.start, a.isAllDay) - parseTime(b.start, b.isAllDay);
  });
}

function mapRawEventsToSource(rawEvents: RawCalendarEvent[], src: CalendarSource): CalendarEvent[] {
  return rawEvents.map((e) => ({
    ...e,
    calendarId: src.id,
    calendarName: src.name,
    color: src.color,
  }));
}

function readUrlCache(rawUrl: string): { timestamp: number; events: RawCalendarEvent[] } | null {
  const canonical = canonicalizeCalendarUrl(rawUrl);
  if (!canonical) return null;
  const hash = hashCalendarKey(canonical);

  let entry = memoryUrlEventCache.get(hash);
  if (!entry && typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = localStorage.getItem(`ambiently_cal_url_${hash}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && Array.isArray(parsed.events) && typeof parsed.timestamp === 'number') {
          entry = parsed;
          memoryUrlEventCache.set(hash, parsed);
        }
      }
    } catch {
      // Ignore storage restrictions
    }
  }
  return entry ?? null;
}

function writeUrlCache(rawUrl: string, events: RawCalendarEvent[]): void {
  const canonical = canonicalizeCalendarUrl(rawUrl);
  if (!canonical) return;
  const hash = hashCalendarKey(canonical);
  const entry = { timestamp: Date.now(), events };

  if (memoryUrlEventCache.has(hash)) {
    memoryUrlEventCache.delete(hash);
  } else if (memoryUrlEventCache.size >= MAX_URL_CACHE_KEYS) {
    const oldest = memoryUrlEventCache.keys().next().value;
    if (oldest !== undefined) memoryUrlEventCache.delete(oldest);
  }
  memoryUrlEventCache.set(hash, entry);

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      localStorage.setItem(`ambiently_cal_url_${hash}`, JSON.stringify(entry));
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('ambiently_cal_url_')) {
          const subHash = k.slice('ambiently_cal_url_'.length);
          if (!memoryUrlEventCache.has(subHash)) {
            localStorage.removeItem(k);
          }
        }
      }
    } catch {
      // Storage quota restriction
    }
  }
}

export function getCalendarCacheKey(sources: CalendarSource[]): string {
  const enabled = sources.filter((s) => s.enabled && s.url.trim());
  if (enabled.length === 0) return '';
  const rawKey = enabled
    .map((s) => `${s.id}:${canonicalizeCalendarUrl(s.url)}:${s.name}:${s.color}`)
    .sort()
    .join('|');
  return hashCalendarKey(rawKey);
}

export function getCachedCalendarEvents(
  sources: CalendarSource[]
): { events: CalendarEvent[]; isStale: boolean; lastFetched: number } | null {
  const enabled = sources.filter((s) => s.enabled && s.url.trim());
  const key = getCalendarCacheKey(sources);
  if (!key || enabled.length === 0) return null;

  // 1. Check in-memory combined widget cache
  let cached = memoryCalendarCache.get(key);

  // 2. Fall back to localStorage combined widget cache
  if (!cached && typeof window !== 'undefined' && window.localStorage) {
    try {
      const stored = localStorage.getItem(`ambiently_cal_cache_${key}`);
      if (stored) {
        cached = JSON.parse(stored);
        if (cached && Array.isArray(cached.events)) {
          memoryCalendarCache.set(key, cached);
        } else {
          cached = undefined;
        }
      }
    } catch {
      // Storage quota or privacy restriction
    }
  }

  // 3. Synthesize from shared per-URL caches (prevents re-fetching private calendars across multiple
  //    canvases, after testing/adding a source in Settings, or when changing a calendar's color/name)
  if (!cached) {
    const perSourceEntries = enabled.map((src) => ({ src, urlCache: readUrlCache(src.url) }));
    if (perSourceEntries.every((item) => item.urlCache !== null)) {
      const oldestTimestamp = Math.min(...perSourceEntries.map((item) => item.urlCache!.timestamp));
      const synthesized = sortCalendarEvents(
        perSourceEntries.flatMap((item) => mapRawEventsToSource(item.urlCache!.events, item.src))
      );
      cached = { timestamp: oldestTimestamp, events: synthesized };
      memoryCalendarCache.set(key, cached);
    }
  }

  if (!cached) return null;

  const age = Date.now() - cached.timestamp;
  return {
    events: cached.events,
    isStale: age > CALENDAR_CACHE_TTL_MS,
    lastFetched: cached.timestamp,
  };
}

export function setCachedCalendarEvents(sources: CalendarSource[], events: CalendarEvent[], timestamp?: number): void {
  const key = getCalendarCacheKey(sources);
  if (!key) return;

  const entry = { timestamp: timestamp ?? Date.now(), events };
  if (memoryCalendarCache.has(key)) {
    memoryCalendarCache.delete(key);
  } else if (memoryCalendarCache.size >= MAX_CALENDAR_CACHE_KEYS) {
    const oldestKey = memoryCalendarCache.keys().next().value;
    if (oldestKey !== undefined) memoryCalendarCache.delete(oldestKey);
  }
  memoryCalendarCache.set(key, entry);

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const targetStorageKey = `ambiently_cal_cache_${key}`;
      localStorage.setItem(targetStorageKey, JSON.stringify(entry));
      // Prune stale or legacy unhashed calendar cache keys from localStorage to prevent quota bloat
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('ambiently_cal_cache_')) {
          const subKey = k.slice('ambiently_cal_cache_'.length);
          if (!memoryCalendarCache.has(subKey)) {
            localStorage.removeItem(k);
          }
        }
      }
    } catch {
      // Storage quota restriction
    }
  }
}

/** How the last attempt to read each calendar went, so the tile can say when one can't be read. */
export interface CalendarFeedStatus {
  id: string;
  name: string;
  ok: boolean;
  error?: string;
  status?: number;
  /** True when the failure is temporary (HTTP 429 rate-limit, 5xx, or transient network blip) */
  transient?: boolean;
  /** The site has no calendar service at /api/ical (for example a plain static copy) */
  noService?: boolean;
  lastSuccessAt?: number;
}

const feedStatuses = new Map<string, CalendarFeedStatus>();
// Keyed by canonical URL so rate-limit backoff protects private calendars across all widgets & canvases
const urlBackoffState = new Map<string, { until: number; strikes: number }>();
const FEED_OK_KEY = 'ambiently_cal_ok_';
const BASE_RATE_LIMIT_BACKOFF_MS = 15 * 60 * 1000; // 15m -> 30m -> 60m exponential cooldown on HTTP 429
const MAX_RATE_LIMIT_BACKOFF_MS = 60 * 60 * 1000; // 60m cap
const BASE_TRANSIENT_BACKOFF_MS = 5 * 60 * 1000; // 5m -> 10m -> 30m exponential cooldown on 5xx / network error
const MAX_TRANSIENT_BACKOFF_MS = 30 * 60 * 1000; // 30m cap
const TRANSIENT_FEED_GRACE_MS = 12 * 60 * 60 * 1000; // Suppress transient warning banner if synced within 12h

function readLastSuccess(urlHash: string, legacySourceId: string): number | undefined {
  try {
    const raw = localStorage.getItem(FEED_OK_KEY + urlHash) ?? localStorage.getItem(FEED_OK_KEY + legacySourceId);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : undefined;
  } catch {
    return undefined;
  }
}

type CalendarRequestResult =
  | { ok: true; events: RawCalendarEvent[] }
  | {
      ok: false;
      error: string;
      status?: number;
      transient?: boolean;
      retryAfterSeconds?: number;
      noService?: boolean;
    };

function recordUrlBackoff(canonicalUrl: string, result: CalendarRequestResult): void {
  if (!canonicalUrl) return;
  if (result.ok) {
    urlBackoffState.delete(canonicalUrl);
    return;
  }
  const prevStrikes = urlBackoffState.get(canonicalUrl)?.strikes ?? 0;
  const strikes = prevStrikes + 1;
  const jitterMs = Math.floor(Math.random() * 30_000);

  if (result.status === 429) {
    const expMs = Math.min(MAX_RATE_LIMIT_BACKOFF_MS, BASE_RATE_LIMIT_BACKOFF_MS * Math.pow(2, strikes - 1));
    const retryHeaderMs = result.retryAfterSeconds ? result.retryAfterSeconds * 1000 : 0;
    urlBackoffState.set(canonicalUrl, {
      until: Date.now() + Math.max(expMs, retryHeaderMs) + jitterMs,
      strikes,
    });
  } else if (result.transient) {
    const expMs = Math.min(MAX_TRANSIENT_BACKOFF_MS, BASE_TRANSIENT_BACKOFF_MS * Math.pow(2, strikes - 1));
    const retryHeaderMs = result.retryAfterSeconds ? result.retryAfterSeconds * 1000 : 0;
    urlBackoffState.set(canonicalUrl, {
      until: Date.now() + Math.max(expMs, retryHeaderMs) + jitterMs,
      strikes,
    });
  }
}

function recordFeedStatus(src: CalendarSource, result: CalendarRequestResult) {
  const canonicalUrl = canonicalizeCalendarUrl(src.url);
  const urlHash = hashCalendarKey(canonicalUrl);
  recordUrlBackoff(canonicalUrl, result);

  if (result.ok) {
    const now = Date.now();
    feedStatuses.set(src.id, { id: src.id, name: src.name, ok: true, lastSuccessAt: now });
    try {
      localStorage.setItem(FEED_OK_KEY + urlHash, String(now));
    } catch {
      // Storage full or blocked
    }
  } else {
    feedStatuses.set(src.id, {
      id: src.id,
      name: src.name,
      ok: false,
      error: result.error,
      status: result.status,
      transient: result.transient,
      noService: result.noService,
      lastSuccessAt: feedStatuses.get(src.id)?.lastSuccessAt ?? readLastSuccess(urlHash, src.id),
    });
  }
}

export function getCalendarFeedStatuses(sources: CalendarSource[]): CalendarFeedStatus[] {
  return sources
    .filter((s) => s.enabled && s.url.trim())
    .map((s) => feedStatuses.get(s.id))
    .filter((s): s is CalendarFeedStatus => Boolean(s));
}

/**
 * Returns feed problems that warrant an on-screen warning banner.
 * Transient rate-limits (HTTP 429) or brief server/network blips stay quiet while recent cached
 * events are still fresh (< 12h), whereas permanent link errors (401/403/404/422) surface immediately.
 */
export function getVisibleCalendarFeedProblems(sources: CalendarSource[]): CalendarFeedStatus[] {
  const now = Date.now();
  return getCalendarFeedStatuses(sources).filter((f) => {
    if (f.ok) return false;
    if (f.transient && f.lastSuccessAt && now - f.lastSuccessAt < TRANSIENT_FEED_GRACE_MS) {
      return false;
    }
    return true;
  });
}

const NO_SERVICE_MESSAGE =
  "This copy of Ambiently has no calendar service, so it can't read calendars. Host it on Cloudflare Pages or with the Docker image (see the README).";

const inFlightCalendarRequests = new Map<string, Promise<CalendarRequestResult>>();

/**
 * Validates a calendar URL when adding it in Settings and seeds the shared per-URL cache so saving
 * the widget renders immediately without a duplicate upstream fetch.
 */
export async function testCalendarFeed(url: string): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const existing = readUrlCache(url);
  if (existing && Date.now() - existing.timestamp <= CALENDAR_CACHE_TTL_MS) {
    return { ok: true, count: existing.events.length };
  }
  const result = await requestCalendar(url, false);
  return result.ok ? { ok: true, count: result.events.length } : { ok: false, error: result.error };
}

async function requestCalendar(url: string, bypassServerCache: boolean = false): Promise<CalendarRequestResult> {
  const canonical = canonicalizeCalendarUrl(url);
  const dedupeKey = `${canonical}|${bypassServerCache ? '1' : '0'}`;
  const existing = inFlightCalendarRequests.get(dedupeKey);
  if (existing) return existing;

  const promise = (async (): Promise<CalendarRequestResult> => {
    try {
      const qs = `url=${encodeURIComponent(canonical)}${bypassServerCache ? '&refresh=1' : ''}`;
      let res = await fetch(`/api/ical?${qs}`);
      if (res.status === 404) {
        res = await fetch(`/functions/api/ical?${qs}`);
      }
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        // A static host answers every unknown path with the app's own page
        return { ok: false, error: NO_SERVICE_MESSAGE, noService: true };
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const isTransient = res.status === 429 || res.status >= 500;
        const defaultMsg =
          res.status === 429
            ? 'Temporarily rate-limited by the calendar server (HTTP 429). Ambiently will retry automatically.'
            : `The calendar service answered ${res.status}.`;
        return {
          ok: false,
          status: res.status,
          transient: isTransient,
          retryAfterSeconds: typeof data?.retryAfterSeconds === 'number' ? data.retryAfterSeconds : undefined,
          error: typeof data?.error === 'string' ? data.error : defaultMsg,
        };
      }
      const events: RawCalendarEvent[] = Array.isArray(data?.events) ? data.events : [];
      writeUrlCache(canonical, events);
      try {
        localStorage.setItem(FEED_OK_KEY + hashCalendarKey(canonical), String(Date.now()));
      } catch {
        // Ignore storage restrictions
      }
      return { ok: true, events };
    } catch {
      return {
        ok: false,
        transient: true,
        error: "Couldn't reach the calendar service. Check this screen's internet connection.",
      };
    }
  })().finally(() => {
    inFlightCalendarRequests.delete(dedupeKey);
  });

  inFlightCalendarRequests.set(dedupeKey, promise);
  return promise;
}

export async function fetchCalendarEvents(
  sources: CalendarSource[],
  forceRefresh: boolean = false,
  manualRefresh: boolean = false
): Promise<CalendarEvent[]> {
  const enabledSources = sources.filter((s) => s.enabled && s.url.trim());
  if (enabledSources.length === 0) return [];

  // Check cache unless forced on-demand or background stale revalidation
  if (!forceRefresh && !manualRefresh) {
    const cached = getCachedCalendarEvents(sources);
    if (cached && !cached.isStale) {
      return cached.events;
    }
  }

  // If a calendar can't be reached, keep what we last got from it instead of blanking it.
  const previousEvents = getCachedCalendarEvents(sources)?.events ?? [];
  const now = Date.now();

  const promises = enabledSources.map(async (src) => {
    const canonicalUrl = canonicalizeCalendarUrl(src.url);
    const urlCached = readUrlCache(canonicalUrl);

    const lastKnown = () => ({
      fetched: false,
      timestamp: urlCached?.timestamp ?? now,
      events: urlCached
        ? mapRawEventsToSource(urlCached.events, src)
        : previousEvents.filter((e) => e.calendarId === src.id),
    });

    // If another canvas or Settings check already refreshed this URL within the last 15 minutes,
    // reuse it instead of hitting the private calendar server again!
    if (!manualRefresh && urlCached && now - urlCached.timestamp <= CALENDAR_CACHE_TTL_MS) {
      feedStatuses.set(src.id, { id: src.id, name: src.name, ok: true, lastSuccessAt: urlCached.timestamp });
      return {
        fetched: true,
        timestamp: urlCached.timestamp,
        events: mapRawEventsToSource(urlCached.events, src),
      };
    }

    const backoff = urlBackoffState.get(canonicalUrl);
    if (!manualRefresh && backoff && now < backoff.until) {
      // Respect shared per-URL cooldown across all widgets and 30s canvas carousel rotations
      return lastKnown();
    }

    const result = await requestCalendar(canonicalUrl, manualRefresh);
    recordFeedStatus(src, result);
    if (!result.ok) {
      console.warn(`Failed to fetch calendar ${src.name}: ${result.error}`);
      return lastKnown();
    }
    const freshTimestamp = readUrlCache(canonicalUrl)?.timestamp ?? Date.now();
    return {
      fetched: true,
      timestamp: freshTimestamp,
      events: mapRawEventsToSource(result.events, src),
    };
  });

  const results = await Promise.all(promises);
  const flattened: CalendarEvent[] = results.flatMap((r) => r.events);
  const sorted = sortCalendarEvents(flattened);

  // Update memory and localStorage cache using the oldest fetched source timestamp so staleness stays exact.
  if (results.some((r) => r.fetched)) {
    const fetchedTimestamps = results.filter((r) => r.fetched).map((r) => r.timestamp);
    const effectiveTimestamp = fetchedTimestamps.length > 0 ? Math.min(...fetchedTimestamps) : Date.now();
    setCachedCalendarEvents(sources, sorted, effectiveTimestamp);
  }

  return sorted;
}

const RSS_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_RSS_CACHE_KEYS = 5;
const memoryRssCache = new Map<string, { timestamp: number; title: string; items: RssArticle[] }>();

function getRssCacheKey(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash << 5) - hash + url.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export async function fetchRssFeed(
  feedUrl: string,
  forceRefresh: boolean = false
): Promise<{ title: string; items: RssArticle[] }> {
  if (!feedUrl || !feedUrl.trim()) return { title: '', items: [] };

  let normalized = feedUrl.trim();
  if (normalized.startsWith('http://')) {
    normalized = 'https://' + normalized.slice(7);
  }

  const key = getRssCacheKey(normalized);
  let cached = memoryRssCache.get(key);
  if (!cached && typeof window !== 'undefined' && window.localStorage) {
    try {
      const raw = localStorage.getItem(`ambiently_rss_cache_${key}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.items)) {
          cached = parsed;
          memoryRssCache.set(key, parsed);
        }
      }
    } catch {
      // ignore storage errors
    }
  }

  if (!forceRefresh && cached && Date.now() - cached.timestamp <= RSS_CACHE_TTL_MS) {
    return { title: cached.title, items: cached.items };
  }

  try {
    let res = await fetch(`/api/rss?url=${encodeURIComponent(normalized)}`);
    if (res.status === 404) {
      res = await fetch(`/functions/api/rss?url=${encodeURIComponent(normalized)}`);
    }
    if (!res.ok) return cached ? { title: cached.title, items: cached.items } : { title: '', items: [] };
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('application/json')) {
      return cached ? { title: cached.title, items: cached.items } : { title: '', items: [] };
    }
    const data = await res.json();
    const result = {
      title: data.title || '',
      items: Array.isArray(data.items) ? data.items : [],
    };

    if (result.items.length > 0) {
      const entry = { timestamp: Date.now(), ...result };
      if (memoryRssCache.has(key)) {
        memoryRssCache.delete(key);
      } else if (memoryRssCache.size >= MAX_RSS_CACHE_KEYS) {
        const oldestKey = memoryRssCache.keys().next().value;
        if (oldestKey !== undefined) memoryRssCache.delete(oldestKey);
      }
      memoryRssCache.set(key, entry);

      if (typeof window !== 'undefined' && window.localStorage) {
        try {
          localStorage.setItem(`ambiently_rss_cache_${key}`, JSON.stringify(entry));
          for (let i = localStorage.length - 1; i >= 0; i--) {
            const k = localStorage.key(i);
            if (k && k.startsWith('ambiently_rss_cache_')) {
              const subKey = k.slice('ambiently_rss_cache_'.length);
              if (!memoryRssCache.has(subKey)) {
                localStorage.removeItem(k);
              }
            }
          }
        } catch {
          // ignore storage errors
        }
      }
    }

    return result;
  } catch (err) {
    console.warn('Failed to fetch RSS feed:', err);
    return cached ? { title: cached.title, items: cached.items } : { title: '', items: [] };
  }
}
