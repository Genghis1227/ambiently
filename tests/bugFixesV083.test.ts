import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractMetadataFromHtml } from '../functions/api/metadata';
import { parseSrcsetUrls } from '../functions/api/reader';
import { DEFAULT_CHORE_SNAPSHOT, DEFAULT_MEAL_SNAPSHOT } from '../src/services/db';
import { useProfileStore } from '../src/stores/useProfileStore';
import { useChoreStore } from '../src/stores/useChoreStore';
import { mealSnapshotsContentEqual, useMealStore } from '../src/stores/useMealStore';
import { useKanbanStore } from '../src/stores/useKanbanStore';
import { useRoutinesStore } from '../src/stores/useRoutinesStore';
import { mergeChoreSnapshotsAuthoritative } from '../src/utils/choreEngine';
import { classifyRasterImageFile } from '../src/utils/imageUpload';
import { computeNonOverlappingLayout } from '../src/utils/autoLayout';
import { isStickerCapableWidget } from '../src/utils/widgetStickerMode';
import type { ChoreEngineSnapshot } from '../src/types/chores';
import type { DashboardWidget, StickyNoteItem } from '../src/types/dashboard';

describe('Metadata apostrophe handling & Reader srcset parsing (v0.8.3)', () => {
  it('preserves apostrophes inside double-quoted og:title and og:site_name meta tags', () => {
    const html = `<!doctype html><html><head>
      <meta property="og:title" content="Grandma's Best Lasagna" />
      <meta property="og:site_name" content="Tony's Tipbits &amp; Notes" />
    </head><body></body></html>`;

    const result = extractMetadataFromHtml(html, 'https://example.org/lasagna');
    assert.equal(result.title, "Grandma's Best Lasagna");
    assert.equal(result.siteName, "Tony's Tipbits & Notes");
  });

  it('keeps comma-separated CDN resize parameters intact when parsing srcset', () => {
    const srcset =
      'https://cdn.example.com/cdn-cgi/image/w=400,q=80/pic.jpg 400w, https://cdn.example.com/cdn-cgi/image/w=800,q=80/pic.jpg 800w';
    assert.deepEqual(parseSrcsetUrls(srcset), [
      'https://cdn.example.com/cdn-cgi/image/w=400,q=80/pic.jpg',
      'https://cdn.example.com/cdn-cgi/image/w=800,q=80/pic.jpg',
    ]);

    const simpleNoDescriptors = 'https://a.example.com/1.jpg, https://b.example.com/2.jpg 2x';
    assert.deepEqual(parseSrcsetUrls(simpleNoDescriptors), [
      'https://a.example.com/1.jpg',
      'https://b.example.com/2.jpg',
    ]);
  });
});

describe('Sync, Chore Reversion & Board-Switch Isolation (v0.8.3)', () => {
  it('preserves canRevert=false on reverted ledger entries across parent-authoritative merges', () => {
    const base: ChoreEngineSnapshot = {
      ...structuredClone(DEFAULT_CHORE_SNAPSHOT),
      profiles: [{ id: 'kid_1', name: 'Alex', role: 'kid', color: '#6b8f71', balance: 10, lifetimePoints: 10 }],
      templates: [
        {
          id: 'tpl_1',
          title: 'Dishes',
          points: 10,
          assignedTo: 'kid_1',
          cadence: 'daily',
          requiresApproval: false,
          rolloverUntilDone: false,
          overduePolicy: 'zero',
        },
      ],
      instances: [
        {
          instanceId: 'tpl_1_2026-11-20',
          choreId: 'tpl_1',
          dateScheduled: '2026-11-20',
          status: 'pending',
          isOverdue: false,
        },
      ],
      ledger: [
        {
          id: 'led_1',
          profileId: 'kid_1',
          refId: 'tpl_1_2026-11-20',
          type: 'chore_complete',
          pointsDelta: 10,
          timestamp: '2026-11-20T09:00:00.000Z',
          approvedBy: 'self',
          canRevert: true,
        },
      ],
      updated_at: '2026-11-20T09:00:00.000Z',
    };

    const localReverted: ChoreEngineSnapshot = {
      ...structuredClone(base),
      ledger: [
        { ...base.ledger[0], canRevert: false },
        {
          id: 'led_rev_1',
          profileId: 'kid_1',
          refId: 'led_1',
          type: 'reversion',
          pointsDelta: -10,
          timestamp: '2026-11-20T09:05:00.000Z',
          approvedBy: 'self',
          canRevert: false,
        },
      ],
      updated_at: '2026-11-20T09:05:00.000Z',
    };

    const remoteParentUpdated: ChoreEngineSnapshot = {
      ...structuredClone(base),
      householdSettings: {
        ...base.householdSettings,
        lastParentActionAt: '2026-11-20T09:10:00.000Z',
      },
      updated_at: '2026-11-20T09:10:00.000Z',
    };

    const merged = mergeChoreSnapshotsAuthoritative(localReverted, remoteParentUpdated);
    const completedEntry = merged.ledger.find((e) => e.id === 'led_1');
    assert.ok(completedEntry);
    assert.equal(completedEntry.canRevert, false);
    assert.ok(merged.ledger.some((e) => e.id === 'led_rev_1'));
  });

  it('does not bump chore updated_at on remote profile sync and resets all stores on board switch', async () => {
    const fixedChoreTimestamp = '2026-11-20T08:00:00.000Z';
    const initialSnap: ChoreEngineSnapshot = {
      ...structuredClone(DEFAULT_CHORE_SNAPSHOT),
      updated_at: fixedChoreTimestamp,
    };

    useChoreStore.setState({ isInitialized: true, snapshot: initialSnap });
    useProfileStore.setState({
      isInitialized: true,
      profiles: [
        {
          id: 'p_parent_1',
          name: 'Parent',
          role: 'parent',
          color: '#3b82f6',
          createdAt: '2026-11-19T00:00:00.000Z',
          updatedAt: '2026-11-19T00:00:00.000Z',
        },
      ],
    });

    await useProfileStore.getState().applyRemoteProfiles([
      {
        id: 'p_parent_1',
        name: 'Parent Remote',
        role: 'parent',
        color: '#3b82f6',
        createdAt: '2026-11-19T00:00:00.000Z',
        updatedAt: '2026-11-20T10:00:00.000Z',
      },
    ]);
    assert.equal(useChoreStore.getState().snapshot.updated_at, fixedChoreTimestamp);

    // Local profile edits must still bump chore updated_at for sync propagation
    await useProfileStore.getState().upsertHouseholdProfile({
      id: 'p_parent_1',
      name: 'Parent Local Edit',
      role: 'parent',
      color: '#3b82f6',
    });
    assert.notEqual(useChoreStore.getState().snapshot.updated_at, fixedChoreTimestamp);

    // resetForBoardSwitch clears isInitialized across all five household stores
    useMealStore.setState({ isInitialized: true });
    useKanbanStore.setState({ isInitialized: true });
    useRoutinesStore.setState({ isInitialized: true });

    useProfileStore.getState().resetForBoardSwitch();
    useChoreStore.getState().resetForBoardSwitch();
    useMealStore.getState().resetForBoardSwitch();
    useKanbanStore.getState().resetForBoardSwitch();
    useRoutinesStore.getState().resetForBoardSwitch();

    assert.equal(useProfileStore.getState().isInitialized, false);
    assert.equal(useChoreStore.getState().isInitialized, false);
    assert.equal(useMealStore.getState().isInitialized, false);
    assert.equal(useKanbanStore.getState().isInitialized, false);
    assert.equal(useRoutinesStore.getState().isInitialized, false);
  });

  it('bumps meal snapshot updated_at monotonically only when merged offline edits differ from remote', async () => {
    const localWithOfflineRecipe = {
      ...structuredClone(DEFAULT_MEAL_SNAPSHOT),
      recipes: [
        {
          id: 'rec-local',
          title: 'Offline Soup',
          ingredients: [],
          instructions: [],
          tags: [],
          createdAt: '2026-11-20T10:00:00.000Z',
          updatedAt: '2026-11-20T10:00:00.000Z',
        },
      ],
      updated_at: '2026-11-20T10:00:00.000Z',
    };

    const remoteNewer = {
      ...structuredClone(DEFAULT_MEAL_SNAPSHOT),
      shoppingItems: [
        {
          id: 'shop-remote',
          name: 'Milk',
          checked: false,
          category: 'Dairy & Eggs' as const,
          updatedAt: '2026-11-20T10:05:00.000Z',
        },
      ],
      updated_at: '2026-11-20T10:05:00.000Z',
    };

    useMealStore.setState({
      isInitialized: true,
      snapshot: localWithOfflineRecipe,
      recipes: localWithOfflineRecipe.recipes,
      scheduledMeals: localWithOfflineRecipe.scheduledMeals,
      shoppingItems: localWithOfflineRecipe.shoppingItems,
      staples: localWithOfflineRecipe.staples,
      aisleOrder: localWithOfflineRecipe.aisleOrder,
      weekStartsOn: localWithOfflineRecipe.weekStartsOn,
    });

    await useMealStore.getState().applyRemoteMealSnapshot(remoteNewer);
    const afterMerge = useMealStore.getState().snapshot;
    assert.ok(afterMerge.recipes.some((r) => r.id === 'rec-local'));
    assert.ok(afterMerge.shoppingItems.some((s) => s.id === 'shop-remote'));
    assert.ok(
      Date.parse(afterMerge.updated_at) > Date.parse(remoteNewer.updated_at),
      'merged offline meal edit must advance updated_at beyond remote so next push syncs it'
    );

    // When local and remote have equal content, updated_at stays unchanged
    const sameRemote = {
      ...structuredClone(remoteNewer),
      updated_at: '2026-11-20T11:00:00.000Z',
    };
    useMealStore.setState({
      isInitialized: true,
      snapshot: structuredClone(remoteNewer),
      recipes: remoteNewer.recipes,
      scheduledMeals: remoteNewer.scheduledMeals,
      shoppingItems: remoteNewer.shoppingItems,
      staples: remoteNewer.staples,
      aisleOrder: remoteNewer.aisleOrder,
      weekStartsOn: remoteNewer.weekStartsOn,
    });
    assert.equal(mealSnapshotsContentEqual(remoteNewer, sameRemote), true);
    await useMealStore.getState().applyRemoteMealSnapshot(sameRemote);
    assert.equal(useMealStore.getState().snapshot.updated_at, sameRemote.updated_at);
  });
});

describe('Raster Upload Classification, Layout Filtering & Sticker Support (v0.8.3)', () => {
  it('allows empty/generic MIME raster uploads and HEIC while blocking SVG and HTML', () => {
    assert.deepEqual(classifyRasterImageFile({ type: '', name: 'wall.webp' }), {
      allowed: true,
      isHeic: false,
      inferredMime: 'image/webp',
    });
    assert.deepEqual(classifyRasterImageFile({ type: 'application/octet-stream', name: 'snap.png' }), {
      allowed: true,
      isHeic: false,
      inferredMime: 'image/png',
    });
    assert.deepEqual(classifyRasterImageFile({ type: 'image/jpg', name: 'pic.jpg' }), {
      allowed: true,
      isHeic: false,
      inferredMime: 'image/jpeg',
    });
    assert.deepEqual(classifyRasterImageFile({ type: '', name: 'IMG_001.HEIC' }), {
      allowed: true,
      isHeic: true,
      inferredMime: 'image/heic',
    });
    assert.equal(classifyRasterImageFile({ type: 'image/svg+xml', name: 'vector.svg' }).allowed, false);
    assert.equal(classifyRasterImageFile({ type: '', name: 'vector.svg' }).allowed, false);
    assert.equal(classifyRasterImageFile({ type: '', name: 'index.html' }).allowed, false);
  });

  it('excludes unpinned notes (isPinnedToCanvas=false) from auto-organize layouts', () => {
    const widgets: DashboardWidget[] = [
      {
        id: 'w1',
        tabId: 'tab-home',
        type: 'clock',
        title: 'Clock',
        gridPos: { x: 0, y: 0, w: 4, h: 4 },
        config: {},
        updated_at: '2026-11-20T00:00:00.000Z',
      },
    ];
    const notes: StickyNoteItem[] = [
      {
        id: 'n-pinned',
        tabId: 'tab-home',
        content: 'Pinned',
        bgColor: '#fef08a',
        isPinnedToCanvas: true,
        updated_at: '2026-11-20T00:00:00.000Z',
      },
      {
        id: 'n-unpinned',
        tabId: 'tab-home',
        content: 'Unpinned in drawer',
        bgColor: '#fef08a',
        isPinnedToCanvas: false,
        updated_at: '2026-11-20T00:00:00.000Z',
      },
    ];

    const layout = computeNonOverlappingLayout(widgets, notes, 'bento');
    assert.ok(layout.notePositions['n-pinned']);
    assert.equal(layout.notePositions['n-unpinned'], undefined);
  });

  it('treats chalkboard, soundscape, and homelab as sticker-capable widgets', () => {
    assert.equal(isStickerCapableWidget('chalkboard'), true);
    assert.equal(isStickerCapableWidget('soundscape'), true);
    assert.equal(isStickerCapableWidget('homelab'), true);
  });
});
