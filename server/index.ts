import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { onRequestGet as handleIcal } from '../functions/api/ical';
import { onRequestGet as handleRss } from '../functions/api/rss';
import { onRequestGet as handleGphotos } from '../functions/api/gphotos';
import { onRequestGet as handleGdrive } from '../functions/api/gdrive';
import { onRequestGet as handleReader } from '../functions/api/reader';
import { onRequestGet as handleWebProxy } from '../functions/api/web-proxy';
import { onRequestGet as handleMetadata } from '../functions/api/metadata';

type ApiHandler = (ctx: { request: Request }) => Promise<Response>;

const API_ROUTES: Record<string, ApiHandler> = {
  ical: handleIcal,
  rss: handleRss,
  gphotos: handleGphotos,
  gdrive: handleGdrive,
  reader: handleReader,
  'web-proxy': handleWebProxy,
  metadata: handleMetadata,
};

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

const COMPRESSIBLE_EXTENSIONS = new Set([
  '.html',
  '.js',
  '.mjs',
  '.css',
  '.json',
  '.webmanifest',
  '.svg',
  '.xml',
  '.txt',
]);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const distRoot = path.resolve(process.env.AMBIENTLY_DIST_DIR || path.join(projectRoot, 'dist'));

function readPackageVersion(): string {
  try {
    const pkgRaw = fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8');
    const parsed = JSON.parse(pkgRaw) as { version?: string };
    return parsed.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const APP_VERSION = readPackageVersion();
const immutableGzipCache = new Map<string, Buffer>();
const MAX_GZIP_CACHE_ITEMS = 96;

function buildRuntimeConfigScript(): string {
  const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const supabaseAnonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim();

  const cfg: Record<string, string> = {};
  if (supabaseUrl && supabaseAnonKey) {
    cfg.supabaseUrl = supabaseUrl;
    cfg.supabaseAnonKey = supabaseAnonKey;
  }

  const safeJson = JSON.stringify(cfg).replace(/</g, '\\u003c');
  return `window.__AMBIENTLY_CONFIG__ = ${safeJson};\n`;
}

function getCacheControl(urlPathname: string): string {
  if (urlPathname.startsWith('/assets/')) {
    return 'public, max-age=31536000, immutable';
  }
  if (
    urlPathname === '/' ||
    urlPathname === '/index.html' ||
    urlPathname === '/sw.js' ||
    urlPathname === '/registerSW.js' ||
    urlPathname === '/version.json' ||
    urlPathname === '/manifest.webmanifest' ||
    /^\/workbox-[a-zA-Z0-9_-]+\.js$/.test(urlPathname)
  ) {
    return 'no-cache';
  }
  return 'public, max-age=3600';
}

function applySecurityHeaders(res: ServerResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function serveStaticFile(
  req: IncomingMessage,
  res: ServerResponse,
  filePath: string,
  urlPathname: string
): boolean {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const cacheControl = getCacheControl(urlPathname);
  const etag = `W/"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;

  applySecurityHeaders(res);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('ETag', etag);

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304);
    res.end();
    return true;
  }

  const acceptEncoding = String(req.headers['accept-encoding'] || '');
  const canGzip =
    COMPRESSIBLE_EXTENSIONS.has(ext) &&
    stat.size >= 1024 &&
    /\bgzip\b/i.test(acceptEncoding);

  if (canGzip) {
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('Content-Encoding', 'gzip');

    if (req.method === 'HEAD') {
      res.writeHead(200);
      res.end();
      return true;
    }

    const isImmutable = urlPathname.startsWith('/assets/');
    let compressed = isImmutable ? immutableGzipCache.get(filePath) : undefined;
    if (!compressed) {
      const raw = fs.readFileSync(filePath);
      compressed = zlib.gzipSync(raw, { level: 6 });
      if (isImmutable) {
        if (immutableGzipCache.size >= MAX_GZIP_CACHE_ITEMS) {
          const oldest = immutableGzipCache.keys().next().value;
          if (oldest) immutableGzipCache.delete(oldest);
        }
        immutableGzipCache.set(filePath, compressed);
      }
    }

    res.setHeader('Content-Length', compressed.byteLength);
    res.writeHead(200);
    res.end(compressed);
    return true;
  }

  res.setHeader('Content-Length', stat.size);
  if (req.method === 'HEAD') {
    res.writeHead(200);
    res.end();
    return true;
  }

  res.writeHead(200);
  fs.createReadStream(filePath).pipe(res);
  return true;
}

async function handleApiRoute(
  req: IncomingMessage,
  res: ServerResponse,
  routeName: string
): Promise<void> {
  const handler = API_ROUTES[routeName];
  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  if (req.method !== 'GET') {
    res.writeHead(405, {
      'Content-Type': 'application/json; charset=utf-8',
      Allow: 'GET',
    });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  try {
    const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const protocol = forwardedProto === 'https' ? 'https' : 'http';
    const host = req.headers.host || 'localhost';
    const fullUrl = new URL(req.url || '/', `${protocol}://${host}`);

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headers.set(key, value);
      } else if (Array.isArray(value)) {
        headers.set(key, value.join(', '));
      }
    }

    const webRequest = new Request(fullUrl, { method: 'GET', headers });
    const webResponse = await handler({ request: webRequest });

    res.statusCode = webResponse.status;
    webResponse.headers.forEach((val, key) => {
      res.setHeader(key, val);
    });
    const bodyBuffer = Buffer.from(await webResponse.arrayBuffer());
    res.setHeader('Content-Length', bodyBuffer.byteLength);
    res.end(bodyBuffer);
  } catch (err) {
    console.error(`[ambiently-server] Error in /api/${routeName}:`, err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    res.end(JSON.stringify({ error: 'Internal server error' }));
  }
}

export function createAmbientlyServer(): http.Server {
  return http.createServer(async (req, res) => {
    const rawUrl = req.url || '/';
    let pathname = '/';
    try {
      pathname = decodeURIComponent(rawUrl.split('?')[0] || '/');
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request');
      return;
    }

    // 1. Container & Raspberry Pi Kiosk Healthcheck
    if (pathname === '/api/health') {
      const payload = JSON.stringify({
        status: 'ok',
        version: APP_VERSION,
        uptimeSec: Math.round(process.uptime()),
        timestamp: new Date().toISOString(),
      });
      applySecurityHeaders(res);
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Length': Buffer.byteLength(payload),
      });
      res.end(req.method === 'HEAD' ? undefined : payload);
      return;
    }

    // 2. Dynamic Runtime Config (/config.js) for zero-rebuild Docker Supabase configuration
    if (pathname === '/config.js') {
      const script = buildRuntimeConfigScript();
      applySecurityHeaders(res);
      res.writeHead(200, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-store',
        'Content-Length': Buffer.byteLength(script),
      });
      res.end(req.method === 'HEAD' ? undefined : script);
      return;
    }

    // 3. Serverless Proxy Endpoints (/api/* and /functions/api/*)
    const apiMatch = pathname.match(/^(?:\/functions)?\/api\/([a-z0-9-]+)$/);
    if (apiMatch) {
      await handleApiRoute(req, res, apiMatch[1]);
      return;
    }

    if (pathname.startsWith('/api/') || pathname.startsWith('/functions/')) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'API endpoint not found' }));
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD' });
      res.end('Method Not Allowed');
      return;
    }

    // 4. Static PWA Assets from dist/ with strict path-traversal guard
    const relativeTarget = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const resolvedPath = path.resolve(distRoot, relativeTarget);
    if (resolvedPath !== distRoot && !resolvedPath.startsWith(distRoot + path.sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    if (serveStaticFile(req, res, resolvedPath, pathname === '/' ? '/index.html' : pathname)) {
      return;
    }

    // 5. SPA Fallback to dist/index.html for client-side routes (skip missing explicit asset extensions)
    if (!path.extname(pathname)) {
      const indexHtmlPath = path.join(distRoot, 'index.html');
      if (serveStaticFile(req, res, indexHtmlPath, '/index.html')) {
        return;
      }
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  });
}

// Start listener when invoked directly as the server entry point
const isMainEntry =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainEntry) {
  const port = Number(process.env.PORT || 8080);
  const host = process.env.HOST || '0.0.0.0';
  const server = createAmbientlyServer();

  server.listen(port, host, () => {
    console.log(
      `🚀 Ambiently v${APP_VERSION} self-hosted server listening on http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`
    );
  });

  const shutdown = (signal: string) => {
    console.log(`\nReceived ${signal}, shutting down Ambiently server...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}
