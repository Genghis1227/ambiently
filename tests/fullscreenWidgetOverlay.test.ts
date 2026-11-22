import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { DashboardWidget, FreeformPosition } from '../src/types/dashboard';
import {
  buildMaximizedFreeformPos,
  buildRestoredFreeformPos,
  resolveFullScreenCardLayoutClasses,
  resolveVisibleChoreOverlay,
  resolveVisibleKanbanOverlay,
} from '../src/utils/fullscreenWidgetOverlay';
import { useChoreStore } from '../src/stores/useChoreStore';
import { useKanbanStore } from '../src/stores/useKanbanStore';

describe('Fullscreen widget overlays & canvas fullscreen layout (fullscreenWidgetOverlay)', () => {
  it('resolves dock clearance and internal padding cleanly across media, hubs, and padded tiles', () => {
    for (const mediaType of ['photo_frame', 'image', 'embed']) {
      assert.deepEqual(resolveFullScreenCardLayoutClasses(mediaType, 'pl-20'), {
        outerClass: 'rounded-none border-0 p-0 overflow-hidden',
        innerPaddingClass: '',
      });
    }

    for (const hubType of ['chores', 'kanban']) {
      assert.deepEqual(resolveFullScreenCardLayoutClasses(hubType, 'pt-20'), {
        outerClass: 'rounded-none border-0 p-0 overflow-hidden',
        innerPaddingClass: '',
      });
    }

    for (const selfPaddedType of ['meals', 'chalkboard']) {
      assert.deepEqual(resolveFullScreenCardLayoutClasses(selfPaddedType, 'pl-20'), {
        outerClass: 'rounded-none border-0 p-0 overflow-hidden pl-20',
        innerPaddingClass: '',
      });
      assert.deepEqual(resolveFullScreenCardLayoutClasses(selfPaddedType, ''), {
        outerClass: 'rounded-none border-0 p-0 overflow-hidden',
        innerPaddingClass: '',
      });
    }

    for (const standardType of ['calendar', 'rss', 'finance', 'clock', 'sticky_notes']) {
      assert.deepEqual(resolveFullScreenCardLayoutClasses(standardType, 'pt-20'), {
        outerClass: 'rounded-none border-0 p-0 overflow-hidden pt-20',
        innerPaddingClass: 'p-4',
      });
      assert.deepEqual(resolveFullScreenCardLayoutClasses(standardType, ''), {
        outerClass: 'rounded-none border-0 p-0 overflow-hidden',
        innerPaddingClass: 'p-4',
      });
    }
  });

  it('snapshots and restores prior tile coordinates, dimensions, and rotation across fullscreen toggles', () => {
    const original: FreeformPosition = {
      xRatio: 0.52,
      yRatio: 0.14,
      wRatio: 0.38,
      hRatio: 0.62,
      zIndex: 9,
      rotation: -7,
      isFullScreen: false,
    };

    const maximized = buildMaximizedFreeformPos(original);
    assert.equal(maximized.xRatio, 0);
    assert.equal(maximized.yRatio, 0);
    assert.equal(maximized.wRatio, 1);
    assert.equal(maximized.hRatio, 1);
    assert.equal(maximized.rotation, 0);
    assert.equal(maximized.zIndex, 9);
    assert.equal(maximized.isFullScreen, true);
    assert.deepEqual(maximized.restorePos, {
      xRatio: 0.52,
      yRatio: 0.14,
      wRatio: 0.38,
      hRatio: 0.62,
      rotation: -7,
    });

    // Re-maximizing an already fullscreen tile preserves its original restore snapshot
    const reMaximized = buildMaximizedFreeformPos(maximized);
    assert.deepEqual(reMaximized.restorePos, maximized.restorePos);

    const restored = buildRestoredFreeformPos(reMaximized);
    assert.deepEqual(restored, original);
    assert.equal('restorePos' in restored, false);

    // Legacy fullscreen tiles without restorePos fall back cleanly
    const legacyFull: FreeformPosition = {
      xRatio: 0,
      yRatio: 0,
      wRatio: 1,
      hRatio: 1,
      zIndex: 4,
      rotation: 0,
      isFullScreen: true,
    };
    const legacyRestored = buildRestoredFreeformPos(legacyFull, {
      xRatio: 0.15,
      yRatio: 0.2,
      wRatio: 0.5,
      hRatio: 0.55,
      rotation: 0,
    });
    assert.deepEqual(legacyRestored, {
      xRatio: 0.15,
      yRatio: 0.2,
      wRatio: 0.5,
      hRatio: 0.55,
      zIndex: 4,
      rotation: 0,
      isFullScreen: false,
    });
  });

  it('scopes Chores and Kanban fullscreen overlays to their originating canvas tab and live widget', () => {
    const choresWidgetTabA: DashboardWidget = {
      id: 'w-chores-1',
      tabId: 'tab-a',
      type: 'chores',
      title: 'Kids Chores Updated',
      config: { scope: 'household', displayMode: 'tile' },
      gridPos: { x: 0, y: 0, w: 4, h: 4 },
      updated_at: '2026-11-21T12:00:00.000Z',
    };
    const kanbanWidgetTabB: DashboardWidget = {
      id: 'w-kanban-1',
      tabId: 'tab-b',
      type: 'kanban',
      title: 'Home Projects',
      config: { activeBoardId: 'board-1', activeColumnId: 'todo' },
      gridPos: { x: 0, y: 0, w: 4, h: 4 },
      updated_at: '2026-11-21T12:00:00.000Z',
    };

    const choreCtx = {
      tabId: 'tab-a',
      widgetId: 'w-chores-1',
      title: 'Old Title',
      config: { scope: 'child-1' },
    };

    // Visible on originating tab-a with live widget title & config
    assert.deepEqual(
      resolveVisibleChoreOverlay({
        isFullScreenOpen: true,
        fullScreenContext: choreCtx,
        activeTabId: 'tab-a',
        activeTabWidgets: [choresWidgetTabA],
      }),
      {
        tabId: 'tab-a',
        widgetId: 'w-chores-1',
        title: 'Kids Chores Updated',
        config: { scope: 'household', displayMode: 'tile' },
      }
    );

    // Hidden while rotating/switching to tab-b, then visible again when returning to tab-a
    assert.equal(
      resolveVisibleChoreOverlay({
        isFullScreenOpen: true,
        fullScreenContext: choreCtx,
        activeTabId: 'tab-b',
        activeTabWidgets: [kanbanWidgetTabB],
      }),
      null
    );

    // Hidden if originating widget is deleted on tab-a
    assert.equal(
      resolveVisibleChoreOverlay({
        isFullScreenOpen: true,
        fullScreenContext: choreCtx,
        activeTabId: 'tab-a',
        activeTabWidgets: [{ ...choresWidgetTabA, deleted_at: '2026-11-21T13:00:00.000Z' }],
      }),
      null
    );

    // Unscoped QuickStart overlay (tabId: null) stays visible regardless of widget list
    assert.deepEqual(
      resolveVisibleChoreOverlay({
        isFullScreenOpen: true,
        fullScreenContext: null,
        activeTabId: 'tab-a',
        activeTabWidgets: [],
      }),
      {
        tabId: null,
        widgetId: undefined,
        title: undefined,
        config: undefined,
      }
    );

    const kanbanCtx = {
      widgetId: 'w-kanban-1',
      tabId: 'tab-b',
      title: 'Old Board',
      config: { activeBoardId: 'board-1' },
      isLight: true,
    };

    assert.equal(
      resolveVisibleKanbanOverlay({
        fullScreenOverlay: kanbanCtx,
        activeTabId: 'tab-a',
        activeTabWidgets: [choresWidgetTabA],
      }),
      null
    );

    assert.deepEqual(
      resolveVisibleKanbanOverlay({
        fullScreenOverlay: kanbanCtx,
        activeTabId: 'tab-b',
        activeTabWidgets: [kanbanWidgetTabB],
      }),
      {
        widgetId: 'w-kanban-1',
        tabId: 'tab-b',
        title: 'Home Projects',
        config: { activeBoardId: 'board-1', activeColumnId: 'todo' },
        isLight: true,
      }
    );
  });

  it('clears Chores and Kanban fullscreen overlays and parent drawer on resetForBoardSwitch', () => {
    useChoreStore.getState().setFullScreenOpen(true, { tabId: 'tab-a', widgetId: 'w-1' });
    useChoreStore.getState().setParentDrawerOpen(true, 'approvals');
    useKanbanStore.getState().setFullScreenOverlay({
      widgetId: 'w-k1',
      tabId: 'tab-b',
      title: 'Projects',
    });

    assert.equal(useChoreStore.getState().isFullScreenOpen, true);
    assert.equal(useChoreStore.getState().isParentDrawerOpen, true);
    assert.notEqual(useKanbanStore.getState().fullScreenOverlay, null);

    useChoreStore.getState().resetForBoardSwitch();
    useKanbanStore.getState().resetForBoardSwitch();

    assert.equal(useChoreStore.getState().isFullScreenOpen, false);
    assert.equal(useChoreStore.getState().fullScreenContext, null);
    assert.equal(useChoreStore.getState().isParentDrawerOpen, false);
    assert.equal(useKanbanStore.getState().fullScreenOverlay, null);
  });
});
