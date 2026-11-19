import type {
  DailyDiscoveryApiPayload,
  DiscoveryHistoryEvent,
} from '../types/phase3Widgets';
import { getFallbackHistoryEventsForDate } from '../utils/dailyDiscoveryData';

const DISCOVERY_CACHE_STORAGE_KEY = 'ambiently_daily_discovery_cache_v1';
const MAX_CACHED_DAYS = 14;
const FRESH_CACHE_MS = 12 * 60 * 60 * 1000;

interface StoredDiscoveryEntry {
  events: DiscoveryHistoryEvent[];
  source: 'wikimedia' | 'fallback';
  savedAtMs: number;
}

const memoryDiscoveryCache = new Map<string, StoredDiscoveryEntry>();
let hydratedFromStorage = false;

function dateKey(month: number, day: number): string {
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function hydrateCacheFromStorage(): void {
  if (hydratedFromStorage) return;
  hydratedFromStorage = true;
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(DISCOVERY_CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, StoredDiscoveryEntry>;
    if (!parsed || typeof parsed !== 'object') return;
    const entries = Object.entries(parsed)
      .filter(
        ([, entry]) =>
          entry &&
          Array.isArray(entry.events) &&
          entry.events.length > 0 &&
          typeof entry.savedAtMs === 'number'
      )
      .slice(-MAX_CACHED_DAYS);
    for (const [k, entry] of entries) {
      memoryDiscoveryCache.set(k, entry);
    }
  } catch {
    // Ignore storage corruption
  }
}

function persistCacheToStorage(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const serialized: Record<string, StoredDiscoveryEntry> = {};
    for (const [k, entry] of memoryDiscoveryCache.entries()) {
      serialized[k] = entry;
    }
    localStorage.setItem(DISCOVERY_CACHE_STORAGE_KEY, JSON.stringify(serialized));
  } catch {
    // Ignore quota errors
  }
}

function saveDiscoveryCache(
  key: string,
  events: DiscoveryHistoryEvent[],
  source: 'wikimedia' | 'fallback',
  savedAtMs: number
): void {
  hydrateCacheFromStorage();
  if (memoryDiscoveryCache.has(key)) {
    memoryDiscoveryCache.delete(key);
  } else if (memoryDiscoveryCache.size >= MAX_CACHED_DAYS) {
    const oldest = memoryDiscoveryCache.keys().next().value;
    if (oldest) memoryDiscoveryCache.delete(oldest);
  }
  memoryDiscoveryCache.set(key, { events, source, savedAtMs });
  persistCacheToStorage();
}

export async function fetchOnThisDayEvents(
  month: number,
  day: number,
  signal?: AbortSignal
): Promise<{
  events: DiscoveryHistoryEvent[];
  source: 'wikimedia' | 'fallback';
  isStaleCache: boolean;
}> {
  hydrateCacheFromStorage();
  const key = dateKey(month, day);
  const nowMs = Date.now();
  const cached = memoryDiscoveryCache.get(key);

  if (cached && cached.source === 'wikimedia' && nowMs - cached.savedAtMs < FRESH_CACHE_MS) {
    return {
      events: cached.events,
      source: 'wikimedia',
      isStaleCache: false,
    };
  }

  try {
    const res = await fetch(`/api/discovery?month=${month}&day=${day}`, { signal });
    if (!res.ok) {
      throw new Error(`Discovery API returned HTTP ${res.status}`);
    }
    const payload = (await res.json()) as Partial<DailyDiscoveryApiPayload>;
    const events = Array.isArray(payload?.events) ? payload.events : [];
    const source: 'wikimedia' | 'fallback' =
      payload?.source === 'wikimedia' ? 'wikimedia' : 'fallback';

    if (events.length > 0) {
      if (source === 'wikimedia') {
        saveDiscoveryCache(key, events, 'wikimedia', nowMs);
      }
      return { events, source, isStaleCache: false };
    }
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
  }

  if (cached && cached.events.length > 0) {
    return {
      events: cached.events,
      source: cached.source,
      isStaleCache: true,
    };
  }

  return {
    events: getFallbackHistoryEventsForDate(month, day),
    source: 'fallback',
    isStaleCache: false,
  };
}
