import {
  externalFetchErrorResponse,
  fetchExternal,
  refuseOtherSites,
} from '../_shared/fetchExternal';

const MAX_METADATA_BYTES = 1.5 * 1024 * 1024; // 1.5 MB HTML cap

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return Number.isNaN(code) ? _ : String.fromCodePoint(code);
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isNaN(code) ? _ : String.fromCodePoint(code);
    })
    .trim();
}

function extractMetaContent(html: string, keys: string[]): string | undefined {
  for (const key of keys) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match <meta property="key" content="val"> or <meta name="key" content="val"> in either attribute order
    const pattern1 = new RegExp(
      `<meta[^>]+(?:property|name|itemprop)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
      'i'
    );
    const m1 = html.match(pattern1);
    if (m1?.[1]?.trim()) {
      return decodeHtmlEntities(m1[1]);
    }

    const pattern2 = new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["']${escaped}["'][^>]*>`,
      'i'
    );
    const m2 = html.match(pattern2);
    if (m2?.[1]?.trim()) {
      return decodeHtmlEntities(m2[1]);
    }
  }
  return undefined;
}

function extractJsonLdProduct(html: string): {
  title?: string;
  imageUrl?: string;
  price?: number;
} {
  const result: { title?: string; imageUrl?: string; price?: number } = {};
  const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;

  const inspectNode = (node: any) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach(inspectNode);
      return;
    }
    if (Array.isArray(node['@graph'])) {
      node['@graph'].forEach(inspectNode);
    }

    const typeVal = Array.isArray(node['@type'])
      ? node['@type'].join(' ')
      : String(node['@type'] || '');

    if (/Product/i.test(typeVal)) {
      if (!result.title && typeof node.name === 'string') {
        result.title = decodeHtmlEntities(node.name);
      }
      if (!result.imageUrl) {
        if (typeof node.image === 'string') {
          result.imageUrl = node.image;
        } else if (Array.isArray(node.image) && typeof node.image[0] === 'string') {
          result.imageUrl = node.image[0];
        } else if (node.image && typeof node.image.url === 'string') {
          result.imageUrl = node.image.url;
        }
      }

      const offers = Array.isArray(node.offers) ? node.offers[0] : node.offers;
      if (offers && result.price === undefined) {
        const rawP = offers.price ?? offers.lowPrice ?? offers.highPrice;
        if (rawP !== undefined && rawP !== null) {
          const parsed = parseFloat(String(rawP).replace(/[^0-9.]/g, ''));
          if (!Number.isNaN(parsed) && parsed > 0) {
            result.price = Number(parsed.toFixed(2));
          }
        }
      }
    }
  };

  while ((match = scriptRegex.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      inspectNode(parsed);
    } catch {
      // Ignore malformed JSON-LD blocks
    }
  }

  return result;
}

function parsePriceAmount(raw?: string): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) return undefined;
  const num = parseFloat(cleaned);
  if (Number.isNaN(num) || num <= 0 || num > 100000) return undefined;
  return Number(num.toFixed(2));
}

export async function onRequestGet(context: { request: Request }) {
  const crossSite = refuseOtherSites(context.request);
  if (crossSite) return crossSite;

  const reqUrl = new URL(context.request.url);
  const targetUrl = reqUrl.searchParams.get('url');

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing url parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    let response = await fetchExternal(targetUrl, {
      maxBytes: MAX_METADATA_BYTES,
      timeoutMs: 9_000,
      headers: {
        'User-Agent':
          'Ambiently-Display/1.0 (+https://dashboard.trinhism.com; Family Wishlist Scraper)',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!response.ok && (response.status === 403 || response.status === 429 || response.status === 406)) {
      response = await fetchExternal(targetUrl, {
        maxBytes: MAX_METADATA_BYTES,
        timeoutMs: 9_000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
    }

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: `Target site returned ${response.status} ${response.statusText}`,
        }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const html = response.text;
    const finalUrl = response.url;
    const jsonLd = extractJsonLdProduct(html);

    // 1. Extract Title (og:title -> twitter:title -> JSON-LD Product name -> <title>)
    const ogTitle = extractMetaContent(html, ['og:title', 'twitter:title']);
    const titleTagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const fallbackTitle = titleTagMatch?.[1]
      ? decodeHtmlEntities(titleTagMatch[1].replace(/\s+/g, ' '))
      : undefined;
    const title = ogTitle || jsonLd.title || fallbackTitle || '';

    // 2. Extract Image (og:image -> twitter:image -> JSON-LD Product image)
    const rawImage =
      extractMetaContent(html, [
        'og:image',
        'og:image:secure_url',
        'og:image:url',
        'twitter:image',
        'twitter:image:src',
      ]) || jsonLd.imageUrl;

    let imageUrl: string | undefined;
    if (rawImage) {
      try {
        const resolved = new URL(rawImage, finalUrl);
        if (resolved.protocol === 'https:' || resolved.protocol === 'http:') {
          imageUrl = resolved.toString();
        }
      } catch {
        // Ignore invalid image URL
      }
    }

    // 3. Extract Price (product:price:amount -> og:price:amount -> price -> JSON-LD offers.price)
    const metaPriceStr = extractMetaContent(html, [
      'product:price:amount',
      'og:price:amount',
      'product:price',
      'price',
      'twitter:data1',
    ]);
    const rawPrice = parsePriceAmount(metaPriceStr) ?? jsonLd.price;

    // 4. Site Name
    const siteName =
      extractMetaContent(html, ['og:site_name']) ||
      new URL(finalUrl).hostname.replace(/^www\./i, '');

    return new Response(
      JSON.stringify({
        title,
        imageUrl,
        rawPrice,
        sourceUrl: finalUrl,
        siteName,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'public, max-age=600',
        },
      }
    );
  } catch (err: unknown) {
    const safeResponse = externalFetchErrorResponse(err);
    if (safeResponse) return safeResponse;
    const message = err instanceof Error ? err.message : 'Failed to extract metadata';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
