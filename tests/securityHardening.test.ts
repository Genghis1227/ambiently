import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import dns from 'node:dns';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import {
  ExternalFetchError,
  checkApiRateLimit,
  fetchExternal,
  refuseOtherSites,
  resetApiRateLimitsForTests,
  setGuardedFetch,
} from '../functions/_shared/fetchExternal';
import { installAddressGuard, isBlockedAddress } from '../server/addressGuard';
import { onRequestGet as webProxy } from '../functions/api/web-proxy';
import { onRequestGet as rssHandler } from '../functions/api/rss';
import { buildPlexItemUrl, sanitizePlexKeySegment } from '../src/services/plex';
import { matchPlexServerFromList } from '../src/services/photoSyncService';
import { stripPlexTokens } from '../src/services/plexLinks';
import { markDirtySettingsKeys, mergeConcurrentCloudSettings } from '../src/services/syncMerge';
import { stripHtmlToText } from '../src/utils/htmlEntities';
import {
  isSafeExternalEmbedUrl,
  safeCssBackgroundUrl,
  sanitizeExternalHttpUrl,
} from '../src/utils/urlSecurity';
import { isSafeVaultMediaDataUrl } from '../src/utils/localMediaVault';
import {
  MAX_BACKUP_FILE_BYTES,
  parseAndValidateBackup,
  sanitizePayloadForBackupExport,
} from '../src/services/fileSync';

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

  it('sandboxes every answer with frame-ancestors self so a proxied page never runs as Ambiently', async () => {
    const res = await call('iframe');
    assert.equal(res.status, 400);
    const csp = res.headers.get('content-security-policy') || '';
    assert.match(csp, /^sandbox\b/);
    assert.match(csp, /frame-ancestors 'self'/);
    assert.ok(!/allow-same-origin/.test(csp), 'the sandbox must not allow the same origin');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });

  it('only answers frames from same-origin or anonymous sandboxed frames and refuses missing Sec-Fetch-Dest or foreign referers', async () => {
    for (const dest of ['document', 'script', 'style', 'image', undefined]) {
      const res = await call(dest, '?url=' + encodeURIComponent('https://example.org/'));
      assert.equal(res.status, 403, `Sec-Fetch-Dest: ${String(dest)}`);
      assert.match(res.headers.get('content-security-policy') || '', /^sandbox\b/);
    }

    const crossOriginFrame = await webProxy({
      request: new Request('https://ambiently.example/api/web-proxy?url=' + encodeURIComponent('https://example.org/'), {
        headers: {
          'Sec-Fetch-Dest': 'iframe',
          'Sec-Fetch-Site': 'cross-site',
          Referer: 'https://evil.example/embed',
        },
      }),
    });
    assert.equal(crossOriginFrame.status, 403);

    setGuardedFetch({
      publicOnly: async () =>
        new Response('<html><head><base href="https://evil.example/"><title>Ok</title></head><body>Hi</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
      privateAllowed: async () => new Response('unused', { status: 500 }),
    });
    try {
      const childLinkRes = await webProxy({
        request: new Request('https://ambiently.example/api/web-proxy?url=' + encodeURIComponent('https://example.org/article'), {
          headers: {
            'Sec-Fetch-Dest': 'iframe',
            'Sec-Fetch-Site': 'cross-site',
          },
        }),
      });
      assert.equal(childLinkRes.status, 200);
      const html = await childLinkRes.text();
      assert.ok(!html.includes('https://evil.example/'), 'upstream <base> tag must be stripped');
      assert.ok(html.includes('<base href="https://example.org/article">'));
    } finally {
      setGuardedFetch(null);
      resetApiRateLimitsForTests();
    }
  });
});

describe('API origin checks, optional AMBIENTLY_API_KEY, and rate limits', () => {
  it('enforces Origin validation on POST, optional AMBIENTLY_API_KEY, and sliding-window rate limits', () => {
    resetApiRateLimitsForTests();
    const prevKey = process.env.AMBIENTLY_API_KEY;
    try {
      const crossOriginPost = refuseOtherSites(
        new Request('https://ambiently.example/api/homelab', {
          method: 'POST',
          headers: { Origin: 'https://evil.example' },
        })
      );
      assert.equal(crossOriginPost?.status, 403);

      process.env.AMBIENTLY_API_KEY = 'test-server-api-key-081';
      const unauthRes = refuseOtherSites(
        new Request('https://ambiently.example/api/homelab', {
          headers: { 'Sec-Fetch-Site': 'same-origin' },
        })
      );
      assert.equal(unauthRes?.status, 401);

      const authRes = refuseOtherSites(
        new Request('https://ambiently.example/api/homelab', {
          headers: {
            'Sec-Fetch-Site': 'same-origin',
            'X-Ambiently-Key': 'test-server-api-key-081',
          },
        })
      );
      assert.equal(authRes, null);
      delete process.env.AMBIENTLY_API_KEY;

      for (let i = 0; i < 3; i += 1) {
        assert.equal(
          checkApiRateLimit(
            new Request('https://ambiently.example/api/test', { headers: { 'X-Forwarded-For': '203.0.113.5' } }),
            '/api/test',
            3,
            60_000
          ),
          null
        );
      }
      const rateLimited = checkApiRateLimit(
        new Request('https://ambiently.example/api/test', { headers: { 'X-Forwarded-For': '203.0.113.5' } }),
        '/api/test',
        3,
        60_000
      );
      assert.equal(rateLimited?.status, 429);
    } finally {
      if (prevKey === undefined) delete process.env.AMBIENTLY_API_KEY;
      else process.env.AMBIENTLY_API_KEY = prevKey;
      resetApiRateLimitsForTests();
    }
  });
});

describe('Self-hosted server security headers', () => {
  let baseUrl = '';
  let close: () => Promise<void>;
  let tmpDist = '';
  let serverRef: http.Server;

  before(async () => {
    tmpDist = fs.mkdtempSync(path.join(os.tmpdir(), 'ambiently-headers-test-'));
    fs.writeFileSync(path.join(tmpDist, 'index.html'), '<!doctype html><html><body>Ambiently</body></html>');
    process.env.AMBIENTLY_DIST_DIR = tmpDist;
    const { createAmbientlyServer } = await import('../server/index');
    const server = createAmbientlyServer();
    serverRef = server;
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

  it('sends Content-Security-Policy, trusted-proxy HSTS, API hardening headers, rejects bad Host with 400, and resists CF-Connecting-IP spoofing', async () => {
    assert.equal(serverRef.headersTimeout, 15_000);
    assert.equal(serverRef.requestTimeout, 30_000);
    assert.equal(serverRef.keepAliveTimeout, 5_000);

    const prevTrustProxy = process.env.AMBIENTLY_TRUST_PROXY;
    try {
      delete process.env.AMBIENTLY_TRUST_PROXY;

      const res = await fetch(`${baseUrl}/`);
      assert.equal(res.status, 200);
      const csp = res.headers.get('content-security-policy') || '';
      assert.match(csp, /script-src 'self'/);
      assert.match(csp, /object-src 'none'/);
      assert.ok(res.headers.get('permissions-policy'));
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
      assert.equal(res.headers.get('strict-transport-security'), null, 'plain HTTP must not emit HSTS');

      // Without AMBIENTLY_TRUST_PROXY=true, client X-Forwarded-Proto: https is ignored
      const spoofedHttpsRes = await fetch(`${baseUrl}/`, {
        headers: { 'X-Forwarded-Proto': 'https' },
      });
      assert.equal(spoofedHttpsRes.status, 200);
      assert.equal(
        spoofedHttpsRes.headers.get('strict-transport-security'),
        null,
        'untrusted X-Forwarded-Proto must not emit HSTS'
      );

      // Rotating fake CF-Connecting-IP headers does not bypass /api/homelab rate limit without AMBIENTLY_TRUST_PROXY
      resetApiRateLimitsForTests();
      for (let i = 1; i <= 60; i += 1) {
        const probe = await fetch(`${baseUrl}/api/homelab`, {
          headers: { 'CF-Connecting-IP': `198.51.100.${i}` },
        });
        assert.equal(probe.status, 200);
      }
      const throttled = await fetch(`${baseUrl}/api/homelab`, {
        headers: { 'CF-Connecting-IP': '198.51.100.250' },
      });
      assert.equal(throttled.status, 429);
      resetApiRateLimitsForTests();

      // With AMBIENTLY_TRUST_PROXY=true, X-Forwarded-Proto: https emits HSTS
      process.env.AMBIENTLY_TRUST_PROXY = 'true';
      const trustedHttpsRes = await fetch(`${baseUrl}/`, {
        headers: { 'X-Forwarded-Proto': 'https' },
      });
      assert.equal(trustedHttpsRes.status, 200);
      assert.match(trustedHttpsRes.headers.get('strict-transport-security') || '', /max-age=31536000/);

      // Invalid Host header on /api/* returns 400 (never 500)
      const parsedBase = new URL(baseUrl);
      const badHostStatus = await new Promise<number>((resolve, reject) => {
        const req = http.request(
          {
            hostname: parsedBase.hostname,
            port: Number(parsedBase.port),
            path: '/api/discovery?month=1&day=1',
            headers: { Host: 'bad host name!' },
          },
          (incoming) => {
            incoming.resume();
            resolve(incoming.statusCode || 0);
          }
        );
        req.on('error', reject);
        req.end();
      });
      assert.equal(badHostStatus, 400);

      const apiRes = await fetch(`${baseUrl}/api/health`);
      assert.equal(apiRes.status, 200);
      assert.equal(apiRes.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(apiRes.headers.get('x-robots-tag'), 'noindex, nofollow');
      assert.equal(apiRes.headers.get('referrer-policy'), 'no-referrer');

      const unknownApiRes = await fetch(`${baseUrl}/api/unknown-route`);
      assert.equal(unknownApiRes.status, 404);
      assert.equal(unknownApiRes.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(unknownApiRes.headers.get('x-robots-tag'), 'noindex, nofollow');
    } finally {
      if (prevTrustProxy === undefined) delete process.env.AMBIENTLY_TRUST_PROXY;
      else process.env.AMBIENTLY_TRUST_PROXY = prevTrustProxy;
      resetApiRateLimitsForTests();
    }
  });
});

describe('URL/CSS sanitizers, backup secret redaction, vault validation & Pi installer hardening', () => {
  it('blocks unsafe link schemes and escapes/restricts CSS background URLs', () => {
    assert.equal(sanitizeExternalHttpUrl('https://example.org/news?a=1'), 'https://example.org/news?a=1');
    assert.equal(sanitizeExternalHttpUrl('http://nas.local:8080/feed'), 'http://nas.local:8080/feed');
    assert.equal(sanitizeExternalHttpUrl('javascript:alert(1)'), null);
    assert.equal(sanitizeExternalHttpUrl('data:text/html,<script>alert(1)</script>'), null);
    assert.equal(sanitizeExternalHttpUrl('file:///etc/passwd'), null);

    assert.equal(safeCssBackgroundUrl('https://example.com/bg(1).jpg'), 'url("https://example.com/bg\\(1\\).jpg")');
    assert.equal(safeCssBackgroundUrl('data:image/png;base64,iVBORw0KGgo='), 'url("data:image/png;base64,iVBORw0KGgo=")');
    assert.equal(safeCssBackgroundUrl('data:image/svg+xml;base64,PHN2Zz4='), null);
    assert.equal(safeCssBackgroundUrl('javascript:alert(1)'), null);
  });

  it('rejects SVG data URLs in localMediaVault and strips secrets from backup exports', () => {
    assert.equal(isSafeVaultMediaDataUrl('data:image/webp;base64,UklGRh4='), true);
    assert.equal(isSafeVaultMediaDataUrl('data:image/svg+xml;base64,PHN2Zz4='), false);
    assert.equal(isSafeVaultMediaDataUrl('data:text/html;base64,PGI+'), false);

    const scrubbed = sanitizePayloadForBackupExport({
      version: 1,
      exportedAt: '2026-11-20T00:00:00.000Z',
      settings: {
        id: 'global',
        dashboardTitle: 'Family Board',
        dockPosition: 'left',
        carouselEnabled: false,
        defaultRotateDurationSec: 30,
        displayDensity: 1,
        wakeLockEnabled: true,
        nightModeEnabled: false,
        nightModeStart: '22:00',
        nightModeEnd: '07:00',
        nightModeStyle: 'dim',
        nightDimOpacity: 0.85,
        nightModeWakeTimeoutMin: 2,
        nightScheduleEnabled: true,
        snapToGrid: false,
        defaultWidgetStyle: 'auto',
        isDockHidden: false,
        autoHideCursor: true,
        cursorIdleTimeoutSec: 3,
        commonPhotos: [],
        commonPhotoSourceUrl: 'https://plex.local:32400/library/sections/1/all?X-Plex-Token=plex-secret-123',
        photoAutoSyncInterval: 'daily',
        pinLockEnabled: true,
        pinHash: 'pbkdf2$120000$00112233445566778899aabbccddeeff$0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
        isLocked: false,
        lockFullscreenKiosk: true,
        lockCanvasEditing: true,
        lockSettingsAccess: true,
        updated_at: '2026-11-20T00:00:00.000Z',
      },
      tabs: [],
      widgets: [
        {
          id: 'w-wifi',
          tabId: 'tab-1',
          type: 'wifi_qr',
          title: 'Guest Wi-Fi',
          config: { ssid: 'HomeNet', password: 'secret-wifi-password', homeAddress: '123 Main' },
          freeformPos: { xRatio: 0, yRatio: 0, wRatio: 0.3, hRatio: 0.3 },
          updated_at: '2026-11-20T00:00:00.000Z',
        },
        {
          id: 'w-ha',
          tabId: 'tab-1',
          type: 'homelab',
          title: 'Homelab',
          config: {
            haBaseUrl: 'http://homeassistant.local:8123',
            haAccessToken: 'ha-token-must-strip',
            url: 'https://plex.local:32400/photo.jpg?X-Plex-Token=plex-secret-xyz',
          },
          freeformPos: { xRatio: 0.3, yRatio: 0, wRatio: 0.3, hRatio: 0.3 },
          updated_at: '2026-11-20T00:00:00.000Z',
        },
      ],
      notes: [],
    });

    assert.equal(scrubbed.settings.pinHash, null);
    assert.equal(scrubbed.settings.pinLockEnabled, false);
    assert.ok(!String(scrubbed.settings.commonPhotoSourceUrl).includes('plex-secret-123'));
    assert.equal('password' in scrubbed.widgets[0].config, false);
    assert.equal('ssid' in scrubbed.widgets[0].config, false);
    assert.equal(scrubbed.widgets[0].config.homeAddress, '123 Main');
    assert.equal('haAccessToken' in scrubbed.widgets[1].config, false);
    assert.ok(!String(scrubbed.widgets[1].config.url).includes('plex-secret-xyz'));
  });

  it('validates --port and --url and uses printf %q + quoted <<\'EOF\' heredoc in pi-kiosk-setup.sh', () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    const script = fs.readFileSync(path.join(repoRoot, 'scripts', 'pi-kiosk-setup.sh'), 'utf8');
    assert.match(script, /printf 'TARGET_URL=%q\\n'/);
    assert.match(script, /printf 'PORT=%q\\n'/);
    assert.match(script, /cat >> "\$\{LAUNCHER_SCRIPT\}" <<'EOF'/);
    assert.match(script, /Invalid --port/);
    assert.match(script, /Invalid --url/);
    assert.ok(!script.includes('--no-sandbox'));
    assert.ok(!script.includes('--disable-web-security'));
  });

  it('prevents Plex token leakage on cross-origin folder keys and validates embed URLs', () => {
    const cleanUri = 'https://plex.example.com:32400';
    const rel = buildPlexItemUrl(cleanUri, '/library/sections/1/folder?parent=7', 'X-Plex-Token=tok-123');
    assert.equal(
      rel,
      'https://plex.example.com:32400/library/sections/1/folder?parent=7&includeDetails=1&includeAdvanced=1&checkFiles=1&X-Plex-Token=tok-123'
    );

    const sameOrigin = buildPlexItemUrl(cleanUri, 'https://plex.example.com:32400/library/metadata/9', 'X-Plex-Token=tok-123');
    assert.equal(
      sameOrigin,
      'https://plex.example.com:32400/library/metadata/9?includeDetails=1&includeAdvanced=1&checkFiles=1&X-Plex-Token=tok-123'
    );

    assert.equal(buildPlexItemUrl(cleanUri, 'https://evil.example/collect', 'X-Plex-Token=tok-123'), null);
    assert.equal(buildPlexItemUrl(cleanUri, '//evil.example/collect', 'X-Plex-Token=tok-123'), null);

    assert.equal(
      isSafeExternalEmbedUrl('https://www.youtube-nocookie.com/embed/abc', {
        requireHttps: true,
        disallowOrigin: 'https://dashboard.trinhism.com',
      }),
      'https://www.youtube-nocookie.com/embed/abc'
    );
    assert.equal(
      isSafeExternalEmbedUrl('http://example.com/embed', { requireHttps: true }),
      null
    );
    assert.equal(
      isSafeExternalEmbedUrl('https://dashboard.trinhism.com/board', {
        requireHttps: true,
        disallowOrigin: 'https://dashboard.trinhism.com',
      }),
      null
    );
  });

  it('disables XML entity expansion in /api/rss and rejects non-HTML Content-Type in /api/web-proxy', async () => {
    setGuardedFetch({
      publicOnly: async (url) => {
        if (url.includes('/feed.xml')) {
          return new Response(
            '<!DOCTYPE lolz [<!ENTITY boom "EXPANDED_SECRET">]><rss><channel><title>Safe</title><item><title>&boom;</title><link>https://example.org/post</link></item></channel></rss>',
            { status: 200, headers: { 'Content-Type': 'application/rss+xml' } }
          );
        }
        return new Response('%PDF-1.7 binary', {
          status: 200,
          headers: { 'Content-Type': 'application/pdf' },
        });
      },
      privateAllowed: async () => new Response('unused', { status: 500 }),
    });
    try {
      const rssRes = await rssHandler({
        request: new Request('https://ambiently.example/api/rss?url=' + encodeURIComponent('https://example.org/feed.xml')),
      });
      assert.equal(rssRes.status, 200);
      const rssJson = (await rssRes.json()) as { items: { title: string }[] };
      assert.ok(!JSON.stringify(rssJson).includes('EXPANDED_SECRET'));

      const proxyPdfRes = await webProxy({
        request: new Request('https://ambiently.example/api/web-proxy?url=' + encodeURIComponent('https://example.org/doc.pdf'), {
          headers: { 'Sec-Fetch-Dest': 'iframe', 'Sec-Fetch-Site': 'same-origin' },
        }),
      });
      assert.equal(proxyPdfRes.status, 415);
    } finally {
      setGuardedFetch(null);
      resetApiRateLimitsForTests();
    }
  });
});

describe('Database security audit & board usage coverage (supabase/)', () => {
  const supabaseDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase');

  function collectPublicTables(): string[] {
    const sqlFiles = [
      path.join(supabaseDir, 'schema.sql'),
      ...fs
        .readdirSync(path.join(supabaseDir, 'migrations'))
        .filter((f) => f.endsWith('.sql'))
        .map((f) => path.join(supabaseDir, 'migrations', f)),
    ];
    const tables = new Set<string>();
    for (const file of sqlFiles) {
      const content = fs.readFileSync(file, 'utf8');
      for (const match of content.matchAll(/create\s+table\s+if\s+not\s+exists\s+public\.([a-z0-9_]+)/gi)) {
        tables.add(match[1]);
      }
    }
    return Array.from(tables).sort();
  }

  function extractBoardUsageBody(sqlText: string): string {
    const match = sqlText.match(/create\s+or\s+replace\s+function\s+private\.board_usage\([\s\S]*?end\s+\$\$;/i);
    assert.ok(match, 'expected private.board_usage definition');
    return match[0];
  }

  it('counts every public table from schema.sql and migrations inside private.board_usage', () => {
    const allTables = collectPublicTables();
    assert.ok(allTables.length >= 19, `expected at least 19 tables, found ${allTables.length}`);

    const schemaBoardUsage = extractBoardUsageBody(fs.readFileSync(path.join(supabaseDir, 'schema.sql'), 'utf8'));
    const migrationBoardUsage = extractBoardUsageBody(
      fs.readFileSync(path.join(supabaseDir, 'migrations', '20261117_board_limit_counts_every_table.sql'), 'utf8')
    );

    for (const table of allTables) {
      assert.ok(schemaBoardUsage.includes(`'${table}'`), `schema.sql private.board_usage is missing ${table}`);
      assert.ok(
        migrationBoardUsage.includes(`'${table}'`),
        `20261117_board_limit_counts_every_table.sql private.board_usage is missing ${table}`
      );
    }
  });

  it('discovers public tables dynamically in security-check.sql and audits limits and revision triggers', () => {
    const checkSql = fs.readFileSync(path.join(supabaseDir, 'security-check.sql'), 'utf8');
    assert.match(checkSql, /from\s+pg_class\s+c/i);
    assert.match(checkSql, /n\.nspname\s*=\s*'public'/i);
    assert.ok(
      !/values\s*\('dashboards'\),\s*\('dashboard_members'\),\s*\('tabs'\),\s*\('widgets'\),\s*\('notes'\)/i.test(
        checkSql
      ),
      'security-check.sql must not hardcode only the original 5 tables'
    );
    for (const expectedCheck of [
      'private.board_usage(text)',
      'check_board_limits_',
      'touch_dashboard_on_',
      'strip_plex_tokens',
      'pinHash',
      'haAccessToken',
    ]) {
      assert.ok(checkSql.includes(expectedCheck), `security-check.sql must check ${expectedCheck}`);
    }

    const schemaSql = fs.readFileSync(path.join(supabaseDir, 'schema.sql'), 'utf8');
    const secretMigrationSql = fs.readFileSync(
      path.join(supabaseDir, 'migrations', '20261120_strip_vault_and_pin_secrets.sql'),
      'utf8'
    );
    for (const sqlText of [schemaSql, secretMigrationSql]) {
      assert.ok(sqlText.includes('haAccessToken'));
      assert.ok(sqlText.includes('pinHash'));
    }

    const repoRoot = path.resolve(supabaseDir, '..');
    const composeText = fs.readFileSync(path.join(repoRoot, 'compose.yaml'), 'utf8');
    assert.match(composeText, /read_only:\s*true/);
    assert.match(composeText, /cap_drop:\s*\r?\n\s*-\s*ALL/);
  });

  it('hardens dashboard_members invites and strips nested Home Assistant / Homelab secrets in SQL', () => {
    const supabaseDir = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      'supabase'
    );
    const schemaText = fs.readFileSync(path.join(supabaseDir, 'schema.sql'), 'utf8');
    const migrationText = fs.readFileSync(
      path.join(supabaseDir, 'migrations', '20261124_harden_members_and_nested_secrets.sql'),
      'utf8'
    );

    for (const sqlText of [schemaText, migrationText]) {
      assert.match(sqlText, /grant insert \(dashboard_id, email, role\) on public\.dashboard_members to authenticated/i);
      assert.match(sqlText, /user_id is null/i);
      assert.match(sqlText, /email <> private\.current_email\(\)/i);
      assert.match(sqlText, /not private\.owns_dashboard\(dashboard_id\)/i);
      assert.match(sqlText, /new\.config->'homeAssistant'/i);
      assert.match(sqlText, /new\.config->'services'/i);
    }
  });
});

describe('Milestone 4 Security Regression Suite', () => {
  it('resolveClientIpFromRequest gates proxy headers behind AMBIENTLY_TRUST_PROXY', async () => {
    const { resolveClientIpFromRequest } = await import('../server/index');
    const mockReq = {
      socket: { remoteAddress: '10.0.0.50' },
      headers: {
        'x-forwarded-for': '198.51.100.1, 203.0.113.9',
        'cf-connecting-ip': '198.51.100.7',
      },
    } as unknown as http.IncomingMessage;

    assert.equal(resolveClientIpFromRequest(mockReq, 'false'), '10.0.0.50');
    assert.equal(resolveClientIpFromRequest(mockReq, ''), '10.0.0.50');
    assert.equal(resolveClientIpFromRequest(mockReq, 'true'), '203.0.113.9');
    assert.equal(resolveClientIpFromRequest(mockReq, 'cloudflare'), '198.51.100.7');
  });

  it('sanitizePlexKeySegment and buildPlexItemUrl reject traversal and cross-origin payloads', () => {
    assert.equal(sanitizePlexKeySegment('sec_12-ab', 'sectionKey'), 'sec_12-ab');
    assert.throws(() => sanitizePlexKeySegment('../../admin', 'ratingKey'), /Invalid Plex ratingKey/);
    assert.throws(() => sanitizePlexKeySegment('1/../../users', 'sectionKey'), /Invalid Plex sectionKey/);

    assert.equal(
      buildPlexItemUrl('https://plex.example.com:32400', '../users', 'X-Plex-Token=abc'),
      null
    );
    assert.equal(
      buildPlexItemUrl('https://plex.example.com:32400', '//evil.example.org/pwn', 'X-Plex-Token=abc'),
      null
    );
    assert.equal(
      buildPlexItemUrl('https://plex.example.com:32400', 'https://evil.example.org/library/1', 'X-Plex-Token=abc'),
      null
    );
    assert.equal(
      buildPlexItemUrl('https://plex.example.com:32400', '/library/metadata/42', 'X-Plex-Token=abc'),
      'https://plex.example.com:32400/library/metadata/42?includeDetails=1&includeAdvanced=1&checkFiles=1&X-Plex-Token=abc'
    );
  });

  it('matchPlexServerFromList enforces strict clientIdentifier matching when specified', () => {
    const servers = [
      {
        name: 'Home Plex',
        clientIdentifier: 'server-id-1',
        connections: [],
      },
      {
        name: 'Home Plex',
        clientIdentifier: 'server-id-2',
        connections: [],
      },
    ] as Parameters<typeof matchPlexServerFromList>[0];

    const missingMatch = matchPlexServerFromList(servers, {
      serverClientIdentifier: 'missing-server-id',
      serverName: 'Home Plex',
      sectionKey: '1',
      sectionTitle: 'Photos',
    });
    assert.equal(missingMatch, undefined);

    const exactMatch = matchPlexServerFromList(servers, {
      serverClientIdentifier: 'server-id-2',
      serverName: 'Home Plex',
      sectionKey: '1',
      sectionTitle: 'Photos',
    });
    assert.equal(exactMatch?.clientIdentifier, 'server-id-2');
  });

  it('stripHtmlToText handles malformed 50KB HTML inputs in linear time without ReDoS', () => {
    const hostileInput = `<p class="test">${'a'.repeat(50_000)}<script>${'x'.repeat(5_000)}`;
    const start = performance.now();
    const text = stripHtmlToText(hostileInput);
    const elapsedMs = performance.now() - start;

    assert.ok(elapsedMs < 200, `Expected linear-time stripHtmlToText, took ${elapsedMs}ms`);
    assert.ok(text.startsWith('aaaa'));
  });

  it('enforces backup size cap and strips __proto__/constructor/prototype keys across parsers and mergers', async () => {
    assert.equal(MAX_BACKUP_FILE_BYTES, 50 * 1024 * 1024);

    const oversized = await parseAndValidateBackup({
      size: MAX_BACKUP_FILE_BYTES + 1,
      text: async () => '{}',
    } as unknown as File);
    assert.equal(oversized.success, false);
    assert.match(oversized.error || '', /maximum supported size/i);

    // Raw string with explicit JSON __proto__ key:
    const rawJsonWithProto =
      '{"__proto__":{"polluted":"yes"},"constructor":{"bad":true},"prototype":{"bad":true},"tabs":[],"widgets":[],"notes":[],"settings":{"themeMode":"dark"}}';
    const parsed = await parseAndValidateBackup({
      size: rawJsonWithProto.length,
      text: async () => rawJsonWithProto,
    } as unknown as File);
    assert.equal(parsed.success, true);
    assert.equal(Object.hasOwn(parsed.data as object, '__proto__'), false);
    assert.equal(Object.hasOwn(parsed.data as object, 'constructor'), false);
    assert.equal(Object.hasOwn(parsed.data as object, 'prototype'), false);
    assert.equal((parsed.data?.settings as { themeMode?: string } | undefined)?.themeMode, 'dark');
    assert.equal(({} as { polluted?: unknown }).polluted, undefined);

    const rawObj = JSON.parse(
      '{"__proto__":{"polluted":true},"constructor":{"bad":1},"url":"https://plex.example.com/a?X-Plex-Token=secret&w=10"}'
    );
    const stripped = stripPlexTokens(rawObj) as Record<string, unknown>;
    assert.equal(Object.hasOwn(stripped, '__proto__'), false);
    assert.equal(Object.hasOwn(stripped, 'constructor'), false);
    assert.equal(stripped.url, 'https://plex.example.com/a?w=10');

    markDirtySettingsKeys(['__proto__', 'constructor', 'prototype', 'themeMode']);
    const fakeLocal = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(fakeLocal, '__proto__', { value: { pwned: true }, enumerable: true });
    fakeLocal.pinLockEnabled = false;
    fakeLocal.pinHash = null;
    fakeLocal.lockCanvasEditing = false;
    fakeLocal.lockFullscreenKiosk = false;
    fakeLocal.lockSettingsAccess = false;
    fakeLocal.settingsPinOptOut = false;
    fakeLocal.externalBrowserLinksPolicy = 'auto';
    fakeLocal.displayDensity = 'comfortable';
    fakeLocal.nightModeEnabled = false;
    fakeLocal.themeMode = 'light';
    fakeLocal.updated_at = '2026-11-24T00:00:00.000Z';

    const merged = mergeConcurrentCloudSettings({
      defaultSettings: { id: 'global', themeMode: 'dark' } as unknown as Parameters<typeof mergeConcurrentCloudSettings>[0]['defaultSettings'],
      baseCloudSettings: { themeMode: 'dark' },
      localSettings: fakeLocal as unknown as Parameters<typeof mergeConcurrentCloudSettings>[0]['localSettings'],
      dirtyKeys: ['__proto__', 'constructor', 'themeMode'],
    });
    assert.equal(Object.hasOwn(merged as object, '__proto__'), false);
    assert.equal(Object.hasOwn(merged as object, 'constructor'), false);
    assert.equal((merged as unknown as { pwned?: unknown }).pwned, undefined);
    assert.equal(merged.themeMode, 'light');
  });
});
