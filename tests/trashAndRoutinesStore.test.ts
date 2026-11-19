import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_ROUTINES_SNAPSHOT, DEFAULT_SETTINGS } from '../src/services/db.ts';
import { isPermanentlyPurgedWidget, keepLocalWidgetFields } from '../src/services/syncMerge.ts';
import { useDashboardStore } from '../src/store/dashboardStore.ts';
import {
  isDefaultStarterRoutines,
  mergeRoutinesSnapshots,
  pickMigratableRoutineWidget,
  useRoutinesStore,
} from '../src/stores/useRoutinesStore.ts';
import type { DashboardTab, DashboardWidget, StickyNoteItem } from '../src/types/dashboard.ts';
import type { RoutineItem, RoutinesSnapshot } from '../src/types/phase2Widgets.ts';
import { DEFAULT_ROUTINE_ITEMS, toggleRoutineCheckIn } from '../src/utils/routinesEngine.ts';

function makeTab(overrides: Partial<DashboardTab> = {}): DashboardTab {
  return {
    id: 'tab-home',
    name: 'Home Board',
    icon: 'Home',
    order: 0,
    autoRotateDurationSec: 30,
    backgroundTheme: 'midnight_dots',
    enabled: true,
    updated_at: '2026-11-16T10:00:00.000Z',
    ...overrides,
  };
}

function makeWidget(overrides: Partial<DashboardWidget> = {}): DashboardWidget {
  return {
    id: 'widget-1',
    tabId: 'tab-home',
    type: 'weather',
    title: 'Weather',
    gridPos: { x: 0, y: 0, w: 4, h: 4 },
    freeformPos: {
      xRatio: 0.05,
      yRatio: 0.08,
      wRatio: 0.3,
      hRatio: 0.35,
      zIndex: 10,
      rotation: -2,
      isFullScreen: false,
    },
    config: { locationName: 'Austin, TX', unit: 'F' },
    updated_at: '2026-11-16T10:00:00.000Z',
    ...overrides,
  };
}

function makeNote(overrides: Partial<StickyNoteItem> = {}): StickyNoteItem {
  return {
    id: 'note-1',
    tabId: 'tab-home',
    title: 'Note',
    content: 'Hello',
    isChecklist: false,
    bgColor: '#fef08a',
    isPinnedToCanvas: true,
    freeformPos: {
      xRatio: 0.05,
      yRatio: 0.08,
      wRatio: 0.3,
      hRatio: 0.35,
      zIndex: 5,
      rotation: 0,
    },
    updated_at: '2026-11-16T10:00:00.000Z',
    ...overrides,
  };
}

describe('useRoutinesStore shared household persistence & migration', () => {
  beforeEach(() => {
    useRoutinesStore.setState({
      isInitialized: true,
      snapshot: {
        ...DEFAULT_ROUTINES_SNAPSHOT,
        items: DEFAULT_ROUTINE_ITEMS.map((item) => ({ ...item, completions: [] })),
        deletedRoutineIds: [],
      },
      items: DEFAULT_ROUTINE_ITEMS.map((item) => ({ ...item, completions: [] })),
    });
    useDashboardStore.setState({
      isInitialized: true,
      settings: { ...DEFAULT_SETTINGS },
      activeTabId: 'tab-home',
      tabs: [makeTab()],
      widgets: [],
      deletedWidgets: [],
      notes: [],
      movedWidgetToast: null,
      deletedNoteTimestamps: {},
      deletedWidgetTimestamps: {},
      deletedTabTimestamps: {},
    });
  });

  it('distinguishes starter defaults from customized routines or routines with completions', () => {
    assert.equal(isDefaultStarterRoutines(undefined), true);
    assert.equal(isDefaultStarterRoutines(DEFAULT_ROUTINE_ITEMS), true);

    const stamped = DEFAULT_ROUTINE_ITEMS.map((item, idx) =>
      idx === 0
        ? {
            ...item,
            completions: [
              { slotKey: '2026-11-16:AM', completedAt: '2026-11-16T08:00:00.000Z', profileId: 'p1' },
            ],
          }
        : item
    );
    assert.equal(isDefaultStarterRoutines(stamped), false);

    const renamed = DEFAULT_ROUTINE_ITEMS.map((item, idx) =>
      idx === 0 ? { ...item, label: 'Feed Benny' } : item
    );
    assert.equal(isDefaultStarterRoutines(renamed), false);
  });

  it('pickMigratableRoutineWidget rescues customized soft-deleted routines over fresh default tiles', () => {
    const customItems: RoutineItem[] = [
      {
        id: 'routine-custom-1',
        label: 'Walk Ollie',
        emoji: '🐕',
        cadence: 'am_pm',
        completions: [],
      },
    ];

    const softDeletedCustom = makeWidget({
      id: 'w-routines-old',
      type: 'routines',
      title: 'Family Rhythm',
      config: { items: customItems },
      deleted_at: '2026-11-16T18:00:00.000Z',
      updated_at: '2026-11-16T18:00:00.000Z',
    });
    const freshDefaultActive = makeWidget({
      id: 'w-routines-new',
      type: 'routines',
      title: 'Home Check-Ins & Rhythms',
      config: { items: DEFAULT_ROUTINE_ITEMS },
      updated_at: '2026-11-16T18:05:00.000Z',
    });

    const picked = pickMigratableRoutineWidget([freshDefaultActive, softDeletedCustom]);
    assert.equal(picked?.id, 'w-routines-old');

    // If the deleted widget was permanently purged, fall back to the active default tile
    const purgedCustom = {
      ...softDeletedCustom,
      permanentlyDeleted: true,
      config: { __purged: true },
    };
    const fallback = pickMigratableRoutineWidget([freshDefaultActive, purgedCustom]);
    assert.equal(fallback?.id, 'w-routines-new');
  });

  it('mutates shared routines via store actions and survives deleting the widget tile', async () => {
    const customItem: RoutineItem = {
      id: 'routine-trash',
      label: 'Curbside Bins',
      emoji: '♻️',
      cadence: 'weekly',
      daysOfWeek: [5],
      completions: [],
    };

    await useRoutinesStore.getState().addRoutineItem(customItem);
    assert.equal(
      useRoutinesStore.getState().items.some((item) => item.id === 'routine-trash'),
      true
    );

    await useRoutinesStore
      .getState()
      .toggleCheckIn('routine-trash', '2026-11-20', 'p_mom', '2026-11-16T12:00:00.000Z');
    let item = useRoutinesStore.getState().items.find((it) => it.id === 'routine-trash');
    assert.equal(item?.completions?.length, 1);
    assert.equal(item?.completions?.[0].profileId, 'p_mom');

    // Add a widget tile then delete it: household routines in useRoutinesStore remain untouched
    await useDashboardStore.getState().addWidget({
      id: 'w-routines-tile',
      tabId: 'tab-home',
      type: 'routines',
      title: 'Family Rhythm',
      config: { compactMode: true },
    });
    await useDashboardStore.getState().removeWidget('w-routines-tile');
    assert.equal(useDashboardStore.getState().widgets.length, 0);

    item = useRoutinesStore.getState().items.find((it) => it.id === 'routine-trash');
    assert.ok(item);
    assert.equal(item.completions?.length, 1);

    await useRoutinesStore.getState().clearAllCompletions();
    item = useRoutinesStore.getState().items.find((it) => it.id === 'routine-trash');
    assert.equal(item?.completions?.length, 0);

    await useRoutinesStore.getState().removeRoutineItem('routine-trash');
    assert.equal(
      useRoutinesStore.getState().items.some((it) => it.id === 'routine-trash'),
      false
    );
    assert.equal(
      useRoutinesStore.getState().snapshot.deletedRoutineIds?.includes('routine-trash'),
      true
    );

    // Explicit setRoutineItems updates order and items cleanly
    await useRoutinesStore.getState().setRoutineItems([
      { id: 'r-final', label: 'Lock Doors', cadence: 'daily', completions: [] },
    ]);
    assert.deepEqual(
      useRoutinesStore.getState().items.map((it) => it.id),
      ['r-final']
    );
  });

  it('merges cross-device routine check-ins and deletions cleanly in mergeRoutinesSnapshots', () => {
    const local: RoutinesSnapshot = {
      id: 'household_routines',
      updated_at: '2026-11-16T12:00:00.000Z',
      deletedRoutineIds: ['r-removed'],
      items: [
        {
          id: 'r-pets',
          label: 'Feed Pets',
          cadence: 'am_pm',
          completions: [
            { slotKey: '2026-11-16:AM', completedAt: '2026-11-16T08:00:00.000Z', profileId: 'p1' },
          ],
          updatedAt: '2026-11-16T12:00:00.000Z',
        },
        {
          id: 'r-plants',
          label: 'Water Plants',
          cadence: 'daily',
          completions: [],
          updatedAt: '2026-11-16T09:00:00.000Z',
        },
      ],
    };

    const incoming: RoutinesSnapshot = {
      id: 'household_routines',
      updated_at: '2026-11-16T12:05:00.000Z',
      deletedRoutineIds: [],
      items: [
        {
          id: 'r-pets',
          label: 'Feed Pets',
          cadence: 'am_pm',
          completions: [],
          updatedAt: '2026-11-16T07:00:00.000Z',
        },
        {
          id: 'r-plants',
          label: 'Water Plants',
          cadence: 'daily',
          completions: [
            { slotKey: '2026-11-16', completedAt: '2026-11-16T12:05:00.000Z', profileId: 'p2' },
          ],
          updatedAt: '2026-11-16T12:05:00.000Z',
        },
        {
          id: 'r-removed',
          label: 'Old Routine',
          cadence: 'daily',
          completions: [],
          updatedAt: '2026-11-16T08:00:00.000Z',
        },
      ],
    };

    const merged = mergeRoutinesSnapshots(local, incoming);
    const pets = merged.items.find((it) => it.id === 'r-pets');
    const plants = merged.items.find((it) => it.id === 'r-plants');
    const removed = merged.items.find((it) => it.id === 'r-removed');

    // Local newer AM stamp preserved, incoming newer plant stamp applied, older deleted item stays gone
    assert.equal(pets?.completions?.length, 1);
    assert.equal(plants?.completions?.length, 1);
    assert.equal(removed, undefined);
    assert.equal(merged.deletedRoutineIds?.includes('r-removed'), true);

    // An untouched item (updatedAt: undefined) on a newer snapshot must not overwrite an explicitly stamped item
    const untouchedOnRemote: RoutinesSnapshot = {
      id: 'household_routines',
      updated_at: '2026-11-16T12:10:00.000Z',
      items: [
        {
          id: 'r-untouched',
          label: 'Feed Dog',
          cadence: 'daily',
          completions: [],
        },
      ],
    };
    const stampedLocally: RoutinesSnapshot = {
      id: 'household_routines',
      updated_at: '2026-11-16T12:08:00.000Z',
      items: [
        {
          id: 'r-untouched',
          label: 'Feed Dog',
          cadence: 'daily',
          completions: [
            { slotKey: '2026-11-16', completedAt: '2026-11-16T12:08:00.000Z', profileId: 'p1' },
          ],
          updatedAt: '2026-11-16T12:08:00.000Z',
        },
      ],
    };
    const untouchedMerge = mergeRoutinesSnapshots(stampedLocally, untouchedOnRemote);
    assert.equal(untouchedMerge.items[0]?.completions?.length, 1);
    assert.equal(untouchedMerge.items[0]?.completions?.[0].profileId, 'p1');
  });

  it('keeps a routine added on another device when the two devices sync', () => {
    const feedPets: RoutineItem = {
      id: 'r-pets',
      label: 'Feed Pets',
      cadence: 'am_pm',
      completions: [],
      updatedAt: '2026-11-18T07:00:00.000Z',
    };
    // The phone (offline) adds "Walk Dog" at 07:10; the kiosk checks Feed Pets at 07:20
    const phone: RoutinesSnapshot = {
      id: 'household_routines',
      updated_at: '2026-11-18T07:10:00.000Z',
      deletedRoutineIds: [],
      items: [
        feedPets,
        { id: 'r-walk', label: 'Walk Dog', cadence: 'daily', completions: [], updatedAt: '2026-11-18T07:10:00.000Z' },
      ],
    };
    const kiosk: RoutinesSnapshot = {
      id: 'household_routines',
      updated_at: '2026-11-18T07:20:00.000Z',
      deletedRoutineIds: [],
      items: [
        {
          ...feedPets,
          completions: [{ slotKey: '2026-11-18:AM', completedAt: '2026-11-18T07:20:00.000Z', profileId: null }],
          updatedAt: '2026-11-18T07:20:00.000Z',
        },
      ],
    };

    for (const merged of [mergeRoutinesSnapshots(phone, kiosk), mergeRoutinesSnapshots(kiosk, phone)]) {
      assert.deepEqual(merged.items.map((it) => it.id).sort(), ['r-pets', 'r-walk']);
      assert.deepEqual(
        merged.items.find((it) => it.id === 'r-pets')?.completions?.map((c) => c.slotKey),
        ['2026-11-18:AM']
      );
    }

    // A routine the other device deleted stays deleted
    const kioskDeletedWalk: RoutinesSnapshot = { ...kiosk, deletedRoutineIds: ['r-walk'] };
    assert.equal(
      mergeRoutinesSnapshots(phone, kioskDeletedWalk).items.some((it) => it.id === 'r-walk'),
      false
    );
  });

  it('combines check-ins made on two devices and lets a later uncheck win', () => {
    const base = (completions: RoutineItem['completions'], updatedAt: string, extra: Partial<RoutineItem> = {}): RoutinesSnapshot => ({
      id: 'household_routines',
      updated_at: updatedAt,
      deletedRoutineIds: [],
      items: [{ id: 'r-pets', label: 'Feed Pets', cadence: 'am_pm', completions, updatedAt, ...extra }],
    });
    const mom = base(
      [{ slotKey: '2026-11-18:AM', completedAt: '2026-11-18T07:20:00.000Z', profileId: 'mom' }],
      '2026-11-18T07:20:00.000Z'
    );
    const dad = base(
      [{ slotKey: '2026-11-17:PM', completedAt: '2026-11-18T07:25:00.000Z', profileId: 'dad' }],
      '2026-11-18T07:25:00.000Z'
    );
    const both = mergeRoutinesSnapshots(mom, dad);
    assert.deepEqual(
      both.items[0]?.completions?.map((c) => `${c.slotKey}:${c.profileId}`),
      ['2026-11-17:PM:dad', '2026-11-18:AM:mom']
    );
    assert.deepEqual(mergeRoutinesSnapshots(dad, mom).items, both.items);

    // Mom takes her check-in back at 07:30; Dad's device still has its 07:20 copy
    const momUnchecked = base([], '2026-11-18T07:30:00.000Z', {
      uncheckedSlots: [{ slotKey: '2026-11-18:AM', uncheckedAt: '2026-11-18T07:30:00.000Z' }],
    });
    const dadWithOldCopy = base(
      [
        { slotKey: '2026-11-18:AM', completedAt: '2026-11-18T07:20:00.000Z', profileId: 'mom' },
        { slotKey: '2026-11-17:PM', completedAt: '2026-11-18T07:25:00.000Z', profileId: 'dad' },
      ],
      '2026-11-18T07:25:00.000Z'
    );
    for (const merged of [
      mergeRoutinesSnapshots(momUnchecked, dadWithOldCopy),
      mergeRoutinesSnapshots(dadWithOldCopy, momUnchecked),
    ]) {
      assert.deepEqual(merged.items[0]?.completions?.map((c) => c.slotKey), ['2026-11-17:PM']);
    }

    // A check-in made after the uncheck is a new one and is kept
    const dadChecksAgain = base(
      [{ slotKey: '2026-11-18:AM', completedAt: '2026-11-18T07:35:00.000Z', profileId: 'dad' }],
      '2026-11-18T07:35:00.000Z'
    );
    assert.deepEqual(
      mergeRoutinesSnapshots(momUnchecked, dadChecksAgain).items[0]?.completions?.map((c) => c.profileId),
      ['dad']
    );

    // Dad's tablet clock runs 5 minutes fast: his check-in says 07:45 though Mom unticks it at 07:42
    const fastClockCheckIn: RoutineItem = {
      id: 'r-pets',
      label: 'Feed Pets',
      cadence: 'am_pm',
      completions: [{ slotKey: '2026-11-18:AM', completedAt: '2026-11-18T07:45:00.000Z', profileId: 'dad' }],
      updatedAt: '2026-11-18T07:45:00.000Z',
    };
    const unticked = toggleRoutineCheckIn(fastClockCheckIn, '2026-11-18:AM', 'mom', '2026-11-18T07:42:00.000Z');
    const momCopy = base(unticked.completions, '2026-11-18T07:46:00.000Z', { uncheckedSlots: unticked.uncheckedSlots });
    const dadCopy = base(fastClockCheckIn.completions, '2026-11-18T07:45:00.000Z');
    assert.equal(mergeRoutinesSnapshots(momCopy, dadCopy).items[0]?.completions?.length, 0);
    assert.equal(mergeRoutinesSnapshots(dadCopy, momCopy).items[0]?.completions?.length, 0);
  });

  it('keeps cleared check-ins cleared and shares check-ins the cloud copy lacks', async () => {
    useRoutinesStore.setState({ isInitialized: true });
    await useRoutinesStore.getState().setRoutineItems([
      { id: 'r-bins', label: 'Bins', cadence: 'daily', completions: [] },
    ]);
    await useRoutinesStore
      .getState()
      .toggleCheckIn('r-bins', '2026-11-18', 'p_kid', '2026-11-18T08:00:00.000Z');
    const staleCopy = useRoutinesStore.getState().snapshot;

    // Clearing history must not be undone by another device that still has the old check-in
    await useRoutinesStore.getState().clearAllCompletions();
    const cleared = useRoutinesStore.getState().snapshot;
    assert.equal(
      mergeRoutinesSnapshots(cleared, staleCopy).items[0]?.completions?.length,
      0
    );
    assert.equal(
      mergeRoutinesSnapshots(staleCopy, cleared).items[0]?.completions?.length,
      0
    );

    // A newer cloud copy without this device's check-in: keep the check-in and date the result
    // after the cloud copy, so the next push shares it
    await useRoutinesStore
      .getState()
      .toggleCheckIn('r-bins', '2026-11-19', 'p_kid', '2026-11-19T08:00:00.000Z');
    const local = useRoutinesStore.getState().snapshot;
    const cloud: RoutinesSnapshot = {
      ...local,
      items: local.items.map((it) => ({ ...it, completions: [], label: 'Bins & Recycling', updatedAt: '2026-11-19T09:00:00.000Z' })),
      updated_at: '2026-11-19T09:00:00.000Z',
    };
    await useRoutinesStore.getState().applyRemoteRoutinesSnapshot(cloud);
    const afterPull = useRoutinesStore.getState().snapshot;
    assert.equal(afterPull.items[0]?.label, 'Bins & Recycling');
    assert.deepEqual(afterPull.items[0]?.completions?.map((c) => c.slotKey), ['2026-11-19']);
    assert.ok(Date.parse(afterPull.updated_at) > Date.parse(cloud.updated_at));

    // Pulling a copy that already has everything changes nothing and isn't re-dated
    await useRoutinesStore.getState().applyRemoteRoutinesSnapshot(afterPull);
    assert.equal(useRoutinesStore.getState().snapshot.updated_at, afterPull.updated_at);
  });
});

describe('Widget Trash & Recovery in useDashboardStore and syncMerge', () => {
  beforeEach(() => {
    useDashboardStore.setState({
      isInitialized: true,
      settings: { ...DEFAULT_SETTINGS },
      activeTabId: 'tab-home',
      tabs: [
        makeTab({ id: 'tab-home', name: 'Home Board', order: 0, isHome: true }),
        makeTab({ id: 'tab-kitchen', name: 'Kitchen', order: 1 }),
      ],
      widgets: [],
      deletedWidgets: [],
      notes: [],
      movedWidgetToast: null,
      deletedNoteTimestamps: {},
      deletedWidgetTimestamps: {},
      deletedTabTimestamps: {},
    });
  });

  it('moves removed widgets into deletedWidgets with config intact and permanentlyDeleted=false', async () => {
    const widget = makeWidget({
      id: 'w-cal-1',
      type: 'calendar',
      title: 'Family Calendar',
      config: { icsUrl: 'https://example.com/cal.ics', viewMode: 'week' },
    });
    useDashboardStore.setState({ widgets: [widget] });

    await useDashboardStore.getState().removeWidget('w-cal-1');

    const state = useDashboardStore.getState();
    assert.equal(state.widgets.length, 0);
    assert.equal(state.deletedWidgets.length, 1);
    assert.equal(state.deletedWidgets[0].id, 'w-cal-1');
    assert.equal(state.deletedWidgets[0].permanentlyDeleted, false);
    assert.equal(state.deletedWidgets[0].config.icsUrl, 'https://example.com/cal.ics');
    assert.ok(state.deletedWidgets[0].deleted_at);
    assert.equal(state.deletedWidgetTimestamps['w-cal-1'], state.deletedWidgets[0].deleted_at);
  });

  it('restores deleted widgets onto their original canvas without overlap and falls back when deleted tab is gone', async () => {
    const deletedOnHome = makeWidget({
      id: 'w-restore-home',
      tabId: 'tab-home',
      title: 'Kitchen Weather',
      freeformPos: { xRatio: 0.05, yRatio: 0.08, wRatio: 0.3, hRatio: 0.35, zIndex: 2, rotation: 0 },
      config: { locationName: 'Seattle, WA' },
      deleted_at: '2026-11-16T12:00:00.000Z',
    });
    const occupyingNote = makeNote({
      id: 'note-blocker',
      tabId: 'tab-home',
      freeformPos: { xRatio: 0.05, yRatio: 0.08, wRatio: 0.3, hRatio: 0.35, zIndex: 20, rotation: 0 },
    });
    const deletedOnMissingTab = makeWidget({
      id: 'w-restore-kitchen',
      tabId: 'tab-kitchen',
      title: 'Kitchen Timer',
      type: 'timer',
      config: { chimeEnabled: true },
      deleted_at: '2026-11-16T11:00:00.000Z',
    });

    useDashboardStore.setState({
      deletedWidgets: [deletedOnHome, deletedOnMissingTab],
      deletedWidgetTimestamps: {
        'w-restore-home': '2026-11-16T12:00:00.000Z',
        'w-restore-kitchen': '2026-11-16T11:00:00.000Z',
      },
      notes: [occupyingNote],
    });

    // Restore on active tab: should clear deleted_at, avoid note-blocker overlap, and emit no cross-tab toast
    const restoredHome = await useDashboardStore.getState().restoreWidget('w-restore-home');
    assert.equal(restoredHome, true);

    let state = useDashboardStore.getState();
    const wHome = state.widgets.find((w) => w.id === 'w-restore-home');
    assert.ok(wHome);
    assert.equal(wHome.deleted_at, null);
    assert.equal(wHome.permanentlyDeleted, false);
    assert.equal(wHome.config.locationName, 'Seattle, WA');
    assert.equal(state.deletedWidgetTimestamps['w-restore-home'], undefined);
    assert.equal(state.movedWidgetToast, null);

    const overlapX =
      Math.min(
        wHome.freeformPos.xRatio + wHome.freeformPos.wRatio,
        occupyingNote.freeformPos!.xRatio + occupyingNote.freeformPos!.wRatio
      ) - Math.max(wHome.freeformPos.xRatio, occupyingNote.freeformPos!.xRatio);
    const overlapY =
      Math.min(
        wHome.freeformPos.yRatio + wHome.freeformPos.hRatio,
        occupyingNote.freeformPos!.yRatio + occupyingNote.freeformPos!.hRatio
      ) - Math.max(wHome.freeformPos.yRatio, occupyingNote.freeformPos!.yRatio);
    assert.equal(overlapX > 0 && overlapY > 0, false);

    // Restore a widget whose source tab exists (not activeTabId): restores to tab-kitchen + shows toast
    const restoredKitchen = await useDashboardStore.getState().restoreWidget('w-restore-kitchen');
    assert.equal(restoredKitchen, true);
    state = useDashboardStore.getState();
    assert.equal(state.movedWidgetToast?.targetTabId, 'tab-kitchen');

    // Restore fallback when original tab has been deleted
    const orphanedWidget = makeWidget({
      id: 'w-orphaned',
      tabId: 'tab-deleted-forever',
      title: 'Orphaned Clock',
      deleted_at: '2026-11-16T13:00:00.000Z',
    });
    useDashboardStore.setState({
      deletedWidgets: [orphanedWidget],
      deletedWidgetTimestamps: { 'w-orphaned': '2026-11-16T13:00:00.000Z' },
    });
    const restoredFallback = await useDashboardStore.getState().restoreWidget('w-orphaned');
    assert.equal(restoredFallback, true);
    assert.equal(
      useDashboardStore.getState().widgets.find((w) => w.id === 'w-orphaned')?.tabId,
      'tab-home'
    );
  });

  it('permanentlyDeleteWidget and permanentlyDeleteWidgets purge config and retain tombstones', async () => {
    const w1 = makeWidget({
      id: 'w-purge-1',
      config: { locationName: 'Denver, CO' },
      deleted_at: '2026-11-16T10:00:00.000Z',
    });
    const w2 = makeWidget({
      id: 'w-purge-2',
      config: { locationName: 'Boston, MA' },
      deleted_at: '2026-11-16T10:01:00.000Z',
    });

    useDashboardStore.setState({
      deletedWidgets: [w1, w2],
      deletedWidgetTimestamps: {
        'w-purge-1': '2026-11-16T10:00:00.000Z',
        'w-purge-2': '2026-11-16T10:01:00.000Z',
      },
    });

    await useDashboardStore.getState().permanentlyDeleteWidget('w-purge-1');
    let state = useDashboardStore.getState();
    assert.deepEqual(
      state.deletedWidgets.map((w) => w.id),
      ['w-purge-2']
    );
    assert.ok(state.deletedWidgetTimestamps['w-purge-1']);

    // Can no longer be restored once permanently deleted
    const restoreAttempt = await state.restoreWidget('w-purge-1');
    assert.equal(restoreAttempt, false);

    await state.permanentlyDeleteWidgets(['w-purge-2']);
    state = useDashboardStore.getState();
    assert.equal(state.deletedWidgets.length, 0);
    assert.ok(state.deletedWidgetTimestamps['w-purge-2']);
  });

  it('preserves local soft-deleted config for legacy empty cloud tombstones while respecting __purged', () => {
    const localSoftDeleted = makeWidget({
      id: 'w-sync-1',
      config: { icsUrl: 'https://example.com/family.ics' },
      deleted_at: '2026-11-16T10:00:00.000Z',
    });
    const legacyCloudTombstone = makeWidget({
      id: 'w-sync-1',
      config: {},
      deleted_at: '2026-11-16T10:00:00.000Z',
    });

    const preserved = keepLocalWidgetFields(legacyCloudTombstone, localSoftDeleted);
    assert.equal(preserved.config.icsUrl, 'https://example.com/family.ics');
    assert.equal(isPermanentlyPurgedWidget(preserved), false);

    const purgedCloudTombstone = makeWidget({
      id: 'w-sync-1',
      config: { __purged: true },
      deleted_at: '2026-11-16T10:05:00.000Z',
    });
    const purgedMerged = keepLocalWidgetFields(purgedCloudTombstone, localSoftDeleted);
    assert.equal(isPermanentlyPurgedWidget(purgedMerged), true);
    assert.equal(purgedMerged.permanentlyDeleted, true);
    assert.equal(purgedMerged.config.icsUrl, undefined);
  });
});
