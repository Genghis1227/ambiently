// Cloudflare Pages Function: /functions/api/ical.ts
// Proxies and parses public/secret .ics or webcal:// URLs into normalized JSON events

import ICAL from 'ical.js';
import { fetchExternal, externalFetchErrorResponse, refuseOtherSites } from '../_shared/fetchExternal';

interface PagesContext {
  request: Request;
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

  if (!icsUrl) {
    return new Response(JSON.stringify({ error: 'Missing "url" query parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    });
  }

  // Normalize webcal:// or webcals:// to https://
  let normalizedUrl = icsUrl.trim();
  if (normalizedUrl.startsWith('webcal://')) {
    normalizedUrl = 'https://' + normalizedUrl.slice(9);
  } else if (normalizedUrl.startsWith('webcals://')) {
    normalizedUrl = 'https://' + normalizedUrl.slice(10);
  }

  try {
    // Checks the address and every redirect, waits at most 15 seconds and reads at most 15 MB
    const fetchRes = await fetchExternal(normalizedUrl, {
      maxBytes: 15 * 1024 * 1024,
      timeoutMs: 15_000,
      headers: {
        'User-Agent': 'Ambiently-Display/1.0 (+https://dashboard.trinhism.com)',
        Accept: 'text/calendar, text/plain, */*',
      },
    });

    if (!fetchRes.ok) {
      return new Response(
        JSON.stringify({
          error: `The calendar's server answered ${fetchRes.status}${fetchRes.statusText ? ` ${fetchRes.statusText}` : ''}. Check the link is still the calendar's secret or public iCal address.`,
        }),
        { status: fetchRes.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } }
      );
    }

    const icsText = fetchRes.text;
    if (!/BEGIN:VCALENDAR/i.test(icsText.slice(0, 4096))) {
      // Usually a calendar's web page pasted instead of its iCal (.ics) address
      return new Response(
        JSON.stringify({ error: "That link didn't return a calendar file. Use the calendar's iCal (.ics) address." }),
        { status: 422, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } }
      );
    }
    const jcalData = ICAL.parse(icsText);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');

    const now = new Date();
    // 60 days back to 90 days forward
    const rangeStart = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
    const rangeEnd = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

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

    return new Response(JSON.stringify({ events: parsedEvents, total: parsedEvents.length }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err: any) {
    const fetchError = externalFetchErrorResponse(err);
    if (fetchError) return fetchError;
    return new Response(
      JSON.stringify({ error: `Calendar parsing error: ${err.message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } }
    );
  }
}
