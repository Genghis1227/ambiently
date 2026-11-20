import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyServiceProbeResult,
  formatHomeAssistantEntityReading,
  isValidHomeAssistantEntityId,
  normalizeHomelabBaseUrl,
  resolveHomeAssistantEntities,
  resolveHomelabServices,
} from '../src/utils/homelabEngine';
import {
  deleteHomelabCredentialsFromVault,
  getHomelabVaultKey,
  loadHomelabCredentialsFromVault,
  saveHomelabCredentialsToVault,
} from '../src/utils/homelabVault';
import {
  sanitizeWidgetConfigForCloud,
  stripHomelabCredentialsFromConfig,
} from '../src/utils/mediaOptimization';
import { onRequestGet, onRequestPost } from '../functions/api/homelab';
import { isBlockedAddress } from '../server/addressGuard';

describe('homelabEngine', () => {
  it('validates Home Assistant entity IDs strictly and sanitizes service/entity arrays', () => {
    assert.equal(isValidHomeAssistantEntityId('sensor.indoor_temperature'), true);
    assert.equal(isValidHomeAssistantEntityId('cover.garage_door'), true);
    assert.equal(isValidHomeAssistantEntityId(''), false);
    assert.equal(isValidHomeAssistantEntityId('sensor/../config'), false);
    assert.equal(isValidHomeAssistantEntityId('sensor.temp?foo=1'), false);
    assert.equal(isValidHomeAssistantEntityId('no_domain'), false);

    assert.equal(normalizeHomelabBaseUrl('http://192.168.1.50:8123///'), 'http://192.168.1.50:8123');

    const svcs = resolveHomelabServices([
      { id: '1', name: 'Plex', url: ' http://192.168.1.50:32400/identity ', preset: 'plex', enabled: true },
      { id: '2', name: '', url: '', enabled: true },
    ]);
    assert.equal(svcs.length, 1);
    assert.equal(svcs[0].url, 'http://192.168.1.50:32400/identity');

    const entities = resolveHomeAssistantEntities([
      { id: 'e1', entityId: 'Sensor.Temp_Upstairs', label: 'Upstairs', enabled: true },
      { id: 'e2', entityId: '../secrets', enabled: true },
      { id: 'e3', entityId: 'sensor.temp_upstairs', enabled: true },
    ]);
    assert.equal(entities.length, 1);
    assert.equal(entities[0].entityId, 'sensor.temp_upstairs');
    assert.equal(entities[0].iconHint, 'thermometer');
  });

  it('classifies service probe HTTP statuses and formats Home Assistant entity readings', () => {
    assert.equal(classifyServiceProbeResult({ ok: true, status: 200, latencyMs: 42 }).state, 'UP');
    assert.equal(classifyServiceProbeResult({ ok: false, status: 401, latencyMs: 18 }).state, 'UP');
    assert.equal(
      classifyServiceProbeResult({ ok: true, status: 200, latencyMs: 3100 }).state,
      'DEGRADED'
    );
    assert.equal(
      classifyServiceProbeResult({
        ok: true,
        status: 200,
        latencyMs: 40,
        bodySnippet: '{"status":"down"}',
      }).state,
      'DEGRADED'
    );
    assert.equal(classifyServiceProbeResult({ ok: false, status: 503, latencyMs: 20 }).state, 'DOWN');

    const numericReading = formatHomeAssistantEntityReading(
      { id: 'e1', entityId: 'sensor.indoor_temp', label: 'Living Room', enabled: true },
      { state: '72.44', attributes: { unit_of_measurement: '°F' } }
    );
    assert.equal(numericReading.formattedValue, '72.4°F');
    assert.equal(numericReading.label, 'Living Room');

    const doorOpen = formatHomeAssistantEntityReading(
      { id: 'e2', entityId: 'cover.garage_door', label: 'Garage', iconHint: 'door', enabled: true },
      { state: 'open' }
    );
    assert.equal(doorOpen.formattedValue, 'Open');
    assert.equal(doorOpen.tone, 'warn');

    const doorClosed = formatHomeAssistantEntityReading(
      { id: 'e3', entityId: 'cover.garage_door', label: 'Garage', iconHint: 'door', enabled: true },
      { state: 'closed' }
    );
    assert.equal(doorClosed.formattedValue, 'Closed');
    assert.equal(doorClosed.tone, 'good');
  });
});

describe('homelabVault and cloud credential stripping', () => {
  it('stores HA tokens locally in fallback vault and strips secret keys before cloud sync', async () => {
    const widgetId = 'widget-homelab-test';
    assert.equal(getHomelabVaultKey(widgetId), 'homelab-cred:widget-homelab-test');

    await saveHomelabCredentialsToVault(widgetId, {
      haAccessToken: 'ha-local-token-sample-987654',
    });
    const loaded = await loadHomelabCredentialsFromVault(widgetId);
    assert.deepEqual(loaded, { haAccessToken: 'ha-local-token-sample-987654' });

    await deleteHomelabCredentialsFromVault(widgetId);
    assert.equal(await loadHomelabCredentialsFromVault(widgetId), null);

    const stripped = stripHomelabCredentialsFromConfig({
      haBaseUrl: 'http://homeassistant.local:8123',
      haAccessToken: 'ha-local-token-sample-987654',
      accessToken: 'secret-a',
      apiToken: 'secret-b',
      bearerToken: 'secret-c',
      serviceHeaders: { Authorization: 'Bearer nope' },
      services: [{ id: 's1', name: 'Plex', url: 'http://192.168.1.50:32400', token: 'drop-me', enabled: true }],
    });

    assert.equal('haAccessToken' in stripped, false);
    assert.equal('accessToken' in stripped, false);
    assert.equal('apiToken' in stripped, false);
    assert.equal('bearerToken' in stripped, false);
    assert.equal('serviceHeaders' in stripped, false);
    assert.equal('token' in stripped.services[0], false);
    assert.equal(stripped.haBaseUrl, 'http://homeassistant.local:8123');

    const cloudSafe = sanitizeWidgetConfigForCloud(
      {
        haBaseUrl: 'http://homeassistant.local:8123',
        haAccessToken: 'ha-local-token-sample-987654',
        showLatency: true,
      },
      'homelab'
    );
    assert.equal('haAccessToken' in cloudSafe, false);
    assert.equal(cloudSafe.showLatency, true);
  });
});

describe('/api/homelab LAN gating and SSRF protection', () => {
  it('blocks cross-site requests and gates LAN endpoints behind AMBIENTLY_ALLOW_PRIVATE_FEEDS while always blocking loopback and metadata', async () => {
    const prevEnv = process.env.AMBIENTLY_ALLOW_PRIVATE_FEEDS;
    try {
      const crossSiteRes = await onRequestGet({
        request: new Request('https://ambiently.local/api/homelab', {
          headers: { 'Sec-Fetch-Site': 'cross-site' },
        }),
      });
      assert.equal(crossSiteRes.status, 403);

      // 1. Default deployment (AMBIENTLY_ALLOW_PRIVATE_FEEDS != 'true'): RFC1918 & .local blocked cleanly with lanAllowed=false
      delete process.env.AMBIENTLY_ALLOW_PRIVATE_FEEDS;
      const capDisabled = await (await onRequestGet({
        request: new Request('https://ambiently.local/api/homelab'),
      })).json() as { lanAllowed: boolean };
      assert.equal(capDisabled.lanAllowed, false);

      const blockedLanRes = await onRequestPost({
        request: new Request('https://ambiently.local/api/homelab', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            services: [
              { id: 'plex', name: 'Plex', url: 'http://192.168.1.50:32400/identity', enabled: true },
            ],
            homeAssistant: {
              baseUrl: 'http://homeassistant.local:8123',
              accessToken: 'ha-local-token-sample-987654',
              entities: [{ id: 't1', entityId: 'sensor.temp', enabled: true }],
            },
          }),
        }),
      });
      const blockedPayload = await blockedLanRes.json() as {
        lanAllowed: boolean;
        services: Array<{ blockedByLanGate?: boolean; state: string }>;
        entities: Array<{ blockedByLanGate?: boolean; formattedValue: string }>;
      };
      assert.equal(blockedPayload.lanAllowed, false);
      assert.equal(blockedPayload.services[0].blockedByLanGate, true);
      assert.equal(blockedPayload.services[0].state, 'DOWN');
      assert.equal(blockedPayload.entities[0].blockedByLanGate, true);

      // 2. Self-hosted LAN mode (AMBIENTLY_ALLOW_PRIVATE_FEEDS='true'): loopback & cloud metadata MUST remain blocked
      process.env.AMBIENTLY_ALLOW_PRIVATE_FEEDS = 'true';
      const capEnabled = await (await onRequestGet({
        request: new Request('https://ambiently.local/api/homelab'),
      })).json() as { lanAllowed: boolean };
      assert.equal(capEnabled.lanAllowed, true);

      const ssrfAttempt = await onRequestPost({
        request: new Request('https://ambiently.local/api/homelab', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            services: [
              { id: 'loop', name: 'Loopback', url: 'http://127.0.0.1:8123', enabled: true },
              { id: 'lh', name: 'Localhost', url: 'http://localhost:8080', enabled: true },
              {
                id: 'meta',
                name: 'Metadata',
                url: 'https://169.254.169.254/latest/meta-data/',
                enabled: true,
              },
            ],
          }),
        }),
      });
      const ssrfPayload = await ssrfAttempt.json() as {
        services: Array<{ id: string; state: string; blockedByLanGate?: boolean }>;
      };
      for (const svc of ssrfPayload.services) {
        assert.equal(svc.state, 'DOWN', `${svc.id} must remain blocked`);
        assert.equal(svc.blockedByLanGate, false, `${svc.id} must never be marked as LAN-gate-eligible`);
      }

      // 3. DNS / socket-level address guard checks
      assert.equal(isBlockedAddress('127.0.0.1', true), true);
      assert.equal(isBlockedAddress('::1', true), true);
      assert.equal(isBlockedAddress('::ffff:127.0.0.1', true), true);
      assert.equal(isBlockedAddress('169.254.169.254', true), true);
      assert.equal(isBlockedAddress('192.168.1.50', false), true);
      assert.equal(isBlockedAddress('192.168.1.50', true), false);
      assert.equal(isBlockedAddress('100.64.0.10', true), false);
    } finally {
      if (prevEnv === undefined) {
        delete process.env.AMBIENTLY_ALLOW_PRIVATE_FEEDS;
      } else {
        process.env.AMBIENTLY_ALLOW_PRIVATE_FEEDS = prevEnv;
      }
    }
  });
});
