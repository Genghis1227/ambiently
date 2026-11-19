import { create } from 'zustand';
import { db, DEFAULT_ROUTINES_SNAPSHOT } from '../services/db';
import { nextMonotonicIso } from '../services/syncMerge';
import type { DashboardWidget } from '../types/dashboard';
import {
  MAX_ROUTINES_PER_WIDGET,
  type RoutineItem,
  type RoutinesSnapshot,
} from '../types/phase2Widgets';
import {
  DEFAULT_ROUTINE_ITEMS,
  mergeRoutineCheckIns,
  recordRemovedCheckIns,
  resolveRoutineItems,
  toggleRoutineCheckIn,
} from '../utils/routinesEngine';

const MAX_DELETED_ROUTINE_TOMBSTONES = 100;
const EPOCH_ISO = '1970-01-01T00:00:00.000Z';

let routinesPersistDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let routinesPersistListener: (() => void) | null = null;

export function registerRoutinesPersistListener(listener: () => void): void {
  routinesPersistListener = listener;
}

async function persistRoutinesSnapshot(snapshot: RoutinesSnapshot): Promise<void> {
  if (typeof indexedDB !== 'undefined') {
    try {
      await db.routines.put(snapshot);
    } catch (err) {
      console.warn('Failed to persist routines snapshot to IndexedDB:', err);
    }
  }

  if (routinesPersistDebounceTimer) {
    clearTimeout(routinesPersistDebounceTimer);
  }
  routinesPersistDebounceTimer = setTimeout(() => {
    try {
      routinesPersistListener?.();
    } catch {
      // Ignore if offline or unauthenticated
    }
  }, 150);
}

/**
 * Returns true only when `items` matches the untouched starter routines with zero completion stamps.
 */
export function isDefaultStarterRoutines(items: RoutineItem[] | undefined): boolean {
  const resolved = resolveRoutineItems(items);
  if (resolved.length !== DEFAULT_ROUTINE_ITEMS.length) return false;
  return resolved.every((item, idx) => {
    const def = DEFAULT_ROUTINE_ITEMS[idx];
    return (
      Boolean(def) &&
      item.id === def.id &&
      item.label === def.label &&
      item.cadence === def.cadence &&
      (!item.completions || item.completions.length === 0)
    );
  });
}

/**
 * Chooses the best legacy `routines` widget to seed `household_routines` on first run or legacy
 * JSON restore, rescuing customized routines from soft-deleted tiles over starter defaults.
 */
export function pickMigratableRoutineWidget(
  widgets: DashboardWidget[]
): DashboardWidget | null {
  const candidates = (widgets || [])
    .filter(
      (w) =>
        w &&
        w.type === 'routines' &&
        Array.isArray(w.config?.items) &&
        !w.permanentlyDeleted &&
        w.config?.__purged !== true
    )
    .sort((a, b) => (Date.parse(b.updated_at || '') || 0) - (Date.parse(a.updated_at || '') || 0));

  if (candidates.length === 0) return null;

  const activeCustom = candidates.find(
    (w) => !w.deleted_at && !isDefaultStarterRoutines(resolveRoutineItems(w.config?.items))
  );
  if (activeCustom) return activeCustom;

  const deletedCustom = candidates.find(
    (w) => Boolean(w.deleted_at) && !isDefaultStarterRoutines(resolveRoutineItems(w.config?.items))
  );
  if (deletedCustom) return deletedCustom;

  const activeAny = candidates.find((w) => !w.deleted_at);
  if (activeAny) return activeAny;

  return candidates[0] || null;
}

function sanitizeRoutinesSnapshot(snapshot: RoutinesSnapshot): RoutinesSnapshot {
  return {
    id: 'household_routines',
    items: resolveRoutineItems(snapshot.items),
    deletedRoutineIds: Array.isArray(snapshot.deletedRoutineIds)
      ? Array.from(new Set(snapshot.deletedRoutineIds)).slice(-MAX_DELETED_ROUTINE_TOMBSTONES)
      : [],
    updated_at: snapshot.updated_at || EPOCH_ISO,
  };
}

/**
 * The same routine from two devices: its settings (name, schedule) come from whichever copy was
 * changed last, and its check-ins are combined so neither device's check-ins are lost.
 */
function mergeRoutineItem(winnerItem: RoutineItem, otherItem: RoutineItem | undefined): RoutineItem {
  if (!otherItem) return winnerItem;
  const winnerTime = Date.parse(winnerItem.updatedAt || '') || 0;
  const otherTime = Date.parse(otherItem.updatedAt || '') || 0;
  const newer = otherTime > winnerTime ? otherItem : winnerItem;
  const { completions, uncheckedSlots } = mergeRoutineCheckIns(winnerItem, otherItem);
  const merged: RoutineItem = { ...newer, completions };
  if (uncheckedSlots.length > 0) {
    merged.uncheckedSlots = uncheckedSlots;
  } else {
    delete merged.uncheckedSlots;
  }
  return merged;
}

function itemsOf(snapshot: RoutinesSnapshot): RoutineItem[] {
  // A snapshot without an items list has no routines; resolveRoutineItems(undefined) would
  // return the starter routines instead
  return Array.isArray(snapshot.items) ? resolveRoutineItems(snapshot.items) : [];
}

/**
 * Merges two household routines snapshots using per-item timestamps and deletion tombstones.
 * A routine only one side has is kept unless the other side deleted it, and check-ins from both
 * sides are combined.
 */
export function mergeRoutinesSnapshots(
  local: RoutinesSnapshot,
  incoming: RoutinesSnapshot
): RoutinesSnapshot {
  const localTime = Date.parse(local.updated_at || '') || 0;
  const remoteTime = Date.parse(incoming.updated_at || '') || 0;

  if (localTime <= 0 && remoteTime > 0) {
    return sanitizeRoutinesSnapshot(incoming);
  }
  if (remoteTime <= 0 && localTime > 0) {
    return sanitizeRoutinesSnapshot(local);
  }

  const incomingWins = remoteTime >= localTime;
  const winner = incomingWins ? incoming : local;
  const loser = incomingWins ? local : incoming;
  const loserTime = Date.parse(loser.updated_at || '') || 0;

  const winnerDeletedSet = new Set(winner.deletedRoutineIds || []);
  const loserDeletedSet = new Set(loser.deletedRoutineIds || []);

  const loserItems = itemsOf(loser);
  const loserById = new Map<string, RoutineItem>(loserItems.map((item) => [item.id, item]));

  const mergedItems: RoutineItem[] = [];
  const seenIds = new Set<string>();

  for (const item of itemsOf(winner)) {
    const itemTime = Date.parse(item.updatedAt || winner.updated_at || '') || 0;
    if (loserDeletedSet.has(item.id) && itemTime < loserTime) {
      continue;
    }
    mergedItems.push(mergeRoutineItem(item, loserById.get(item.id)));
    seenIds.add(item.id);
  }

  // A routine only the other device has was added there (deletions leave a tombstone), so keep it
  for (const item of loserItems) {
    if (seenIds.has(item.id) || winnerDeletedSet.has(item.id)) continue;
    mergedItems.push(item);
    seenIds.add(item.id);
  }

  const resolvedItems = resolveRoutineItems(mergedItems);
  const presentIds = new Set(resolvedItems.map((it) => it.id));
  const mergedDeletedIds = Array.from(
    new Set([...(winner.deletedRoutineIds || []), ...(loser.deletedRoutineIds || [])])
  )
    .filter((id) => !presentIds.has(id))
    .slice(-MAX_DELETED_ROUTINE_TOMBSTONES);

  return {
    id: 'household_routines',
    items: resolvedItems,
    deletedRoutineIds: mergedDeletedIds,
    updated_at: incomingWins ? incoming.updated_at : local.updated_at,
  };
}

/** True when `a` and `b` hold the same routines, check-ins and deletions. */
export function routinesContentEqual(a: RoutinesSnapshot, b: RoutinesSnapshot): boolean {
  const content = (snap: RoutinesSnapshot) =>
    JSON.stringify({
      items: itemsOf(snap),
      deleted: [...new Set(snap.deletedRoutineIds || [])].sort(),
    });
  return content(a) === content(b);
}

interface RoutinesStoreState {
  isInitialized: boolean;
  snapshot: RoutinesSnapshot;
  items: RoutineItem[];

  initRoutinesStore: () => Promise<void>;
  setRoutineItems: (nextItems: RoutineItem[]) => Promise<void>;
  toggleCheckIn: (
    itemId: string,
    slotKey: string,
    profileId: string | null,
    nowIso?: string
  ) => Promise<void>;
  addRoutineItem: (item: RoutineItem) => Promise<void>;
  removeRoutineItem: (itemId: string) => Promise<void>;
  clearAllCompletions: () => Promise<void>;
  applyRemoteRoutinesSnapshot: (incoming: RoutinesSnapshot) => Promise<void>;
}

export const useRoutinesStore = create<RoutinesStoreState>((set, get) => {
  const commitRoutinesState = (
    nextSnapshot: RoutinesSnapshot,
    extra?: Partial<RoutinesStoreState>
  ) => {
    const clean = sanitizeRoutinesSnapshot(nextSnapshot);
    set({
      ...extra,
      snapshot: clean,
      items: clean.items,
    });
  };

  return {
    isInitialized: false,
    snapshot: DEFAULT_ROUTINES_SNAPSHOT,
    items: DEFAULT_ROUTINES_SNAPSHOT.items,

    initRoutinesStore: async () => {
      try {
        if (typeof indexedDB === 'undefined') {
          commitRoutinesState(DEFAULT_ROUTINES_SNAPSHOT, { isInitialized: true });
          return;
        }
        const stored = await db.routines.get('household_routines');
        if (stored) {
          commitRoutinesState(stored, { isInitialized: true });
          return;
        }

        const allWidgets = await db.widgets.toArray().catch(() => []);
        const candidate = pickMigratableRoutineWidget(allWidgets);
        if (candidate) {
          const migrated: RoutinesSnapshot = {
            id: 'household_routines',
            items: resolveRoutineItems(candidate.config?.items),
            deletedRoutineIds: [],
            updated_at:
              candidate.updated_at && candidate.updated_at !== EPOCH_ISO
                ? candidate.updated_at
                : new Date().toISOString(),
          };
          await db.routines.put(migrated);
          commitRoutinesState(migrated, { isInitialized: true });
          return;
        }

        await db.routines.put(DEFAULT_ROUTINES_SNAPSHOT);
        commitRoutinesState(DEFAULT_ROUTINES_SNAPSHOT, { isInitialized: true });
      } catch (err) {
        console.warn('Failed to initialize routines store from IndexedDB:', err);
        commitRoutinesState(DEFAULT_ROUTINES_SNAPSHOT, { isInitialized: true });
      }
    },

    setRoutineItems: async (nextItems) => {
      const current = get().snapshot;
      const nowIso = nextMonotonicIso(current.updated_at);
      const resolvedNext = resolveRoutineItems(nextItems);
      const prevById = new Map(current.items.map((it) => [it.id, it]));
      const nextIds = new Set(resolvedNext.map((it) => it.id));

      const removedIds = current.items
        .filter((it) => !nextIds.has(it.id))
        .map((it) => it.id);
      const deletedRoutineIds = Array.from(
        new Set([...(current.deletedRoutineIds || []), ...removedIds])
      )
        .filter((id) => !nextIds.has(id))
        .slice(-MAX_DELETED_ROUTINE_TOMBSTONES);

      const stampedItems = resolvedNext.map((item) => {
        const prev = prevById.get(item.id);
        const withUnchecks = recordRemovedCheckIns(prev, item, nowIso);
        const changed = !prev || JSON.stringify(prev) !== JSON.stringify(withUnchecks);
        return changed ? { ...withUnchecks, updatedAt: nowIso } : withUnchecks;
      });

      const nextSnapshot: RoutinesSnapshot = {
        id: 'household_routines',
        items: stampedItems,
        deletedRoutineIds,
        updated_at: nowIso,
      };
      commitRoutinesState(nextSnapshot, { isInitialized: true });
      await persistRoutinesSnapshot(nextSnapshot);
    },

    toggleCheckIn: async (itemId, slotKey, profileId, nowIsoOverride) => {
      const current = get().snapshot;
      const effectiveIso = nowIsoOverride || nextMonotonicIso(current.updated_at);
      const nextSnapshotUpdated = nextMonotonicIso(current.updated_at, Date.parse(effectiveIso) || Date.now());
      let changed = false;

      const nextItems = current.items.map((item) => {
        if (item.id !== itemId) return item;
        changed = true;
        const toggled = toggleRoutineCheckIn(item, slotKey, profileId, effectiveIso);
        return {
          ...toggled,
          updatedAt: effectiveIso,
        };
      });

      if (!changed) return;

      const nextSnapshot: RoutinesSnapshot = {
        ...current,
        id: 'household_routines',
        items: resolveRoutineItems(nextItems),
        updated_at: nextSnapshotUpdated,
      };
      commitRoutinesState(nextSnapshot, { isInitialized: true });
      await persistRoutinesSnapshot(nextSnapshot);
    },

    addRoutineItem: async (item) => {
      const current = get().snapshot;
      if (current.items.length >= MAX_ROUTINES_PER_WIDGET) return;
      const nowIso = nextMonotonicIso(current.updated_at);
      const normalizedList = resolveRoutineItems([
        ...current.items,
        { ...item, updatedAt: nowIso },
      ]);
      const addedIds = new Set(normalizedList.map((it) => it.id));
      const nextSnapshot: RoutinesSnapshot = {
        id: 'household_routines',
        items: normalizedList,
        deletedRoutineIds: (current.deletedRoutineIds || [])
          .filter((id) => !addedIds.has(id))
          .slice(-MAX_DELETED_ROUTINE_TOMBSTONES),
        updated_at: nowIso,
      };
      commitRoutinesState(nextSnapshot, { isInitialized: true });
      await persistRoutinesSnapshot(nextSnapshot);
    },

    removeRoutineItem: async (itemId) => {
      const current = get().snapshot;
      if (!current.items.some((it) => it.id === itemId)) return;
      const nowIso = nextMonotonicIso(current.updated_at);
      const nextItems = current.items.filter((it) => it.id !== itemId);
      const deletedRoutineIds = Array.from(
        new Set([...(current.deletedRoutineIds || []), itemId])
      ).slice(-MAX_DELETED_ROUTINE_TOMBSTONES);

      const nextSnapshot: RoutinesSnapshot = {
        id: 'household_routines',
        items: nextItems,
        deletedRoutineIds,
        updated_at: nowIso,
      };
      commitRoutinesState(nextSnapshot, { isInitialized: true });
      await persistRoutinesSnapshot(nextSnapshot);
    },

    clearAllCompletions: async () => {
      const current = get().snapshot;
      const nowIso = nextMonotonicIso(current.updated_at);
      const nextItems = current.items.map((it) => ({
        ...recordRemovedCheckIns(it, { ...it, completions: [] }, nowIso),
        updatedAt: nowIso,
      }));
      const nextSnapshot: RoutinesSnapshot = {
        ...current,
        id: 'household_routines',
        items: nextItems,
        updated_at: nowIso,
      };
      commitRoutinesState(nextSnapshot, { isInitialized: true });
      await persistRoutinesSnapshot(nextSnapshot);
    },

    applyRemoteRoutinesSnapshot: async (incoming) => {
      const storedLocal = get().isInitialized
        ? get().snapshot
        : typeof indexedDB !== 'undefined'
          ? await db.routines.get('household_routines').catch(() => undefined)
          : undefined;
      const local = storedLocal || incoming;
      const merged = mergeRoutinesSnapshots(local, incoming);

      // This device kept something the cloud copy lacks (a routine or check-in made here before the
      // sync). Date the merged copy after both so the next push sends it up for the other devices.
      if (!routinesContentEqual(merged, incoming)) {
        const latestKnown =
          (Date.parse(local.updated_at || '') || 0) > (Date.parse(incoming.updated_at || '') || 0)
            ? local.updated_at
            : incoming.updated_at;
        const toShare: RoutinesSnapshot = { ...merged, updated_at: nextMonotonicIso(latestKnown) };
        commitRoutinesState(toShare, { isInitialized: true });
        await persistRoutinesSnapshot(toShare);
        return;
      }

      commitRoutinesState(merged, { isInitialized: true });
      if (typeof indexedDB !== 'undefined') {
        try {
          await db.routines.put(merged);
        } catch (err) {
          console.warn('Failed to persist merged routines snapshot to IndexedDB:', err);
        }
      }
    },
  };
});
