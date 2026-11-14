import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  nextMonotonicIso,
  buildNoteFreeformPos,
  buildNoteCloudFreeformPos,
  normalizeLoadedNote,
  hydrateNoteFromCloudRow,
  keepLocalNoteFields,
  shouldAcceptCloudRow,
  shouldPushLocalRowToCloud,
  shouldApplyRealtimeRow,
} from '../src/services/syncMerge.ts';
import { useDashboardStore } from '../src/store/dashboardStore.ts';
import type { StickyNoteItem } from '../src/types/dashboard.ts';

function makeNote(overrides: Partial<StickyNoteItem> = {}): StickyNoteItem {
  return {
    id: 'note-1',
    tabId: 'tab-1',
    title: 'Note',
    content: 'Alyssa tablet reminder',
    isChecklist: false,
    checklistItems: [],
    bgColor: '#fbcfe8',
    fontSize: 'base',
    updated_at: '2026-11-10T10:00:00.000Z',
    isPinnedToCanvas: true,
    ...overrides,
  };
}

describe('syncMerge note hydration and freeform_pos round-trip', () => {
  it('encodes and hydrates isPinnedToCanvas, isShoppingList, and textColor via freeform_pos', () => {
    const note = makeNote({
      isPinnedToCanvas: false,
      isShoppingList: true,
      textColor: '#3b1d2e',
      freeformPos: { xRatio: 0.25, yRatio: 0.4, wRatio: 0.2, hRatio: 0.25, zIndex: 4, rotation: -2 },
    });

    const packedPos = buildNoteFreeformPos(note);
    assert.equal(packedPos.isPinnedToCanvas, false);
    assert.equal(packedPos.isShoppingList, true);
    assert.equal(packedPos.textColor, '#3b1d2e');
    assert.equal(packedPos.xRatio, 0.25);

    const cloudPos = buildNoteCloudFreeformPos(note);
    assert.deepEqual(cloudPos, packedPos);

    const hydrated = hydrateNoteFromCloudRow({
      id: note.id,
      tab_id: note.tabId,
      title: note.title,
      content: note.content,
      bg_color: note.bgColor,
      checklist_items: null,
      freeform_pos: cloudPos,
      expires_at: null,
      archived_at: null,
      updated_at: note.updated_at,
      deleted_at: null,
    });

    assert.equal(hydrated.isPinnedToCanvas, false);
    assert.equal(hydrated.isShoppingList, true);
    assert.equal(hydrated.textColor, '#3b1d2e');
    assert.equal(hydrated.freeformPos?.xRatio, 0.25);
  });

  it('strips cloud freeform_pos payload for deleted notes and preserves undefined pin on unannotated legacy notes', () => {
    const deletedNote = makeNote({
      deleted_at: '2026-11-14T18:00:00.000Z',
      freeformPos: { xRatio: 0.1, yRatio: 0.1, wRatio: 0.2, hRatio: 0.2, zIndex: 1 },
    });
    assert.deepEqual(buildNoteCloudFreeformPos(deletedNote), {});

    const legacyNote = normalizeLoadedNote({
      id: 'note-legacy',
      tabId: 'tab-1',
      title: 'Legacy',
      content: 'Old note',
      isChecklist: false,
      checklistItems: [],
      bgColor: '#fef08a',
      fontSize: 'base',
      updated_at: '2026-11-01T00:00:00.000Z',
    });
    // UI treats undefined !== false as pinned while allowing keepLocalNoteFields to detect omitted cloud state
    assert.equal(legacyNote.isPinnedToCanvas, undefined);
  });

  it('normalizes legacy notes carrying embedded freeformPos metadata', () => {
    const normalized = normalizeLoadedNote(
      makeNote({
        isPinnedToCanvas: undefined,
        isShoppingList: undefined,
        textColor: undefined,
        freeformPos: {
          xRatio: 0.3,
          yRatio: 0.3,
          wRatio: 0.2,
          hRatio: 0.2,
          zIndex: 2,
          isPinnedToCanvas: false,
          isShoppingList: true,
          textColor: '#112233',
        },
      }),
    );
    assert.equal(normalized.isPinnedToCanvas, false);
    assert.equal(normalized.isShoppingList, true);
    assert.equal(normalized.textColor, '#112233');
  });

  it('prefers explicit cloud isPinnedToCanvas and falls back to local when legacy cloud omits it', () => {
    const localClosed = makeNote({ isPinnedToCanvas: false });
    const incomingWithFalse = hydrateNoteFromCloudRow({
      id: 'note-1',
      tab_id: 'tab-1',
      title: 'Note',
      content: 'Test',
      bg_color: '#fbcfe8',
      freeform_pos: { xRatio: 0.2, yRatio: 0.2, wRatio: 0.2, hRatio: 0.2, zIndex: 1, isPinnedToCanvas: false },
      updated_at: '2026-11-14T12:00:00.000Z',
    });
    assert.equal(keepLocalNoteFields(incomingWithFalse, makeNote({ isPinnedToCanvas: true })).isPinnedToCanvas, false);

    const incomingWithTrue = hydrateNoteFromCloudRow({
      id: 'note-1',
      tab_id: 'tab-1',
      title: 'Note',
      content: 'Test',
      bg_color: '#fbcfe8',
      freeform_pos: { xRatio: 0.2, yRatio: 0.2, wRatio: 0.2, hRatio: 0.2, zIndex: 1, isPinnedToCanvas: true },
      updated_at: '2026-11-14T12:00:00.000Z',
    });
    assert.equal(keepLocalNoteFields(incomingWithTrue, localClosed).isPinnedToCanvas, true);

    const legacyCloud = hydrateNoteFromCloudRow({
      id: 'note-1',
      tab_id: 'tab-1',
      title: 'Note',
      content: 'Test',
      bg_color: '#fbcfe8',
      freeform_pos: { xRatio: 0.2, yRatio: 0.2, wRatio: 0.2, hRatio: 0.2, zIndex: 1 },
      updated_at: '2026-11-14T12:00:00.000Z',
    });
    assert.equal(keepLocalNoteFields(legacyCloud, localClosed).isPinnedToCanvas, false);
  });
});

describe('syncMerge monotonic timestamps and deletion precedence', () => {
  it('advances strictly past future-skewed timestamps via nextMonotonicIso', () => {
    const skewedFutureMs = Date.now() + 60 * 60 * 1000;
    const skewedIso = new Date(skewedFutureMs).toISOString();
    const bumpedIso = nextMonotonicIso(skewedIso, Date.now());
    assert.ok(Date.parse(bumpedIso) > Date.parse(skewedIso));
  });

  it('blocks stale or tied active cloud rows from resurrecting local deletions/archives', () => {
    const t = Date.parse('2026-11-14T18:00:00.000Z');
    // Same timestamp: local deleted vs cloud active -> reject cloud
    assert.equal(
      shouldAcceptCloudRow({
        overwriteLocal: false,
        hasLocalRow: true,
        localTime: t,
        cloudTime: t,
        localDeletedOrArchived: true,
        cloudDeletedOrArchived: false,
      }),
      false,
    );
    // Same timestamp: local active vs cloud deleted -> accept cloud deletion
    assert.equal(
      shouldAcceptCloudRow({
        overwriteLocal: false,
        hasLocalRow: true,
        localTime: t,
        cloudTime: t,
        localDeletedOrArchived: false,
        cloudDeletedOrArchived: true,
      }),
      true,
    );
    // Cloud strictly newer -> accept
    assert.equal(
      shouldAcceptCloudRow({
        overwriteLocal: false,
        hasLocalRow: true,
        localTime: t,
        cloudTime: t + 1000,
        localDeletedOrArchived: true,
        cloudDeletedOrArchived: false,
      }),
      true,
    );
    // Manual authoritative Restore from Cloud -> always accept
    assert.equal(
      shouldAcceptCloudRow({
        overwriteLocal: true,
        hasLocalRow: true,
        localTime: t + 5000,
        cloudTime: t,
        localDeletedOrArchived: true,
        cloudDeletedOrArchived: false,
      }),
      true,
    );
  });

  it('prevents stale Realtime broadcasts from applying over newer or tied local tombstones', () => {
    const t = Date.parse('2026-11-14T18:00:00.000Z');
    assert.equal(
      shouldApplyRealtimeRow({
        hasLocalRow: true,
        localTime: t,
        remoteTime: t - 500,
        localDeletedOrArchived: true,
        remoteDeletedOrArchived: false,
      }),
      false,
    );
    assert.equal(
      shouldApplyRealtimeRow({
        hasLocalRow: true,
        localTime: t,
        remoteTime: t,
        localDeletedOrArchived: true,
        remoteDeletedOrArchived: false,
      }),
      false,
    );
    assert.equal(
      shouldApplyRealtimeRow({
        hasLocalRow: true,
        localTime: t,
        remoteTime: t,
        localDeletedOrArchived: false,
        remoteDeletedOrArchived: true,
      }),
      true,
    );
  });

  it('prevents lagging-device force pushes from overwriting newer or tied cloud deletions', () => {
    const t = Date.parse('2026-11-14T18:00:00.000Z');
    assert.equal(
      shouldPushLocalRowToCloud({
        force: true,
        localTime: t - 1000,
        remoteTime: t,
        localDeletedOrArchived: false,
        remoteDeletedOrArchived: true,
      }),
      false,
    );
    assert.equal(
      shouldPushLocalRowToCloud({
        force: true,
        localTime: t,
        remoteTime: t,
        localDeletedOrArchived: false,
        remoteDeletedOrArchived: true,
      }),
      false,
    );
    assert.equal(
      shouldPushLocalRowToCloud({
        force: true,
        localTime: t,
        remoteTime: t,
        localDeletedOrArchived: true,
        remoteDeletedOrArchived: false,
      }),
      true,
    );
  });
});

describe('useDashboardStore note deletion and Realtime resurrection protection', () => {
  beforeEach(() => {
    useDashboardStore.setState({
      isInitialized: true,
      tabs: [
        {
          id: 'tab-1',
          name: 'Home',
          icon: 'LayoutGrid',
          order: 0,
          autoRotateDurationSec: 0,
          isHome: true,
          enabled: true,
        },
      ],
      widgets: [],
      notes: [],
      deletedNoteTimestamps: {},
      deletedWidgetTimestamps: {},
      deletedTabTimestamps: {},
    });
  });

  it('advances monotonic updated_at on deleteNote even against future-skewed note timestamps', async () => {
    const skewedUpdatedAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    const note = makeNote({
      id: 'note-skewed',
      updated_at: skewedUpdatedAt,
    });
    useDashboardStore.setState({ notes: [note] });

    await useDashboardStore.getState().deleteNote('note-skewed');
    const updated = useDashboardStore.getState().notes.find((n) => n.id === 'note-skewed');
    assert.ok(updated);
    assert.ok(updated.archivedAt);
    assert.ok(Date.parse(updated.updated_at) > Date.parse(skewedUpdatedAt));

    // Stale remote active update with the older skewed timestamp must be ignored
    useDashboardStore.getState().syncRemoteNoteChange(
      makeNote({
        id: 'note-skewed',
        updated_at: skewedUpdatedAt,
        archivedAt: null,
        isPinnedToCanvas: true,
      }),
      'UPDATE',
    );
    const afterStale = useDashboardStore.getState().notes.find((n) => n.id === 'note-skewed');
    assert.ok(afterStale?.archivedAt);
  });

  it('records a tombstone on permanentlyDeleteNote and ignores stale Realtime INSERT/UPDATE resurrections', async () => {
    const createdNote = makeNote({
      id: 'note-delete-me',
      updated_at: '2026-11-14T18:00:00.000Z',
    });
    useDashboardStore.setState({ notes: [createdNote] });

    await useDashboardStore.getState().permanentlyDeleteNote('note-delete-me');

    const stateAfterDelete = useDashboardStore.getState();
    assert.equal(stateAfterDelete.notes.length, 0);
    const tombstoneIso = stateAfterDelete.deletedNoteTimestamps['note-delete-me'];
    assert.ok(tombstoneIso);
    assert.ok(Date.parse(tombstoneIso) > Date.parse(createdNote.updated_at));

    // Stale Realtime event from another device or delayed echo arrives
    useDashboardStore.getState().syncRemoteNoteChange(
      makeNote({
        id: 'note-delete-me',
        updated_at: '2026-11-14T18:00:00.000Z',
      }),
      'INSERT',
    );
    assert.equal(useDashboardStore.getState().notes.length, 0);

    // Strictly newer remote note event with the same ID (e.g. explicit restore) clears tombstone
    const newerIso = new Date(Date.parse(tombstoneIso) + 5000).toISOString();
    useDashboardStore.getState().syncRemoteNoteChange(
      makeNote({
        id: 'note-delete-me',
        updated_at: newerIso,
      }),
      'UPDATE',
    );
    assert.equal(useDashboardStore.getState().notes.length, 1);
    assert.equal(useDashboardStore.getState().deletedNoteTimestamps['note-delete-me'], undefined);
  });
});
