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

    const parsedEvents = vevents.map((v: any) => {
      const event = new ICAL.Event(v);
      const isAllDay = event.startDate ? event.startDate.isDate : false;
      const startDate = event.startDate ? event.startDate.toJSDate().toISOString() : null;
      const endDate = event.endDate ? event.endDate.toJSDate().toISOString() : null;

      return {
        uid: event.uid || Math.random().toString(),
        summary: event.summary || 'Untitled Event',
        description: event.description || '',
        location: event.location || '',
        start: startDate,
        end: endDate,
        isAllDay,
      };
    }).filter((evt: any) => {
      if (!evt.start) return false;
      const evtDate = new Date(evt.start);
      return evtDate >= rangeStart && evtDate <= rangeEnd;
    });

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
