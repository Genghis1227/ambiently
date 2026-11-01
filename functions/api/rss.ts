// Cloudflare Pages Function: /functions/api/rss.ts
// Proxies and parses XML RSS / Atom feeds into normalized JSON articles

import { XMLParser } from 'fast-xml-parser';

interface PagesContext {
  request: Request;
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const url = new URL(context.request.url);
  const feedUrl = url.searchParams.get('url');

  if (!feedUrl) {
    return new Response(JSON.stringify({ error: 'Missing "url" query parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  try {
    const fetchRes = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Ambiently-Display/1.0 (+https://dashboard.trinhism.com)',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
      },
    });

    if (!fetchRes.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch RSS feed: ${fetchRes.statusText}` }),
        { status: fetchRes.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const xmlText = await fetchRes.text();
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });
    const parsed = parser.parse(xmlText);

    // Support standard RSS 2.0 or Atom feeds
    let rawItems: any[] = [];
    let feedTitle = 'RSS Feed';

    if (parsed.rss && parsed.rss.channel) {
      feedTitle = parsed.rss.channel.title || feedTitle;
      rawItems = Array.isArray(parsed.rss.channel.item)
        ? parsed.rss.channel.item
        : parsed.rss.channel.item
        ? [parsed.rss.channel.item]
        : [];
    } else if (parsed.feed && parsed.feed.entry) {
      feedTitle = parsed.feed.title || feedTitle;
      rawItems = Array.isArray(parsed.feed.entry)
        ? parsed.feed.entry
        : [parsed.feed.entry];
    }

    const items = rawItems.slice(0, 20).map((item: any, idx: number) => {
      const title = item.title || 'Untitled';
      const link = typeof item.link === 'string' ? item.link : item.link?.['@_href'] || '';
      const pubDate = item.pubDate || item.published || item.updated || new Date().toISOString();
      const description = typeof item.description === 'string' ? item.description.replace(/<[^>]*>?/gm, '').slice(0, 160) : '';

      return {
        id: item.guid?.['#text'] || item.id || `item-${idx}`,
        title,
        link,
        pubDate,
        description,
      };
    });

    return new Response(JSON.stringify({ title: feedTitle, items }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=600', // 10-minute edge cache
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: `RSS parsing error: ${err.message}` }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }
}
