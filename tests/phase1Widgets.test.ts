import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_TIMERS_PER_WIDGET, type TimerItem } from '../src/types/phase1Widgets';
import {
  DEFAULT_TIMER_PRESETS,
  MAX_ALARM_RING_MS,
  addSecondsToTimerItem,
  combineDurationHms,
  dismissTimerItem,
  extractStepDurations,
  formatShortDurationLabel,
  formatTimerDuration,
  getTimerLiveState,
  isTimerActivelyRinging,
  pauseTimerItem,
  resetTimerItem,
  resolveCrossTabAlarmSwitch,
  resolveWidgetTimers,
  splitDurationHms,
  startTimerItem,
  stopAllTimerAlarms,
  syncTimerAlarmSubscriber,
  updateTimerItem,
} from '../src/utils/timerEngine';
import {
  classifyPollenLevel,
  classifyUsAqi,
  classifyUvIndex,
  normalizeOpenMeteoAirQuality,
} from '../src/services/airQuality';
import {
  buildMoonPhaseSvgPath,
  computeLunarSummary,
  computeSolarSummary,
} from '../src/utils/astronomy';

describe('timerEngine', () => {
  it('provides 6 pure kitchen presets and enforces MAX_TIMERS_PER_WIDGET in resolveWidgetTimers', () => {
    assert.equal(DEFAULT_TIMER_PRESETS.length, 6);
    assert.equal(
      DEFAULT_TIMER_PRESETS.every(
        (p) => p.durationSec > 0 && !p.label.toLowerCase().includes('pomodoro')
      ),
      true
    );

    const legacyPomodoro = {
      id: 'legacy-1',
      label: '  ',
      durationSec: -10,
      status: 'idle' as const,
      mode: 'pomodoro',
      pomodoroPhase: 'focus',
    } as unknown as TimerItem;

    const overflow: TimerItem[] = [
      legacyPomodoro,
      ...Array.from({ length: MAX_TIMERS_PER_WIDGET + 2 }, (_, idx) => ({
        id: `t-${idx + 1}`,
        label: `Timer ${idx + 1}`,
        durationSec: (idx + 1) * 60,
        status: 'idle' as const,
      })),
    ];

    const resolved = resolveWidgetTimers(overflow);
    assert.equal(resolved.length, MAX_TIMERS_PER_WIDGET);
    assert.equal(resolved[0].label, 'Kitchen Timer');
    assert.equal(resolved[0].durationSec, 1);
    assert.equal('mode' in resolved[0], false);
    assert.equal('pomodoroPhase' in resolved[0], false);
  });

  it('tracks running countdowns via endsAt ISO timestamps across pause, resume, reset, and completion', () => {
    const t0 = Date.UTC(2026, 4, 15, 12, 0, 0);
    const baseTimer: TimerItem = {
      id: 'pasta-1',
      label: 'Pasta',
      durationSec: 600,
      status: 'idle',
    };

    const started = startTimerItem(baseTimer, t0);
    assert.equal(started.status, 'running');
    assert.equal(started.endsAt, new Date(t0 + 600_000).toISOString());

    const mid = getTimerLiveState(started, t0 + 150_500);
    assert.equal(mid.effectiveStatus, 'running');
    assert.equal(mid.remainingSec, 450);
    assert.equal(mid.isExpired, false);

    const paused = pauseTimerItem(started, t0 + 150_000);
    assert.equal(paused.status, 'paused');
    assert.equal(paused.endsAt, null);
    assert.equal(paused.remainingSec, 450);

    const t1 = t0 + 300_000;
    const resumed = startTimerItem(paused, t1);
    assert.equal(resumed.status, 'running');
    assert.equal(resumed.endsAt, new Date(t1 + 450_000).toISOString());

    const expired = getTimerLiveState(resumed, t1 + 451_000);
    assert.equal(expired.effectiveStatus, 'completed');
    assert.equal(expired.remainingSec, 0);
    assert.equal(expired.isExpired, true);
    assert.equal(expired.progressRatio, 1);

    const reset = resetTimerItem(resumed);
    assert.equal(reset.status, 'idle');
    assert.equal(reset.remainingSec, 600);
    assert.equal(reset.endsAt, null);
    assert.equal(reset.completedAt, null);
  });

  it('adjusts +/-60s across states and edits labels/durations via splitDurationHms, combineDurationHms, and updateTimerItem', () => {
    const t0 = Date.UTC(2026, 4, 15, 14, 0, 0);
    const running = startTimerItem(
      { id: 'r1', label: 'Roast', durationSec: 120, status: 'idle' },
      t0
    );

    const addedRunning = addSecondsToTimerItem(running, 60, t0 + 30_000);
    assert.equal(addedRunning.status, 'running');
    assert.equal(addedRunning.remainingSec, 150);
    assert.equal(addedRunning.endsAt, new Date(t0 + 180_000).toISOString());

    const subtractedRunning = addSecondsToTimerItem(addedRunning, -60, t0 + 30_000);
    assert.equal(subtractedRunning.status, 'running');
    assert.equal(subtractedRunning.remainingSec, 90);

    const paused: TimerItem = {
      id: 'p1',
      label: 'Prep',
      durationSec: 120,
      status: 'paused',
      remainingSec: 80,
      endsAt: null,
    };
    const addedPaused = addSecondsToTimerItem(paused, 60, t0);
    assert.equal(addedPaused.remainingSec, 140);
    assert.equal(addedPaused.durationSec, 140);

    const completed: TimerItem = {
      id: 'c1',
      label: 'Steep Tea',
      durationSec: 240,
      status: 'completed',
      remainingSec: 0,
      endsAt: null,
      completedAt: new Date(t0).toISOString(),
    };
    const restartedByAdd = addSecondsToTimerItem(completed, 60, t0 + 5000);
    assert.equal(restartedByAdd.status, 'running');
    assert.equal(restartedByAdd.remainingSec, 60);
    assert.equal(restartedByAdd.endsAt, new Date(t0 + 65_000).toISOString());

    assert.deepEqual(splitDurationHms(3665), { hours: 1, minutes: 1, seconds: 5 });
    assert.equal(combineDurationHms(1, 1, 5), 3665);
    assert.equal(combineDurationHms(0, 0, 0), 0);

    // Renaming a running timer with the same duration preserves its active countdown
    const renamedRunning = updateTimerItem(running, { label: 'Sunday Roast', durationSec: 120 });
    assert.equal(renamedRunning.label, 'Sunday Roast');
    assert.equal(renamedRunning.status, 'running');
    assert.equal(renamedRunning.endsAt, running.endsAt);

    // Changing duration resets cleanly to idle at the new duration
    const resizedTimer = updateTimerItem(running, { label: 'Short Boil', durationSec: 300 });
    assert.equal(resizedTimer.label, 'Short Boil');
    assert.equal(resizedTimer.durationSec, 300);
    assert.equal(resizedTimer.status, 'idle');
    assert.equal(resizedTimer.remainingSec, 300);
    assert.equal(resizedTimer.endsAt, null);
    assert.equal(resizedTimer.completedAt, null);
  });

  it('tracks active repeating alarm state until dismissed or past MAX_ALARM_RING_MS and handles Node SSR safely', () => {
    const t0 = Date.UTC(2026, 4, 15, 18, 0, 0);
    const running = startTimerItem(
      { id: 'ring-1', label: 'Broil', durationSec: 60, status: 'idle' },
      t0
    );

    // Not ringing while still counting down
    assert.equal(isTimerActivelyRinging(running, t0 + 30_000), false);

    // Rings immediately once countdown expires
    assert.equal(isTimerActivelyRinging(running, t0 + 60_000), true);
    assert.equal(isTimerActivelyRinging(running, t0 + 60_000 + 60_000), true);

    // Rings while completedAt is within MAX_ALARM_RING_MS (15 min)
    const completedTimer: TimerItem = {
      id: 'ring-2',
      label: 'Oven',
      durationSec: 120,
      status: 'completed',
      remainingSec: 0,
      endsAt: null,
      completedAt: new Date(t0).toISOString(),
    };
    assert.equal(isTimerActivelyRinging(completedTimer, t0 + MAX_ALARM_RING_MS), true);
    assert.equal(isTimerActivelyRinging(completedTimer, t0 + MAX_ALARM_RING_MS + 1), false);

    // Explicitly dismissing silences the alarm and resets back to idle at original duration
    const dismissed = dismissTimerItem(completedTimer);
    assert.equal(dismissed.status, 'idle');
    assert.equal(dismissed.remainingSec, 120);
    assert.equal(dismissed.completedAt, null);
    assert.equal(isTimerActivelyRinging(dismissed, t0 + 5000), false);

    // Node test environment (no window) safely ignores audio alarm subscription calls
    assert.doesNotThrow(() => {
      syncTimerAlarmSubscriber('test-sub', true);
      syncTimerAlarmSubscriber('test-sub', false);
      stopAllTimerAlarms();
    });
  });

  it('resolves cross-tab alarm auto-switch once per trigger and respects modal/editor blocks', () => {
    const t0 = Date.UTC(2026, 4, 15, 19, 0, 0);
    const kitchenTimer: TimerItem = {
      id: 'k1',
      label: 'Pasta',
      durationSec: 540,
      status: 'completed',
      remainingSec: 0,
      endsAt: null,
      completedAt: new Date(t0).toISOString(),
    };
    const candidates = [
      { tabId: 'tab-kitchen', timer: kitchenTimer, key: 'w-kitchen:k1:done1' },
    ];

    // Modal / active editor open -> blocks tab switch, still marks alarm handled
    const handledWhileBlocked = new Set<string>();
    const blockedRes = resolveCrossTabAlarmSwitch(
      candidates,
      'tab-photos',
      t0 + 2000,
      true,
      handledWhileBlocked
    );
    assert.equal(blockedRes.targetTabId, null);
    assert.deepEqual(blockedRes.newlyHandledKeys, ['w-kitchen:k1:done1']);

    // Normal state on another tab -> auto-switches straight to the timer's tab once
    const handled = new Set<string>();
    const firstSwitch = resolveCrossTabAlarmSwitch(
      candidates,
      'tab-photos',
      t0 + 2000,
      false,
      handled
    );
    assert.equal(firstSwitch.targetTabId, 'tab-kitchen');
    assert.deepEqual(firstSwitch.newlyHandledKeys, ['w-kitchen:k1:done1']);

    firstSwitch.newlyHandledKeys.forEach((k) => handled.add(k));

    // Subsequent ticks for the same handled alarm do not hijack tab navigation again
    const secondTick = resolveCrossTabAlarmSwitch(
      candidates,
      'tab-calendar',
      t0 + 3000,
      false,
      handled
    );
    assert.equal(secondTick.targetTabId, null);
    assert.deepEqual(secondTick.newlyHandledKeys, []);

    // Already on the timer's tab -> no switch needed
    const alreadyOnTab = resolveCrossTabAlarmSwitch(
      candidates,
      'tab-kitchen',
      t0 + 2000,
      false,
      new Set()
    );
    assert.equal(alreadyOnTab.targetTabId, null);
    assert.deepEqual(alreadyOnTab.newlyHandledKeys, ['w-kitchen:k1:done1']);
  });

  it('formats durations cleanly and parses recipe step durations without false positives', () => {
    assert.equal(formatTimerDuration(65), '01:05');
    assert.equal(formatTimerDuration(3661), '1:01:01');
    assert.equal(formatShortDurationLabel(4500), '1h 15m');
    assert.equal(formatShortDurationLabel(45), '45s');

    assert.deepEqual(
      extractStepDurations('Simmer uncovered for 12-15 minutes until slightly thickened.'),
      [
        { label: '12m', durationSec: 720 },
        { label: '15m', durationSec: 900 },
      ]
    );

    assert.deepEqual(extractStepDurations('Bake 25m then rest 1 hr 15 min before slicing.'), [
      { label: '25m', durationSec: 1500 },
      { label: '1h 15m', durationSec: 4500 },
    ]);

    assert.deepEqual(extractStepDurations('Sear scallops for 45 seconds per side.'), [
      { label: '45s', durationSec: 45 },
    ]);

    assert.deepEqual(
      extractStepDurations(
        'Preheat oven to 375 degrees F and whisk 2 tsp salt into 1 cup warm water.'
      ),
      []
    );
  });
});

describe('airQuality service classifiers and normalizer', () => {
  it('classifies US EPA AQI bands, WHO UV bands, and pollen thresholds', () => {
    assert.equal(classifyUsAqi(25).level, 'good');
    assert.equal(classifyUsAqi(75).level, 'moderate');
    assert.equal(classifyUsAqi(125).level, 'sensitive');
    assert.equal(classifyUsAqi(175).level, 'unhealthy');
    assert.equal(classifyUsAqi(250).level, 'very_unhealthy');
    assert.equal(classifyUsAqi(350).level, 'hazardous');

    assert.equal(classifyUvIndex(1.5).level, 'low');
    assert.equal(classifyUvIndex(4).level, 'moderate');
    assert.equal(classifyUvIndex(7).level, 'high');
    assert.equal(classifyUvIndex(9.5).level, 'very_high');
    assert.equal(classifyUvIndex(12).level, 'extreme');

    assert.equal(classifyPollenLevel(null, 'tree').level, 'unavailable');
    assert.equal(classifyPollenLevel(0.2, 'grass').level, 'none');
    assert.equal(classifyPollenLevel(8, 'tree').level, 'low');
    assert.equal(classifyPollenLevel(25, 'tree').level, 'moderate');
    assert.equal(classifyPollenLevel(100, 'tree').level, 'high');
    assert.equal(classifyPollenLevel(12, 'grass').level, 'moderate');
    assert.equal(classifyPollenLevel(60, 'weed').level, 'high');
  });

  it('normalizes Open-Meteo AQI payloads with pollen and handles null pollen gracefully', () => {
    const withPollen = normalizeOpenMeteoAirQuality(
      {
        current: {
          us_aqi: 44,
          pm2_5: 8.4,
          pm10: 19.2,
          ozone: 61.3,
          uv_index: 5.8,
          alder_pollen: 12,
          birch_pollen: 28,
          olive_pollen: 3,
          grass_pollen: 7.5,
          mugwort_pollen: 2,
          ragweed_pollen: 14,
        },
        hourly: {
          time: [
            '2026-05-15T06:00',
            '2026-05-15T09:00',
            '2026-05-15T12:00',
            '2026-05-15T15:00',
            '2026-05-15T18:00',
          ],
          uv_index: [0.4, 3.2, 8.7, 6.4, 1.8],
        },
      },
      30.2672,
      -97.7431,
      'Austin, TX',
      1700000000000
    );

    assert.equal(withPollen.usAqi, 44);
    assert.equal(withPollen.treePollen, 28);
    assert.equal(withPollen.grassPollen, 7.5);
    assert.equal(withPollen.weedPollen, 14);
    assert.equal(withPollen.hasPollenData, true);
    assert.equal(withPollen.peakUv, 8.7);
    assert.deepEqual(
      withPollen.hourlyUvSlots.map((s) => `${s.label}:${s.uvIndex}`),
      ['9a:3.2', '12p:8.7', '3p:6.4', '6p:1.8']
    );

    const withoutPollen = normalizeOpenMeteoAirQuality(
      {
        current: {
          us_aqi: 62,
          pm2_5: 14.1,
          pm10: 27.9,
          ozone: 74,
          uv_index: 3.1,
          alder_pollen: null,
          birch_pollen: null,
          olive_pollen: null,
          grass_pollen: null,
          mugwort_pollen: null,
          ragweed_pollen: null,
        },
        hourly: { time: [], uv_index: [] },
      },
      21.3069,
      -157.8583,
      'Honolulu, HI',
      1700000000000
    );

    assert.equal(withoutPollen.hasPollenData, false);
    assert.equal(withoutPollen.treePollen, null);
    assert.equal(withoutPollen.grassPollen, null);
    assert.equal(withoutPollen.weedPollen, null);
    assert.equal(withoutPollen.pm25, 14.1);
    assert.equal(withoutPollen.pm10, 27.9);
    assert.equal(withoutPollen.ozone, 74);
  });
});

describe('astronomy ephemeris math', () => {
  it('computes accurate seasonal sunrise, sunset, golden hours, and daylight deltas for Austin', () => {
    const juneDay = computeSolarSummary(
      new Date(Date.UTC(2026, 5, 21, 18, 30, 0)),
      30.2672,
      -97.7431,
      'America/Chicago'
    );
    const decDay = computeSolarSummary(
      new Date(Date.UTC(2026, 11, 21, 18, 30, 0)),
      30.2672,
      -97.7431,
      'America/Chicago'
    );

    assert.equal(juneDay.polarState, 'normal');
    assert.equal(decDay.polarState, 'normal');
    assert.ok(juneDay.sunrise && juneDay.sunset);
    assert.ok(decDay.sunrise && decDay.sunset);
    assert.ok(juneDay.sunrise.getTime() < juneDay.solarNoon.getTime());
    assert.ok(juneDay.solarNoon.getTime() < juneDay.sunset.getTime());
    assert.ok(
      juneDay.morningGoldenHourEnd &&
        juneDay.morningGoldenHourEnd.getTime() > juneDay.sunrise.getTime()
    );
    assert.ok(
      juneDay.eveningGoldenHourStart &&
        juneDay.eveningGoldenHourStart.getTime() < juneDay.sunset.getTime()
    );
    assert.ok(juneDay.dayLengthSec > 13.5 * 3600);
    assert.ok(decDay.dayLengthSec < 10.5 * 3600);
    assert.equal(juneDay.isDaylight, true);
    assert.ok(juneDay.sunAltitudeDeg > 50);

    const springDay = computeSolarSummary(
      new Date(Date.UTC(2026, 2, 20, 18, 0, 0)),
      30.2672,
      -97.7431,
      'America/Chicago'
    );
    const autumnDay = computeSolarSummary(
      new Date(Date.UTC(2026, 8, 22, 18, 0, 0)),
      30.2672,
      -97.7431,
      'America/Chicago'
    );
    assert.ok(springDay.daylightDeltaSec > 0);
    assert.ok(autumnDay.daylightDeltaSec < 0);
  });

  it('handles high-latitude polar day and polar night without NaN coordinates', () => {
    const polarSummer = computeSolarSummary(
      new Date(Date.UTC(2026, 5, 21, 12, 0, 0)),
      78.2232,
      15.6267,
      'Arctic/Longyearbyen'
    );
    const polarWinter = computeSolarSummary(
      new Date(Date.UTC(2026, 11, 21, 12, 0, 0)),
      78.2232,
      15.6267,
      'Arctic/Longyearbyen'
    );

    assert.equal(polarSummer.polarState, 'always_day');
    assert.equal(polarSummer.dayLengthSec, 86400);
    assert.equal(Number.isFinite(polarSummer.arcPoint.x), true);
    assert.equal(Number.isFinite(polarSummer.arcPoint.y), true);

    assert.equal(polarWinter.polarState, 'always_night');
    assert.equal(polarWinter.dayLengthSec, 0);
    assert.equal(Number.isFinite(polarWinter.arcPoint.x), true);
    assert.equal(Number.isFinite(polarWinter.arcPoint.y), true);
    assert.equal(Number.isFinite(polarWinter.sunAltitudeDeg), true);
  });

  it('computes lunar phases and SVG disc paths for New Moon, Full Moon, and Quarter phases', () => {
    const newMoonDate = new Date(Date.UTC(2000, 0, 6, 18, 14, 0));
    const newLunar = computeLunarSummary(newMoonDate);
    assert.equal(newLunar.illuminationPct, 0);
    assert.equal(newLunar.phaseName, 'New Moon');
    assert.equal(buildMoonPhaseSvgPath(24, newLunar.phaseCycle), '');

    const halfCycleMs = (29.530588853 / 2) * 86_400_000;
    const fullMoonDate = new Date(newMoonDate.getTime() + halfCycleMs);
    const fullLunar = computeLunarSummary(fullMoonDate);
    assert.equal(fullLunar.illuminationPct, 100);
    assert.equal(fullLunar.phaseName, 'Full Moon');
    const fullPath = buildMoonPhaseSvgPath(24, fullLunar.phaseCycle);
    assert.ok(fullPath.startsWith('M 24 0 A 24 24'));
    assert.equal(fullPath.includes('NaN'), false);

    const quarterPath = buildMoonPhaseSvgPath(24, 0.25);
    assert.ok(quarterPath.length > 0);
    assert.equal(quarterPath.includes('NaN'), false);
  });
});
