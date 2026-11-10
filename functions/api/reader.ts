// Cloudflare Pages Function: /functions/api/reader.ts
// Extracts clean article content, title, byline, lead image, and formatted body using Readability & semantic DOM parsing

import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import {
  fetchExternal,
  externalFetchErrorResponse,
  refuseOtherSites,
  ExternalFetchError,
  type ExternalFetchResult,
} from '../_shared/fetchExternal';

interface PagesContext {
  request: Request;
}

const PRIMARY_READER_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Ambiently-Reader/1.0 (+https://dashboard.trinhism.com)',
  'Ambiently-Display/1.0 (+https://dashboard.trinhism.com)',
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.html)',
];

const BOILERPLATE_STUB_PATTERNS = [
  /New York Times content is made available for your personal, non-commercial\s+use subject to our Terms of Service/i,
  /Use of any device, tool, or process designed to data mine or scrape the content/i,
  /Please enable JS and disable any ad blocker/i,
  /You have been blocked/i,
];

function isBoilerplateStub(text: string): boolean {
  const trimmed = (text || '').trim();
  if (!trimmed) return true;
  return BOILERPLATE_STUB_PATTERNS.some((re) => re.test(trimmed)) && trimmed.length < 1200;
}

async function fetchPageWithFallback(normalizedUrl: string): Promise<ExternalFetchResult> {
  let lastRes: ExternalFetchResult | null = null;
  for (const ua of PRIMARY_READER_USER_AGENTS) {
    try {
      const res = await fetchExternal(normalizedUrl, {
        maxBytes: 10 * 1024 * 1024, // 10 MB cap
        timeoutMs: 12_000,
        headers: {
          'User-Agent': ua,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
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

function sanitizeArticleHtml(rawHtml: string): string {
  return rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/\s+style="[^"]*"/gi, '')
    .replace(/\s+style='[^']*'/gi, '')
    .replace(/\s+on[a-z]+="[^"]*"/gi, '')
    .replace(/\s+on[a-z]+='[^']*'/gi, '');
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

    // 1. Extract OpenGraph / Meta tag metadata before mutating the DOM
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
    const ogAuthor = getMeta([
      'meta[name="author"]',
      'meta[property="article:author"]',
      'meta[name="twitter:creator"]',
    ]);
    const ogPublishedTime = getMeta([
      'meta[property="article:published_time"]',
      'meta[name="date"]',
      'meta[name="publish-date"]',
      'meta[name="sailthru.date"]',
    ]);
    const ogDescription = getMeta([
      'meta[property="og:description"]',
      'meta[name="description"]',
      'meta[name="twitter:description"]',
    ]);
    const ogImage = getMeta(['meta[property="og:image"]', 'meta[name="twitter:image"]']);

    let absoluteLeadImage: string | null = null;
    if (ogImage) {
      try {
        absoluteLeadImage = new URL(ogImage, finalUrl).href;
      } catch {
        absoluteLeadImage = ogImage;
      }
    }

    // 2. Extract JSON-LD articleBody if embedded in structured data
    let jsonLdBody = '';
    const ldScripts = Array.from(
      document.querySelectorAll('script[type="application/ld+json"]')
    ) as any[];
    for (const s of ldScripts) {
      try {
        const parsedLd = JSON.parse(s.textContent || '');
        const items = Array.isArray(parsedLd)
          ? parsedLd
          : parsedLd?.['@graph']
            ? parsedLd['@graph']
            : [parsedLd];
        for (const item of items) {
          if (
            item &&
            typeof item.articleBody === 'string' &&
            item.articleBody.trim().length > jsonLdBody.length
          ) {
            jsonLdBody = item.articleBody.trim();
          }
        }
      } catch {
        // Ignore malformed JSON-LD blocks
      }
    }

    // 3. Remove non-article UI chrome (popovers, follow buttons, author bio headers, recirculation)
    const preCleanSelectors = [
      'script',
      'style',
      'noscript',
      'aside',
      'nav',
      'footer',
      'form',
      '[aria-hidden="true"]',
      '[id^="popover-"]',
      '[id^="follow-"]',
      '[role="navigation"]',
      '[role="complementary"]',
      '.duet--article--lede',
      '.duet--article--article-byline',
      '.duet--article--share-buttons',
      '.duet--cta--newsletter',
      '.duet--layout--article-recirc-color-container',
      '.duet--layout--rail',
    ].join(', ');
    for (const el of Array.from(document.querySelectorAll(preCleanSelectors)) as any[]) {
      el.remove();
    }

    // 4. Resolve relative image URLs, promote srcset over data: blur placeholders, and strip inline styles
    const images = Array.from(document.querySelectorAll('img')) as any[];
    for (const img of images) {
      const wAttr = Number(img.getAttribute('width') || 0);
      const hAttr = Number(img.getAttribute('height') || 0);
      if ((wAttr > 0 && wAttr <= 64) || (hAttr > 0 && hAttr <= 64)) {
        img.remove();
        continue;
      }

      let src =
        img.getAttribute('src') ||
        img.getAttribute('data-src') ||
        img.getAttribute('data-original') ||
        '';
      const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset') || '';

      if ((!src || src.startsWith('data:')) && srcset) {
        const candidates = srcset
          .split(',')
          .map((part: string) => part.trim().split(/\s+/)[0])
          .filter(Boolean);
        if (candidates.length > 0) {
          src = candidates[candidates.length - 1];
        }
      }

      if (!src || src.startsWith('data:')) {
        img.remove();
        continue;
      }

      try {
        img.setAttribute('src', new URL(src, finalUrl).href);
      } catch {
        // Keep original src
      }
      img.removeAttribute('srcset');
      img.removeAttribute('data-srcset');
      img.removeAttribute('data-src');
      img.removeAttribute('style');
      img.removeAttribute('loading');
      img.removeAttribute('onerror');
      img.removeAttribute('onload');
    }

    for (const styledEl of Array.from(document.querySelectorAll('[style]')) as any[]) {
      styledEl.removeAttribute('style');
    }

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

    // 5. Capture semantic <article> / articleBody container BEFORE Readability mutates the DOM
    const semanticTarget =
      document.querySelector('[itemprop="articleBody"]') ||
      document.querySelector('.duet--layout--entry-body') ||
      document.querySelector('article .markdown-body') ||
      document.querySelector('article .post-content') ||
      document.querySelector('article .entry-content') ||
      document.querySelector('article .article-body') ||
      document.querySelector('article') ||
      document.querySelector('main [role="main"]');

    let semanticHtml = '';
    let semanticText = '';
    if (semanticTarget) {
      const { document: cloneDoc } = parseHTML(
        `<div id="semantic-root">${semanticTarget.innerHTML}</div>`
      );
      const root = cloneDoc.getElementById('semantic-root');
      if (root) {
        const junkSelectors = [
          'script',
          'style',
          'iframe',
          'nav',
          'footer',
          'aside',
          'form',
          'noscript',
          'svg',
          'button',
          '.sidebar',
          '.Layout-sidebar',
          '.related',
          '.comments',
          '.share',
          '.social',
          '[aria-label="Footer navigation"]',
          '[role="navigation"]',
          '[role="complementary"]',
        ].join(', ');
        for (const el of Array.from(root.querySelectorAll(junkSelectors)) as any[]) {
          el.remove();
        }
        semanticHtml = root.innerHTML.trim();
        semanticText = (root.textContent || '').trim();
      }
    }

    // 6. Protect ancestors of <article> and <main> so Readability's UNLIKELY_CANDIDATES regex
    // (which matches "sidebar" in classes like "Layout--sidebarPosition-end") never deletes the article wrapper!
    const coreNodes = Array.from(
      document.querySelectorAll(
        'article, main, [role="main"], [itemprop="articleBody"], .duet--layout--entry-body'
      )
    ) as any[];
    for (const core of coreNodes) {
      let el = core;
      while (el && el.tagName !== 'BODY' && el.tagName !== 'HTML') {
        if (typeof el.removeAttribute === 'function') {
          el.removeAttribute('class');
          el.removeAttribute('id');
        }
        el = el.parentElement;
      }
    }

    // 7. Run Mozilla Readability
    const reader = new Readability(document as any, {
      charThreshold: 80,
      keepClasses: false,
    });
    const parsed = reader.parse();

    const title = parsed?.title || ogTitle || document.title || 'Untitled Article';
    const byline = parsed?.byline || ogAuthor || null;
    const siteName =
      parsed?.siteName || ogSiteName || new URL(finalUrl).hostname.replace(/^www\./, '');
    const publishedTime = parsed?.publishedTime || ogPublishedTime || null;
    const excerpt = ogDescription || parsed?.excerpt || null;

    let contentHtml = parsed?.content || '';
    let textContent = (parsed?.textContent || '').trim();

    if (isBoilerplateStub(textContent)) {
      contentHtml = '';
      textContent = '';
    }

    // 8. Only fall back to semantic <article> when Readability fails or truncates severely
    if (
      semanticText.length > 250 &&
      !isBoilerplateStub(semanticText) &&
      (textContent.length < 250 ||
        (textContent.length < 800 && semanticText.length > textContent.length * 2.2))
    ) {
      contentHtml = semanticHtml;
      textContent = semanticText;
    }

    // 8. If still empty/short and JSON-LD articleBody is present, format paragraphs from JSON-LD
    if (textContent.length < 200 && jsonLdBody.length > 200 && !isBoilerplateStub(jsonLdBody)) {
      contentHtml = jsonLdBody
        .split(/\n\n+/)
        .map((p) => `<p>${p.trim()}</p>`)
        .join('\n');
      textContent = jsonLdBody;
    }

    contentHtml = sanitizeArticleHtml(contentHtml);

    const isSummaryOnly = textContent.length < 120;
    const wordCount = textContent
      ? textContent.split(/\s+/).filter(Boolean).length
      : (excerpt || '').split(/\s+/).filter(Boolean).length;
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
        isSummaryOnly,
        canEmbedDirectly: Boolean(fetchRes.canEmbedDirectly),
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=180',
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
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
      }
    );
  }
}
