// Cloudflare Pages Function: /functions/api/rss.ts
// Proxies and parses XML RSS / Atom feeds into normalized JSON articles

import { XMLParser } from 'fast-xml-parser';

interface PagesContext {
  request: Request;
}

function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&copy;/g, '©')
    .replace(/&reg;/g, '®')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&bull;/g, '•')
    .trim();
}

// The XML parser returns { '#text': ..., '@_type': ... } for a tag with attributes (such as Atom's
// <title type="html">) and a number for numeric text, so normalize before using string methods.
function textOf(value: any): string {
  if (value === null || value === undefined) return '';
  return String(typeof value === 'object' ? value['#text'] ?? '' : value);
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

  let normalizedUrl = feedUrl.trim();
  // Automatically upgrade insecure http:// to https:// to prevent Cloudflare Worker redirect hangs
  if (normalizedUrl.startsWith('http://')) {
    normalizedUrl = 'https://' + normalizedUrl.slice(7);
  }

  try {
    const fetchRes = await fetch(normalizedUrl, {
      redirect: 'follow',
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
      feedTitle = decodeHtmlEntities(textOf(parsed.rss.channel.title)) || feedTitle;
      rawItems = Array.isArray(parsed.rss.channel.item)
        ? parsed.rss.channel.item
        : parsed.rss.channel.item
        ? [parsed.rss.channel.item]
        : [];
    } else if (parsed.feed && parsed.feed.entry) {
      feedTitle = decodeHtmlEntities(textOf(parsed.feed.title)) || feedTitle;
      rawItems = Array.isArray(parsed.feed.entry)
        ? parsed.feed.entry
        : [parsed.feed.entry];
    }

    const items = rawItems.slice(0, 25).map((item: any, idx: number) => {
      const title = decodeHtmlEntities(textOf(item.title)) || 'Untitled';
      const link = typeof item.link === 'string' ? item.link : item.link?.['@_href'] || '';
      const pubDate = item.pubDate || item.published || item.updated || new Date().toISOString();
      const rawDesc = (textOf(item.description) || textOf(item.summary)).replace(/<[^>]*>?/gm, '').slice(0, 200);
      const description = decodeHtmlEntities(rawDesc);

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
