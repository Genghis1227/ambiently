import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { checkPublicHttpsUrl, ExternalFetchError } from '../functions/_shared/fetchExternal';

describe('Self-hosted LAN feed URL validation (fetchExternal)', () => {
  it('blocks private LAN and HTTP addresses by default', () => {
    delete process.env.AMBIENTLY_ALLOW_PRIVATE_FEEDS;
    assert.throws(() => checkPublicHttpsUrl('http://192.168.1.50:8080/cal.ics'), ExternalFetchError);
    assert.throws(() => checkPublicHttpsUrl('https://192.168.1.50/cal.ics'), ExternalFetchError);
    assert.throws(() => checkPublicHttpsUrl('https://nextcloud.local/cal.ics'), ExternalFetchError);
    assert.doesNotThrow(() => checkPublicHttpsUrl('https://calendar.google.com/calendar/ical/basic.ics'));
  });

  it('allows RFC1918 LAN & mDNS addresses when AMBIENTLY_ALLOW_PRIVATE_FEEDS=true, while still blocking loopback and metadata IPs', () => {
    process.env.AMBIENTLY_ALLOW_PRIVATE_FEEDS = 'true';
    try {
      assert.doesNotThrow(() => checkPublicHttpsUrl('http://192.168.1.50:5232/user/cal.ics'));
      assert.doesNotThrow(() => checkPublicHttpsUrl('http://10.0.0.12:8080/rss.xml'));
      assert.doesNotThrow(() => checkPublicHttpsUrl('https://nextcloud.local/remote.php/dav/public-calendars/abc?export'));

      // Loopback & link-local cloud metadata must NEVER be allowed
      assert.throws(() => checkPublicHttpsUrl('http://127.0.0.1:8080/secret'), ExternalFetchError);
      assert.throws(() => checkPublicHttpsUrl('http://localhost:8080/secret'), ExternalFetchError);
      assert.throws(() => checkPublicHttpsUrl('http://169.254.169.254/latest/meta-data/'), ExternalFetchError);

      // Google-restricted functions (allowedHosts) must still enforce HTTPS on Google hosts
      assert.throws(
        () => checkPublicHttpsUrl('http://192.168.1.50/album', ['photos.google.com']),
        ExternalFetchError
      );
    } finally {
      delete process.env.AMBIENTLY_ALLOW_PRIVATE_FEEDS;
    }
  });
});

describe('Standalone Ambiently HTTP Server (server/index.ts)', () => {
  let tmpDistDir: string;
  let baseUrl: string;
  let closeServer: () => Promise<void>;

  before(async () => {
    tmpDistDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ambiently-dist-test-'));
    fs.mkdirSync(path.join(tmpDistDir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(tmpDistDir, 'index.html'), '<!doctype html><html><body>Ambiently Test</body></html>');
    fs.writeFileSync(path.join(tmpDistDir, 'assets', 'app-12345.js'), 'console.log("hello ".repeat(300));');

    process.env.AMBIENTLY_DIST_DIR = tmpDistDir;
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'anon-key-<test>';

    const { createAmbientlyServer } = await import('../server/index');
    const server = createAmbientlyServer();

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
    closeServer = () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
  });

  after(async () => {
    delete process.env.AMBIENTLY_DIST_DIR;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    if (closeServer) await closeServer();
    if (tmpDistDir) fs.rmSync(tmpDistDir, { recursive: true, force: true });
  });

  it('serves /api/health with status ok', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { status: string; version: string };
    assert.equal(body.status, 'ok');
    assert.equal(typeof body.version, 'string');
  });

  it('serves dynamic runtime /config.js with XSS-safe escaping and no-store cache header', async () => {
    const res = await fetch(`${baseUrl}/config.js`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const text = await res.text();
    assert.match(text, /window\.__AMBIENTLY_CONFIG__ = /);
    assert.match(text, /https:\/\/example\.supabase\.co/);
    assert.ok(!text.includes('<test>'), 'Expected < to be unicode-escaped');
    assert.ok(text.includes('\\u003ctest>'));
  });

  it('serves immutable hashed assets with gzip compression and SPA fallback for client routes', async () => {
    const assetRes = await fetch(`${baseUrl}/assets/app-12345.js`, {
      headers: { 'Accept-Encoding': 'gzip' },
    });
    assert.equal(assetRes.status, 200);
    assert.equal(assetRes.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    const assetText = await assetRes.text();
    assert.match(assetText, /hello/);

    const spaRes = await fetch(`${baseUrl}/board/kitchen`);
    assert.equal(spaRes.status, 200);
    assert.equal(spaRes.headers.get('cache-control'), 'no-cache');
    const spaHtml = await spaRes.text();
    assert.match(spaHtml, /Ambiently Test/);
  });

  it('returns 400 on /api/rss without url param and 404 on unknown /api routes', async () => {
    const rssRes = await fetch(`${baseUrl}/api/rss`);
    assert.equal(rssRes.status, 400);

    const unknownApiRes = await fetch(`${baseUrl}/api/does-not-exist`);
    assert.equal(unknownApiRes.status, 404);
  });
});
