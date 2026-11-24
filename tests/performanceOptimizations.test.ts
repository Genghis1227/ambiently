import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PHOTO_FOCAL_CACHE,
  MAX_PHOTO_FOCAL_STATE_KEYS,
  appendBoundedFocalState,
  canReadCanvasPixelsWithoutCorsRefetch,
  clearPhotoFocalCacheForTests,
  computeDefaultFocalPosition,
  getCachedPhotoFocal,
  getPhotoFocalCacheSize,
  setCachedPhotoFocal,
} from '../src/utils/photoFocal.ts';
import { shouldWakeOrThrottleIdleCursor } from '../src/hooks/useIdleCursor.ts';
import { computeCardDragLayout } from '../src/utils/cardDragTransform.ts';
import { getBackgroundCanvasWidgetTypes } from '../src/utils/widgetPreloader.ts';
import {
  ALL_DIRTY_SYNC_SCOPES,
  mergeDirtySyncScopes,
  resolveEffectiveSyncScopes,
} from '../src/services/syncMerge.ts';
import { useDashboardStore } from '../src/store/dashboardStore.ts';

describe('v0.8.0 UX & systems performance optimizations', () => {
  beforeEach(() => {
    clearPhotoFocalCacheForTests();
  });

  it('skips CORS canvas re-fetches for external photo hosts while allowing same-origin, blob, and data URLs', () => {
    const appOrigin = 'https://dashboard.trinhism.com';
    assert.equal(
      canReadCanvasPixelsWithoutCorsRefetch(
        'https://lh3.googleusercontent.com/pw/AP1GczExample=w1600-h900',
        appOrigin
      ),
      false
    );
    assert.equal(
      canReadCanvasPixelsWithoutCorsRefetch(
        'https://drive.google.com/thumbnail?id=abc123&sz=w1600',
        appOrigin
      ),
      false
    );
    assert.equal(
      canReadCanvasPixelsWithoutCorsRefetch(
        'http://192.168.1.50:32400/library/parts/123/thumb.jpg',
        appOrigin
      ),
      false
    );

    assert.equal(canReadCanvasPixelsWithoutCorsRefetch('/assets/logo.png', appOrigin), true);
    assert.equal(
      canReadCanvasPixelsWithoutCorsRefetch(`${appOrigin}/api/proxy?url=test`, appOrigin),
      true
    );
    assert.equal(canReadCanvasPixelsWithoutCorsRefetch('blob:https://dashboard.trinhism.com/1234', appOrigin), true);
    assert.equal(canReadCanvasPixelsWithoutCorsRefetch('data:image/jpeg;base64,/9j/4AAQ', appOrigin), true);
    assert.equal(canReadCanvasPixelsWithoutCorsRefetch('', appOrigin), false);
  });

  it('computes default focal crop and bounds photo focal caches and React focal state', () => {
    assert.equal(computeDefaultFocalPosition(1080, 1920), 'center 25%');
    assert.equal(computeDefaultFocalPosition(1920, 1080), 'center center');

    // Default landscape framing avoids allocating new React state keys
    const initialState: Record<string, string> = {};
    const unchanged = appendBoundedFocalState(initialState, 'p1', 'center center');
    assert.equal(unchanged, initialState);

    // Bounded React state eviction
    let state: Record<string, string> = {};
    for (let i = 0; i < MAX_PHOTO_FOCAL_STATE_KEYS + 15; i++) {
      state = appendBoundedFocalState(state, `photo-${i}`, '40% 25%');
    }
    assert.equal(Object.keys(state).length, MAX_PHOTO_FOCAL_STATE_KEYS);
    assert.equal(state['photo-0'], undefined);
    assert.equal(state[`photo-${MAX_PHOTO_FOCAL_STATE_KEYS + 14}`], '40% 25%');

    // Bounded LRU cache eviction
    for (let i = 0; i < MAX_PHOTO_FOCAL_CACHE + 25; i++) {
      setCachedPhotoFocal(`lru-${i}`, '50% 25%');
    }
    assert.equal(getPhotoFocalCacheSize(), MAX_PHOTO_FOCAL_CACHE);
    assert.equal(getCachedPhotoFocal('lru-0'), undefined);
    assert.equal(getCachedPhotoFocal(`lru-${MAX_PHOTO_FOCAL_CACHE + 24}`), '50% 25%');
  });

  it('coalesces idle-cursor wake DOM scans and throttles awake timer resets', () => {
    const wakeFromHidden = shouldWakeOrThrottleIdleCursor({
      isCurrentlyHidden: true,
      hasClassOnRoot: true,
      hasObserver: true,
      nowMs: 1000,
      lastResetMs: 950,
    });
    assert.deepEqual(wakeFromHidden, { shouldRestoreDom: true, shouldResetTimer: true });

    const fastAwakeMove = shouldWakeOrThrottleIdleCursor({
      isCurrentlyHidden: false,
      hasClassOnRoot: false,
      hasObserver: false,
      nowMs: 1120,
      lastResetMs: 1000,
    });
    assert.deepEqual(fastAwakeMove, { shouldRestoreDom: false, shouldResetTimer: false });

    const throttledAwakeMove = shouldWakeOrThrottleIdleCursor({
      isCurrentlyHidden: false,
      hasClassOnRoot: false,
      hasObserver: false,
      nowMs: 1260,
      lastResetMs: 1000,
    });
    assert.deepEqual(throttledAwakeMove, { shouldRestoreDom: false, shouldResetTimer: true });
  });

  it('computes GPU translate3d drag offsets while anchoring base left/top coordinates', () => {
    const basePos = { xRatio: 0.1, yRatio: 0.2, wRatio: 0.3, hRatio: 0.4, rotation: 4 };
    const dragging = computeCardDragLayout({
      basePos,
      isDragging: true,
      dragPos: { xRatio: 0.35, yRatio: 0.45 },
      containerSize: { width: 1000, height: 800 },
      isResizing: false,
      resizeRatio: null,
      isRotating: false,
      rotateAngle: null,
      dragScale: 1.02,
    });

    assert.equal(dragging.leftPct, 10);
    assert.equal(dragging.topPct, 20);
    assert.equal(dragging.transform, 'translate3d(250px, 200px, 0) rotate(4deg) scale(1.02)');
    assert.equal(dragging.willChange, 'transform');
    assert.equal(dragging.effectiveXRatio, 0.35);
    assert.equal(dragging.effectiveYRatio, 0.45);

    const idle = computeCardDragLayout({
      basePos,
      isDragging: false,
      dragPos: null,
      containerSize: null,
      isResizing: false,
      resizeRatio: null,
      isRotating: false,
      rotateAngle: null,
      dragScale: 1.02,
    });
    assert.equal(idle.transform, 'translate3d(0px, 0px, 0) rotate(4deg) scale(1)');
    assert.equal(idle.willChange, 'auto');
  });

  it('identifies unique background canvas widget types excluding active, deleted, and disabled tabs', () => {
    const types = getBackgroundCanvasWidgetTypes(
      [
        { type: 'photo_frame', tabId: 'tab-home', deleted_at: null },
        { type: 'calendar', tabId: 'tab-family', deleted_at: null },
        { type: 'calendar', tabId: 'tab-kitchen', deleted_at: null },
        { type: 'homelab', tabId: 'tab-kitchen', deleted_at: null },
        { type: 'sports', tabId: 'tab-disabled', deleted_at: null },
        { type: 'soundscape', tabId: 'tab-family', deleted_at: '2026-11-19T00:00:00Z' },
        { type: 'clock', tabId: 'tab-family', deleted_at: null }, // eager widget, skipped
      ],
      'tab-home',
      new Set(['tab-home', 'tab-family', 'tab-kitchen'])
    );

    assert.deepEqual(types, ['calendar', 'homelab']);
  });

  it('scopes incremental cloud pushes once a baseline exists and avoids redundant carousel pause notifications', () => {
    // Baseline missing or forced -> full sync scopes
    assert.deepEqual(
      resolveEffectiveSyncScopes({ dirtyScopes: { notes: true } }, false),
      ALL_DIRTY_SYNC_SCOPES
    );
    assert.deepEqual(
      resolveEffectiveSyncScopes({ force: true, dirtyScopes: { notes: true } }, true),
      ALL_DIRTY_SYNC_SCOPES
    );

    // Baseline established -> strictly scoped push
    assert.deepEqual(
      resolveEffectiveSyncScopes({ dirtyScopes: { notes: true } }, true),
      {
        settings: false,
        tabs: false,
        widgets: false,
        notes: true,
        householdStores: false,
      }
    );

    const combined = mergeDirtySyncScopes(
      mergeDirtySyncScopes({}, { widgets: true }),
      { notes: true }
    );
    assert.deepEqual(resolveEffectiveSyncScopes({ dirtyScopes: combined }, true), {
      settings: false,
      tabs: false,
      widgets: true,
      notes: true,
      householdStores: false,
    });

    // Repeated pauseCarouselTemporarily calls while already paused only notify subscribers once
    useDashboardStore.setState({ isCarouselPaused: false });
    let notifications = 0;
    const unsub = useDashboardStore.subscribe(() => {
      notifications += 1;
    });
    try {
      const store = useDashboardStore.getState();
      store.pauseCarouselTemporarily(20000);
      store.pauseCarouselTemporarily(20000);
      store.pauseCarouselTemporarily(20000);
      assert.equal(useDashboardStore.getState().isCarouselPaused, true);
      assert.equal(notifications, 1);
    } finally {
      unsub();
      useDashboardStore.setState({ isCarouselPaused: false });
    }
  });
});

describe('Milestone 4 Performance & Kiosk Runtime Suite', () => {
  it('batches z-order updates synchronously and preserves untouched sibling references', async () => {
    const prevWidgets = useDashboardStore.getState().widgets;
    const prevNotes = useDashboardStore.getState().notes;

    const w1 = {
      id: 'w-z-1',
      tabId: 'tab-1',
      type: 'clock' as const,
      title: 'Clock',
      config: {},
      gridPos: { x: 0, y: 0, w: 4, h: 4 },
      freeformPos: { xRatio: 0.1, yRatio: 0.1, wRatio: 0.3, hRatio: 0.3, zIndex: 1, rotation: 0 },
      updated_at: '2026-11-24T00:00:00.000Z',
    };
    const w2 = {
      id: 'w-z-2',
      tabId: 'tab-1',
      type: 'weather' as const,
      title: 'Weather',
      config: {},
      gridPos: { x: 4, y: 0, w: 4, h: 4 },
      freeformPos: { xRatio: 0.5, yRatio: 0.1, wRatio: 0.3, hRatio: 0.3, zIndex: 2, rotation: 0 },
      updated_at: '2026-11-24T00:00:00.000Z',
    };
    const n1 = {
      id: 'n-z-1',
      tabId: 'tab-1',
      content: 'Note',
      color: '#fef08a',
      freeformPos: { xRatio: 0.2, yRatio: 0.2, wRatio: 0.2, hRatio: 0.2, zIndex: 3, rotation: 0 },
      updated_at: '2026-11-24T00:00:00.000Z',
    };

    useDashboardStore.setState({
      widgets: [w1 as never, w2 as never],
      notes: [n1 as never],
    });

    let notifications = 0;
    const unsub = useDashboardStore.subscribe(() => {
      notifications += 1;
    });

    try {
      await useDashboardStore.getState().applyCanvasZOrderUpdates([
        { id: 'w-z-1', type: 'widget', zIndex: 10, isBackground: true },
        { id: 'n-z-1', type: 'note', zIndex: 11, isBackground: false },
      ]);

      const stateAfterZ = useDashboardStore.getState();
      assert.equal(notifications, 1);
      assert.equal(stateAfterZ.widgets[0].freeformPos?.zIndex, 10);
      assert.equal(stateAfterZ.widgets[0].freeformPos?.isBackground, true);
      assert.equal(stateAfterZ.widgets[1], w2);
      assert.equal(stateAfterZ.notes[0].freeformPos?.zIndex, 11);

      await useDashboardStore.getState().reorderMobileWidgets(['w-z-2', 'w-z-1']);
      const stateAfterOrder = useDashboardStore.getState();
      assert.equal(stateAfterOrder.widgets[0].mobileOrder, 1);
      assert.equal(stateAfterOrder.widgets[1].mobileOrder, 0);
    } finally {
      unsub();
      useDashboardStore.setState({ widgets: prevWidgets, notes: prevNotes });
    }
  });

  it('caps local folder scans at 1500 and filters dead session blob URLs', async () => {
    const { MAX_LOCAL_FOLDER_PHOTOS, filterDeadSessionBlobPhotos } = await import(
      '../src/services/photos'
    );
    assert.equal(MAX_LOCAL_FOLDER_PHOTOS, 1500);

    const filtered = filterDeadSessionBlobPhotos([
      { id: '1', url: 'blob:https://example.org/dead-session-uuid-1' },
      { id: '2', url: 'https://example.org/photo.jpg' },
      { id: '3', url: 'data:image/png;base64,iVBORw0KGgo=' },
    ]);
    assert.deepEqual(
      filtered.map((p) => p.id),
      ['2', '3']
    );
  });

  it('toggles canvas occlusion state cleanly for photo screensaver hibernation', async () => {
    const { getPhotoScreensaverOccludingCanvas, setPhotoScreensaverOccludingCanvas } =
      await import('../src/utils/displayActivity');

    try {
      assert.equal(getPhotoScreensaverOccludingCanvas(), false);
      setPhotoScreensaverOccludingCanvas(true);
      assert.equal(getPhotoScreensaverOccludingCanvas(), true);
      setPhotoScreensaverOccludingCanvas(false);
      assert.equal(getPhotoScreensaverOccludingCanvas(), false);
    } finally {
      setPhotoScreensaverOccludingCanvas(false);
    }
  });

  it('formats timezone offsets independently of WorldClockWidget UI', async () => {
    const { getFormattedTimeForZone, getZoneOffsetMinutes } = await import(
      '../src/utils/timezoneFormat'
    );
    const sampleDate = new Date('2026-11-24T12:00:00.000Z');
    assert.equal(getZoneOffsetMinutes(sampleDate, 'UTC'), 0);

    const formatted12 = getFormattedTimeForZone(sampleDate, 'UTC', true);
    assert.equal(formatted12.hoursMinutes, '12:00');
    assert.equal(formatted12.ampm, 'PM');

    const formatted24 = getFormattedTimeForZone(sampleDate, 'UTC', false);
    assert.equal(formatted24.hoursMinutes, '12:00');
    assert.equal(formatted24.ampm, '');
  });

  it('deduplicates concurrent in-flight RSS feed requests for the same URL', async () => {
    const { clearFeedMemoryCaches, fetchRssFeed } = await import('../src/services/feeds');
    clearFeedMemoryCaches();

    const prevFetch = globalThis.fetch;
    let fetchCalls = 0;
    globalThis.fetch = (async () => {
      fetchCalls += 1;
      await new Promise((r) => setTimeout(r, 15));
      return new Response(
        JSON.stringify({
          title: 'Test Feed',
          items: [
            {
              title: 'Headline One',
              link: 'https://example.org/post-1',
              pubDate: '2026-11-24T12:00:00.000Z',
              snippet: 'Summary',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    try {
      const feedUrl = 'https://example.org/dedup-rss-test.xml';
      const [resA, resB] = await Promise.all([fetchRssFeed(feedUrl), fetchRssFeed(feedUrl)]);
      assert.equal(fetchCalls, 1);
      assert.equal(resA.items.length, 1);
      assert.equal(resB.items.length, 1);
      assert.equal(resA.items[0].title, 'Headline One');
    } finally {
      globalThis.fetch = prevFetch;
      clearFeedMemoryCaches();
    }
  });
});
