import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_SETTINGS } from '../src/services/db.ts';
import {
  MAX_LAYOUT_UNDO_STACK,
  classifyLayoutGeometryChange,
  useDashboardStore,
} from '../src/store/dashboardStore.ts';
import type { DashboardTab, DashboardWidget, StickyNoteItem } from '../src/types/dashboard.ts';

function makeTab(id: string, name: string, order = 0): DashboardTab {
  return {
    id,
    name,
    icon: 'Home',
    order,
    autoRotateDurationSec: 30,
    backgroundTheme: 'midnight_dots',
    enabled: true,
    updated_at: '2026-11-17T08:00:00.000Z',
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
      xRatio: 0.1,
      yRatio: 0.12,
      wRatio: 0.3,
      hRatio: 0.35,
      zIndex: 5,
      rotation: 0,
      isFullScreen: false,
    },
    config: {},
    updated_at: '2026-11-17T08:00:00.000Z',
    ...overrides,
  };
}

function makeNote(overrides: Partial<StickyNoteItem> = {}): StickyNoteItem {
  return {
    id: 'note-1',
    tabId: 'tab-home',
    title: 'Groceries',
    content: '',
    isChecklist: true,
    isShoppingList: true,
    bgColor: '#fef08a',
    isPinnedToCanvas: true,
    freeformPos: {
      xRatio: 0.6,
      yRatio: 0.55,
      wRatio: 0.24,
      hRatio: 0.28,
      zIndex: 4,
      rotation: 0,
    },
    updated_at: '2026-11-17T08:00:00.000Z',
    ...overrides,
  };
}

describe('layoutUndo stack and geometry classification', () => {
  beforeEach(() => {
    useDashboardStore.setState({
      isInitialized: false,
      settings: { ...DEFAULT_SETTINGS },
      tabs: [makeTab('tab-home', 'Home', 0), makeTab('tab-work', 'Work', 1)],
      activeTabId: 'tab-home',
      widgets: [
        makeWidget({ id: 'w-home', tabId: 'tab-home', title: 'Clock' }),
        makeWidget({ id: 'w-work', tabId: 'tab-work', title: 'Kanban' }),
      ],
      deletedWidgets: [],
      notes: [makeNote()],
      layoutUndoStack: [],
      lastLayoutSnapshot: null,
      layoutUndoToast: null,
      movedWidgetToast: null,
    });
  });

  it('classifies move, resize, rotate, maximize/restore while ignoring pure z-order changes', () => {
    const base = {
      xRatio: 0.1,
      yRatio: 0.12,
      wRatio: 0.3,
      hRatio: 0.35,
      zIndex: 5,
      rotation: 0,
      isFullScreen: false,
    };

    assert.equal(classifyLayoutGeometryChange(base, { ...base, zIndex: 12, isBackground: true }), null);
    assert.equal(classifyLayoutGeometryChange(base, { ...base, xRatio: 0.25 }), 'Moved');
    assert.equal(classifyLayoutGeometryChange(base, { ...base, wRatio: 0.45 }), 'Resized');
    assert.equal(classifyLayoutGeometryChange(base, { ...base, rotation: -12 }), 'Rotated');
    assert.equal(classifyLayoutGeometryChange(base, { ...base, isFullScreen: true }), 'Maximized');
    assert.equal(
      classifyLayoutGeometryChange({ ...base, isFullScreen: true }, { ...base, isFullScreen: false }),
      'Restored'
    );
  });

  it('undoes multiple moves, resizes, and rotations in LIFO order and ignores zIndex-only bring-to-front', async () => {
    const store = useDashboardStore.getState();

    // Pure zIndex bump does not push undo history
    await store.updateWidgetPosition('w-home', undefined, {
      xRatio: 0.1,
      yRatio: 0.12,
      wRatio: 0.3,
      hRatio: 0.35,
      zIndex: 19,
      rotation: 0,
      isFullScreen: false,
    });
    assert.equal(useDashboardStore.getState().layoutUndoStack.length, 0);

    // 1. Move
    await store.updateWidgetPosition('w-home', undefined, {
      xRatio: 0.48,
      yRatio: 0.3,
      wRatio: 0.3,
      hRatio: 0.35,
      zIndex: 19,
      rotation: 0,
      isFullScreen: false,
    });
    assert.equal(useDashboardStore.getState().layoutUndoToast?.label, 'Moved "Clock"');

    // 2. Rotate
    await store.updateWidgetPosition('w-home', undefined, {
      xRatio: 0.48,
      yRatio: 0.3,
      wRatio: 0.3,
      hRatio: 0.35,
      zIndex: 19,
      rotation: 15,
      isFullScreen: false,
    });
    assert.equal(useDashboardStore.getState().layoutUndoToast?.label, 'Rotated "Clock"');
    assert.equal(useDashboardStore.getState().layoutUndoStack.length, 2);

    // First Ctrl+Z undoes rotation (stays at moved coords)
    const undone1 = await store.undoLayoutChange('tab-home');
    assert.equal(undone1, true);
    let current = useDashboardStore.getState().widgets.find((w) => w.id === 'w-home')!;
    assert.equal(current.freeformPos?.rotation, 0);
    assert.equal(current.freeformPos?.xRatio, 0.48);

    // Second Ctrl+Z undoes move (restores original coords)
    const undone2 = await store.undoLayoutChange('tab-home');
    assert.equal(undone2, true);
    current = useDashboardStore.getState().widgets.find((w) => w.id === 'w-home')!;
    assert.equal(current.freeformPos?.xRatio, 0.1);
    assert.equal(current.freeformPos?.yRatio, 0.12);
    assert.equal(useDashboardStore.getState().layoutUndoStack.length, 0);

    // Third undo is a clean no-op
    assert.equal(await store.undoLayoutChange('tab-home'), false);
  });

  it('restores sticky note position while keeping shopping list metadata and scopes undo per canvas tab', async () => {
    const store = useDashboardStore.getState();

    await store.updateNotePosition('note-1', {
      xRatio: 0.2,
      yRatio: 0.25,
      wRatio: 0.24,
      hRatio: 0.28,
      zIndex: 4,
      rotation: 0,
    });
    await store.updateWidgetPosition('w-work', undefined, {
      xRatio: 0.45,
      yRatio: 0.45,
      wRatio: 0.3,
      hRatio: 0.35,
      zIndex: 5,
      rotation: 0,
      isFullScreen: false,
    });

    // Undoing on tab-home only restores note-1 and leaves tab-work untouched
    assert.equal(await store.undoLayoutChange('tab-home'), true);
    const note = useDashboardStore.getState().notes.find((n) => n.id === 'note-1')!;
    const workWidget = useDashboardStore.getState().widgets.find((w) => w.id === 'w-work')!;
    assert.equal(note.freeformPos?.xRatio, 0.6);
    assert.equal(note.isShoppingList, true);
    assert.equal(workWidget.freeformPos?.xRatio, 0.45);
    assert.equal(useDashboardStore.getState().layoutUndoStack.length, 1);
  });

  it('caps layoutUndoStack at MAX_LAYOUT_UNDO_STACK (20) entries', async () => {
    const store = useDashboardStore.getState();
    for (let i = 1; i <= MAX_LAYOUT_UNDO_STACK + 5; i += 1) {
      await store.updateWidgetPosition('w-home', undefined, {
        xRatio: Number((0.02 * (i % 40)).toFixed(3)) + 0.01 * i,
        yRatio: 0.12,
        wRatio: 0.3,
        hRatio: 0.35,
        zIndex: 5,
        rotation: 0,
        isFullScreen: false,
      });
    }
    assert.equal(useDashboardStore.getState().layoutUndoStack.length, MAX_LAYOUT_UNDO_STACK);
  });
});
