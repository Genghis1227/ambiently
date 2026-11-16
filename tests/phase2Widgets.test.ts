import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_DECISION_OPTIONS,
  MAX_ROUTINE_COMPLETIONS,
  MAX_ROUTINES_PER_WIDGET,
  type DecisionOption,
  type RoutineItem,
} from '../src/types/phase2Widgets.ts';
import {
  DEFAULT_ROUTINE_ITEMS,
  evaluateRoutineStatus,
  formatWeeklyDaysSummary,
  normalizeDaysOfWeek,
  resolveRoutineItems,
  swapAlternatingWeekParity,
  toggleDayOfWeek,
  toggleRoutineCheckIn,
} from '../src/utils/routinesEngine.ts';
import {
  buildWifiQrPayload,
  deleteWifiCredentialsFromVault,
  escapeWifiQrField,
  getWifiVaultKey,
  loadWifiCredentialsFromVault,
  saveWifiCredentialsToVault,
} from '../src/utils/wifiQr.ts';
import {
  sanitizeWidgetConfigForCloud,
  stripWifiCredentialsFromConfig,
} from '../src/utils/mediaOptimization.ts';
import {
  buildWheelSliceGeometry,
  castPollVote,
  computeWheelSpinTargetDeg,
  DEFAULT_DECISION_OPTIONS,
  importOptionsFromProfiles,
  importOptionsFromRecipes,
  pickRandomOptionIndex,
  resolveDecisionOptions,
  tallyPollVotes,
} from '../src/utils/decisionEngine.ts';
import type { Recipe } from '../src/types/meals.ts';
import type { HouseholdProfile } from '../src/types/profiles.ts';

describe('routinesEngine', () => {
  it('resolves defaults and clamps to MAX_ROUTINES_PER_WIDGET', () => {
    const defaults = resolveRoutineItems(undefined);
    assert.equal(defaults.length, DEFAULT_ROUTINE_ITEMS.length);
    assert.equal(defaults[0].cadence, 'am_pm');

    const oversized: RoutineItem[] = Array.from({ length: MAX_ROUTINES_PER_WIDGET + 5 }, (_, i) => ({
      id: `r-${i}`,
      label: `Routine ${i}`,
      cadence: 'daily',
      completions: [],
    }));
    const clamped = resolveRoutineItems(oversized);
    assert.equal(clamped.length, MAX_ROUTINES_PER_WIDGET);
  });

  it('evaluates daily rollover and toggles check-in stamps with 14-entry pruning', () => {
    const item: RoutineItem = {
      id: 'vitamins',
      label: 'Morning Vitamins',
      cadence: 'daily',
      completions: Array.from({ length: MAX_ROUTINE_COMPLETIONS + 2 }, (_, idx) => ({
        slotKey: `2026-10-${String(idx + 1).padStart(2, '0')}`,
        completedAt: `2026-10-${String(idx + 1).padStart(2, '0')}T08:00:00.000Z`,
        profileId: 'p1',
      })),
    };

    const resolved = resolveRoutineItems([item])[0];
    assert.equal(resolved.completions?.length, MAX_ROUTINE_COMPLETIONS);

    const day1 = new Date('2026-11-15T09:00:00');
    const day2 = new Date('2026-11-16T09:00:00');

    const beforeCheckIn = evaluateRoutineStatus(resolved, day1);
    assert.equal(beforeCheckIn.cadence, 'daily');
    assert.equal(beforeCheckIn.todaySlotKey, '2026-11-15');
    assert.equal(beforeCheckIn.dayStamp, null);

    const stamped = toggleRoutineCheckIn(resolved, '2026-11-15', 'p_mom', '2026-11-15T09:05:00.000Z');
    assert.equal(stamped.completions?.length, MAX_ROUTINE_COMPLETIONS);

    const afterCheckInDay1 = evaluateRoutineStatus(stamped, day1);
    assert.equal(afterCheckInDay1.cadence, 'daily');
    assert.equal(afterCheckInDay1.dayStamp?.profileId, 'p_mom');

    const nextMorning = evaluateRoutineStatus(stamped, day2);
    assert.equal(nextMorning.cadence, 'daily');
    assert.equal(nextMorning.dayStamp, null);

    const undone = toggleRoutineCheckIn(stamped, '2026-11-15', 'p_mom', '2026-11-15T09:06:00.000Z');
    const afterUndo = evaluateRoutineStatus(undone, day1);
    assert.equal(afterUndo.cadence, 'daily');
    assert.equal(afterUndo.dayStamp, null);
  });

  it('tracks independent AM and PM slots on the same calendar day', () => {
    const petItem: RoutineItem = {
      id: 'pets',
      label: 'Feed Pets',
      cadence: 'am_pm',
      completions: [],
    };
    const morning = new Date('2026-11-15T08:15:00');
    const evening = new Date('2026-11-15T18:30:00');

    const evalAm = evaluateRoutineStatus(petItem, morning);
    assert.equal(evalAm.cadence, 'am_pm');
    assert.equal(evalAm.activeHalf, 'AM');
    assert.equal(evalAm.amSlotKey, '2026-11-15:AM');
    assert.equal(evalAm.pmSlotKey, '2026-11-15:PM');

    const stampedAm = toggleRoutineCheckIn(petItem, evalAm.amSlotKey, 'p_dad', '2026-11-15T08:16:00.000Z');
    const evalPm = evaluateRoutineStatus(stampedAm, evening);
    assert.equal(evalPm.cadence, 'am_pm');
    assert.equal(evalPm.activeHalf, 'PM');
    assert.equal(evalPm.amStamp?.profileId, 'p_dad');
    assert.equal(evalPm.pmStamp, null);

    const stampedBoth = toggleRoutineCheckIn(stampedAm, evalPm.pmSlotKey, 'p_kid', '2026-11-15T18:35:00.000Z');
    const evalBoth = evaluateRoutineStatus(stampedBoth, evening);
    assert.equal(evalBoth.cadence, 'am_pm');
    assert.equal(evalBoth.amStamp?.profileId, 'p_dad');
    assert.equal(evalBoth.pmStamp?.profileId, 'p_kid');

    // Undo AM while keeping PM untouched
    const undoneAm = toggleRoutineCheckIn(stampedBoth, evalPm.amSlotKey, 'p_dad', '2026-11-15T18:36:00.000Z');
    const evalOnlyPm = evaluateRoutineStatus(undoneAm, evening);
    assert.equal(evalOnlyPm.cadence, 'am_pm');
    assert.equal(evalOnlyPm.amStamp, null);
    assert.equal(evalOnlyPm.pmStamp?.profileId, 'p_kid');
  });

  it('computes alternating_week Week A vs Week B parity and swaps cleanly', () => {
    const bins: RoutineItem = {
      id: 'bins',
      label: 'Curbside Bins',
      cadence: 'alternating_week',
      pickupDayOfWeek: 4, // Thursday
      anchorDate: '2026-11-05', // Thursday in Week A
      weekALabel: 'Trash + Recycling',
      weekBLabel: 'Trash Only',
      completions: [],
    };

    const weekADay = new Date('2026-11-03T10:00:00'); // Tuesday of anchor week -> next Thu 2026-11-05
    const evalA = evaluateRoutineStatus(bins, weekADay);
    assert.equal(evalA.cadence, 'alternating_week');
    assert.equal(evalA.isWeekA, true);
    assert.equal(evalA.currentLabel, 'Trash + Recycling');
    assert.equal(evalA.cycleSlotKey, '2026-11-05');
    assert.equal(evalA.daysUntilPickup, 2);

    const weekBDay = new Date('2026-11-10T10:00:00'); // Tuesday of following week -> next Thu 2026-11-12
    const evalB = evaluateRoutineStatus(bins, weekBDay);
    assert.equal(evalB.cadence, 'alternating_week');
    assert.equal(evalB.isWeekA, false);
    assert.equal(evalB.currentLabel, 'Trash Only');
    assert.equal(evalB.cycleSlotKey, '2026-11-12');

    const swappedAnchor = swapAlternatingWeekParity(bins.anchorDate, weekADay);
    const evalSwapped = evaluateRoutineStatus({ ...bins, anchorDate: swappedAnchor }, weekADay);
    assert.equal(evalSwapped.cadence, 'alternating_week');
    assert.equal(evalSwapped.isWeekA, false);
    assert.equal(evalSwapped.currentLabel, 'Trash Only');
  });

  it('calculates every_n_days remaining, due today, and overdue day counts', () => {
    const plantBase: RoutineItem = {
      id: 'plants',
      label: 'Water Plants',
      cadence: 'every_n_days',
      intervalDays: 7,
      completions: [],
    };

    const now = new Date('2026-11-15T12:00:00');

    // Never stamped -> due today immediately
    const neverDone = evaluateRoutineStatus(plantBase, now);
    assert.equal(neverDone.cadence, 'every_n_days');
    assert.equal(neverDone.isDueToday, true);
    assert.equal(neverDone.isOverdue, false);
    assert.equal(neverDone.daysRemaining, 0);

    // Done today -> 7 days remaining
    const doneTodayItem: RoutineItem = {
      ...plantBase,
      completions: [{ slotKey: '2026-11-15', completedAt: '2026-11-15T08:00:00' }],
    };
    const doneToday = evaluateRoutineStatus(doneTodayItem, now);
    assert.equal(doneToday.cadence, 'every_n_days');
    assert.equal(doneToday.isDoneToday, true);
    assert.equal(doneToday.daysRemaining, 7);
    assert.equal(doneToday.isOverdue, false);

    // Done 5 days ago -> 2 days remaining
    const fiveDaysAgoItem: RoutineItem = {
      ...plantBase,
      completions: [{ slotKey: '2026-11-10', completedAt: '2026-11-10T08:00:00' }],
    };
    const fiveDaysAgo = evaluateRoutineStatus(fiveDaysAgoItem, now);
    assert.equal(fiveDaysAgo.cadence, 'every_n_days');
    assert.equal(fiveDaysAgo.daysElapsed, 5);
    assert.equal(fiveDaysAgo.daysRemaining, 2);
    assert.equal(fiveDaysAgo.isDueToday, false);
    assert.equal(fiveDaysAgo.isOverdue, false);

    // Done 7 days ago -> due today
    const sevenDaysAgoItem: RoutineItem = {
      ...plantBase,
      completions: [{ slotKey: '2026-11-08', completedAt: '2026-11-08T08:00:00' }],
    };
    const sevenDaysAgo = evaluateRoutineStatus(sevenDaysAgoItem, now);
    assert.equal(sevenDaysAgo.cadence, 'every_n_days');
    assert.equal(sevenDaysAgo.daysRemaining, 0);
    assert.equal(sevenDaysAgo.isDueToday, true);
    assert.equal(sevenDaysAgo.isOverdue, false);

    // Done 9 days ago -> 2 days overdue
    const nineDaysAgoItem: RoutineItem = {
      ...plantBase,
      completions: [{ slotKey: '2026-11-06', completedAt: '2026-11-06T08:00:00' }],
    };
    const nineDaysAgo = evaluateRoutineStatus(nineDaysAgoItem, now);
    assert.equal(nineDaysAgo.cadence, 'every_n_days');
    assert.equal(nineDaysAgo.daysElapsed, 9);
    assert.equal(nineDaysAgo.isOverdue, true);
    assert.equal(nineDaysAgo.daysOverdue, 2);
  });

  it('normalizes, toggles, and formats single and multiple weekdays without emptying', () => {
    assert.deepEqual(normalizeDaysOfWeek(undefined, 5), [5]);
    assert.deepEqual(normalizeDaysOfWeek([5, 2, 5, -1, 9], 1), [2, 5]);

    assert.deepEqual(toggleDayOfWeek([5], 2), [2, 5]);
    assert.deepEqual(toggleDayOfWeek([2, 5], 5), [2]);
    // Cannot remove the sole active day
    assert.deepEqual(toggleDayOfWeek([2], 2), [2]);

    assert.equal(formatWeeklyDaysSummary([5]), 'Every Fri');
    assert.equal(formatWeeklyDaysSummary([2, 5]), 'Tue & Fri');
    assert.equal(formatWeeklyDaysSummary([1, 2, 3, 4, 5]), 'Weekdays (Mon–Fri)');
    assert.equal(formatWeeklyDaysSummary([0, 6]), 'Weekends (Sat & Sun)');
    assert.equal(formatWeeklyDaysSummary([0, 1, 2, 3, 4, 5, 6]), 'Every Day');
  });

  it('evaluates fixed-weekday weekly routines cleanly without drifting across early/late check-ins', () => {
    const fridayTrash = resolveRoutineItems([
      {
        id: 'weekly-trash',
        label: 'Trash Bins',
        cadence: 'weekly',
        daysOfWeek: [5], // Friday
        completions: [],
      },
    ])[0];
    assert.equal(fridayTrash.cadence, 'weekly');
    assert.deepEqual(fridayTrash.daysOfWeek, [5]);

    // Thursday (1 day early) -> targets Friday 2026-11-20
    const thu = new Date('2026-11-19T19:00:00');
    const evalThu = evaluateRoutineStatus(fridayTrash, thu);
    assert.equal(evalThu.cadence, 'weekly');
    assert.equal(evalThu.daysUntilNext, 1);
    assert.equal(evalThu.nextDayLabel, 'Fri');
    assert.equal(evalThu.activeSlotKey, '2026-11-20');
    assert.equal(evalThu.isDueToday, false);

    // Checking in early on Thursday carries into Friday
    const checkedEarly = toggleRoutineCheckIn(
      fridayTrash,
      evalThu.activeSlotKey,
      'p_dad',
      '2026-11-19T19:05:00.000Z'
    );
    const fri = new Date('2026-11-20T09:00:00');
    const evalFri = evaluateRoutineStatus(checkedEarly, fri);
    assert.equal(evalFri.cadence, 'weekly');
    assert.equal(evalFri.isDueToday, true);
    assert.equal(evalFri.daysUntilNext, 0);
    assert.equal(evalFri.activeStamp?.profileId, 'p_dad');

    // Checking in late on Saturday stamps last Friday (2026-11-20) without pre-stamping next Friday (2026-11-27)
    const sat = new Date('2026-11-21T10:00:00');
    const evalSat = evaluateRoutineStatus(fridayTrash, sat);
    assert.equal(evalSat.cadence, 'weekly');
    assert.equal(evalSat.daysUntilNext, 6);
    assert.equal(evalSat.activeSlotKey, '2026-11-20');
    assert.equal(evalSat.settledFromPrevSlot, false);

    const checkedLateOnSat = toggleRoutineCheckIn(
      fridayTrash,
      evalSat.activeSlotKey,
      'p_mom',
      '2026-11-21T10:05:00.000Z'
    );
    const evalSatSettled = evaluateRoutineStatus(checkedLateOnSat, sat);
    assert.equal(evalSatSettled.cadence, 'weekly');
    assert.equal(evalSatSettled.settledFromPrevSlot, true);
    assert.equal(evalSatSettled.prevDayLabel, 'Fri');

    // By next Thursday (2026-11-26), target shifts cleanly to 2026-11-27 (not pre-checked)
    const nextThu = new Date('2026-11-26T08:00:00');
    const evalNextThu = evaluateRoutineStatus(checkedLateOnSat, nextThu);
    assert.equal(evalNextThu.cadence, 'weekly');
    assert.equal(evalNextThu.activeSlotKey, '2026-11-27');
    assert.equal(evalNextThu.activeStamp, null);

    // Multi-day weekly routine (Tue & Fri) tracks each occurrence independently
    const tueFri = resolveRoutineItems([
      {
        id: 'tue-fri',
        label: 'Water Porch Fern',
        cadence: 'weekly',
        daysOfWeek: [2, 5],
        completions: [],
      },
    ])[0];
    const tue = new Date('2026-11-17T09:00:00');
    const evalTue = evaluateRoutineStatus(tueFri, tue);
    assert.equal(evalTue.cadence, 'weekly');
    assert.equal(evalTue.scheduleLabel, 'Tue & Fri');
    assert.equal(evalTue.isDueToday, true);
    assert.equal(evalTue.activeSlotKey, '2026-11-17');

    const stampedTue = toggleRoutineCheckIn(tueFri, '2026-11-17', 'p_kid', '2026-11-17T09:01:00.000Z');
    const wed = new Date('2026-11-18T12:00:00');
    const evalWed = evaluateRoutineStatus(stampedTue, wed);
    assert.equal(evalWed.cadence, 'weekly');
    assert.equal(evalWed.daysUntilNext, 2);
    assert.equal(evalWed.settledFromPrevSlot, true);
    assert.equal(evalWed.prevDayLabel, 'Tue');

    const evalThuForFri = evaluateRoutineStatus(stampedTue, thu);
    assert.equal(evalThuForFri.cadence, 'weekly');
    assert.equal(evalThuForFri.activeSlotKey, '2026-11-20');
    assert.equal(evalThuForFri.activeStamp, null);
  });
});

describe('wifiQr and cloud sanitization', () => {
  it('escapes ZXing special characters and builds WPA / hidden / nopass QR payloads', () => {
    assert.equal(escapeWifiQrField('Home;Guest:1,"test"\\'), 'Home\\;Guest\\:1\\,\\"test\\"\\\\');

    const wpaHidden = buildWifiQrPayload({
      ssid: 'Trinh;Guest',
      password: 'p:a,s\\s"1',
      security: 'WPA',
      hiddenNetwork: true,
    });
    assert.equal(wpaHidden, 'WIFI:T:WPA;S:Trinh\\;Guest;P:p\\:a\\,s\\\\s\\"1;H:true;;');

    const openNet = buildWifiQrPayload({
      ssid: 'PorchGuest',
      security: 'nopass',
      hiddenNetwork: false,
    });
    assert.equal(openNet, 'WIFI:T:nopass;S:PorchGuest;;');
  });

  it('stores, reads, normalizes, and deletes full Wi-Fi credentials in the device-only vault fallback', async () => {
    const widgetId = 'w-wifi-test-1';
    assert.equal(getWifiVaultKey(widgetId), 'wifi-cred:w-wifi-test-1');

    assert.equal(await loadWifiCredentialsFromVault(widgetId), null);
    await saveWifiCredentialsToVault(widgetId, {
      ssid: '  Trinh_Guest  ',
      password: 'hunter2-secret',
      security: 'WPA',
      hiddenNetwork: true,
    });
    assert.deepEqual(await loadWifiCredentialsFromVault(widgetId), {
      ssid: 'Trinh_Guest',
      password: 'hunter2-secret',
      security: 'WPA',
      hiddenNetwork: true,
    });

    // Open networks strip password when persisted to vault
    await saveWifiCredentialsToVault(widgetId, {
      ssid: 'PorchOpen',
      password: 'ignored',
      security: 'nopass',
      hiddenNetwork: false,
    });
    assert.deepEqual(await loadWifiCredentialsFromVault(widgetId), {
      ssid: 'PorchOpen',
      password: '',
      security: 'nopass',
      hiddenNetwork: false,
    });

    // Blank SSID cleans up any stored secret
    await saveWifiCredentialsToVault(widgetId, {
      ssid: '   ',
      password: 'leftover',
      security: 'WPA',
      hiddenNetwork: false,
    });
    assert.equal(await loadWifiCredentialsFromVault(widgetId), null);

    // Explicit deletion works cleanly
    await saveWifiCredentialsToVault(widgetId, {
      ssid: 'GuestAgain',
      password: 'secret',
      security: 'WEP',
      hiddenNetwork: false,
    });
    await deleteWifiCredentialsFromVault(widgetId);
    assert.equal(await loadWifiCredentialsFromVault(widgetId), null);
  });

  it('unconditionally strips all Wi-Fi credentials before cloud sync while keeping House-Sitter fields', () => {
    const sanitizedForType = sanitizeWidgetConfigForCloud(
      {
        ssid: 'GuestNet',
        password: 'never-sync-password',
        security: 'WPA',
        hiddenNetwork: true,
        credentialStorage: 'synced',
        activeView: 'split',
        autoHidePasswordSec: 60,
        homeAddress: '123 Maple St',
        emergencyContacts: [{ id: 'ec-1', roleLabel: 'Vet', name: 'Oak Vet', phone: '555-0100' }],
        sitterNotes: 'Side gate code is 4242',
      },
      'wifi_qr'
    );

    assert.equal('ssid' in sanitizedForType, false);
    assert.equal('password' in sanitizedForType, false);
    assert.equal('security' in sanitizedForType, false);
    assert.equal('hiddenNetwork' in sanitizedForType, false);
    assert.equal('credentialStorage' in sanitizedForType, false);
    assert.equal(sanitizedForType.activeView, 'split');
    assert.equal(sanitizedForType.autoHidePasswordSec, 60);
    assert.equal(sanitizedForType.homeAddress, '123 Maple St');
    assert.equal(sanitizedForType.emergencyContacts.length, 1);
    assert.equal(sanitizedForType.sitterNotes, 'Side gate code is 4242');

    // Legacy payloads without explicit widgetType argument still strip Wi-Fi secrets
    const sanitizedLegacy = sanitizeWidgetConfigForCloud({
      ssid: 'LegacyGuest',
      password: 'legacy-password',
      security: 'WPA',
      hiddenNetwork: false,
      homeAddress: '456 Pine Ave',
    });
    assert.equal('ssid' in sanitizedLegacy, false);
    assert.equal('password' in sanitizedLegacy, false);
    assert.equal('security' in sanitizedLegacy, false);
    assert.equal('hiddenNetwork' in sanitizedLegacy, false);
    assert.equal(sanitizedLegacy.homeAddress, '456 Pine Ave');

    // stripWifiCredentialsFromConfig preserves photo customPhotos on pull/realtime without dropping non-Wi-Fi keys
    const strippedPull = stripWifiCredentialsFromConfig({
      ssid: 'CloudLeak',
      password: 'secret',
      security: 'WPA',
      hiddenNetwork: true,
      credentialStorage: 'device_vault',
      sitterNotes: 'Feed fish once daily',
    });
    assert.deepEqual(strippedPull, { sitterNotes: 'Feed fish once daily' });
  });
});

describe('decisionEngine', () => {
  it('resolves defaults and picks deterministic slice indices from floats', () => {
    const defaults = resolveDecisionOptions(undefined);
    assert.equal(defaults.length, DEFAULT_DECISION_OPTIONS.length);

    assert.equal(pickRandomOptionIndex(0), -1);
    assert.equal(pickRandomOptionIndex(5, 0), 0);
    assert.equal(pickRandomOptionIndex(5, 0.45), 2);
    assert.equal(pickRandomOptionIndex(5, 0.999), 4);
  });

  it('computes forward spin angles landing squarely inside winnerIndex under the 12 oclock pointer', () => {
    const totalSlices = 6;
    const sliceDeg = 360 / totalSlices;
    let currentDeg = 0;

    for (let winnerIndex = 0; winnerIndex < totalSlices; winnerIndex++) {
      const targetDeg = computeWheelSpinTargetDeg(currentDeg, winnerIndex, totalSlices, 5, 0.5);
      assert.ok(targetDeg >= currentDeg + 5 * 360);

      const finalMod = ((targetDeg % 360) + 360) % 360;
      const landedAngleFromTop = (360 - finalMod) % 360;
      const landedSlice = Math.floor(landedAngleFromTop / sliceDeg);
      assert.equal(landedSlice, winnerIndex);

      currentDeg = targetDeg;
    }
  });

  it('builds SVG slice geometry for single-slice and multi-slice wheels', () => {
    const oneSlice = buildWheelSliceGeometry(1, 100, 120, 120);
    assert.equal(oneSlice.length, 1);
    assert.ok(oneSlice[0].path.startsWith('M '));
    assert.ok(oneSlice[0].path.endsWith('Z'));

    const sixSlices = buildWheelSliceGeometry(6, 100, 120, 120);
    assert.equal(sixSlices.length, 6);
    for (const slice of sixSlices) {
      assert.ok(slice.path.startsWith('M 120 120 '));
      assert.ok(slice.path.endsWith('Z'));
    }
  });

  it('casts single/multi votes cleanly and detects poll ties', () => {
    const options: DecisionOption[] = [
      { id: 'tacos', label: 'Tacos' },
      { id: 'pizza', label: 'Pizza' },
      { id: 'pasta', label: 'Pasta' },
    ];

    // Single-vote mode replaces prior selection and toggles off when clicked again
    let votes = castPollVote(undefined, 'p1', 'tacos', false);
    assert.deepEqual(votes.p1, ['tacos']);

    votes = castPollVote(votes, 'p1', 'pizza', false);
    assert.deepEqual(votes.p1, ['pizza']);

    votes = castPollVote(votes, 'p1', 'pizza', false);
    assert.equal('p1' in votes, false);

    // Multi-vote mode keeps multiple selections
    votes = castPollVote(votes, 'p1', 'tacos', true);
    votes = castPollVote(votes, 'p1', 'pasta', true);
    assert.deepEqual(votes.p1, ['tacos', 'pasta']);

    // Second voter creates a 1-1 tie between Tacos and Pizza (Wait: p1 voted tacos+pasta -> tacos=1, pizza=1 if p2 votes pizza, pasta=1 -> 3-way tie!)
    // Let's test explicit 2-way tie: p1 -> tacos, p2 -> pizza
    let tieVotes = castPollVote(undefined, 'p1', 'tacos', false);
    tieVotes = castPollVote(tieVotes, 'p2', 'pizza', false);

    const tally = tallyPollVotes(options, tieVotes);
    assert.equal(tally.totalVotes, 2);
    assert.equal(tally.maxVotes, 1);
    assert.equal(tally.hasTie, true);
    assert.deepEqual(tally.leadingOptionIds, ['tacos', 'pizza']);
    assert.equal(tally.rows[0].percentage, 50);
    assert.equal(tally.rows[1].percentage, 50);
    assert.equal(tally.rows[2].percentage, 0);
  });

  it('imports recipes and profiles with deduplication, soft-delete filtering, and cap enforcement', () => {
    const existing: DecisionOption[] = [{ id: 'opt-1', label: 'Tacos' }];

    const recipes: Recipe[] = [
      {
        id: 'rec-1',
        title: 'tacos', // duplicate case-insensitive -> skip
        ingredients: [],
        instructions: [],
        isFavorite: true,
        tags: [],
        createdAt: '2026-11-15T00:00:00Z',
        updatedAt: '2026-11-15T00:00:00Z',
      } as Recipe,
      {
        id: 'rec-2',
        title: 'Deleted Curry',
        ingredients: [],
        instructions: [],
        isFavorite: true,
        tags: [],
        createdAt: '2026-11-15T00:00:00Z',
        updatedAt: '2026-11-15T00:00:00Z',
        deletedAt: '2026-11-15T01:00:00Z',
      } as Recipe,
      {
        id: 'rec-3',
        title: 'Ramen Bowl',
        ingredients: [],
        instructions: [],
        isFavorite: true,
        tags: [],
        createdAt: '2026-11-15T00:00:00Z',
        updatedAt: '2026-11-15T00:00:00Z',
      } as Recipe,
      {
        id: 'rec-4',
        title: 'Quick Salad',
        ingredients: [],
        instructions: [],
        isFavorite: false,
        tags: [],
        createdAt: '2026-11-15T00:00:00Z',
        updatedAt: '2026-11-15T00:00:00Z',
      } as Recipe,
    ];

    const importedFavs = importOptionsFromRecipes(existing, recipes, true);
    assert.deepEqual(
      importedFavs.map((o) => o.label),
      ['Tacos', 'Ramen Bowl']
    );

    const profiles: HouseholdProfile[] = [
      {
        id: 'p-1',
        name: 'Maya',
        role: 'kid',
        color: 'sage',
        emoji: '🦄',
        createdAt: '2026-11-15T00:00:00Z',
        updatedAt: '2026-11-15T00:00:00Z',
      },
      {
        id: 'p-2',
        name: 'Removed Member',
        role: 'parent',
        color: 'slate',
        createdAt: '2026-11-15T00:00:00Z',
        updatedAt: '2026-11-15T00:00:00Z',
        deletedAt: '2026-11-15T02:00:00Z',
      },
    ];

    const withProfiles = importOptionsFromProfiles(importedFavs, profiles);
    assert.equal(withProfiles.length, 3);
    assert.equal(withProfiles[2].label, 'Maya');
    assert.equal(withProfiles[2].color, '#6b8f71');
    assert.equal(withProfiles[2].emoji, '🦄');

    // Enforce MAX_DECISION_OPTIONS cap
    const manyRecipes: Recipe[] = Array.from({ length: MAX_DECISION_OPTIONS + 5 }, (_, i) => ({
      id: `bulk-${i}`,
      title: `Dish ${i}`,
      ingredients: [],
      instructions: [],
      isFavorite: false,
      tags: [],
      createdAt: '2026-11-15T00:00:00Z',
      updatedAt: '2026-11-15T00:00:00Z',
    })) as Recipe[];
    const capped = importOptionsFromRecipes(existing, manyRecipes, false);
    assert.equal(capped.length, MAX_DECISION_OPTIONS);
  });
});
