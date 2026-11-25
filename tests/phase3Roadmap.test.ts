import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DashboardTab } from '../src/types/dashboard';
import {
  clearAllDisplayRoomPreferencesForTests,
  readDisplayRoomPreferences,
  resolveDisplayHomeTab,
  resolveDisplayVisibleTabs,
  writeDisplayRoomPreferences,
} from '../src/utils/displayRoomFilter';
import {
  clearCanvasScheduleSnooze,
  computeScheduleSnoozeUntil,
  isTimeInScheduleRule,
  normalizeCanvasSchedules,
  readCanvasScheduleSnooze,
  resolveActiveCanvasSchedule,
  writeCanvasScheduleSnooze,
} from '../src/utils/canvasSchedule';
import {
  isSensitiveHomeAssistantEntity,
  resolveAllowedHaServiceCall,
  resolveHomeAssistantEntities,
  resolveHomelabCameras,
} from '../src/utils/homelabEngine';
import {
  loadHomelabCredentialsWithSharedFallback,
  saveHomelabCredentialsToVault,
} from '../src/utils/homelabVault';
import { parsePlexSessionsPayload } from '../src/services/nowPlaying';
import { onRequestPost } from '../functions/api/homelab';
import { resetApiRateLimitsForTests, setGuardedFetch } from '../functions/_shared/fetchExternal';

function makeTab(id: string, name: string, overrides: Partial<DashboardTab> = {}): DashboardTab {
  return {
    id,
    name,
    order: 0,
    autoRotateDurationSec: 30,
    updated_at: '2026-11-24T12:00:00.000Z',
    ...overrides,
  };
}

describe('Phase 3 Per-Room Display Filtering (displayRoomFilter.ts)', () => {
  afterEach(() => {
    clearAllDisplayRoomPreferencesForTests();
  });

  it('isolates room preferences per board, overrides home canvas, and preserves >=1 visible tab', () => {
    const tabs: DashboardTab[] = [
      makeTab('tab-home', 'Family Hub', { isHome: true }),
      makeTab('tab-kitchen', 'Kitchen'),
      makeTab('tab-bedroom', 'Bedroom'),
    ];

    writeDisplayRoomPreferences(
      {
        roomName: 'Kitchen Wall',
        localHomeTabId: 'tab-kitchen',
        hiddenTabIds: ['tab-bedroom'],
        followCanvasSchedule: true,
      },
      'board-alpha'
    );
    writeDisplayRoomPreferences(
      {
        roomName: 'Office',
        localHomeTabId: 'tab-home',
        hiddenTabIds: ['tab-kitchen'],
      },
      'board-beta'
    );

    const prefsAlpha = readDisplayRoomPreferences('board-alpha');
    assert.equal(prefsAlpha.roomName, 'Kitchen Wall');
    const visibleAlpha = resolveDisplayVisibleTabs(tabs, prefsAlpha);
    assert.deepEqual(
      visibleAlpha.map((t) => t.id),
      ['tab-home', 'tab-kitchen']
    );
    assert.equal(resolveDisplayHomeTab(visibleAlpha, tabs, prefsAlpha)?.id, 'tab-kitchen');

    // Safety invariant: hiding all tabs still leaves one fallback tab visible
    const hideAllPrefs = { ...prefsAlpha, hiddenTabIds: ['tab-home', 'tab-kitchen', 'tab-bedroom'] };
    const fallbackVisible = resolveDisplayVisibleTabs(tabs, hideAllPrefs);
    assert.equal(fallbackVisible.length, 1);
    assert.equal(fallbackVisible[0].id, 'tab-kitchen');

    const prefsBeta = readDisplayRoomPreferences('board-beta');
    assert.equal(prefsBeta.roomName, 'Office');
    assert.deepEqual(
      resolveDisplayVisibleTabs(tabs, prefsBeta).map((t) => t.id),
      ['tab-home', 'tab-bedroom']
    );
  });
});

describe('Phase 3 Time-of-Day Canvas Scheduling (canvasSchedule.ts)', () => {
  afterEach(() => {
    clearCanvasScheduleSnooze();
  });

  it('evaluates same-day and overnight schedule windows with weekday filtering and snoozing', () => {
    const normalized = normalizeCanvasSchedules([
      {
        id: 'morning',
        tabId: 'tab-morning',
        startTime: '06:30',
        endTime: '09:00',
        daysOfWeek: [1, 2, 3, 4, 5],
        enabled: true,
      },
      {
        id: 'night-photos',
        tabId: 'tab-photos',
        startTime: '21:00',
        endTime: '06:00',
        daysOfWeek: [5], // Friday night into Saturday 06:00
        enabled: true,
      },
      {
        id: 'bad',
        tabId: 'tab-bad',
        startTime: '99:00',
        endTime: '10:00',
        enabled: true,
      },
    ]);
    assert.equal(normalized.length, 2);

    // Tuesday at 07:15 matches morning weekday rule
    const tueMorning = new Date(2026, 10, 24, 7, 15, 0, 0); // Tuesday Nov 24, 2026
    assert.equal(isTimeInScheduleRule(tueMorning, normalized[0]), true);

    // Saturday at 02:30 matches Friday overnight rule
    const satEarly = new Date(2026, 10, 28, 2, 30, 0, 0); // Saturday Nov 28, 2026
    assert.equal(isTimeInScheduleRule(satEarly, normalized[1]), true);

    const visibleSet = new Set(['tab-morning', 'tab-photos']);
    const resolved = resolveActiveCanvasSchedule({
      now: tueMorning,
      enabled: true,
      followOnThisDisplay: true,
      rules: normalized,
      visibleTabIds: visibleSet,
    });
    assert.equal(resolved?.id, 'morning');

    // Room display opt-out suppresses scheduled switching
    assert.equal(
      resolveActiveCanvasSchedule({
        now: tueMorning,
        enabled: true,
        followOnThisDisplay: false,
        rules: normalized,
        visibleTabIds: visibleSet,
      }),
      null
    );

    // Snooze until window end vs fixed minutes
    const snoozeFixed = computeScheduleSnoozeUntil(
      tueMorning.getTime(),
      15,
      normalized[0],
      tueMorning
    );
    assert.equal(snoozeFixed, tueMorning.getTime() + 15 * 60 * 1000);

    const snoozeUntilEnd = computeScheduleSnoozeUntil(
      tueMorning.getTime(),
      0,
      normalized[0],
      tueMorning
    );
    assert.equal(snoozeUntilEnd, new Date(2026, 10, 24, 9, 0, 0, 0).getTime());

    writeCanvasScheduleSnooze('morning', snoozeFixed);
    assert.equal(readCanvasScheduleSnooze()?.ruleId, 'morning');
  });
});

describe('Phase 3 Interactive Home Assistant, Cameras & Now Playing', () => {
  afterEach(() => {
    setGuardedFetch(null);
    resetApiRateLimitsForTests();
    delete process.env.AMBIENTLY_ALLOW_PRIVATE_FEEDS;
  });

  it('strictly allowlists HA service calls, protects sensitive entities, and shares origin-bound vault tokens', async () => {
    assert.deepEqual(resolveAllowedHaServiceCall('light.kitchen'), {
      domain: 'light',
      service: 'toggle',
    });
    assert.deepEqual(resolveAllowedHaServiceCall('lock.front_door', 'unlock'), {
      domain: 'lock',
      service: 'unlock',
    });
    assert.deepEqual(resolveAllowedHaServiceCall('cover.garage_door', 'close_cover'), {
      domain: 'cover',
      service: 'close_cover',
    });
    assert.equal(resolveAllowedHaServiceCall('sensor.temperature', 'turn_on'), null);
    assert.equal(resolveAllowedHaServiceCall('hassio.host_reboot', 'reboot'), null);
    assert.equal(resolveAllowedHaServiceCall('shell_command.wipe', 'turn_on'), null);
    assert.equal(resolveAllowedHaServiceCall('light.kitchen', 'arbitrary_call'), null);

    assert.equal(isSensitiveHomeAssistantEntity('lock.front_door'), true);
    assert.equal(isSensitiveHomeAssistantEntity('light.kitchen'), false);

    const entities = resolveHomeAssistantEntities([
      { entityId: 'lock.front_door', allowControl: true },
      { entityId: 'light.kitchen', allowControl: true },
    ]);
    assert.equal(entities[0].requirePin, true);
    assert.equal(entities[1].requirePin, false);

    const cams = resolveHomelabCameras([
      { name: 'Porch', sourceType: 'ha_entity', entityId: 'camera.front_porch' },
      { name: 'Bad', sourceType: 'ha_entity', entityId: 'sensor.not_a_camera' },
      { name: 'Driveway', sourceType: 'snapshot_url', snapshotUrl: 'http://192.168.1.60/snap.jpg' },
    ]);
    assert.equal(cams.length, 2);

    await saveHomelabCredentialsToVault('widget-hl-1', {
      haAccessToken: 'ha-token-fixture-001',
      boundOrigin: 'https://ha.example.com:8123',
    });
    const sharedSameOrigin = await loadHomelabCredentialsWithSharedFallback(
      'widget-np-1',
      'https://ha.example.com:8123/api'
    );
    assert.equal(sharedSameOrigin?.haAccessToken, 'ha-token-fixture-001');

    const sharedOtherOrigin = await loadHomelabCredentialsWithSharedFallback(
      'widget-np-2',
      'https://other.example.org:8123'
    );
    assert.equal(sharedOtherOrigin, null);
  });

  it('executes HA service call, enforces LAN gate & MIME checks on cameras, and reads HA media_player', async () => {
    const requestedUrls: Array<{ url: string; method?: string; redirect?: RequestRedirect }> = [];
    setGuardedFetch({
      publicOnly: async () => new Response('unexpected', { status: 500 }),
      privateAllowed: async (url, init) => {
        requestedUrls.push({ url, method: init.method, redirect: init.redirect });
        if (url.endsWith('/api/services/light/toggle')) {
          return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (url.endsWith('/api/states/light.kitchen')) {
          return new Response(
            JSON.stringify({ state: 'on', attributes: { friendly_name: 'Kitchen Light' } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url.endsWith('/api/camera_proxy/camera.porch')) {
          return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
            status: 200,
            headers: { 'Content-Type': 'image/jpeg' },
          });
        }
        if (url.includes('/bad-svg')) {
          return new Response('<svg/>', {
            status: 200,
            headers: { 'Content-Type': 'image/svg+xml' },
          });
        }
        if (url.endsWith('/api/states/media_player.sonos')) {
          return new Response(
            JSON.stringify({
              state: 'playing',
              attributes: {
                friendly_name: 'Living Room Sonos',
                media_title: 'Midnight City',
                media_artist: 'M83',
                media_album_name: 'Hurry Up, Were Dreaming',
                media_duration: 243,
                media_position: 45,
                entity_picture: '/api/media_player_proxy/media_player.sonos?token=abc',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url.includes('/api/media_player_proxy/')) {
          return new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
            status: 200,
            headers: { 'Content-Type': 'image/png' },
          });
        }
        return new Response('not found', { status: 404 });
      },
    });

    // 1. Camera snapshot gated when AMBIENTLY_ALLOW_PRIVATE_FEEDS is unset
    delete process.env.AMBIENTLY_ALLOW_PRIVATE_FEEDS;
    const blockedCamRes = await onRequestPost({
      request: new Request('https://ambiently.local/api/homelab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'check',
          homeAssistant: { baseUrl: 'http://homeassistant.local:8123', accessToken: 'tok', entities: [] },
          cameras: [{ id: 'c1', name: 'Porch', sourceType: 'ha_entity', entityId: 'camera.porch', enabled: true }],
        }),
      }),
    });
    const blockedCamJson = (await blockedCamRes.json()) as {
      cameras: Array<{ state: string; blockedByLanGate?: boolean }>;
    };
    assert.equal(blockedCamJson.cameras[0].state, 'ERROR');
    assert.equal(blockedCamJson.cameras[0].blockedByLanGate, true);

    // 2. With AMBIENTLY_ALLOW_PRIVATE_FEEDS='true': ha_service, raster cameras, SVG rejection, and HA media_player succeed
    process.env.AMBIENTLY_ALLOW_PRIVATE_FEEDS = 'true';

    const svcRes = await onRequestPost({
      request: new Request('https://ambiently.local/api/homelab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'ha_service',
          baseUrl: 'https://ha.example.com:8123',
          accessToken: 'ha-token-fixture',
          entityId: 'light.kitchen',
          action: 'toggle',
        }),
      }),
    });
    const svcJson = (await svcRes.json()) as { ok: boolean; entity?: { formattedValue: string } };
    assert.equal(svcJson.ok, true);
    assert.equal(svcJson.entity?.formattedValue, 'On');
    assert.equal(requestedUrls.every((r) => r.redirect === 'manual'), true);

    const camRes = await onRequestPost({
      request: new Request('https://ambiently.local/api/homelab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'check',
          homeAssistant: { baseUrl: 'https://ha.example.com:8123', accessToken: 'ha-token-fixture', entities: [] },
          cameras: [
            { id: 'c1', name: 'Porch', sourceType: 'ha_entity', entityId: 'camera.porch', enabled: true },
            { id: 'c2', name: 'Bad SVG', sourceType: 'snapshot_url', snapshotUrl: 'https://ha.example.com/bad-svg', enabled: true },
          ],
        }),
      }),
    });
    const camJson = (await camRes.json()) as {
      cameras: Array<{ state: string; imageDataUrl?: string; error?: string }>;
    };
    assert.equal(camJson.cameras[0].state, 'OK');
    assert.match(camJson.cameras[0].imageDataUrl || '', /^data:image\/jpeg;base64,/);
    assert.equal(camJson.cameras[1].state, 'ERROR');
    assert.match(camJson.cameras[1].error || '', /raster image/i);

    const mpRes = await onRequestPost({
      request: new Request('https://ambiently.local/api/homelab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'ha_media_player',
          baseUrl: 'https://ha.example.com:8123',
          accessToken: 'ha-token-fixture',
          entityId: 'media_player.sonos',
        }),
      }),
    });
    const mpJson = (await mpRes.json()) as {
      ok: boolean;
      state: string;
      title?: string;
      artist?: string;
      artworkDataUrl?: string;
    };
    assert.equal(mpJson.ok, true);
    assert.equal(mpJson.state, 'playing');
    assert.equal(mpJson.title, 'Midnight City');
    assert.equal(mpJson.artist, 'M83');
    assert.match(mpJson.artworkDataUrl || '', /^data:image\/png;base64,/);
  });

  it('parses Plex active sessions cleanly and rejects path-traversal artwork thumbnails', () => {
    const payload = {
      MediaContainer: {
        Metadata: [
          {
            type: 'track',
            title: 'Paused Track',
            grandparentTitle: 'Other Artist',
            Player: { title: 'Bedroom', state: 'paused' },
          },
          {
            type: 'track',
            title: 'Starlight',
            grandparentTitle: 'Muse',
            parentTitle: 'Black Holes and Revelations',
            thumb: '/library/metadata/123/thumb/456',
            duration: 240000,
            viewOffset: 60000,
            Player: { title: 'Living Room Sonos', state: 'playing' },
            User: { title: 'Tony' },
          },
        ],
      },
    };

    const parsed = parsePlexSessionsPayload(
      payload,
      'https://plex.example.com:32400',
      'plex-token-sample'
    );
    assert.equal(parsed.status, 'playing');
    assert.equal(parsed.title, 'Starlight');
    assert.equal(parsed.artistOrSubtitle, 'Muse');
    assert.equal(parsed.playerName, 'Living Room Sonos');
    assert.equal(
      parsed.artworkUrl,
      'https://plex.example.com:32400/library/metadata/123/thumb/456?X-Plex-Token=plex-token-sample'
    );

    const filteredBedroom = parsePlexSessionsPayload(
      payload,
      'https://plex.example.com:32400',
      'plex-token-sample',
      'bedroom'
    );
    assert.equal(filteredBedroom.status, 'paused');
    assert.equal(filteredBedroom.title, 'Paused Track');

    const traversalPayload = {
      MediaContainer: {
        Metadata: [
          {
            type: 'movie',
            title: 'Unsafe Thumb',
            thumb: '/library/../../accounts',
            Player: { state: 'playing' },
          },
        ],
      },
    };
    const unsafe = parsePlexSessionsPayload(
      traversalPayload,
      'https://plex.example.com:32400',
      'plex-token-sample'
    );
    assert.equal(unsafe.artworkUrl, undefined);
  });
});
