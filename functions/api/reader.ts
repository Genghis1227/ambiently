// Cloudflare Pages Function: /functions/api/reader.ts
// Extracts clean article content, title, byline, lead image, and formatted body using Readability & DOM parsing

import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import { fetchExternal, externalFetchErrorResponse, refuseOtherSites, ExternalFetchError, type ExternalFetchResult } from '../_shared/fetchExternal';

interface PagesContext {
  request: Request;
}

// Major news outlets (NYTimes, WSJ, Bloomberg) block generic datacenter / custom user-agents with 403,
// but explicitly whitelist recognized social link preview bots (Facebook, Slack, Twitter) for unrolling.
const FALLBACK_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.html)',
  'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)',
];

async function fetchPageWithFallback(normalizedUrl: string): Promise<ExternalFetchResult> {
  let lastRes: ExternalFetchResult | null = null;
  for (const ua of FALLBACK_USER_AGENTS) {
    try {
      const res = await fetchExternal(normalizedUrl, {
        maxBytes: 10 * 1024 * 1024, // 10 MB cap
        timeoutMs: 12_000,
        headers: {
          'User-Agent': ua,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (res.ok) return res;
      lastRes = res;
      if (res.status !== 403 && res.status !== 401 && res.status !== 429) {
        break;
      }
    } catch (err) {
      if (err instanceof ExternalFetchError && err.status !== 403 && err.status !== 401) {
        throw err;
      }
    }
  }
  if (lastRes) return lastRes;
  throw new Error('Failed to fetch article from destination server.');
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const refused = refuseOtherSites(context.request);
  if (refused) return refused;

  const urlObj = new URL(context.request.url);
  const targetUrl = urlObj.searchParams.get('url');

  if (!targetUrl) {
    return new Response(JSON.stringify({ error: 'Missing "url" query parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
    });
  }

  let normalizedUrl = targetUrl.trim();
  if (normalizedUrl.startsWith('http://')) {
    normalizedUrl = 'https://' + normalizedUrl.slice(7);
  }

  try {
    const fetchRes = await fetchPageWithFallback(normalizedUrl);

    if (!fetchRes.ok) {
      return new Response(
        JSON.stringify({
          error: `The website answered ${fetchRes.status}${fetchRes.statusText ? ` ${fetchRes.statusText}` : ''}.`,
        }),
        {
          status: fetchRes.status >= 400 && fetchRes.status < 600 ? fetchRes.status : 502,
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
        }
      );
    }

    const htmlText = fetchRes.text;
    const finalUrl = fetchRes.url || normalizedUrl;
    const { document } = parseHTML(htmlText);

    // Extract OpenGraph / Meta tag fallbacks before modifying document
    const getMeta = (selectors: string[]): string | null => {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        const val = el?.getAttribute('content') || el?.getAttribute('value');
        if (val && typeof val === 'string' && val.trim()) return val.trim();
      }
      return null;
    };

    const ogTitle = getMeta(['meta[property="og:title"]', 'meta[name="twitter:title"]']);
    const ogSiteName = getMeta(['meta[property="og:site_name"]']);
    const ogAuthor = getMeta(['meta[name="author"]', 'meta[property="article:author"]', 'meta[name="twitter:creator"]']);
    const ogPublishedTime = getMeta([
      'meta[property="article:published_time"]',
      'meta[name="date"]',
      'meta[name="publish-date"]',
      'meta[name="sailthru.date"]',
    ]);
    const ogDescription = getMeta(['meta[property="og:description"]', 'meta[name="description"]', 'meta[name="twitter:description"]']);
    const ogImage = getMeta(['meta[property="og:image"]', 'meta[name="twitter:image"]']);

    let absoluteLeadImage: string | null = null;
    if (ogImage) {
      try {
        absoluteLeadImage = new URL(ogImage, finalUrl).href;
      } catch {
        absoluteLeadImage = ogImage;
      }
    }

    // Resolve relative image URLs and clean image attributes
    const images = Array.from(document.querySelectorAll('img')) as any[];
    for (const img of images) {
      const src = img.getAttribute('src') || img.getAttribute('data-src') || img.getAttribute('data-original');
      if (src) {
        try {
          img.setAttribute('src', new URL(src, finalUrl).href);
        } catch {
          // Keep original src
        }
      }
      img.removeAttribute('srcset');
      img.removeAttribute('data-src');
      img.removeAttribute('loading');
      img.removeAttribute('onerror');
      img.removeAttribute('onload');
    }

    // Resolve relative links
    const anchors = Array.from(document.querySelectorAll('a')) as any[];
    for (const a of anchors) {
      const href = a.getAttribute('href');
      if (href) {
        try {
          a.setAttribute('href', new URL(href, finalUrl).href);
        } catch {
          // Keep original href
        }
      }
    }

    // Run Mozilla Readability
    const reader = new Readability(document as any, {
      charThreshold: 80,
      keepClasses: false,
    });
    const parsed = reader.parse();

    const title = parsed?.title || ogTitle || document.title || 'Untitled Article';
    const byline = parsed?.byline || ogAuthor || null;
    const siteName = parsed?.siteName || ogSiteName || new URL(finalUrl).hostname.replace(/^www\./, '');
    const publishedTime = parsed?.publishedTime || ogPublishedTime || null;
    const excerpt = parsed?.excerpt || ogDescription || null;
    let contentHtml = parsed?.content || '';
    const textContent = parsed?.textContent || '';

    // If Readability didn't extract content (e.g. non-standard structure), fallback to main/article text
    if (!contentHtml.trim() || textContent.trim().length < 50) {
      const fallbackContainer =
        document.querySelector('article') ||
        document.querySelector('main') ||
        document.querySelector('[role="main"]') ||
        document.querySelector('.content') ||
        document.body;

      if (fallbackContainer) {
        // Strip scripts, styles, forms, navs
        const toRemove = Array.from(
          fallbackContainer.querySelectorAll('script, style, iframe, nav, header, footer, form, noscript, svg')
        ) as any[];
        for (const el of toRemove) {
          el.remove();
        }
        contentHtml = fallbackContainer.innerHTML || '';
      }
    }

    // Clean up contentHtml (remove any scripts, on* handlers)
    contentHtml = contentHtml
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/\s+on[a-z]+="[^"]*"/gi, '')
      .replace(/\s+on[a-z]+='[^']*'/gi, '');

    const wordCount = textContent.trim().split(/\s+/).filter(Boolean).length;
    const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

    return new Response(
      JSON.stringify({
        ok: true,
        url: finalUrl,
        title,
        byline,
        siteName,
        publishedTime,
        leadImageUrl: absoluteLeadImage,
        excerpt,
        contentHtml,
        textContent: textContent.slice(0, 500),
        readingTimeMinutes,
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
        },
      }
    );
  } catch (err) {
    const errorRes = externalFetchErrorResponse(err);
    if (errorRes) return errorRes;

    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : 'Failed to extract article content.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } }
    );
  }
}
