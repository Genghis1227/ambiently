// Cloudflare Pages Function: /functions/api/ical.ts
// Proxies and parses public/secret .ics or webcal:// URLs into normalized JSON events

import ICAL from 'ical.js';
import { fetchExternal, externalFetchErrorResponse, refuseOtherSites } from '../_shared/fetchExternal';
import { generateUsHolidayEvents, isGoogleUsHolidaysUrl } from '../_shared/usHolidaysFallback';

interface PagesContext {
  request: Request;
}

const PUBLIC_FEED_CACHE_SECONDS = 6 * 60 * 60; // 6 hours for public feeds (e.g., US Holidays)
const PRIVATE_FEED_CACHE_SECONDS = 15 * 60; // 15 minutes for private/secret .ics feeds (matches Google/iCloud limits)
const FALLBACK_FEED_CACHE_SECONDS = 60 * 60; // 1 hour when serving built-in US Holidays fallback
const STALE_IF_ERROR_SECONDS = 12 * 60 * 60; // 12 hours stale-if-error retention for private & public feeds
const MIN_MANUAL_REFRESH_MS = 60 * 1000; // 60s floor so rapid manual refreshes can't rate-limit a private URL
const DEFAULT_RATE_LIMIT_COOLDOWN_SECONDS = 15 * 60; // 15m server cooldown on HTTP 429
const DEFAULT_SERVER_ERROR_COOLDOWN_SECONDS = 5 * 60; // 5m server cooldown on 5xx / timeout
const MAX_MEMORY_CACHE_ENTRIES = 64;

interface ServerCalendarCacheEntry {
  payload?: string;
  fetchedAt: number;
  freshUntil: number;
  staleUntil: number;
  cooldownUntil?: number;
  cooldownStatus?: number;
  cooldownError?: string;
  etag?: string;
  lastModified?: string;
}

const memoryResponseCache = new Map<string, ServerCalendarCacheEntry>();
const inFlightServerRequests = new Map<string, Promise<{ status: number; body: string }>>();

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getEdgeCache(): Cache | null {
  try {
    const cachesObj = (globalThis as unknown as { caches?: { default?: Cache } }).caches;
    return cachesObj?.default ?? null;
  } catch {
    return null;
  }
}

async function readServerCache(cacheKeyHash: string): Promise<ServerCalendarCacheEntry | null> {
  const nowMs = Date.now();
  const mem = memoryResponseCache.get(cacheKeyHash);
  if (mem) {
    const maxValid = Math.max(mem.staleUntil, mem.cooldownUntil ?? 0);
    if (nowMs < maxValid) {
      return mem;
    }
    memoryResponseCache.delete(cacheKeyHash);
  }

  const edgeCache = getEdgeCache();
  if (!edgeCache) return null;

  try {
    const cacheReq = new Request(`https://ical-cache.ambiently.internal/v2/${cacheKeyHash}`, { method: 'GET' });
    const hit = await edgeCache.match(cacheReq);
    if (!hit) return null;
    const parsed = (await hit.json()) as ServerCalendarCacheEntry;
    if (!parsed || typeof parsed !== 'object') return null;
    const maxValid = Math.max(parsed.staleUntil || 0, parsed.cooldownUntil ?? 0);
    if (nowMs >= maxValid) return null;
    memoryResponseCache.set(cacheKeyHash, parsed);
    return parsed;
  } catch {
    return null;
  }
}

async function writeServerCache(cacheKeyHash: string, entry: ServerCalendarCacheEntry): Promise<void> {
  const nowMs = Date.now();
  const storageTtlSeconds = Math.max(
    60,
    Math.round((Math.max(entry.staleUntil, entry.cooldownUntil ?? 0) - nowMs) / 1000)
  );

  if (memoryResponseCache.has(cacheKeyHash)) {
    memoryResponseCache.delete(cacheKeyHash);
  } else if (memoryResponseCache.size >= MAX_MEMORY_CACHE_ENTRIES) {
    const oldestKey = memoryResponseCache.keys().next().value;
    if (oldestKey !== undefined) memoryResponseCache.delete(oldestKey);
  }
  memoryResponseCache.set(cacheKeyHash, entry);

  const edgeCache = getEdgeCache();
  if (!edgeCache) return;

  try {
    const cacheReq = new Request(`https://ical-cache.ambiently.internal/v2/${cacheKeyHash}`, { method: 'GET' });
    const cacheRes = new Response(JSON.stringify(entry), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${storageTtlSeconds}`,
      },
    });
    await edgeCache.put(cacheReq, cacheRes);
  } catch {
    // Ignore edge cache write failures in non-Cloudflare runtimes
  }
}

function isPublicCalendarFeedUrl(normalizedUrl: string): boolean {
  try {
    const u = new URL(normalizedUrl);
    return /\/public\//i.test(u.pathname);
  } catch {
    return false;
  }
}

function jsonNoStoreResponse(body: string, status: number = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'private, no-store',
    },
  });
}

// Repeating events are generated from their first occurrence, so an old series has to be walked
// forward to reach the display window. This only stops a rule that would otherwise never end.
const MAX_OCCURRENCES_SCANNED = 20000;

function isCancelled(component: any): boolean {
  return String(component.getFirstPropertyValue('status') || '').toUpperCase() === 'CANCELLED';
}

// A feed should define every time zone it names (VTIMEZONE), but some don't. ical.js then treats
// "09:00 in Europe/Berlin" as 09:00 in the server's own zone (UTC on Cloudflare), so the event moves
// by the zone's offset. When the name is a standard IANA zone, work out the real moment instead.
const ianaZoneCache = new Map<string, Intl.DateTimeFormat | null>();

function zoneFormatter(tzid: string): Intl.DateTimeFormat | null {
  if (!ianaZoneCache.has(tzid)) {
    try {
      ianaZoneCache.set(
        tzid,
        new Intl.DateTimeFormat('en-US', {
          timeZone: tzid,
          hourCycle: 'h23',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    } catch {
      ianaZoneCache.set(tzid, null);
    }
  }
  return ianaZoneCache.get(tzid) ?? null;
}

function zoneOffsetMs(instantMs: number, fmt: Intl.DateTimeFormat): number {
  const parts = fmt.formatToParts(new Date(instantMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return wall - instantMs;
}

function wallTimeInZoneToDate(time: any, fmt: Intl.DateTimeFormat): Date {
  const wall = Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second);
  let instant = wall - zoneOffsetMs(wall, fmt);
  // Near a daylight-saving change the offset at the first guess can be the other one
  const second = wall - zoneOffsetMs(instant, fmt);
  if (second !== instant) instant = second;
  return new Date(instant);
}

function tzidOf(component: any, propName: 'dtstart' | 'dtend'): string | null {
  const prop = component?.getFirstProperty?.(propName);
  const tzid = prop?.getParameter?.('tzid');
  return typeof tzid === 'string' && tzid ? tzid : null;
}

function toInstant(time: any, tzid: string | null): Date {
  if (tzid && !time.isDate && time.zone === ICAL.Timezone.localTimezone) {
    const fmt = zoneFormatter(tzid);
    if (fmt) return wallTimeInZoneToDate(time, fmt);
  }
  return time.toJSDate();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const refused = refuseOtherSites(context.request);
  if (refused) return refused;

  const url = new URL(context.request.url);
  const icsUrl = url.searchParams.get('url');
  const forceRefresh = url.searchParams.get('refresh') === '1';

  if (!icsUrl) {
    return jsonNoStoreResponse(JSON.stringify({ error: 'Missing "url" query parameter' }), 400);
  }

  // Normalize webcal:// or webcals:// to https://
  let normalizedUrl = icsUrl.trim();
  if (normalizedUrl.startsWith('webcal://')) {
    normalizedUrl = 'https://' + normalizedUrl.slice(9);
  } else if (normalizedUrl.startsWith('webcals://')) {
    normalizedUrl = 'https://' + normalizedUrl.slice(10);
  }

  const now = new Date();
  const nowMs = now.getTime();
  // 60 days back to 90 days forward
  const rangeStart = new Date(nowMs - 60 * 24 * 60 * 60 * 1000);
  const rangeEnd = new Date(nowMs + 90 * 24 * 60 * 60 * 1000);
  const isUsHolidays = isGoogleUsHolidaysUrl(normalizedUrl);
  const freshTtlSeconds =
    isUsHolidays || isPublicCalendarFeedUrl(normalizedUrl)
      ? PUBLIC_FEED_CACHE_SECONDS
      : PRIVATE_FEED_CACHE_SECONDS;
  const dayBucket = now.toISOString().slice(0, 10);
  const cacheKeyHash = await sha256Hex(`${normalizedUrl}|${dayBucket}`);

  const existingEntry = await readServerCache(cacheKeyHash);
  if (existingEntry) {
    // 1. Active upstream 429/5xx cooldown: never hit the calendar server again until cooldown expires
    if (existingEntry.cooldownUntil && nowMs < existingEntry.cooldownUntil) {
      if (existingEntry.payload && nowMs < existingEntry.staleUntil) {
        return jsonNoStoreResponse(existingEntry.payload, 200);
      }
      const remainingSeconds = Math.max(60, Math.ceil((existingEntry.cooldownUntil - nowMs) / 1000));
      return jsonNoStoreResponse(
        JSON.stringify({
          error:
            existingEntry.cooldownError ||
            'Temporarily rate-limited by the calendar server (HTTP 429). Ambiently will retry automatically.',
          retryAfterSeconds: remainingSeconds,
        }),
        existingEntry.cooldownStatus || 429
      );
    }

    // 2. Fresh cache hit (or manual refresh requested < 60s after last upstream check)
    const recentlyChecked = nowMs - existingEntry.fetchedAt < MIN_MANUAL_REFRESH_MS;
    if (existingEntry.payload && ((!forceRefresh && nowMs < existingEntry.freshUntil) || recentlyChecked)) {
      return jsonNoStoreResponse(existingEntry.payload, 200);
    }
  }

  // 3. Deduplicate concurrent upstream fetches for the same calendar URL on this worker/server
  const inFlight = inFlightServerRequests.get(cacheKeyHash);
  if (inFlight) {
    const shared = await inFlight;
    return jsonNoStoreResponse(shared.body, shared.status);
  }

  const upstreamPromise = (async (): Promise<{ status: number; body: string }> => {
    const reqStartMs = Date.now();

    const serveUsHolidaysFallback = async (): Promise<{ status: number; body: string }> => {
      const fallbackEvents = generateUsHolidayEvents(rangeStart, rangeEnd);
      const payload = JSON.stringify({
        events: fallbackEvents,
        total: fallbackEvents.length,
        fallback: 'builtin-us-holidays',
      });
      await writeServerCache(cacheKeyHash, {
        payload,
        fetchedAt: reqStartMs,
        freshUntil: reqStartMs + FALLBACK_FEED_CACHE_SECONDS * 1000,
        staleUntil: reqStartMs + STALE_IF_ERROR_SECONDS * 1000,
      });
      return { status: 200, body: payload };
    };

    const handleTransientUpstreamFailure = async (
      status: number,
      errorMsg: string,
      retryAfterSec?: number
    ): Promise<{ status: number; body: string }> => {
      const cooldownSec =
        retryAfterSec ??
        (status === 429 ? DEFAULT_RATE_LIMIT_COOLDOWN_SECONDS : DEFAULT_SERVER_ERROR_COOLDOWN_SECONDS);
      const cooldownUntil = reqStartMs + cooldownSec * 1000;

      if (existingEntry?.payload && reqStartMs < existingEntry.staleUntil) {
        // Keep serving stale-if-error events for private/public calendars while enforcing cooldown
        await writeServerCache(cacheKeyHash, {
          ...existingEntry,
          fetchedAt: reqStartMs,
          cooldownUntil,
          cooldownStatus: status,
          cooldownError: errorMsg,
        });
        return { status: 200, body: existingEntry.payload };
      }

      // Cold cache hit rate-limit: persist negative cooldown so remounts/other screens don't pile on
      await writeServerCache(cacheKeyHash, {
        fetchedAt: reqStartMs,
        freshUntil: reqStartMs,
        staleUntil: cooldownUntil,
        cooldownUntil,
        cooldownStatus: status,
        cooldownError: errorMsg,
      });

      return {
        status,
        body: JSON.stringify({
          error: errorMsg,
          retryAfterSeconds: cooldownSec,
        }),
      };
    };

    try {
      const conditionalHeaders: Record<string, string> = {
        'User-Agent': 'Ambiently-Display/1.0 (+https://dashboard.trinhism.com)',
        Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.8',
      };
      if (existingEntry?.payload) {
        if (existingEntry.etag) {
          conditionalHeaders['If-None-Match'] = existingEntry.etag;
        }
        if (existingEntry.lastModified) {
          conditionalHeaders['If-Modified-Since'] = existingEntry.lastModified;
        }
      }

      // Checks the address and every redirect, waits at most 15 seconds and reads at most 15 MB
      const fetchRes = await fetchExternal(normalizedUrl, {
        maxBytes: 15 * 1024 * 1024,
        timeoutMs: 15_000,
        headers: conditionalHeaders,
      });

      // 304 Not Modified: private/public calendar unchanged — renew freshness with 0 bytes parsed
      if (fetchRes.status === 304 && existingEntry?.payload) {
        await writeServerCache(cacheKeyHash, {
          payload: existingEntry.payload,
          fetchedAt: reqStartMs,
          freshUntil: reqStartMs + freshTtlSeconds * 1000,
          staleUntil: reqStartMs + STALE_IF_ERROR_SECONDS * 1000,
          etag: fetchRes.etag || existingEntry.etag,
          lastModified: fetchRes.lastModified || existingEntry.lastModified,
        });
        return { status: 200, body: existingEntry.payload };
      }

      if (!fetchRes.ok) {
        if (isUsHolidays && (fetchRes.status === 429 || fetchRes.status === 403 || fetchRes.status >= 500)) {
          return await serveUsHolidaysFallback();
        }
        if (fetchRes.status === 429) {
          return await handleTransientUpstreamFailure(
            429,
            'Temporarily rate-limited by the calendar server (HTTP 429). Ambiently will retry automatically.',
            fetchRes.retryAfterSeconds
          );
        }
        if (fetchRes.status >= 500) {
          return await handleTransientUpstreamFailure(
            fetchRes.status,
            `The calendar server is temporarily unavailable (HTTP ${fetchRes.status}). Ambiently will retry automatically.`,
            fetchRes.retryAfterSeconds
          );
        }
        return {
          status: fetchRes.status,
          body: JSON.stringify({
            error: `The calendar's server answered ${fetchRes.status}${fetchRes.statusText ? ` ${fetchRes.statusText}` : ''}. Check the link is still the calendar's secret or public iCal address.`,
          }),
        };
      }

      const icsText = fetchRes.text;
      if (!/BEGIN:VCALENDAR/i.test(icsText.slice(0, 4096))) {
        if (isUsHolidays) {
          return await serveUsHolidaysFallback();
        }
        // Usually a calendar's web page pasted instead of its iCal (.ics) address
        return {
          status: 422,
          body: JSON.stringify({ error: "That link didn't return a calendar file. Use the calendar's iCal (.ics) address." }),
        };
      }
      const jcalData = ICAL.parse(icsText);
      const comp = new ICAL.Component(jcalData);
      const vevents = comp.getAllSubcomponents('vevent');

      const parsedEvents: any[] = [];

      // A moved or edited instance of a repeating event is its own VEVENT with the series' UID and a
      // RECURRENCE-ID. Group them so the series can apply them instead of listing them twice.
      const overridesByUid = new Map<string, any[]>();
      const repeatingUids = new Set<string>();
      for (const v of vevents) {
        const uid = v.getFirstPropertyValue('uid');
        if (v.hasProperty('recurrence-id')) {
          overridesByUid.set(uid, [...(overridesByUid.get(uid) || []), v]);
        } else if (v.hasProperty('rrule') || v.hasProperty('rdate')) {
          repeatingUids.add(uid);
        }
      }

      for (const v of vevents) {
        try {
          const uid = v.getFirstPropertyValue('uid');
          const isOverride = v.hasProperty('recurrence-id');

          // Its series reports this one. An override with no series in the feed stays: that is how
          // an invite to a single instance of someone else's repeating event arrives.
          if (isOverride && repeatingUids.has(uid)) continue;
          if (isCancelled(v)) continue;

          // Passing exceptions explicitly stops ical.js applying every override in the file to this
          // event whatever its UID.
          const event = new ICAL.Event(v, { exceptions: isOverride ? [] : overridesByUid.get(uid) || [] });
          if (!event.startDate) continue;

          const isAllDay = Boolean(event.startDate.isDate);

          if (event.isRecurring()) {
            const iter = event.iterator();
            let nextTime: any;
            let scanned = 0;

            while ((nextTime = iter.next()) && scanned < MAX_OCCURRENCES_SCANNED) {
              scanned++;
              // Cheap skip for occurrences long before the window. The year of margin leaves room
              // for an override that moves an old occurrence into it.
              if (nextTime.year < rangeStart.getUTCFullYear() - 1) continue;
              if (nextTime.toJSDate() > rangeEnd) break;

              const occ = event.getOccurrenceDetails(nextTime);
              if (isCancelled(occ.item.component)) continue;

              const startTzid = tzidOf(occ.item.component, 'dtstart') || tzidOf(v, 'dtstart');
              const endTzid = tzidOf(occ.item.component, 'dtend') || startTzid;
              const occStart = toInstant(occ.startDate, startTzid);
              const occEnd = occ.endDate ? toInstant(occ.endDate, endTzid) : occStart;
              const occIsAllDay = Boolean(occ.startDate.isDate);

              // Kept while any part of it is in the window, so a long event that's still going on shows
              if (occEnd >= rangeStart && occStart <= rangeEnd) {
                let startStr: string;
                let endStr: string | null = null;

                if (occIsAllDay) {
                  startStr = `${String(occ.startDate.year).padStart(4, '0')}-${String(occ.startDate.month).padStart(2, '0')}-${String(occ.startDate.day).padStart(2, '0')}T00:00:00`;
                  if (occ.endDate) {
                    endStr = `${String(occ.endDate.year).padStart(4, '0')}-${String(occ.endDate.month).padStart(2, '0')}-${String(occ.endDate.day).padStart(2, '0')}T00:00:00`;
                  }
                } else {
                  startStr = occStart.toISOString();
                  endStr = occ.endDate ? occEnd.toISOString() : null;
                }

                parsedEvents.push({
                  uid: `${event.uid || Math.random().toString()}-${occ.startDate.toICALString()}`,
                  summary: occ.item.summary || event.summary || 'Untitled Event',
                  description: occ.item.description || event.description || '',
                  location: occ.item.location || event.location || '',
                  start: startStr,
                  end: endStr,
                  isAllDay: occIsAllDay,
                });
              }
            }
          } else {
            // Single (non-recurring) event
            const startTzid = tzidOf(v, 'dtstart');
            const evtDate = toInstant(event.startDate, startTzid);
            const evtEnd = event.endDate ? toInstant(event.endDate, tzidOf(v, 'dtend') || startTzid) : evtDate;
            if (evtEnd >= rangeStart && evtDate <= rangeEnd) {
              let startStr: string;
              let endStr: string | null = null;

              if (isAllDay) {
                startStr = `${String(event.startDate.year).padStart(4, '0')}-${String(event.startDate.month).padStart(2, '0')}-${String(event.startDate.day).padStart(2, '0')}T00:00:00`;
                if (event.endDate) {
                  endStr = `${String(event.endDate.year).padStart(4, '0')}-${String(event.endDate.month).padStart(2, '0')}-${String(event.endDate.day).padStart(2, '0')}T00:00:00`;
                }
              } else {
                startStr = evtDate.toISOString();
                endStr = event.endDate ? evtEnd.toISOString() : null;
              }

              parsedEvents.push({
                uid: event.uid || Math.random().toString(),
                summary: event.summary || 'Untitled Event',
                description: event.description || '',
                location: event.location || '',
                start: startStr,
                end: endStr,
                isAllDay,
              });
            }
          }
        } catch {
          // Continue if single event parsing throws
        }
      }

      const payload = JSON.stringify({ events: parsedEvents, total: parsedEvents.length });
      await writeServerCache(cacheKeyHash, {
        payload,
        fetchedAt: reqStartMs,
        freshUntil: reqStartMs + freshTtlSeconds * 1000,
        staleUntil: reqStartMs + STALE_IF_ERROR_SECONDS * 1000,
        etag: fetchRes.etag,
        lastModified: fetchRes.lastModified,
      });

      return { status: 200, body: payload };
    } catch (err: any) {
      if (isUsHolidays) {
        return await serveUsHolidaysFallback();
      }
      const fetchError = externalFetchErrorResponse(err);
      if (fetchError) {
        const status = fetchError.status;
        if (status >= 500) {
          const errJson = (await fetchError.json().catch(() => ({}))) as { error?: string };
          return await handleTransientUpstreamFailure(
            status,
            errJson.error || `The calendar server is temporarily unavailable (HTTP ${status}).`
          );
        }
        return { status, body: await fetchError.text() };
      }
      return {
        status: 500,
        body: JSON.stringify({ error: `Calendar parsing error: ${err.message}` }),
      };
    }
  })().finally(() => {
    inFlightServerRequests.delete(cacheKeyHash);
  });

  inFlightServerRequests.set(cacheKeyHash, upstreamPromise);
  const outcome = await upstreamPromise;
  return jsonNoStoreResponse(outcome.body, outcome.status);
}
