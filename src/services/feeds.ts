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
  let url = rawUrl.trim();
  if (!url) return { url: '' };

  // Convert webcal:// to https://
  if (url.startsWith('webcal://')) {
    return {
      url: 'https://' + url.slice('webcal://'.length),
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

export interface RssArticle {
  id: string;
  title: string;
  link: string;
  pubDate: string;
  description: string;
}

export const CALENDAR_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes recommended refresh frequency
const memoryCalendarCache = new Map<string, { timestamp: number; events: CalendarEvent[] }>();

export function getCalendarCacheKey(sources: CalendarSource[]): string {
  const enabled = sources.filter((s) => s.enabled && s.url.trim());
  return enabled.map((s) => `${s.id}:${s.url.trim()}:${s.color}`).sort().join('|');
}

export function getCachedCalendarEvents(sources: CalendarSource[]): { events: CalendarEvent[]; isStale: boolean; lastFetched: number } | null {
  const key = getCalendarCacheKey(sources);
  if (!key) return null;

  // 1. Check in-memory cache
  let cached = memoryCalendarCache.get(key);

  // 2. Fall back to localStorage
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

  if (!cached) return null;

  const age = Date.now() - cached.timestamp;
  return {
    events: cached.events,
    isStale: age > CALENDAR_CACHE_TTL_MS,
    lastFetched: cached.timestamp,
  };
}

const MAX_CALENDAR_CACHE_KEYS = 3;

export function setCachedCalendarEvents(sources: CalendarSource[], events: CalendarEvent[]): void {
  const key = getCalendarCacheKey(sources);
  if (!key) return;

  const entry = { timestamp: Date.now(), events };
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
      // Prune stale calendar cache keys from localStorage to prevent quota bloat
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

export async function fetchCalendarEvents(sources: CalendarSource[], forceRefresh: boolean = false): Promise<CalendarEvent[]> {
  const enabledSources = sources.filter((s) => s.enabled && s.url.trim());
  if (enabledSources.length === 0) return [];

  // Check cache unless forced on-demand refresh
  if (!forceRefresh) {
    const cached = getCachedCalendarEvents(sources);
    if (cached && !cached.isStale) {
      return cached.events;
    }
  }

  // If a calendar can't be reached, keep what we last got from it instead of blanking it.
  const previousEvents = getCachedCalendarEvents(sources)?.events ?? [];

  const promises = enabledSources.map(async (src) => {
    const lastKnown = () => ({
      fetched: false,
      events: previousEvents.filter((e) => e.calendarId === src.id),
    });

    try {
      let res = await fetch(`/api/ical?url=${encodeURIComponent(src.url.trim())}`);
      if (res.status === 404) {
        res = await fetch(`/functions/api/ical?url=${encodeURIComponent(src.url.trim())}`);
      }
      if (!res.ok) return lastKnown();
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) return lastKnown();
      const data = await res.json();
      return {
        fetched: true,
        events: (data.events || []).map((e: any) => ({
          ...e,
          calendarId: src.id,
          calendarName: src.name,
          color: src.color,
        })) as CalendarEvent[],
      };
    } catch (err) {
      console.warn(`Failed to fetch calendar ${src.name}:`, err);
      return lastKnown();
    }
  });

  const results = await Promise.all(promises);
  const flattened: CalendarEvent[] = results.flatMap((r) => r.events);

  // Sort chronologically (accounting for all-day date strings)
  const sorted = flattened.sort((a, b) => {
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

  // Update memory and localStorage cache. If every calendar failed, leave it alone so its age stays
  // accurate and the next load retries.
  if (results.some((r) => r.fetched)) {
    setCachedCalendarEvents(sources, sorted);
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
