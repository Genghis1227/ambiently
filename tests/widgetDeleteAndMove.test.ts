import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_SETTINGS } from '../src/services/db.ts';
import { useDashboardStore } from '../src/store/dashboardStore.ts';
import {
  MAX_CANVASES,
  type DashboardTab,
  type DashboardWidget,
  type StickyNoteItem,
} from '../src/types/dashboard.ts';
import { computeMovedWidgetPosition } from '../src/utils/autoLayout.ts';

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
      rotation: -3,
      isFullScreen: false,
    },
    config: { locationName: 'Austin, TX' },
    updated_at: '2026-11-16T10:00:00.000Z',
    ...overrides,
  };
}

function makeNote(overrides: Partial<StickyNoteItem> = {}): StickyNoteItem {
  return {
    id: 'note-1',
    tabId: 'tab-kitchen',
    title: 'Groceries',
    content: 'Milk, Eggs',
    isChecklist: false,
    bgColor: '#fef08a',
    isPinnedToCanvas: true,
    freeformPos: {
      xRatio: 0.65,
      yRatio: 0.6,
      wRatio: 0.25,
      hRatio: 0.25,
      zIndex: 12,
      rotation: 0,
    },
    updated_at: '2026-11-16T10:00:00.000Z',
    ...overrides,
  };
}

describe('widget delete confirmation settings default', () => {
  it('enables confirmWidgetDelete by default and treats undefined settings values as enabled', () => {
    assert.equal(DEFAULT_SETTINGS.confirmWidgetDelete, true);

    const legacyUndefined: { confirmWidgetDelete?: boolean } = {};
    assert.equal(legacyUndefined.confirmWidgetDelete !== false, true);

    const optedOut: { confirmWidgetDelete?: boolean } = { confirmWidgetDelete: false };
    assert.equal(optedOut.confirmWidgetDelete !== false, false);
  });
});

describe('computeMovedWidgetPosition', () => {
  it('preserves unobstructed coordinates and rotation while elevating zIndex above destination items', () => {
    const moving = makeWidget({
      freeformPos: {
        xRatio: 0.05,
        yRatio: 0.08,
        wRatio: 0.28,
        hRatio: 0.3,
        zIndex: 4,
        rotation: 6,
      },
    });
    const destWidget = makeWidget({
      id: 'dest-w',
      tabId: 'tab-kitchen',
      freeformPos: {
        xRatio: 0.55,
        yRatio: 0.1,
        wRatio: 0.35,
        hRatio: 0.4,
        zIndex: 22,
        rotation: 0,
      },
    });
    const destNote = makeNote({
      freeformPos: {
        xRatio: 0.6,
        yRatio: 0.6,
        wRatio: 0.25,
        hRatio: 0.25,
        zIndex: 31,
        rotation: 0,
      },
    });

    const result = computeMovedWidgetPosition(moving, [destWidget], [destNote]);
    assert.equal(result.freeformPos.xRatio, 0.05);
    assert.equal(result.freeformPos.yRatio, 0.08);
    assert.equal(result.freeformPos.wRatio, 0.28);
    assert.equal(result.freeformPos.hRatio, 0.3);
    assert.equal(result.freeformPos.rotation, 6);
    assert.equal(result.freeformPos.zIndex, 32);
    assert.equal(result.freeformPos.isFullScreen, false);
    assert.equal(result.configPatch, undefined);
  });

  it('relocates overlapping widgets to open space on the destination canvas', () => {
    const moving = makeWidget({
      freeformPos: {
        xRatio: 0.05,
        yRatio: 0.08,
        wRatio: 0.3,
        hRatio: 0.35,
        zIndex: 5,
        rotation: 0,
      },
    });
    const blocker = makeWidget({
      id: 'blocker',
      tabId: 'tab-kitchen',
      freeformPos: {
        xRatio: 0.04,
        yRatio: 0.05,
        wRatio: 0.35,
        hRatio: 0.4,
        zIndex: 14,
        rotation: 0,
      },
    });

    const result = computeMovedWidgetPosition(moving, [blocker], []);
    const overlapX =
      Math.min(
        result.freeformPos.xRatio + result.freeformPos.wRatio,
        blocker.freeformPos.xRatio + blocker.freeformPos.wRatio
      ) - Math.max(result.freeformPos.xRatio, blocker.freeformPos.xRatio);
    const overlapY =
      Math.min(
        result.freeformPos.yRatio + result.freeformPos.hRatio,
        blocker.freeformPos.yRatio + blocker.freeformPos.hRatio
      ) - Math.max(result.freeformPos.yRatio, blocker.freeformPos.yRatio);

    assert.equal(overlapX > 0 && overlapY > 0, false);
    assert.equal(result.freeformPos.zIndex, 15);
  });

  it('normalizes fullscreen chores/kanban widgets back to tile dimensions when moved', () => {
    const fullChores = makeWidget({
      id: 'chores-full',
      type: 'chores',
      freeformPos: {
        xRatio: 0,
        yRatio: 0,
        wRatio: 1,
        hRatio: 1,
        zIndex: 99,
        rotation: 0,
        isFullScreen: true,
      },
      config: { displayMode: 'hub' },
    });

    const result = computeMovedWidgetPosition(fullChores, [], []);
    assert.equal(result.freeformPos.isFullScreen, false);
    assert.equal(result.freeformPos.wRatio, 0.45);
    assert.equal(result.freeformPos.hRatio, 0.5);
    assert.deepEqual(result.configPatch, { displayMode: 'tile' });
  });
});

describe('useDashboardStore moveWidgetToTab and moveWidgetToNewTab', () => {
  beforeEach(() => {
    useDashboardStore.setState({
      isInitialized: true,
      settings: { ...DEFAULT_SETTINGS },
      activeTabId: 'tab-home',
      tabs: [
        makeTab({ id: 'tab-home', name: 'Home Board', order: 0, isHome: true }),
        makeTab({ id: 'tab-kitchen', name: 'Kitchen', order: 1 }),
      ],
      widgets: [
        makeWidget({
          id: 'w-wifi-1',
          tabId: 'tab-home',
          type: 'wifi_qr',
          title: 'Guest Wi-Fi',
          config: { sitterNotes: 'Gate #1234' },
        }),
      ],
      notes: [],
      movedWidgetToast: null,
      deletedNoteTimestamps: {},
      deletedWidgetTimestamps: {},
      deletedTabTimestamps: {},
    });
  });

  it('moves a widget atomically with extraUpdates, preserves id, keeps activeTabId, and emits toast', async () => {
    const priorUpdatedAt = useDashboardStore.getState().widgets[0].updated_at;

    const moved = await useDashboardStore.getState().moveWidgetToTab('w-wifi-1', 'tab-kitchen', {
      title: 'House-Sitter Corner',
      config: { sitterNotes: 'Gate #1234 • Dog meds at 6 PM' },
    });

    assert.equal(moved, true);
    const state = useDashboardStore.getState();
    assert.equal(state.activeTabId, 'tab-home');

    const updated = state.widgets.find((w) => w.id === 'w-wifi-1');
    assert.ok(updated);
    assert.equal(updated.id, 'w-wifi-1');
    assert.equal(updated.tabId, 'tab-kitchen');
    assert.equal(updated.title, 'House-Sitter Corner');
    assert.equal(updated.config.sitterNotes, 'Gate #1234 • Dog meds at 6 PM');
    assert.ok(Date.parse(updated.updated_at) > Date.parse(priorUpdatedAt));

    assert.ok(state.movedWidgetToast);
    assert.equal(state.movedWidgetToast.widgetId, 'w-wifi-1');
    assert.equal(state.movedWidgetToast.widgetTitle, 'House-Sitter Corner');
    assert.equal(state.movedWidgetToast.targetTabId, 'tab-kitchen');
    assert.equal(state.movedWidgetToast.targetTabName, 'Kitchen');

    state.dismissMovedWidgetToast();
    assert.equal(useDashboardStore.getState().movedWidgetToast, null);
  });

  it('creates a Midnight Dots canvas via moveWidgetToNewTab, keeps activeTabId, and enforces MAX_CANVASES', async () => {
    const newTabId = await useDashboardStore.getState().moveWidgetToNewTab('w-wifi-1', '   ');
    assert.ok(newTabId);

    const state = useDashboardStore.getState();
    assert.equal(state.activeTabId, 'tab-home');
    assert.equal(state.tabs.length, 3);

    const createdTab = state.tabs.find((t) => t.id === newTabId);
    assert.ok(createdTab);
    assert.equal(createdTab.name, 'Canvas 3');
    assert.equal(createdTab.backgroundTheme, 'midnight_dots');
    assert.equal(createdTab.backgroundDimLevel, 45);
    assert.equal(createdTab.icon, 'Pin');

    const movedWidget = state.widgets.find((w) => w.id === 'w-wifi-1');
    assert.equal(movedWidget?.tabId, newTabId);
    assert.equal(state.movedWidgetToast?.targetTabId, newTabId);
    assert.equal(state.movedWidgetToast?.targetTabName, 'Canvas 3');

    // Fill remaining canvas slots up to MAX_CANVASES and confirm limit enforcement
    const existingCount = state.tabs.length;
    const fillerTabs = Array.from({ length: MAX_CANVASES - existingCount }, (_, idx) =>
      makeTab({ id: `tab-extra-${idx}`, name: `Extra ${idx}`, order: existingCount + idx })
    );
    useDashboardStore.setState({ tabs: [...state.tabs, ...fillerTabs] });
    assert.equal(useDashboardStore.getState().tabs.length, MAX_CANVASES);

    const blockedTabId = await useDashboardStore
      .getState()
      .moveWidgetToNewTab('w-wifi-1', 'Overflow Canvas');
    assert.equal(blockedTabId, null);
    assert.equal(useDashboardStore.getState().tabs.length, MAX_CANVASES);
  });
});
