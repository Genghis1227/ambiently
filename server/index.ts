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
import { onRequestGet as handleFinance } from '../functions/api/finance';
import { onRequestGet as handleSports } from '../functions/api/sports';
import { onRequestGet as handleDiscovery } from '../functions/api/discovery';
import {
  onRequestGet as handleHomelabGet,
  onRequestPost as handleHomelabPost,
} from '../functions/api/homelab';
import { installAddressGuard } from './addressGuard';

type ApiHandler = (ctx: { request: Request }) => Promise<Response>;

const API_ROUTES: Record<string, ApiHandler> = {
  ical: handleIcal,
  rss: handleRss,
  gphotos: handleGphotos,
  gdrive: handleGdrive,
  reader: handleReader,
  'web-proxy': handleWebProxy,
  metadata: handleMetadata,
  finance: handleFinance,
  sports: handleSports,
  discovery: handleDiscovery,
  homelab: handleHomelabGet,
};

const API_POST_ROUTES: Record<string, ApiHandler> = {
  homelab: handleHomelabPost,
};

const MAX_API_POST_BODY_BYTES = 64 * 1024;

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

// The response headers Cloudflare Pages sends from public/_headers (Content-Security-Policy,
// Permissions-Policy, HSTS...), so a self-hosted copy gets the same protection. Read from the build
// (dist/_headers), or from public/_headers when the build doesn't have it.
type HeaderRule = { pattern: string; headers: [string, string][] };
let headerRules: HeaderRule[] | null = null;

function parseHeadersFile(text: string): HeaderRule[] {
  const rules: HeaderRule[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      rules.push({ pattern: line.trim(), headers: [] });
    } else if (rules.length > 0) {
      const idx = line.indexOf(':');
      if (idx > 0) rules[rules.length - 1].headers.push([line.slice(0, idx).trim(), line.slice(idx + 1).trim()]);
    }
  }
  return rules;
}

function loadHeaderRules(): HeaderRule[] {
  if (headerRules) return headerRules;
  for (const file of [path.join(distRoot, '_headers'), path.join(projectRoot, 'public', '_headers')]) {
    try {
      headerRules = parseHeadersFile(fs.readFileSync(file, 'utf8'));
      return headerRules;
    } catch {
      // Try the next place
    }
  }
  console.warn('[ambiently-server] No _headers file found; pages are served without a Content-Security-Policy.');
  headerRules = [];
  return headerRules;
}

function isTrustedProxyEnabled(): boolean {
  return process.env.AMBIENTLY_TRUST_PROXY === 'true';
}

function isHttpsRequest(req?: IncomingMessage): boolean {
  if ((req?.socket as { encrypted?: boolean } | undefined)?.encrypted) {
    return true;
  }
  if (!isTrustedProxyEnabled()) {
    return false;
  }
  const rawProto = req?.headers['x-forwarded-proto'];
  const proto = Array.isArray(rawProto) ? rawProto[0] : rawProto;
  return (
    String(proto || '')
      .split(',')[0]
      .trim()
      .toLowerCase() === 'https'
  );
}

function applySecurityHeaders(
  res: ServerResponse,
  urlPathname?: string,
  req?: IncomingMessage
): void {
  const httpsReq = isHttpsRequest(req);
  if (urlPathname) {
    for (const rule of loadHeaderRules()) {
      const p = rule.pattern;
      const matches =
        p === '/*' ||
        p === urlPathname ||
        (p.endsWith('/*') && urlPathname.startsWith(p.slice(0, -1)));
      if (matches) {
        for (const [name, value] of rule.headers) {
          if (name.toLowerCase() === 'strict-transport-security' && !httpsReq) {
            continue;
          }
          res.setHeader(name, value);
        }
      }
    }
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

function applyApiSecurityHeaders(res: ServerResponse): void {
  if (!res.hasHeader('X-Content-Type-Options')) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
  if (!res.hasHeader('Referrer-Policy')) {
    res.setHeader('Referrer-Policy', 'no-referrer');
  }
  if (!res.hasHeader('X-Robots-Tag')) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  }
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

  applySecurityHeaders(res, urlPathname, req);
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

async function readBoundedRequestBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk);
    total += buf.byteLength;
    if (total > maxBytes) {
      const tooLargeErr = new Error('Request payload too large.') as Error & { statusCode?: number };
      tooLargeErr.statusCode = 413;
      throw tooLargeErr;
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

async function handleApiRoute(
  req: IncomingMessage,
  res: ServerResponse,
  routeName: string
): Promise<void> {
  const method = (req.method || 'GET').toUpperCase();
  const getHandler = Object.hasOwn(API_ROUTES, routeName) ? API_ROUTES[routeName] : undefined;
  const postHandler = Object.hasOwn(API_POST_ROUTES, routeName)
    ? API_POST_ROUTES[routeName]
    : undefined;
  if (!getHandler && !postHandler) {
    applyApiSecurityHeaders(res);
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const handler = method === 'POST' ? postHandler : method === 'GET' ? getHandler : undefined;
  if (!handler) {
    const allowedMethods = [getHandler ? 'GET' : '', postHandler ? 'POST' : ''].filter(Boolean).join(', ');
    applyApiSecurityHeaders(res);
    res.writeHead(405, {
      'Content-Type': 'application/json; charset=utf-8',
      Allow: allowedMethods || 'GET',
    });
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  try {
    const protocol = isHttpsRequest(req) ? 'https' : 'http';
    const host = String(req.headers.host || 'localhost').trim() || 'localhost';
    let fullUrl: URL;
    try {
      fullUrl = new URL(req.url || '/', `${protocol}://${host}`);
    } catch {
      applyApiSecurityHeaders(res);
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Bad Request: Invalid Host or URL' }));
      return;
    }

    const trustProxy = isTrustedProxyEnabled();
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      const lower = key.toLowerCase();
      if (
        !trustProxy &&
        (lower === 'cf-connecting-ip' ||
          lower === 'x-forwarded-for' ||
          lower === 'x-real-ip' ||
          lower === 'x-forwarded-proto')
      ) {
        continue;
      }
      if (typeof value === 'string') {
        headers.set(key, value);
      } else if (Array.isArray(value)) {
        headers.set(key, value.join(', '));
      }
    }
    if (!trustProxy) {
      const peerIp = (req.socket?.remoteAddress || '').trim();
      if (peerIp) {
        headers.set('cf-connecting-ip', peerIp);
      }
    }

    const requestBody =
      method === 'POST' ? await readBoundedRequestBody(req, MAX_API_POST_BODY_BYTES) : undefined;
    const webRequest = new Request(fullUrl, {
      method,
      headers,
      ...(requestBody ? { body: new Uint8Array(requestBody) } : {}),
    });
    const webResponse = await handler({ request: webRequest });

    res.statusCode = webResponse.status;
    webResponse.headers.forEach((val, key) => {
      res.setHeader(key, val);
    });
    applyApiSecurityHeaders(res);
    const bodyBuffer = Buffer.from(await webResponse.arrayBuffer());
    res.setHeader('Content-Length', bodyBuffer.byteLength);
    res.end(bodyBuffer);
  } catch (err) {
    const statusCode =
      typeof (err as { statusCode?: unknown })?.statusCode === 'number'
        ? (err as { statusCode: number }).statusCode
        : 500;
    if (statusCode === 500) {
      console.error(`[ambiently-server] Error in /api/${routeName}:`, err);
    }
    if (!res.headersSent) {
      applyApiSecurityHeaders(res);
      res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    res.end(
      JSON.stringify({
        error: statusCode === 413 ? 'Payload Too Large' : 'Internal server error',
      })
    );
  }
}

export function createAmbientlyServer(): http.Server {
  installAddressGuard();
  const server = http.createServer(async (req, res) => {
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
      applySecurityHeaders(res, pathname, req);
      applyApiSecurityHeaders(res);
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
      applySecurityHeaders(res, pathname, req);
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
      applyApiSecurityHeaders(res);
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
  server.headersTimeout = 15_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  return server;
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
