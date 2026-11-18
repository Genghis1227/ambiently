import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { ExternalFetchError, fetchExternal, setGuardedFetch } from '../functions/_shared/fetchExternal';
import { installAddressGuard, isBlockedAddress } from '../server/addressGuard';
import { onRequestGet as webProxy } from '../functions/api/web-proxy';

describe('Self-hosted address guard (server/addressGuard.ts)', () => {
  it('blocks loopback, metadata and reserved addresses in every form, and home networks unless allowed', () => {
    for (const ip of [
      '127.0.0.1', '127.8.9.10', '0.0.0.0', '169.254.169.254', '224.0.0.1', '255.255.255.255',
      '::1', '::', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe', '64:ff9b::7f00:1',
    ]) {
      assert.equal(isBlockedAddress(ip, false), true, `${ip} must be blocked`);
      assert.equal(isBlockedAddress(ip, true), true, `${ip} must be blocked even for home-network feeds`);
    }
    for (const ip of ['10.0.0.12', '192.168.1.50', '172.20.0.5', '100.100.100.100', 'fd00::5', '::ffff:192.168.1.50']) {
      assert.equal(isBlockedAddress(ip, false), true, `${ip} must be blocked by default`);
      assert.equal(isBlockedAddress(ip, true), false, `${ip} is allowed for opted-in home-network feeds`);
    }
    for (const ip of ['8.8.8.8', '104.16.1.1', '2606:4700:4700::1111']) {
      assert.equal(isBlockedAddress(ip, false), false, `${ip} is public`);
    }
  });

  describe('names that point at this machine', () => {
    let server: http.Server;
    let port = 0;
    let localhostDotResolves = false;

    before(async () => {
      installAddressGuard();
      server = http.createServer((_req, res) => res.end('secret from this machine'));
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
      port = (server.address() as AddressInfo).port;
      // "localhost." (with the trailing dot) passes the name check but resolves to this machine
      localhostDotResolves = await new Promise((resolve) => dns.lookup('localhost.', (err) => resolve(!err)));
    });

    after(async () => {
      setGuardedFetch(null);
      delete process.env.AMBIENTLY_ALLOW_PRIVATE_FEEDS;
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it('refuses a public-looking name that resolves to loopback', async (t) => {
      if (!localhostDotResolves) return t.skip('localhost. does not resolve here');
      await assert.rejects(
        fetchExternal(`https://localhost.:${port}/`, { maxBytes: 10_000, timeoutMs: 5_000 }),
        (err: unknown) => err instanceof ExternalFetchError && /Private or internal/.test(err.message)
      );
    });

    it('keeps loopback blocked for opted-in home-network feeds too', async (t) => {
      if (!localhostDotResolves) return t.skip('localhost. does not resolve here');
      process.env.AMBIENTLY_ALLOW_PRIVATE_FEEDS = 'true';
      await assert.rejects(
        fetchExternal(`http://localhost.:${port}/`, { maxBytes: 10_000, timeoutMs: 5_000, allowPrivateNetwork: true }),
        (err: unknown) => err instanceof ExternalFetchError && /Private or internal/.test(err.message)
      );
    });
  });
});

describe('Web preview proxy (functions/api/web-proxy.ts)', () => {
  const call = (dest?: string, query = '') =>
    webProxy({
      request: new Request(`https://ambiently.example/api/web-proxy${query}`, {
        headers: dest ? { 'Sec-Fetch-Dest': dest, 'Sec-Fetch-Site': 'same-origin' } : {},
      }),
    });

  it('sandboxes every answer so a proxied page never runs as Ambiently', async () => {
    const res = await call('iframe');
    assert.equal(res.status, 400);
    const csp = res.headers.get('content-security-policy') || '';
    assert.match(csp, /^sandbox\b/);
    assert.ok(!/allow-same-origin/.test(csp), 'the sandbox must not allow the same origin');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });

  it('only answers frames: a direct visit or a script tag is refused', async () => {
    for (const dest of ['document', 'script', 'style', 'image']) {
      const res = await call(dest, '?url=' + encodeURIComponent('https://example.org/'));
      assert.equal(res.status, 403, `Sec-Fetch-Dest: ${dest}`);
      assert.match(res.headers.get('content-security-policy') || '', /^sandbox\b/);
    }
  });
});

describe('Self-hosted server security headers', () => {
  let baseUrl = '';
  let close: () => Promise<void>;
  let tmpDist = '';

  before(async () => {
    tmpDist = fs.mkdtempSync(path.join(os.tmpdir(), 'ambiently-headers-test-'));
    fs.writeFileSync(path.join(tmpDist, 'index.html'), '<!doctype html><html><body>Ambiently</body></html>');
    process.env.AMBIENTLY_DIST_DIR = tmpDist;
    const { createAmbientlyServer } = await import('../server/index');
    const server = createAmbientlyServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    close = () => new Promise<void>((resolve) => server.close(() => resolve()));
  });

  after(async () => {
    delete process.env.AMBIENTLY_DIST_DIR;
    setGuardedFetch(null);
    await close?.();
    fs.rmSync(tmpDist, { recursive: true, force: true });
  });

  it('sends the Content-Security-Policy from public/_headers with the app page', async () => {
    const res = await fetch(`${baseUrl}/`);
    assert.equal(res.status, 200);
    const csp = res.headers.get('content-security-policy') || '';
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /object-src 'none'/);
    assert.ok(res.headers.get('permissions-policy'));
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });
});
