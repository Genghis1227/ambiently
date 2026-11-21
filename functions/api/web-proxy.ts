// Cloudflare Pages Function: /functions/api/web-proxy.ts
// Proxies web pages for kiosk iframe viewing, stripping X-Frame-Options & CSP frame-ancestors,
// injecting <base href="..."> for asset resolution, and securing against frame busting.
//
// The page comes back from Ambiently's own address, so it must never run as Ambiently: its scripts
// could read the board, the saved sign-in and every secret calendar link. Every answer is therefore
// sandboxed by its own Content-Security-Policy (a separate, anonymous origin, even when the address
// is opened directly), and only frames may load it, so it can't be sent around as a link that shows
// any page under Ambiently's name, or loaded as a script.

import {
  checkApiRateLimit,
  fetchExternal,
  externalFetchErrorResponse,
  ExternalFetchError,
  verifyOptionalServerApiKey,
  type ExternalFetchResult,
} from '../_shared/fetchExternal';

interface PagesContext {
  request: Request;
}

const SANDBOXED_PAGE_HEADERS: Record<string, string> = {
  // No allow-same-origin: the page gets an anonymous origin with no access to Ambiently's storage,
  // and frame-ancestors 'self' prevents external sites from embedding /api/web-proxy.
  'Content-Security-Policy': "sandbox allow-scripts allow-forms allow-popups; frame-ancestors 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'X-Robots-Tag': 'noindex, nofollow',
  // A frame's cached answer must not be reused across origins/fetch destinations
  Vary: 'Sec-Fetch-Dest, Sec-Fetch-Site, Origin',
};

function htmlResponse(html: string, status: number, extra: Record<string, string> = {}): Response {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...SANDBOXED_PAGE_HEADERS, ...extra },
  });
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

const FRAME_FORBIDDEN_HTML =
  '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;background:#090d16;color:#cbd5e1;">This preview only opens inside Ambiently\'s web viewer.</body></html>';

/**
 * Requires genuine iframe/frame navigation from the same origin (or anonymous sandbox child
 * navigations with no Origin/Referer) while rejecting direct/script/cross-origin proxy loads.
 */
function refuseNonFrameRequests(request: Request): Response | null {
  const keyError = verifyOptionalServerApiKey(request);
  if (keyError) {
    return htmlResponse(
      '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;background:#090d16;color:#cbd5e1;">Unauthorized</body></html>',
      401,
      { 'Cache-Control': 'private, no-store' }
    );
  }

  const dest = (request.headers.get('Sec-Fetch-Dest') || '').trim().toLowerCase();
  if (dest !== 'iframe' && dest !== 'frame') {
    return htmlResponse(FRAME_FORBIDDEN_HTML, 403);
  }

  let reqOrigin = '';
  try {
    reqOrigin = new URL(request.url).origin;
  } catch {
    return htmlResponse(FRAME_FORBIDDEN_HTML, 400);
  }

  const origin = request.headers.get('Origin');
  if (origin && origin !== 'null' && origin !== reqOrigin) {
    return htmlResponse(FRAME_FORBIDDEN_HTML, 403);
  }

  const referer = request.headers.get('Referer');
  if (referer) {
    try {
      if (new URL(referer).origin !== reqOrigin) {
        return htmlResponse(FRAME_FORBIDDEN_HTML, 403);
      }
    } catch {
      return htmlResponse(FRAME_FORBIDDEN_HTML, 403);
    }
  }

  const secFetchSite = (request.headers.get('Sec-Fetch-Site') || '').trim().toLowerCase();
  if (secFetchSite === 'cross-site' && (Boolean(referer) || (Boolean(origin) && origin !== 'null'))) {
    return htmlResponse(FRAME_FORBIDDEN_HTML, 403);
  }

  const rateLimited = checkApiRateLimit(request, '/api/web-proxy', 60, 60_000);
  if (rateLimited) {
    return htmlResponse(
      '<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;background:#090d16;color:#cbd5e1;">Too many preview requests. Please wait a moment.</body></html>',
      429,
      { 'Retry-After': '60', 'Cache-Control': 'private, no-store' }
    );
  }

  return null;
}

const WEB_PROXY_USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Ambiently-WebProxy/1.0 (+https://dashboard.trinhism.com)',
  'Ambiently-Display/1.0 (+https://dashboard.trinhism.com)',
];

async function fetchPageWithFallback(normalizedUrl: string): Promise<ExternalFetchResult> {
  let lastRes: ExternalFetchResult | null = null;
  for (const ua of WEB_PROXY_USER_AGENTS) {
    try {
      const res = await fetchExternal(normalizedUrl, {
        maxBytes: 15 * 1024 * 1024, // 15 MB cap
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
  throw new Error('Failed to fetch page from destination server.');
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const refused = refuseNonFrameRequests(context.request);
  if (refused) return refused;

  const urlObj = new URL(context.request.url);
  const targetUrl = urlObj.searchParams.get('url');

  if (!targetUrl) {
    return htmlResponse(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;background:#090d16;color:#fff;">Missing url parameter</body></html>`,
      400
    );
  }

  let normalizedUrl = targetUrl.trim();
  if (normalizedUrl.startsWith('http://')) {
    normalizedUrl = 'https://' + normalizedUrl.slice(7);
  }

  try {
    const fetchRes = await fetchPageWithFallback(normalizedUrl);

    if (!fetchRes.ok) {
      return htmlResponse(
        `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Unable to load page</title>
  <style>
    body { background: #090d16; color: #cbd5e1; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 1.5rem; text-align: center; }
    .card { background: #0f172a; border: 1px solid #1e293b; padding: 2rem; border-radius: 1rem; max-width: 480px; }
    h2 { color: #f87171; margin-top: 0; font-size: 1.25rem; }
    p { font-size: 0.875rem; line-height: 1.5; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Page Preview Unavailable</h2>
    <p>The destination server answered ${fetchRes.status} (${escapeHtml(fetchRes.statusText || 'Error')}).</p>
    <p>Try switching to <strong>Reader View</strong> using the header toggle above.</p>
  </div>
</body>
</html>`,
        fetchRes.status >= 400 && fetchRes.status < 600 ? fetchRes.status : 502,
        { 'Cache-Control': 'private, no-store' }
      );
    }

    if (
      fetchRes.contentType &&
      !/\b(?:text\/html|application\/xhtml\+xml|text\/plain)\b/i.test(fetchRes.contentType)
    ) {
      return htmlResponse(
        `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Preview Unavailable</title>
  <style>
    body { background: #090d16; color: #cbd5e1; font-family: system-ui, -apple-system, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; padding: 1.5rem; text-align: center; }
    .card { background: #0f172a; border: 1px solid #1e293b; padding: 2rem; border-radius: 1rem; max-width: 480px; }
    h2 { color: #f87171; margin-top: 0; font-size: 1.25rem; }
    p { font-size: 0.875rem; line-height: 1.5; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="card">
    <h2>Unsupported Content Type</h2>
    <p>Web Preview only renders HTML pages (received ${escapeHtml(fetchRes.contentType.split(';')[0] || 'non-HTML content')}).</p>
  </div>
</body>
</html>`,
        415,
        { 'Cache-Control': 'private, no-store' }
      );
    }

    let html = fetchRes.text;
    const finalUrl = fetchRes.url || normalizedUrl;
    // The page's own origin is anonymous in the sandbox, so links are pointed back at the proxy by
    // the address it was served from
    const proxyPrefix = JSON.stringify(`${urlObj.origin}/api/web-proxy?url=`).replace(/</g, '\\u003c');

    // Prepare injected base tag & anti-frame-buster script
    const injectedCode = `
  <base href="${escapeHtml(finalUrl)}">
  <script>
    // Guard against frame-busting scripts that attempt to hijack the kiosk window
    try {
      Object.defineProperty(window, 'top', { get: function() { return window.self; } });
      Object.defineProperty(window, 'parent', { get: function() { return window.self; } });
    } catch (e) {}

    // Rewrite internal link clicks so browsing within the preview stays proxied
    document.addEventListener('click', function(e) {
      var a = e.target && e.target.closest('a');
      if (!a) return;
      var href = a.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
      try {
        var abs = new URL(href, document.baseURI).href;
        if (abs.startsWith('http://') || abs.startsWith('https://')) {
          a.href = ${proxyPrefix} + encodeURIComponent(abs);
          a.target = '_self';
        }
      } catch (err) {}
    }, true);
  </script>`;

    // Strip existing upstream <base> tags before injecting our base URL so relative resolution cannot be hijacked
    html = html.replace(/<base\b[^>]*>/gi, '');

    // Inject right after <head> or at top
    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/<head[^>]*>/i, (head) => head + injectedCode);
    } else {
      html = injectedCode + html;
    }

    // Strip meta tags that enforce frame-ancestors or X-Frame-Options
    html = html.replace(/<meta[^>]*http-equiv=["']X-Frame-Options["'][^>]*>/gi, '');
    html = html.replace(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '');

    return htmlResponse(html, 200, { 'Cache-Control': 'private, max-age=180' });
  } catch (err) {
    const errorRes = externalFetchErrorResponse(err);
    if (errorRes) {
      return htmlResponse(
        `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;background:#090d16;color:#f87171;">${escapeHtml(err instanceof Error ? err.message : 'Error fetching page')}</body></html>`,
        (err as any).status || 500
      );
    }
    return htmlResponse(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;background:#090d16;color:#f87171;">Failed to preview webpage</body></html>`,
      500
    );
  }
}
