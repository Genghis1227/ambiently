// Cloudflare Pages Function: /functions/api/ical.ts
// Proxies and parses public/secret .ics or webcal:// URLs into normalized JSON events

import ICAL from 'ical.js';

interface PagesContext {
  request: Request;
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const url = new URL(context.request.url);
  const icsUrl = url.searchParams.get('url');

  if (!icsUrl) {
    return new Response(JSON.stringify({ error: 'Missing "url" query parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
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
    const fetchRes = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'Ambiently-Display/1.0 (+https://dashboard.trinhism.com)',
        Accept: 'text/calendar, text/plain, */*',
      },
    });

    if (!fetchRes.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch calendar feed: ${fetchRes.statusText}` }),
        { status: fetchRes.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
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

    for (const v of vevents) {
      try {
        const event = new ICAL.Event(v);
        if (!event.startDate) continue;

        const isAllDay = Boolean(event.startDate.isDate);

        if (event.isRecurring()) {
          const iter = event.iterator();
          let nextTime: any;
          let count = 0;
          const maxIterations = 300;

          while ((nextTime = iter.next()) && count < maxIterations) {
            count++;
            const occ = event.getOccurrenceDetails(nextTime);
            const occStart = occ.startDate.toJSDate();

            if (occStart > rangeEnd) {
              break;
            }

            if (occStart >= rangeStart) {
              let startStr: string;
              let endStr: string | null = null;

              if (isAllDay) {
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
                summary: event.summary || 'Untitled Event',
                description: event.description || '',
                location: event.location || '',
                start: startStr,
                end: endStr,
                isAllDay,
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
        'Cache-Control': 'public, max-age=300', // 5-minute edge cache
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: `Calendar parsing error: ${err.message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }
}
