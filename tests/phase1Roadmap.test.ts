import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeIdleScreensaverTimeoutMin,
  resolveScreensaverWeatherLocation,
  shouldBlockIdleScreensaver,
} from '../src/utils/idleScreensaver.ts';
import {
  filterCalendarEvents,
  localFamilyEventsToCalendarEvents,
  mergeCalendarEventsSnapshots,
  sanitizeLocalFamilyEvent,
} from '../src/utils/calendarEventsEngine.ts';
import { useCalendarEventsStore } from '../src/stores/useCalendarEventsStore.ts';
import {
  LOCAL_CALENDAR_ID,
  LOCAL_CALENDAR_NAME,
  type CalendarEventsSnapshot,
  type LocalFamilyEvent,
} from '../src/types/calendarEvents.ts';
import {
  extractUpcomingHourlyForecast,
  fetchWeatherAlerts,
  formatHourlyPointTime,
  getPeakPrecipProb,
  isWithinUsNwsBounds,
  parseNwsAlertsResponse,
} from '../src/services/weather.ts';
import type { DashboardWidget } from '../src/types/dashboard.ts';
import type { HouseholdProfile } from '../src/types/profiles.ts';
import type { CalendarEvent } from '../src/services/feeds.ts';

function makeWidget(overrides: Partial<DashboardWidget> = {}): DashboardWidget {
  return {
    id: 'w-1',
    tabId: 'tab-corkboard',
    type: 'weather',
    title: 'Weather',
    gridPos: { x: 0, y: 0, w: 3, h: 3 },
    freeformPos: {
      xRatio: 0.1,
      yRatio: 0.1,
      wRatio: 0.25,
      hRatio: 0.25,
      zIndex: 1,
      rotation: 0,
      isFullScreen: false,
    },
    config: {},
    updated_at: '2026-11-22T10:00:00.000Z',
    ...overrides,
  };
}

function makeProfile(overrides: Partial<HouseholdProfile> = {}): HouseholdProfile {
  return {
    id: 'p-1',
    name: 'Tony',
    role: 'parent',
    color: '#3b82f6',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeLocalEvent(overrides: Partial<LocalFamilyEvent> = {}): LocalFamilyEvent {
  return {
    id: 'evt-1',
    title: 'Soccer Practice',
    date: '2026-11-25',
    isAllDay: false,
    startTime: '17:00',
    endTime: '18:30',
    color: '#10b981',
    profileIds: ['p-1'],
    location: 'North Field',
    notes: 'Bring cleats',
    createdAt: '2026-11-20T10:00:00.000Z',
    updatedAt: '2026-11-20T10:00:00.000Z',
    ...overrides,
  };
}

describe('Phase 1 — Idle Photo Screensaver helpers', () => {
  it('normalizes supported timeouts and falls back to 0 when invalid', () => {
    assert.equal(normalizeIdleScreensaverTimeoutMin(0), 0);
    assert.equal(normalizeIdleScreensaverTimeoutMin(5), 5);
    assert.equal(normalizeIdleScreensaverTimeoutMin('10'), 10);
    assert.equal(normalizeIdleScreensaverTimeoutMin(15), 15);
    assert.equal(normalizeIdleScreensaverTimeoutMin(30), 30);
    assert.equal(normalizeIdleScreensaverTimeoutMin(7), 0);
    assert.equal(normalizeIdleScreensaverTimeoutMin(-1), 0);
    assert.equal(normalizeIdleScreensaverTimeoutMin(undefined), 0);
  });

  it('blocks screensaver during night mode, overlays, mobile companion, or active dialogs/alarms', () => {
    const base = {
      timeoutMin: 10,
      isMobileCompanionActive: false,
      nightModeEnabled: false,
      isAnyBlockingOverlayOpen: false,
      hasActiveModalOrAlarmInDom: false,
    };
    assert.equal(shouldBlockIdleScreensaver(base), false);
    assert.equal(shouldBlockIdleScreensaver({ ...base, timeoutMin: 0 }), true);
    assert.equal(shouldBlockIdleScreensaver({ ...base, isMobileCompanionActive: true }), true);
    assert.equal(shouldBlockIdleScreensaver({ ...base, nightModeEnabled: true }), true);
    assert.equal(shouldBlockIdleScreensaver({ ...base, isAnyBlockingOverlayOpen: true }), true);
    assert.equal(shouldBlockIdleScreensaver({ ...base, hasActiveModalOrAlarmInDom: true }), true);
  });

  it('resolves the newest non-deleted weather or clock_weather location cleanly', () => {
    assert.equal(resolveScreensaverWeatherLocation([]), null);

    const resolved = resolveScreensaverWeatherLocation([
      makeWidget({
        id: 'w-deleted',
        type: 'weather',
        deleted_at: '2026-11-22T12:00:00.000Z',
        updated_at: '2026-11-22T12:00:00.000Z',
        config: { latitude: 40.71, longitude: -74.0, locationName: 'NYC', unit: 'F' },
      }),
      makeWidget({
        id: 'w-older',
        type: 'weather',
        updated_at: '2026-11-22T09:00:00.000Z',
        config: { latitude: 37.77, longitude: -122.41, locationName: 'San Francisco', unit: 'F' },
      }),
      makeWidget({
        id: 'w-newest',
        type: 'clock_weather',
        updated_at: '2026-11-22T11:00:00.000Z',
        config: { latitude: 47.6, longitude: -122.33, locationName: 'Seattle', unit: 'C' },
      }),
    ]);

    assert.deepEqual(resolved, {
      locationName: 'Seattle',
      latitude: 47.6,
      longitude: -122.33,
      unit: 'C',
    });
  });
});

describe('Phase 1 — Local Family Events Engine, Filtering & Sync Merge', () => {
  beforeEach(() => {
    useCalendarEventsStore.getState().resetForBoardSwitch();
  });

  it('sanitizes fields, rejects invalid dates/titles, and drops times for all-day events', () => {
    assert.equal(sanitizeLocalFamilyEvent({ id: 'x', title: '   ', date: '2026-11-22' }), null);
    assert.equal(sanitizeLocalFamilyEvent({ id: 'x', title: 'Valid', date: '11/22/2026' }), null);

    const cleaned = sanitizeLocalFamilyEvent({
      id: 'evt-clean',
      title: '  Thanksgiving Break  ',
      date: '2026-11-26',
      endDate: '2026-11-24', // before start -> dropped
      isAllDay: true,
      startTime: '09:00',
      color: 'invalid',
      profileIds: ['p-1', 'p-1', '  '],
    });
    assert.ok(cleaned);
    assert.equal(cleaned.title, 'Thanksgiving Break');
    assert.equal(cleaned.endDate, undefined);
    assert.equal(cleaned.startTime, undefined);
    assert.equal(cleaned.color, '#10b981');
    assert.deepEqual(cleaned.profileIds, ['p-1']);
  });

  it('converts local all-day (with exclusive multi-day DTEND), timed events, and strips deleted profiles', () => {
    const activeProfile = makeProfile({ id: 'p-1' });
    const deletedProfile = makeProfile({
      id: 'p-deleted',
      deletedAt: '2026-11-20T00:00:00.000Z',
    });

    const converted = localFamilyEventsToCalendarEvents(
      [
        makeLocalEvent({
          id: 'multi',
          title: 'Family Trip',
          date: '2026-12-24',
          endDate: '2026-12-26',
          isAllDay: true,
          profileIds: ['p-1', 'p-deleted'],
        }),
        makeLocalEvent({
          id: 'timed',
          title: 'Dentist',
          date: '2026-12-28',
          isAllDay: false,
          startTime: '14:30',
          endTime: '15:30',
          profileIds: ['p-1'],
        }),
      ],
      [activeProfile, deletedProfile]
    );

    assert.equal(converted.length, 2);
    assert.equal(converted[0].calendarId, LOCAL_CALENDAR_ID);
    assert.equal(converted[0].calendarName, LOCAL_CALENDAR_NAME);
    assert.equal(converted[0].start, '2026-12-24');
    // RFC 5545 exclusive end is inclusive end + 1 day
    assert.equal(converted[0].end, '2026-12-27');
    assert.deepEqual(converted[0].profileIds, ['p-1']);
    assert.equal(converted[0].localEventId, 'multi');

    assert.equal(converted[1].isAllDay, false);
    assert.ok(!Number.isNaN(Date.parse(converted[1].start)));
    assert.ok(converted[1].end && Date.parse(converted[1].end) > Date.parse(converted[1].start));
  });

  it('filters calendar events cleanly by source IDs and tagged household profile', () => {
    const events: CalendarEvent[] = [
      {
        uid: 'ics-1',
        calendarId: 'google-home',
        calendarName: 'Home',
        color: '#3b82f6',
        summary: 'Parent Teacher Conf',
        start: '2026-11-24T10:00:00Z',
        isAllDay: false,
      },
      {
        uid: 'loc-1',
        calendarId: LOCAL_CALENDAR_ID,
        calendarName: LOCAL_CALENDAR_NAME,
        color: '#10b981',
        summary: 'Leo Swim',
        start: '2026-11-24',
        isAllDay: true,
        localEventId: 'evt-leo',
        profileIds: ['p-leo'],
      },
      {
        uid: 'loc-2',
        calendarId: LOCAL_CALENDAR_ID,
        calendarName: LOCAL_CALENDAR_NAME,
        color: '#f59e0b',
        summary: 'Maya Piano',
        start: '2026-11-24',
        isAllDay: true,
        localEventId: 'evt-maya',
        profileIds: ['p-maya'],
      },
    ];

    assert.equal(filterCalendarEvents(events, null, null).length, 3);
    assert.deepEqual(
      filterCalendarEvents(events, new Set(['google-home']), null).map((e) => e.uid),
      ['ics-1']
    );
    assert.deepEqual(
      filterCalendarEvents(events, null, 'p-leo').map((e) => e.uid),
      ['loc-1']
    );
    assert.deepEqual(
      filterCalendarEvents(events, new Set(['google-home']), 'p-leo'),
      []
    );
  });

  it('merges concurrent adds across devices and honors deletion tombstones', () => {
    const localSnap: CalendarEventsSnapshot = {
      id: 'household_calendar_events',
      events: [
        makeLocalEvent({
          id: 'shared',
          date: '2026-11-25',
          title: 'Old Shared',
          updatedAt: '2026-11-21T10:00:00.000Z',
        }),
        makeLocalEvent({
          id: 'local-only',
          date: '2026-11-26',
          title: 'Added Offline',
          updatedAt: '2026-11-22T09:00:00.000Z',
        }),
      ],
      deletedEventIds: ['removed-on-local'],
      updated_at: '2026-11-22T09:00:00.000Z',
    };

    const remoteSnap: CalendarEventsSnapshot = {
      id: 'household_calendar_events',
      events: [
        makeLocalEvent({
          id: 'shared',
          date: '2026-11-25',
          title: 'Updated Remote',
          updatedAt: '2026-11-22T10:00:00.000Z',
        }),
        makeLocalEvent({
          id: 'removed-on-local',
          date: '2026-11-25',
          title: 'Should Stay Deleted',
          updatedAt: '2026-11-21T08:00:00.000Z',
        }),
        makeLocalEvent({
          id: 'remote-only',
          date: '2026-11-27',
          title: 'Added On Phone',
          updatedAt: '2026-11-22T08:30:00.000Z',
        }),
      ],
      deletedEventIds: [],
      updated_at: '2026-11-22T10:00:00.000Z',
    };

    const merged = mergeCalendarEventsSnapshots(localSnap, remoteSnap);
    assert.deepEqual(
      merged.events.map((e) => [e.id, e.title]),
      [
        ['shared', 'Updated Remote'],
        ['local-only', 'Added Offline'],
        ['remote-only', 'Added On Phone'],
      ]
    );
    assert.ok(merged.deletedEventIds.includes('removed-on-local'));
  });

  it('supports addEvent, updateEvent, deleteEvent, and remote merge on useCalendarEventsStore', async () => {
    const store = useCalendarEventsStore.getState();
    await store.initCalendarEventsStore();

    const created = await store.addEvent({
      title: 'Family Game Night',
      date: '2026-11-29',
      isAllDay: false,
      startTime: '19:00',
      endTime: '21:00',
      color: '#8b5cf6',
      profileIds: ['p-1'],
    });
    assert.ok(created);
    assert.equal(useCalendarEventsStore.getState().events.length, 1);

    await store.updateEvent(created.id, { title: 'Board Game Night' });
    assert.equal(useCalendarEventsStore.getState().events[0].title, 'Board Game Night');

    await store.applyRemoteCalendarEventsSnapshot({
      id: 'household_calendar_events',
      events: [
        makeLocalEvent({
          id: 'remote-evt',
          title: 'School Concert',
          date: '2026-12-03',
          isAllDay: true,
        }),
      ],
      deletedEventIds: [],
      updated_at: '2026-11-30T12:00:00.000Z',
    });
    assert.equal(useCalendarEventsStore.getState().events.length, 2);

    await store.deleteEvent(created.id);
    assert.deepEqual(
      useCalendarEventsStore.getState().events.map((e) => e.id),
      ['remote-evt']
    );
    assert.ok(useCalendarEventsStore.getState().snapshot.deletedEventIds.includes(created.id));
  });
});

describe('Phase 1 — Hourly Weather Forecast & NOAA/NWS Alerts', () => {
  it('detects US NWS bounds accurately and skips international coordinates', () => {
    assert.equal(isWithinUsNwsBounds(30.2672, -97.7431), true); // Austin, TX
    assert.equal(isWithinUsNwsBounds(61.2181, -149.9003), true); // Anchorage, AK
    assert.equal(isWithinUsNwsBounds(21.3069, -157.8583), true); // Honolulu, HI
    assert.equal(isWithinUsNwsBounds(18.4655, -66.1057), true); // San Juan, PR
    assert.equal(isWithinUsNwsBounds(51.5074, -0.1278), false); // London
    assert.equal(isWithinUsNwsBounds(35.6762, 139.6503), false); // Tokyo
    assert.equal(isWithinUsNwsBounds(Number.NaN, -97.7), false);
  });

  it('extracts upcoming local-clock hourly points with precip clamping and limit', () => {
    const pts = extractUpcomingHourlyForecast(
      {
        time: [
          '2026-11-22T08:00',
          '2026-11-22T09:00',
          '2026-11-22T10:00',
          '2026-11-22T11:00',
        ],
        temperature_2m: [62.4, 65.6, 70.1, 74.9],
        weather_code: [0, 2, 61, 95],
        precipitation_probability: [0, 15, 140, -10],
        is_day: [1, 1, 1, 0],
      },
      { currentTime: '2026-11-22T09:35', limit: 2 }
    );

    assert.equal(pts.length, 2);
    assert.equal(pts[0].time, '2026-11-22T09:00');
    assert.equal(pts[0].temp, 66);
    assert.equal(pts[0].precipProb, 15);
    assert.equal(pts[1].time, '2026-11-22T10:00');
    assert.equal(pts[1].precipProb, 100);
    assert.equal(getPeakPrecipProb(pts, 6), 100);
    assert.equal(getPeakPrecipProb(undefined), 0);
  });

  it('formats 12h/24h hourly strip labels cleanly without timezone drift', () => {
    assert.equal(formatHourlyPointTime('2026-11-22T00:00', true), '12a');
    assert.equal(formatHourlyPointTime('2026-11-22T09:00', true), '9a');
    assert.equal(formatHourlyPointTime('2026-11-22T12:00', true), '12p');
    assert.equal(formatHourlyPointTime('2026-11-22T16:00', true), '4p');
    assert.equal(formatHourlyPointTime('2026-11-22T09:00', false), '09:00');
    assert.equal(formatHourlyPointTime('2026-11-22T16:00', false), '16:00');
  });

  it('parses NWS GeoJSON alerts sorted by severity while discarding expired/test/cancel entries', () => {
    const nowMs = Date.parse('2026-11-22T15:00:00Z');
    const alerts = parseNwsAlertsResponse(
      {
        features: [
          {
            id: 'expired-1',
            properties: {
              event: 'Frost Advisory',
              severity: 'Minor',
              headline: 'Expired frost',
              expires: '2026-11-22T14:00:00Z',
            },
          },
          {
            id: 'test-1',
            properties: {
              status: 'Test',
              event: 'Test Warning',
              severity: 'Extreme',
            },
          },
          {
            id: 'minor-1',
            properties: {
              event: 'Wind Advisory',
              severity: 'Moderate',
              headline: 'Gusty winds until 8 PM',
              description: 'Winds 25 to 35 mph.',
              expires: '2026-11-23T02:00:00Z',
            },
          },
          {
            id: 'severe-1',
            properties: {
              event: 'Tornado Warning',
              severity: 'Extreme',
              urgency: 'Immediate',
              headline: 'Take shelter now',
              description: 'Confirmed tornado.',
              instruction: 'Move to an interior room on the lowest floor.',
              expires: '2026-11-22T16:00:00Z',
            },
          },
        ],
      },
      nowMs
    );

    assert.equal(alerts.length, 2);
    assert.equal(alerts[0].id, 'severe-1');
    assert.equal(alerts[0].severity, 'Extreme');
    assert.equal(alerts[0].instruction, 'Move to an interior room on the lowest floor.');
    assert.equal(alerts[1].id, 'minor-1');
    assert.equal(alerts[1].severity, 'Moderate');
  });

  it('deduplicates concurrent NWS alert lookups and skips non-US locations', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;

    globalThis.fetch = (async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 10));
      return new Response(
        JSON.stringify({
          features: [
            {
              id: 'alert-austin-1',
              properties: {
                event: 'Heat Advisory',
                severity: 'Moderate',
                headline: 'Heat index up to 106',
                expires: '2099-01-01T00:00:00Z',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/geo+json' } }
      );
    }) as typeof globalThis.fetch;

    try {
      const intl = await fetchWeatherAlerts(51.5074, -0.1278, true);
      assert.deepEqual(intl, []);
      assert.equal(calls, 0);

      const [a, b] = await Promise.all([
        fetchWeatherAlerts(30.2672, -97.7431, false),
        fetchWeatherAlerts(30.2672, -97.7431, false),
      ]);
      assert.equal(calls, 1);
      assert.equal(a.length, 1);
      assert.equal(b[0].event, 'Heat Advisory');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
