// Cloudflare Pages Function: /functions/api/web-proxy.ts
// Proxies web pages for kiosk iframe viewing, stripping X-Frame-Options & CSP frame-ancestors,
// injecting <base href="..."> for asset resolution, and securing against frame busting.

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
  const refused = refuseOtherSites(context.request);
  if (refused) return refused;

  const urlObj = new URL(context.request.url);
  const targetUrl = urlObj.searchParams.get('url');

  if (!targetUrl) {
    return new Response(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;background:#090d16;color:#fff;">Missing url parameter</body></html>`,
      { status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }

  let normalizedUrl = targetUrl.trim();
  if (normalizedUrl.startsWith('http://')) {
    normalizedUrl = 'https://' + normalizedUrl.slice(7);
  }

  try {
    const fetchRes = await fetchPageWithFallback(normalizedUrl);

    if (!fetchRes.ok) {
      return new Response(
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
    <p>The destination server answered ${fetchRes.status} (${fetchRes.statusText || 'Error'}).</p>
    <p>Try switching to <strong>Reader View</strong> using the header toggle above.</p>
  </div>
</body>
</html>`,
        {
          status: fetchRes.status >= 400 && fetchRes.status < 600 ? fetchRes.status : 502,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'private, no-store',
          },
        }
      );
    }

    let html = fetchRes.text;
    const finalUrl = fetchRes.url || normalizedUrl;

    // Prepare injected base tag & anti-frame-buster script
    const injectedCode = `
  <base href="${finalUrl}">
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
          a.href = '/api/web-proxy?url=' + encodeURIComponent(abs);
          a.target = '_self';
        }
      } catch (err) {}
    }, true);
  </script>`;

    // Inject right after <head> or at top
    if (/<head[^>]*>/i.test(html)) {
      html = html.replace(/(<head[^>]*>)/i, `$1${injectedCode}`);
    } else {
      html = injectedCode + html;
    }

    // Strip meta tags that enforce frame-ancestors or X-Frame-Options
    html = html.replace(/<meta[^>]*http-equiv=["']X-Frame-Options["'][^>]*>/gi, '');
    html = html.replace(/<meta[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi, '');

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, max-age=180',
        'X-Robots-Tag': 'noindex, nofollow',
      },
    });
  } catch (err) {
    const errorRes = externalFetchErrorResponse(err);
    if (errorRes) {
      return new Response(
        `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;background:#090d16;color:#f87171;">${err instanceof Error ? err.message : 'Error fetching page'}</body></html>`,
        {
          status: (err as any).status || 500,
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }
      );
    }
    return new Response(
      `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:2rem;background:#090d16;color:#f87171;">Failed to preview webpage</body></html>`,
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}
