// Ambiently's own small web server, for running it anywhere Node runs (a home server, a NAS, a
// Raspberry Pi, Docker) instead of Cloudflare Pages. It serves the built app from dist/ and runs the
// same four feed functions Cloudflare runs from functions/api, so calendars, RSS, Google Photos
// albums and Drive folders work the same way.
//
//   npm run build && npm run build:server && npm start      (PORT and HOST change where it listens)

import http from 'node:http';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { onRequestGet as icalHandler } from '../functions/api/ical';
import { onRequestGet as rssHandler } from '../functions/api/rss';
import { onRequestGet as gphotosHandler } from '../functions/api/gphotos';
import { onRequestGet as gdriveHandler } from '../functions/api/gdrive';

type Handler = (context: { request: Request }) => Promise<Response>;

const FUNCTIONS: Record<string, Handler> = {
  ical: icalHandler,
  rss: rssHandler,
  gphotos: gphotosHandler,
  gdrive: gdriveHandler,
};

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(process.env.AMBIENTLY_DIST || path.join(here, '..', 'dist'));

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
};

const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.xml', '.txt', '.svg']);

// Cloudflare-only files in public/ that shouldn't be served
const HIDDEN = new Set(['/_headers', '/_redirects', '/_routes.json']);

/** Reads the `/*` and exact-path blocks of public/_headers (Cloudflare Pages format) so pages get the same security headers here. */
function loadHeaderRules(): { pattern: string; headers: [string, string][] }[] {
  let text: string;
  try {
    text = readFileSync(path.join(ROOT, '_headers'), 'utf8');
  } catch {
    return [];
  }
  const rules: { pattern: string; headers: [string, string][] }[] = [];
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

const headerRules = loadHeaderRules();

function headersFor(pathname: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of headerRules) {
    const p = rule.pattern;
    const matches = p === '/*' || p === pathname || (p.endsWith('/*') && pathname.startsWith(p.slice(0, -1)));
    if (matches) for (const [k, v] of rule.headers) out[k] = v;
  }
  return out;
}

function toWebRequest(req: http.IncomingMessage): Request {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(', '));
  }
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  return new Request(url, { method: 'GET', headers });
}

async function runFunction(name: string, req: http.IncomingMessage, res: http.ServerResponse) {
  try {
    const response = await FUNCTIONS[name]({ request: toWebRequest(req) });
    const body = Buffer.from(await response.arrayBuffer());
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.statusCode = response.status;
    res.end(body);
  } catch (err) {
    console.error(`/api/${name} failed:`, err);
    sendJson(res, 500, { error: 'The server hit an error. Try again.' });
  }
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify(body));
}

function fileFor(pathname: string): { file: string; size: number } | null {
  const resolved = path.resolve(ROOT, '.' + pathname);
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) return null;
  try {
    const stat = statSync(resolved);
    if (stat.isFile()) return { file: resolved, size: stat.size };
    if (stat.isDirectory()) {
      const index = path.join(resolved, 'index.html');
      const indexStat = statSync(index);
      if (indexStat.isFile()) return { file: index, size: indexStat.size };
    }
  } catch {
    // Not found
  }
  return null;
}

function serveFile(req: http.IncomingMessage, res: http.ServerResponse, pathname: string, found: { file: string; size: number }) {
  const ext = path.extname(found.file).toLowerCase();
  for (const [k, v] of Object.entries(headersFor(pathname))) res.setHeader(k, v);
  res.setHeader('Content-Type', MIME[ext] || 'application/octet-stream');
  // Built files have a content hash in their name and never change; everything else is checked each time
  res.setHeader('Cache-Control', pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');

  const acceptsGzip = /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
  if (COMPRESSIBLE.has(ext) && acceptsGzip && found.size > 1024) {
    res.setHeader('Content-Encoding', 'gzip');
    res.setHeader('Vary', 'Accept-Encoding');
    res.statusCode = 200;
    if (req.method === 'HEAD') return res.end();
    createReadStream(found.file).pipe(zlib.createGzip()).pipe(res);
    return;
  }
  res.setHeader('Content-Length', found.size);
  res.statusCode = 200;
  if (req.method === 'HEAD') return res.end();
  createReadStream(found.file).pipe(res);
}

const server = http.createServer((req, res) => {
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname);
  } catch {
    res.statusCode = 400;
    return res.end('Bad request');
  }
  if (pathname.includes('\0')) {
    res.statusCode = 400;
    return res.end('Bad request');
  }

  if (pathname === '/healthz') {
    res.setHeader('Content-Type', 'text/plain');
    return res.end('ok');
  }

  const api = pathname.match(/^\/(?:functions\/)?api\/([a-z]+)\/?$/);
  if (api || pathname.startsWith('/api/') || pathname.startsWith('/functions/')) {
    if (!api || !FUNCTIONS[api[1]]) return sendJson(res, 404, { error: 'No such service.' });
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return sendJson(res, 405, { error: 'Only GET is supported.' });
    }
    return void runFunction(api[1], req, res);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET, HEAD');
    return res.end();
  }

  const found = HIDDEN.has(pathname) ? null : fileFor(pathname);
  if (found) return serveFile(req, res, pathname, found);

  // The app handles its own routes; a missing file with an extension is a real 404
  if (path.extname(pathname)) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'text/plain');
    return res.end('Not found');
  }
  const index = fileFor('/index.html');
  if (!index) {
    res.statusCode = 500;
    return res.end(`No built app in ${ROOT}. Run npm run build first.`);
  }
  return serveFile(req, res, '/index.html', index);
});

server.listen(PORT, HOST, () => {
  console.log(`Ambiently is running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT} (serving ${ROOT})`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
