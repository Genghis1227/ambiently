// Cloudflare Pages Function: /functions/api/ical.ts
// Proxies and parses public/secret .ics or webcal:// URLs into normalized JSON events

import ICAL from 'ical.js';

interface PagesContext {
  request: Request;
}

// Repeating events are generated from their first occurrence, so an old series has to be walked
// forward to reach the display window. This only stops a rule that would otherwise never end.
const MAX_OCCURRENCES_SCANNED = 20000;

function isCancelled(component: any): boolean {
  return String(component.getFirstPropertyValue('status') || '').toUpperCase() === 'CANCELLED';
}

function isSafeExternalHttpsUrl(rawUrl: string): { valid: boolean; url?: URL; reason?: string } {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') {
      return { valid: false, reason: 'Only HTTPS calendar URLs are permitted.' };
    }
    const host = parsed.hostname.toLowerCase();
    // Block localhost, loopback, link-local, metadata, and RFC1918 private networks
    if (
      host === 'localhost' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host === '0.0.0.0' ||
      host === '[::1]' ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return { valid: false, reason: 'Private or internal network addresses are forbidden.' };
    }
    return { valid: true, url: parsed };
  } catch {
    return { valid: false, reason: 'Malformed URL.' };
  }
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
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

  const safetyCheck = isSafeExternalHttpsUrl(normalizedUrl);
  if (!safetyCheck.valid) {
    return new Response(JSON.stringify({ error: safetyCheck.reason || 'Invalid calendar URL' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    });
  }

  try {
    const fetchRes = await fetch(normalizedUrl, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Ambiently-Display/1.0 (+https://dashboard.trinhism.com)',
        Accept: 'text/calendar, text/plain, */*',
      },
    });

    if (!fetchRes.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch calendar feed: ${fetchRes.statusText}` }),
        { status: fetchRes.status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } }
      );
    }

    const icsText = await fetchRes.text();
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

            const occStart = occ.startDate.toJSDate();
            const occIsAllDay = Boolean(occ.startDate.isDate);

            if (occStart >= rangeStart && occStart <= rangeEnd) {
              let startStr: string;
              let endStr: string | null = null;

              if (occIsAllDay) {
                startStr = `${String(occ.startDate.year).padStart(4, '0')}-${String(occ.startDate.month).padStart(2, '0')}-${String(occ.startDate.day).padStart(2, '0')}T00:00:00`;
                if (occ.endDate) {
                  endStr = `${String(occ.endDate.year).padStart(4, '0')}-${String(occ.endDate.month).padStart(2, '0')}-${String(occ.endDate.day).padStart(2, '0')}T00:00:00`;
                }
              } else {
                startStr = occStart.toISOString();
                endStr = occ.endDate ? occ.endDate.toJSDate().toISOString() : null;
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
          const evtDate = event.startDate.toJSDate();
          if (evtDate >= rangeStart && evtDate <= rangeEnd) {
            let startStr: string;
            let endStr: string | null = null;

            if (isAllDay) {
              startStr = `${String(event.startDate.year).padStart(4, '0')}-${String(event.startDate.month).padStart(2, '0')}-${String(event.startDate.day).padStart(2, '0')}T00:00:00`;
              if (event.endDate) {
                endStr = `${String(event.endDate.year).padStart(4, '0')}-${String(event.endDate.month).padStart(2, '0')}-${String(event.endDate.day).padStart(2, '0')}T00:00:00`;
              }
            } else {
              startStr = evtDate.toISOString();
              endStr = event.endDate ? event.endDate.toJSDate().toISOString() : null;
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
    return new Response(
      JSON.stringify({ error: `Calendar parsing error: ${err.message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } }
    );
  }
}
