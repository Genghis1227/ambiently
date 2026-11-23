import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import type { DashboardWidget, FreeformPosition, StickyNoteItem } from '../src/types/dashboard.ts';
import { computeNonOverlappingLayout } from '../src/utils/autoLayout.ts';
import { materializeCanvasBlueprint } from '../src/utils/canvasBlueprints.ts';
import {
  DESKTOP_MODE_OVERRIDE_STORAGE_KEY,
  readPersistedForceDesktopMode,
  resolveAdaptiveCalendarColumns,
  resolveAdaptiveMealWeekColumns,
  resolveFinanceAutoMode,
  resolvePortraitSpawnDimensions,
  resolveViewportLayoutMode,
  writePersistedForceDesktopMode,
} from '../src/utils/displayOrientation.ts';

function makeWidget(overrides: Partial<DashboardWidget> = {}): DashboardWidget {
  return {
    id: 'w-1',
    tabId: 'tab-portrait',
    type: 'clock_weather',
    title: 'Clock & Weather',
    gridPos: { x: 0, y: 0, w: 4, h: 4 },
    freeformPos: {
      xRatio: 0.05,
      yRatio: 0.05,
      wRatio: 0.35,
      hRatio: 0.45,
      zIndex: 1,
      rotation: 0,
    },
    config: {},
    updated_at: '2026-11-23T06:00:00.000Z',
    ...overrides,
  };
}

function makeNote(overrides: Partial<StickyNoteItem> = {}): StickyNoteItem {
  return {
    id: 'n-1',
    tabId: 'tab-portrait',
    content: 'Buy milk',
    bgColor: '#fef08a',
    isPinnedToCanvas: true,
    updated_at: '2026-11-23T06:00:00.000Z',
    ...overrides,
  };
}

function boxesOverlap(a?: FreeformPosition, b?: FreeformPosition): boolean {
  if (!a || !b) return false;
  const xOverlap =
    Math.min(a.xRatio + a.wRatio, b.xRatio + b.wRatio) - Math.max(a.xRatio, b.xRatio);
  const yOverlap =
    Math.min(a.yRatio + a.hRatio, b.yRatio + b.hRatio) - Math.max(a.yRatio, b.yRatio);
  return xOverlap > 0.001 && yOverlap > 0.001;
}

describe('Phase 2 displayOrientation helpers', () => {
  it('classifies mobile, portrait wall displays (768x1366, 1080x1920), and landscape boards cleanly', () => {
    const phone = resolveViewportLayoutMode(390, 844, false);
    assert.equal(phone.isMobileViewport, true);
    assert.equal(phone.isMobileCompanionActive, true);
    assert.equal(phone.isPortraitViewport, true);
    assert.equal(phone.isPortraitDesktop, false);
    assert.equal(phone.orientation, 'portrait');

    const kiosk720Companion = resolveViewportLayoutMode(720, 1280, false);
    assert.equal(kiosk720Companion.isMobileCompanionActive, true);
    assert.equal(kiosk720Companion.isPortraitDesktop, false);

    const kiosk720Desktop = resolveViewportLayoutMode(720, 1280, true);
    assert.equal(kiosk720Desktop.isMobileViewport, true);
    assert.equal(kiosk720Desktop.isMobileCompanionActive, false);
    assert.equal(kiosk720Desktop.isPortraitDesktop, true);

    const tabletPortrait = resolveViewportLayoutMode(768, 1366, false);
    assert.equal(tabletPortrait.isMobileViewport, false);
    assert.equal(tabletPortrait.isMobileCompanionActive, false);
    assert.equal(tabletPortrait.isPortraitDesktop, true);
    assert.equal(tabletPortrait.orientation, 'portrait');

    const fhdPortrait = resolveViewportLayoutMode(1080, 1920, false);
    assert.equal(fhdPortrait.isPortraitDesktop, true);
    assert.equal(fhdPortrait.aspectRatio, 0.5625);

    const fhdLandscape = resolveViewportLayoutMode(1920, 1080, false);
    assert.equal(fhdLandscape.isPortraitViewport, false);
    assert.equal(fhdLandscape.isPortraitDesktop, false);
    assert.equal(fhdLandscape.orientation, 'landscape');
  });

  it('persists device-local Desktop View preference cleanly in localStorage', () => {
    const store = new Map<string, string>();
    const g = globalThis as Record<string, unknown>;
    const prevWindow = g.window;
    g.window = {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => {
          store.set(k, v);
        },
        removeItem: (k: string) => {
          store.delete(k);
        },
      },
    };

    try {
      assert.equal(readPersistedForceDesktopMode(), false);
      writePersistedForceDesktopMode(true);
      assert.equal(store.get(DESKTOP_MODE_OVERRIDE_STORAGE_KEY), 'true');
      assert.equal(readPersistedForceDesktopMode(), true);
      writePersistedForceDesktopMode(false);
      assert.equal(readPersistedForceDesktopMode(), false);
    } finally {
      if (prevWindow === undefined) {
        delete g.window;
      } else {
        g.window = prevWindow;
      }
    }
  });

  it('computes adaptive portrait Calendar, Meal Planner, Finance, and spawn heuristics', () => {
    assert.deepEqual(resolveAdaptiveCalendarColumns('3day', 420), {
      stacked: true,
      scrollHorizontally: false,
    });
    assert.deepEqual(resolveAdaptiveCalendarColumns('3day', 600), {
      stacked: false,
      scrollHorizontally: false,
    });
    assert.deepEqual(resolveAdaptiveCalendarColumns('week', 500), {
      stacked: true,
      scrollHorizontally: false,
    });
    assert.deepEqual(resolveAdaptiveCalendarColumns('week', 680), {
      stacked: false,
      scrollHorizontally: true,
    });
    assert.deepEqual(resolveAdaptiveCalendarColumns('week', 900), {
      stacked: false,
      scrollHorizontally: false,
    });

    assert.equal(resolveAdaptiveMealWeekColumns(480), 1);
    assert.equal(resolveAdaptiveMealWeekColumns(680), 2);
    assert.equal(resolveAdaptiveMealWeekColumns(960), 3);

    assert.equal(resolveFinanceAutoMode(360, 110), 'ticker');
    assert.equal(resolveFinanceAutoMode(600, 950), 'list');
    assert.equal(resolveFinanceAutoMode(700, 500), 'grid');

    assert.deepEqual(resolvePortraitSpawnDimensions('landscape', 0.35, 0.45), {
      wRatio: 0.35,
      hRatio: 0.45,
    });
    const spawnedPortrait = resolvePortraitSpawnDimensions('portrait', 0.35, 0.45);
    assert.ok(spawnedPortrait.wRatio >= 0.46 && spawnedPortrait.wRatio <= 0.92);
    assert.ok(spawnedPortrait.hRatio >= 0.22 && spawnedPortrait.hRatio <= 0.42);
  });
});

describe('Phase 2 portrait autoLayout heuristics and starter blueprints', () => {
  it('stacks 2 items vertically, promotes a top hero for 3 items, and avoids overlaps for 1..6 items in portrait bento', () => {
    const twoWidgets = [
      makeWidget({ id: 'w-a', type: 'calendar' }),
      makeWidget({ id: 'w-b', type: 'chores' }),
    ];

    const portraitTwo = computeNonOverlappingLayout(twoWidgets, [], 'bento', {
      orientation: 'portrait',
      viewportAspectRatio: 9 / 16,
    });
    assert.equal(portraitTwo.widgetPositions['w-a'].wRatio, 0.96);
    assert.equal(portraitTwo.widgetPositions['w-b'].wRatio, 0.96);
    assert.ok(
      portraitTwo.widgetPositions['w-b'].yRatio >=
        portraitTwo.widgetPositions['w-a'].yRatio + portraitTwo.widgetPositions['w-a'].hRatio
    );

    // Default landscape behavior remains side-by-side
    const landscapeTwo = computeNonOverlappingLayout(twoWidgets, [], 'bento');
    assert.equal(landscapeTwo.widgetPositions['w-a'].yRatio, landscapeTwo.widgetPositions['w-b'].yRatio);

    const threeWidgets = [
      makeWidget({ id: 'w-1', type: 'calendar' }),
      makeWidget({ id: 'w-2', type: 'photo_frame' }),
      makeWidget({ id: 'w-3', type: 'clock_weather' }),
    ];
    const portraitThree = computeNonOverlappingLayout(threeWidgets, [], 'bento', {
      orientation: 'portrait',
      viewportAspectRatio: 9 / 16,
    });
    assert.equal(portraitThree.widgetPositions['w-1'].wRatio, 0.96);
    assert.ok(
      portraitThree.widgetPositions['w-2'].yRatio >=
        portraitThree.widgetPositions['w-1'].yRatio + portraitThree.widgetPositions['w-1'].hRatio
    );
    assert.equal(
      portraitThree.widgetPositions['w-2'].yRatio,
      portraitThree.widgetPositions['w-3'].yRatio
    );

    for (const count of [1, 2, 3, 4, 5, 6]) {
      const batch = Array.from({ length: count }, (_, idx) =>
        makeWidget({ id: `w-n-${idx}`, type: idx === 0 ? 'calendar' : 'weather' })
      );
      const layout = computeNonOverlappingLayout(batch, [], 'bento', {
        orientation: 'portrait',
        viewportAspectRatio: 9 / 16,
      });
      const positions = batch.map((w) => layout.widgetPositions[w.id]);
      for (let i = 0; i < positions.length; i++) {
        assert.ok(positions[i].xRatio >= 0 && positions[i].xRatio + positions[i].wRatio <= 1.001);
        assert.ok(positions[i].yRatio >= 0 && positions[i].yRatio + positions[i].hRatio <= 1.001);
        for (let j = i + 1; j < positions.length; j++) {
          assert.equal(boxesOverlap(positions[i], positions[j]), false);
        }
      }
    }
  });

  it('splits live widgets top and sticky notes bottom in portrait split mode and preserves readable widths in pack mode', () => {
    const widgets = [
      makeWidget({ id: 'w-cal', type: 'calendar', freeformPos: { xRatio: 0.1, yRatio: 0.1, wRatio: 0.3, hRatio: 0.35, zIndex: 1, rotation: 0 } }),
      makeWidget({ id: 'w-clk', type: 'clock_weather', freeformPos: { xRatio: 0.2, yRatio: 0.2, wRatio: 0.2, hRatio: 0.25, zIndex: 2, rotation: 0 } }),
    ];
    const notes = [
      makeNote({ id: 'n-1' }),
      makeNote({ id: 'n-2' }),
    ];

    const splitLayout = computeNonOverlappingLayout(widgets, notes, 'split', {
      orientation: 'portrait',
      viewportAspectRatio: 9 / 16,
    });
    const maxWidgetBottom = Math.max(
      ...widgets.map((w) => splitLayout.widgetPositions[w.id].yRatio + splitLayout.widgetPositions[w.id].hRatio)
    );
    const minNoteTop = Math.min(...notes.map((n) => splitLayout.notePositions[n.id].yRatio));
    assert.ok(minNoteTop > maxWidgetBottom);
    assert.ok(!boxesOverlap(splitLayout.notePositions['n-1'], splitLayout.notePositions['n-2']));

    const packLayout = computeNonOverlappingLayout(widgets, notes, 'pack', {
      orientation: 'portrait',
      viewportAspectRatio: 9 / 16,
    });
    const packedAll = [
      ...widgets.map((w) => packLayout.widgetPositions[w.id]),
      ...notes.map((n) => packLayout.notePositions[n.id]),
    ];
    for (let i = 0; i < packedAll.length; i++) {
      assert.ok(packedAll[i].wRatio >= 0.28);
      for (let j = i + 1; j < packedAll.length; j++) {
        assert.equal(boxesOverlap(packedAll[i], packedAll[j]), false);
      }
    }
  });

  it('materializes non-overlapping vertical starter blueprints when orientation is portrait', () => {
    const existing = [
      makeWidget({
        id: 'existing-weather',
        type: 'weather',
        config: { locationName: 'Seattle, WA', latitude: 47.6062, longitude: -122.3321, unit: 'F' },
      }),
    ];

    const family = materializeCanvasBlueprint('family_command', {
      tabId: 'tab-portrait-fam',
      existingWidgets: existing,
      nowMs: 1000,
      orientation: 'portrait',
    });
    assert.equal(family.widgets.length, 3);
    assert.equal(family.widgets[0].config.locationName, 'Seattle, WA');
    for (let i = 0; i < family.widgets.length; i++) {
      assert.equal(family.widgets[i].freeformPos?.wRatio, 0.94);
      for (let j = i + 1; j < family.widgets.length; j++) {
        assert.equal(
          boxesOverlap(family.widgets[i].freeformPos, family.widgets[j].freeformPos),
          false
        );
      }
    }

    const kitchen = materializeCanvasBlueprint('kitchen_meals', {
      tabId: 'tab-portrait-kitchen',
      existingWidgets: existing,
      nowMs: 2000,
      orientation: 'portrait',
    });
    assert.equal(kitchen.widgets[0].freeformPos?.wRatio, 0.94);
    const kitchenBoxes = [
      ...kitchen.widgets.map((w) => w.freeformPos),
      ...kitchen.notes.map((n) => n.freeformPos),
    ];
    for (let i = 0; i < kitchenBoxes.length; i++) {
      for (let j = i + 1; j < kitchenBoxes.length; j++) {
        assert.equal(boxesOverlap(kitchenBoxes[i], kitchenBoxes[j]), false);
      }
    }

    const gallery = materializeCanvasBlueprint('photo_gallery', {
      tabId: 'tab-portrait-photos',
      existingWidgets: existing,
      nowMs: 3000,
      orientation: 'portrait',
    });
    assert.equal(gallery.widgets[0].freeformPos?.wRatio, 0.96);
    assert.equal(gallery.widgets[1].freeformPos?.wRatio, 0.88);
  });
});
