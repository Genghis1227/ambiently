import { create } from 'zustand';
import {
  db,
  DEFAULT_KANBAN_BOARDS,
  DEFAULT_KANBAN_CARDS,
  DEFAULT_KANBAN_SNAPSHOT,
} from '../services/db';
import {
  KANBAN_COLUMNS,
  getSortedKanbanBoards,
  type KanbanBoard,
  type KanbanCard,
  type KanbanChecklistItem,
  type KanbanColumnId,
  type KanbanEngineSnapshot,
} from '../types/kanban';

const MAX_TOMBSTONES = 500;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const SORT_STEP = 1000;
const MIN_SORT_GAP = 0.001;
const DEFAULT_SEED_BOARD_ID = 'board-household-projects';
const EPOCH_ISO = '1970-01-01T00:00:00.000Z';

export type KanbanRowSyncEvent =
  | { kind: 'upsert_boards'; boards: KanbanBoard[] }
  | { kind: 'delete_boards'; boardIds: string[] }
  | { kind: 'upsert_cards'; cards: KanbanCard[]; parentBoards?: KanbanBoard[] }
  | { kind: 'delete_cards'; cardIds: string[] };

const persistListeners = new Set<(snapshot: KanbanEngineSnapshot) => void>();
const rowSyncListeners = new Set<(event: KanbanRowSyncEvent) => void>();

let kanbanCloudDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let autoArchiveHourlyTimer: ReturnType<typeof setInterval> | null = null;
let autoArchiveMidnightTimer: ReturnType<typeof setTimeout> | null = null;
let autoArchiveSchedulerStarted = false;

export function registerKanbanPersistListener(
  listener: (snapshot: KanbanEngineSnapshot) => void
): () => void {
  persistListeners.add(listener);
  return () => {
    persistListeners.delete(listener);
  };
}

export function registerKanbanRowSyncListener(
  listener: (event: KanbanRowSyncEvent) => void
): () => void {
  rowSyncListeners.add(listener);
  return () => {
    rowSyncListeners.delete(listener);
  };
}

function notifyPersistListeners(snapshot: KanbanEngineSnapshot): void {
  if (kanbanCloudDebounceTimer) {
    clearTimeout(kanbanCloudDebounceTimer);
  }
  kanbanCloudDebounceTimer = setTimeout(() => {
    for (const listener of persistListeners) {
      try {
        listener(snapshot);
      } catch {
        // Ignore downstream sync listener errors when offline/unauthenticated
      }
    }
  }, 150);
}

function emitRowSyncEvent(event: KanbanRowSyncEvent): void {
  for (const listener of rowSyncListeners) {
    try {
      listener(event);
    } catch {
      // Ignore offline/unauthenticated row sync failures
    }
  }
}

function hasIndexedDB(): boolean {
  return typeof indexedDB !== 'undefined';
}

function generateKanbanId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function boundTombstones(ids: string[] | undefined): string[] {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const id of ids) {
    if (id && !seen.has(id)) {
      seen.add(id);
      deduped.push(id);
    }
  }
  return deduped.slice(-MAX_TOMBSTONES);
}

function removeFromIds(ids: string[] | undefined, toRemove: Set<string>): string[] {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  return ids.filter((id) => !toRemove.has(id));
}

function sortColumnCards(cards: KanbanCard[]): KanbanCard[] {
  return [...cards].sort(
    (a, b) => (a.sortOrder - b.sortOrder) || a.createdAt.localeCompare(b.createdAt)
  );
}

function normalizeAutoArchiveDays(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return Math.round(num);
}

function normalizeChecklist(items: KanbanChecklistItem[] | undefined): KanbanChecklistItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => item && typeof item.id === 'string')
    .map((item) => ({
      id: item.id,
      text: String(item.text ?? '').trim(),
      checked: Boolean(item.checked),
    }))
    .filter((item) => item.text.length > 0);
}

function buildSnapshot(
  boards: KanbanBoard[],
  cards: KanbanCard[],
  deletedBoardIds: string[],
  deletedCardIds: string[],
  updatedAt: string
): KanbanEngineSnapshot {
  return {
    id: 'household_kanban',
    boards,
    cards,
    deletedBoardIds: boundTombstones(deletedBoardIds),
    deletedCardIds: boundTombstones(deletedCardIds),
    updated_at: updatedAt,
  };
}

/**
 * Calculates a fractional sortOrder for inserting at `targetIndex` within an ordered sibling array,
 * and signals `needsReindex` if neighboring float values collapse below `MIN_SORT_GAP`.
 */
export function computeTargetSortOrder(
  siblings: ReadonlyArray<{ id: string; sortOrder: number }>,
  targetIndex: number
): { sortOrder: number; needsReindex: boolean } {
  const count = siblings.length;
  const clamped = Math.max(0, Math.min(count, targetIndex));

  if (count === 0) {
    return { sortOrder: SORT_STEP, needsReindex: false };
  }

  if (clamped === 0) {
    const first = siblings[0].sortOrder;
    const candidate = first - SORT_STEP;
    const needsReindex = !Number.isFinite(candidate) || Math.abs(first - candidate) < MIN_SORT_GAP;
    return { sortOrder: candidate, needsReindex };
  }

  if (clamped >= count) {
    const last = siblings[count - 1].sortOrder;
    const candidate = last + SORT_STEP;
    const needsReindex = !Number.isFinite(candidate) || Math.abs(candidate - last) < MIN_SORT_GAP;
    return { sortOrder: candidate, needsReindex };
  }

  const prev = siblings[clamped - 1].sortOrder;
  const next = siblings[clamped].sortOrder;
  const gap = next - prev;
  if (!Number.isFinite(gap) || gap < MIN_SORT_GAP) {
    return { sortOrder: prev + gap / 2, needsReindex: true };
  }

  return { sortOrder: prev + gap / 2, needsReindex: false };
}

async function persistFullKanbanStateToDexie(
  snapshot: KanbanEngineSnapshot,
  options?: {
    upsertBoards?: KanbanBoard[];
    deleteBoardIds?: string[];
    upsertCards?: KanbanCard[];
    deleteCardIds?: string[];
    replaceAll?: boolean;
  }
): Promise<void> {
  if (!hasIndexedDB()) return;
  try {
    await db.transaction('rw', [db.kanbanBoards, db.kanbanCards, db.kanban], async () => {
      if (options?.replaceAll) {
        await Promise.all([db.kanbanBoards.clear(), db.kanbanCards.clear()]);
        if (snapshot.boards.length > 0) {
          await db.kanbanBoards.bulkPut(snapshot.boards);
        }
        if (snapshot.cards.length > 0) {
          await db.kanbanCards.bulkPut(snapshot.cards);
        }
      } else {
        if (options?.deleteBoardIds && options.deleteBoardIds.length > 0) {
          await db.kanbanBoards.bulkDelete(options.deleteBoardIds);
        }
        if (options?.upsertBoards && options.upsertBoards.length > 0) {
          await db.kanbanBoards.bulkPut(options.upsertBoards);
        }
        if (options?.deleteCardIds && options.deleteCardIds.length > 0) {
          await db.kanbanCards.bulkDelete(options.deleteCardIds);
        }
        if (options?.upsertCards && options.upsertCards.length > 0) {
          await db.kanbanCards.bulkPut(options.upsertCards);
        }
      }
      await db.kanban.put(snapshot);
    });
  } catch (err) {
    console.warn('Failed to persist Kanban state to IndexedDB:', err);
  }
}

export function mergeKanbanSnapshots(
  local: KanbanEngineSnapshot,
  remote: KanbanEngineSnapshot
): KanbanEngineSnapshot {
  const deletedBoardIds = boundTombstones([
    ...(local.deletedBoardIds || []),
    ...(remote.deletedBoardIds || []),
  ]);
  const deletedBoardSet = new Set(deletedBoardIds);

  const deletedCardIds = boundTombstones([
    ...(local.deletedCardIds || []),
    ...(remote.deletedCardIds || []),
  ]);
  const deletedCardSet = new Set(deletedCardIds);

  const isUntouchedSeedBoard = (b: KanbanBoard) =>
    b.id === DEFAULT_SEED_BOARD_ID && b.updatedAt === EPOCH_ISO;

  const mergeList = <T extends { id: string; updatedAt: string }>(
    localArr: T[],
    remoteArr: T[],
    deletedSet: Set<string>
  ): T[] => {
    const map = new Map<string, T>();
    for (const item of localArr || []) {
      if (item && item.id && !deletedSet.has(item.id)) {
        map.set(item.id, item);
      }
    }
    for (const item of remoteArr || []) {
      if (!item || !item.id || deletedSet.has(item.id)) continue;
      const existing = map.get(item.id);
      if (!existing) {
        map.set(item.id, item);
      } else {
        const localTime = Date.parse(existing.updatedAt || '') || 0;
        const remoteTime = Date.parse(item.updatedAt || '') || 0;
        if (remoteTime >= localTime) {
          map.set(item.id, item);
        }
      }
    }
    return Array.from(map.values());
  };

  let mergedBoards = mergeList(local.boards || [], remote.boards || [], deletedBoardSet);
  const hasRealRemoteBoards = (remote.boards || []).some((b) => !isUntouchedSeedBoard(b));
  if (hasRealRemoteBoards) {
    mergedBoards = mergedBoards.filter((b) => !isUntouchedSeedBoard(b) || (remote.boards || []).some((rb) => rb.id === b.id));
  }

  const validBoardIds = new Set(mergedBoards.map((b) => b.id));
  const mergedCards = mergeList(local.cards || [], remote.cards || [], deletedCardSet).filter(
    (c) => validBoardIds.has(c.boardId)
  );

  const localUpdated = Date.parse(local.updated_at || '') || 0;
  const remoteUpdated = Date.parse(remote.updated_at || '') || 0;
  const updatedAt =
    remoteUpdated >= localUpdated
      ? remote.updated_at || local.updated_at || new Date().toISOString()
      : local.updated_at || new Date().toISOString();

  return buildSnapshot(mergedBoards, mergedCards, deletedBoardIds, deletedCardIds, updatedAt);
}

export interface CreateKanbanBoardInput {
  name: string;
  autoArchiveDays?: number | null;
}

export interface AddKanbanCardInput {
  boardId: string;
  columnId: KanbanColumnId;
  title: string;
  tagColor?: string;
  tagLabel?: string;
  assigneeIds?: string[];
  checklist?: KanbanChecklistItem[];
  position?: 'top' | 'bottom';
  now?: Date;
}

export interface UpdateKanbanCardInput {
  title?: string;
  tagColor?: string | undefined;
  tagLabel?: string | undefined;
  assigneeIds?: string[];
  checklist?: KanbanChecklistItem[];
}

export interface KanbanStoreState {
  isInitialized: boolean;
  snapshot: KanbanEngineSnapshot;
  boards: KanbanBoard[];
  cards: KanbanCard[];

  initKanbanStore: () => Promise<void>;

  // Board actions
  createBoard: (input: CreateKanbanBoardInput) => Promise<KanbanBoard | null>;
  updateBoard: (
    boardId: string,
    updates: { name?: string; autoArchiveDays?: number | null }
  ) => Promise<void>;
  deleteBoard: (boardId: string) => Promise<void>;

  // Card actions
  addCard: (input: AddKanbanCardInput) => Promise<KanbanCard | null>;
  updateCard: (cardId: string, updates: UpdateKanbanCardInput) => Promise<void>;
  moveCard: (
    cardId: string,
    targetColumnId: KanbanColumnId,
    targetIndex: number,
    now?: Date
  ) => Promise<void>;
  stepCardColumn: (
    cardId: string,
    direction: 'left' | 'right',
    now?: Date
  ) => Promise<void>;
  deleteCard: (cardId: string) => Promise<void>;

  // Checklist helpers
  addChecklistItem: (cardId: string, text: string) => Promise<void>;
  toggleChecklistItem: (cardId: string, itemId: string) => Promise<void>;
  updateChecklistItem: (cardId: string, itemId: string, text: string) => Promise<void>;
  reorderChecklistItems: (cardId: string, fromIndex: number, toIndex: number) => Promise<void>;
  removeChecklistItem: (cardId: string, itemId: string) => Promise<void>;

  // Done & Archive lifecycle
  evaluateAutoArchive: (now?: Date) => Promise<number>;
  archiveAllDone: (boardId: string, now?: Date) => Promise<number>;
  clearDoneCards: (boardId: string) => Promise<number>;
  restoreArchivedCard: (
    cardId: string,
    targetColumnId?: 'todo' | 'done',
    now?: Date
  ) => Promise<void>;
  emptyArchive: (boardId: string) => Promise<number>;

  // Cloud & Realtime sync
  applyRemoteBoardRow: (
    row: KanbanBoard,
    eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  ) => Promise<void>;
  applyRemoteCardRow: (
    row: KanbanCard,
    eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  ) => Promise<void>;
  applyRemoteKanbanSnapshot: (remote: KanbanEngineSnapshot) => Promise<void>;
}

function scheduleNextMidnightTick(evaluateFn: () => Promise<number>): void {
  if (typeof window === 'undefined') return;
  if (autoArchiveMidnightTimer) {
    clearTimeout(autoArchiveMidnightTimer);
  }
  const now = new Date();
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    5,
    0
  );
  const delayMs = Math.max(5000, nextMidnight.getTime() - now.getTime());
  autoArchiveMidnightTimer = setTimeout(() => {
    void evaluateFn();
    scheduleNextMidnightTick(evaluateFn);
  }, delayMs);
}

function ensureAutoArchiveScheduler(evaluateFn: () => Promise<number>): void {
  if (typeof window === 'undefined' || autoArchiveSchedulerStarted) return;
  autoArchiveSchedulerStarted = true;

  if (autoArchiveHourlyTimer) {
    clearInterval(autoArchiveHourlyTimer);
  }
  autoArchiveHourlyTimer = setInterval(() => {
    void evaluateFn();
  }, 60 * 60 * 1000);

  scheduleNextMidnightTick(evaluateFn);

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        void evaluateFn();
      }
    });
  }
}

export const useKanbanStore = create<KanbanStoreState>((set, get) => ({
  isInitialized: false,
  snapshot: DEFAULT_KANBAN_SNAPSHOT,
  boards: DEFAULT_KANBAN_BOARDS,
  cards: DEFAULT_KANBAN_CARDS,

  initKanbanStore: async () => {
    if (!hasIndexedDB()) {
      set({
        isInitialized: true,
        snapshot: DEFAULT_KANBAN_SNAPSHOT,
        boards: DEFAULT_KANBAN_BOARDS,
        cards: DEFAULT_KANBAN_CARDS,
      });
      await get().evaluateAutoArchive();
      ensureAutoArchiveScheduler(() => get().evaluateAutoArchive());
      return;
    }

    try {
      const [storedSnapshot, tableBoards, tableCards] = await Promise.all([
        db.kanban.get('household_kanban'),
        db.kanbanBoards.toArray(),
        db.kanbanCards.toArray(),
      ]);

      let boards = tableBoards.length > 0 ? tableBoards : storedSnapshot?.boards || [];
      let cards = tableCards.length > 0 ? tableCards : storedSnapshot?.cards || [];
      const deletedBoardIds = boundTombstones(storedSnapshot?.deletedBoardIds);
      const deletedCardIds = boundTombstones(storedSnapshot?.deletedCardIds);

      if (boards.length === 0 && deletedBoardIds.length === 0) {
        boards = structuredClone(DEFAULT_KANBAN_BOARDS);
        cards = structuredClone(DEFAULT_KANBAN_CARDS);
        const seedSnap = buildSnapshot(boards, cards, [], [], EPOCH_ISO);
        await persistFullKanbanStateToDexie(seedSnap, { replaceAll: true });
        set({
          isInitialized: true,
          snapshot: seedSnap,
          boards,
          cards,
        });
      } else {
        const deletedBoardSet = new Set(deletedBoardIds);
        const deletedCardSet = new Set(deletedCardIds);
        const cleanBoards = boards.filter((b) => b && b.id && !deletedBoardSet.has(b.id));
        const validBoardIds = new Set(cleanBoards.map((b) => b.id));
        const cleanCards = cards.filter(
          (c) => c && c.id && !deletedCardSet.has(c.id) && validBoardIds.has(c.boardId)
        );
        const nextSnap = buildSnapshot(
          cleanBoards,
          cleanCards,
          deletedBoardIds,
          deletedCardIds,
          storedSnapshot?.updated_at || new Date().toISOString()
        );
        set({
          isInitialized: true,
          snapshot: nextSnap,
          boards: cleanBoards,
          cards: cleanCards,
        });
      }
    } catch (err) {
      console.warn('Failed to initialize Kanban store from IndexedDB:', err);
      set({
        isInitialized: true,
        snapshot: DEFAULT_KANBAN_SNAPSHOT,
        boards: DEFAULT_KANBAN_BOARDS,
        cards: DEFAULT_KANBAN_CARDS,
      });
    }

    await get().evaluateAutoArchive();
    ensureAutoArchiveScheduler(() => get().evaluateAutoArchive());
  },

  createBoard: async (input) => {
    const trimmed = (input.name || '').trim();
    if (!trimmed) return null;

    const nowIso = new Date().toISOString();
    const state = get();
    const sorted = getSortedKanbanBoards(state.boards);
    const maxSort = sorted.length > 0 ? sorted[sorted.length - 1].sortOrder : 0;

    const board: KanbanBoard = {
      id: generateKanbanId('board'),
      name: trimmed,
      autoArchiveDays: normalizeAutoArchiveDays(input.autoArchiveDays),
      sortOrder: maxSort + SORT_STEP,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const nextBoards = [...state.boards, board];
    const nextDeletedBoards = removeFromIds(
      state.snapshot.deletedBoardIds,
      new Set([board.id])
    );
    const nextSnap = buildSnapshot(
      nextBoards,
      state.cards,
      nextDeletedBoards,
      state.snapshot.deletedCardIds || [],
      nowIso
    );

    set({ boards: nextBoards, snapshot: nextSnap });
    void persistFullKanbanStateToDexie(nextSnap, { upsertBoards: [board] });
    emitRowSyncEvent({ kind: 'upsert_boards', boards: [board] });
    notifyPersistListeners(nextSnap);
    return board;
  },

  updateBoard: async (boardId, updates) => {
    const state = get();
    const existing = state.boards.find((b) => b.id === boardId);
    if (!existing) return;

    const nowIso = new Date().toISOString();
    const nextName =
      updates.name !== undefined ? updates.name.trim() || existing.name : existing.name;
    const nextAutoArchiveDays =
      updates.autoArchiveDays !== undefined
        ? normalizeAutoArchiveDays(updates.autoArchiveDays)
        : existing.autoArchiveDays;

    const updatedBoard: KanbanBoard = {
      ...existing,
      name: nextName,
      autoArchiveDays: nextAutoArchiveDays,
      updatedAt: nowIso,
    };

    const nextBoards = state.boards.map((b) => (b.id === boardId ? updatedBoard : b));
    const nextSnap = buildSnapshot(
      nextBoards,
      state.cards,
      state.snapshot.deletedBoardIds || [],
      state.snapshot.deletedCardIds || [],
      nowIso
    );

    set({ boards: nextBoards, snapshot: nextSnap });
    void persistFullKanbanStateToDexie(nextSnap, { upsertBoards: [updatedBoard] });
    emitRowSyncEvent({ kind: 'upsert_boards', boards: [updatedBoard] });
    notifyPersistListeners(nextSnap);

    if (updates.autoArchiveDays !== undefined && nextAutoArchiveDays !== null) {
      await get().evaluateAutoArchive();
    }
  },

  deleteBoard: async (boardId) => {
    const state = get();
    if (!state.boards.some((b) => b.id === boardId)) return;

    const nowIso = new Date().toISOString();
    const removedCardIds = state.cards
      .filter((c) => c.boardId === boardId)
      .map((c) => c.id);
    const nextBoards = state.boards.filter((b) => b.id !== boardId);
    const nextCards = state.cards.filter((c) => c.boardId !== boardId);
    const nextDeletedBoards = boundTombstones([
      ...(state.snapshot.deletedBoardIds || []),
      boardId,
    ]);
    const nextDeletedCards = boundTombstones([
      ...(state.snapshot.deletedCardIds || []),
      ...removedCardIds,
    ]);

    const nextSnap = buildSnapshot(
      nextBoards,
      nextCards,
      nextDeletedBoards,
      nextDeletedCards,
      nowIso
    );

    set({ boards: nextBoards, cards: nextCards, snapshot: nextSnap });
    void persistFullKanbanStateToDexie(nextSnap, {
      deleteBoardIds: [boardId],
      deleteCardIds: removedCardIds,
    });
    if (removedCardIds.length > 0) {
      emitRowSyncEvent({ kind: 'delete_cards', cardIds: removedCardIds });
    }
    emitRowSyncEvent({ kind: 'delete_boards', boardIds: [boardId] });
    notifyPersistListeners(nextSnap);
  },

  addCard: async (input) => {
    const trimmedTitle = (input.title || '').trim();
    if (!trimmedTitle) return null;

    const state = get();
    const targetBoard = state.boards.find((b) => b.id === input.boardId);
    if (!targetBoard) return null;

    const nowDate = input.now || new Date();
    const nowIso = nowDate.toISOString();

    const colCards = sortColumnCards(
      state.cards.filter(
        (c) => c.boardId === input.boardId && c.columnId === input.columnId && !c.isArchived
      )
    );
    const targetIndex = input.position === 'top' ? 0 : colCards.length;
    const { sortOrder, needsReindex } = computeTargetSortOrder(colCards, targetIndex);

    const card: KanbanCard = {
      id: generateKanbanId('kcard'),
      boardId: input.boardId,
      columnId: input.columnId,
      title: trimmedTitle,
      ...(input.tagColor ? { tagColor: input.tagColor } : {}),
      ...(input.tagLabel?.trim() ? { tagLabel: input.tagLabel.trim() } : {}),
      assigneeIds: Array.from(new Set(input.assigneeIds || [])),
      checklist: normalizeChecklist(input.checklist),
      sortOrder,
      isArchived: false,
      ...(input.columnId === 'done' ? { completedAt: nowIso } : {}),
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    let nextCards = [...state.cards, card];
    let changedCards: KanbanCard[] = [card];

    if (needsReindex) {
      const combined = sortColumnCards([...colCards, card]);
      const reindexedMap = new Map<string, KanbanCard>();
      combined.forEach((c, idx) => {
        reindexedMap.set(c.id, {
          ...c,
          sortOrder: (idx + 1) * SORT_STEP,
          updatedAt: nowIso,
        });
      });
      nextCards = nextCards.map((c) => reindexedMap.get(c.id) || c);
      changedCards = Array.from(reindexedMap.values());
    }

    const nextSnap = buildSnapshot(
      state.boards,
      nextCards,
      state.snapshot.deletedBoardIds || [],
      removeFromIds(state.snapshot.deletedCardIds, new Set([card.id])),
      nowIso
    );

    set({ cards: nextCards, snapshot: nextSnap });
    void persistFullKanbanStateToDexie(nextSnap, { upsertCards: changedCards });
    emitRowSyncEvent({
      kind: 'upsert_cards',
      cards: changedCards,
      parentBoards: [targetBoard],
    });
    notifyPersistListeners(nextSnap);
    return changedCards.find((c) => c.id === card.id) || card;
  },

  updateCard: async (cardId, updates) => {
    const state = get();
    const existing = state.cards.find((c) => c.id === cardId);
    if (!existing) return;

    const nowIso = new Date().toISOString();
    const nextTitle =
      updates.title !== undefined ? updates.title.trim() || existing.title : existing.title;
    const nextTagColor =
      'tagColor' in updates ? updates.tagColor || undefined : existing.tagColor;
    const nextTagLabel =
      'tagLabel' in updates ? updates.tagLabel?.trim() || undefined : existing.tagLabel;
    const nextAssignees =
      updates.assigneeIds !== undefined
        ? Array.from(new Set(updates.assigneeIds))
        : existing.assigneeIds;
    const nextChecklist =
      updates.checklist !== undefined
        ? normalizeChecklist(updates.checklist)
        : existing.checklist;

    const updatedCard: KanbanCard = {
      ...existing,
      title: nextTitle,
      tagColor: nextTagColor,
      tagLabel: nextTagLabel,
      assigneeIds: nextAssignees,
      checklist: nextChecklist,
      updatedAt: nowIso,
    };

    const nextCards = state.cards.map((c) => (c.id === cardId ? updatedCard : c));
    const nextSnap = buildSnapshot(
      state.boards,
      nextCards,
      state.snapshot.deletedBoardIds || [],
      state.snapshot.deletedCardIds || [],
      nowIso
    );

    const parentBoard = state.boards.find((b) => b.id === updatedCard.boardId);
    set({ cards: nextCards, snapshot: nextSnap });
    void persistFullKanbanStateToDexie(nextSnap, { upsertCards: [updatedCard] });
    emitRowSyncEvent({
      kind: 'upsert_cards',
      cards: [updatedCard],
      ...(parentBoard ? { parentBoards: [parentBoard] } : {}),
    });
    notifyPersistListeners(nextSnap);
  },

  moveCard: async (cardId, targetColumnId, targetIndex, now) => {
    const state = get();
    const existing = state.cards.find((c) => c.id === cardId);
    if (!existing) return;

    const nowIso = (now || new Date()).toISOString();
    const siblingsWithoutSelf = sortColumnCards(
      state.cards.filter(
        (c) =>
          c.boardId === existing.boardId &&
          c.columnId === targetColumnId &&
          !c.isArchived &&
          c.id !== existing.id
      )
    );

    const clampedIndex = Math.max(0, Math.min(siblingsWithoutSelf.length, targetIndex));
    const { sortOrder, needsReindex } = computeTargetSortOrder(siblingsWithoutSelf, clampedIndex);

    // Strictly enforce completedAt lifecycle:
    // set when entering 'done', preserve when reordering inside 'done', clear when leaving 'done'.
    let nextCompletedAt: string | undefined;
    if (targetColumnId === 'done') {
      nextCompletedAt = existing.columnId === 'done' ? existing.completedAt || nowIso : nowIso;
    } else {
      nextCompletedAt = undefined;
    }

    const updatedCard: KanbanCard = {
      ...existing,
      columnId: targetColumnId,
      sortOrder,
      completedAt: nextCompletedAt,
      updatedAt: nowIso,
    };

    let nextCards = state.cards.map((c) => (c.id === cardId ? updatedCard : c));
    let changedCards: KanbanCard[] = [updatedCard];

    if (needsReindex) {
      const ordered = [...siblingsWithoutSelf];
      ordered.splice(clampedIndex, 0, updatedCard);
      const reindexedMap = new Map<string, KanbanCard>();
      ordered.forEach((c, idx) => {
        reindexedMap.set(c.id, {
          ...c,
          sortOrder: (idx + 1) * SORT_STEP,
          updatedAt: nowIso,
        });
      });
      nextCards = nextCards.map((c) => reindexedMap.get(c.id) || c);
      changedCards = Array.from(reindexedMap.values());
    }

    const nextSnap = buildSnapshot(
      state.boards,
      nextCards,
      state.snapshot.deletedBoardIds || [],
      state.snapshot.deletedCardIds || [],
      nowIso
    );

    const parentBoard = state.boards.find((b) => b.id === updatedCard.boardId);
    set({ cards: nextCards, snapshot: nextSnap });
    void persistFullKanbanStateToDexie(nextSnap, { upsertCards: changedCards });
    emitRowSyncEvent({
      kind: 'upsert_cards',
      cards: changedCards,
      ...(parentBoard ? { parentBoards: [parentBoard] } : {}),
    });
    notifyPersistListeners(nextSnap);
  },

  stepCardColumn: async (cardId, direction, now) => {
    const state = get();
    const existing = state.cards.find((c) => c.id === cardId);
    if (!existing) return;

    const currentIdx = KANBAN_COLUMNS.findIndex((c) => c.id === existing.columnId);
    if (currentIdx === -1) return;

    const nextIdx = direction === 'left' ? currentIdx - 1 : currentIdx + 1;
    if (nextIdx < 0 || nextIdx >= KANBAN_COLUMNS.length) return;

    const targetCol = KANBAN_COLUMNS[nextIdx].id;
    const targetCount = state.cards.filter(
      (c) => c.boardId === existing.boardId && c.columnId === targetCol && !c.isArchived
    ).length;

    await get().moveCard(cardId, targetCol, targetCount, now);
  },

  deleteCard: async (cardId) => {
    const state = get();
    if (!state.cards.some((c) => c.id === cardId)) return;

    const nowIso = new Date().toISOString();
    const nextCards = state.cards.filter((c) => c.id !== cardId);
    const nextDeletedCards = boundTombstones([
      ...(state.snapshot.deletedCardIds || []),
      cardId,
    ]);
    const nextSnap = buildSnapshot(
      state.boards,
      nextCards,
      state.snapshot.deletedBoardIds || [],
      nextDeletedCards,
      nowIso
    );

    set({ cards: nextCards, snapshot: nextSnap });
    void persistFullKanbanStateToDexie(nextSnap, { deleteCardIds: [cardId] });
    emitRowSyncEvent({ kind: 'delete_cards', cardIds: [cardId] });
    notifyPersistListeners(nextSnap);
  },

  addChecklistItem: async (cardId, text) => {
    const cleaned = text.trim();
    if (!cleaned) return;
    const existing = get().cards.find((c) => c.id === cardId);
    if (!existing) return;

    const nextItem: KanbanChecklistItem = {
      id: generateKanbanId('chk'),
      text: cleaned,
      checked: false,
    };
    await get().updateCard(cardId, { checklist: [...existing.checklist, nextItem] });
  },

  toggleChecklistItem: async (cardId, itemId) => {
    const existing = get().cards.find((c) => c.id === cardId);
    if (!existing) return;

    const nextList = existing.checklist.map((item) =>
      item.id === itemId ? { ...item, checked: !item.checked } : item
    );
    await get().updateCard(cardId, { checklist: nextList });
  },

  updateChecklistItem: async (cardId, itemId, text) => {
    const cleaned = text.trim();
    if (!cleaned) return;
    const existing = get().cards.find((c) => c.id === cardId);
    if (!existing) return;

    const nextList = existing.checklist.map((item) =>
      item.id === itemId ? { ...item, text: cleaned } : item
    );
    await get().updateCard(cardId, { checklist: nextList });
  },

  reorderChecklistItems: async (cardId, fromIndex, toIndex) => {
    const existing = get().cards.find((c) => c.id === cardId);
    if (!existing) return;
    if (
      fromIndex === toIndex ||
      fromIndex < 0 ||
      toIndex < 0 ||
      fromIndex >= existing.checklist.length ||
      toIndex >= existing.checklist.length
    ) {
      return;
    }

    const nextList = [...existing.checklist];
    const [moved] = nextList.splice(fromIndex, 1);
    nextList.splice(toIndex, 0, moved);
    await get().updateCard(cardId, { checklist: nextList });
  },

  removeChecklistItem: async (cardId, itemId) => {
    const existing = get().cards.find((c) => c.id === cardId);
    if (!existing) return;

    const nextList = existing.checklist.filter((item) => item.id !== itemId);
    await get().updateCard(cardId, { checklist: nextList });
  },

  evaluateAutoArchive: async (now) => {
    const state = get();
    const nowDate = now || new Date();
    const nowMs = nowDate.getTime();
    const nowIso = nowDate.toISOString();

    const boardMap = new Map(state.boards.map((b) => [b.id, b]));
    const archivedCards: KanbanCard[] = [];
    const parentBoardsMap = new Map<string, KanbanBoard>();

    const nextCards = state.cards.map((card) => {
      if (card.isArchived || card.columnId !== 'done' || !card.completedAt) {
        return card;
      }
      const board = boardMap.get(card.boardId);
      if (!board || board.autoArchiveDays === null || board.autoArchiveDays <= 0) {
        return card;
      }
      const completedMs = Date.parse(card.completedAt);
      if (Number.isNaN(completedMs)) return card;

      const archiveThresholdMs = completedMs + board.autoArchiveDays * MS_PER_DAY;
      if (nowMs >= archiveThresholdMs) {
        const updated: KanbanCard = {
          ...card,
          isArchived: true,
          archivedAt: nowIso,
          updatedAt: nowIso,
        };
        archivedCards.push(updated);
        parentBoardsMap.set(board.id, board);
        return updated;
      }
      return card;
    });

    if (archivedCards.length === 0) return 0;

    const nextSnap = buildSnapshot(
      state.boards,
      nextCards,
      state.snapshot.deletedBoardIds || [],
      state.snapshot.deletedCardIds || [],
      nowIso
    );

    set({ cards: nextCards, snapshot: nextSnap });
    void persistFullKanbanStateToDexie(nextSnap, { upsertCards: archivedCards });
    emitRowSyncEvent({
      kind: 'upsert_cards',
      cards: archivedCards,
      parentBoards: Array.from(parentBoardsMap.values()),
    });
    notifyPersistListeners(nextSnap);
    return archivedCards.length;
  },

  archiveAllDone: async (boardId, now) => {
    const state = get();
    const nowIso = (now || new Date()).toISOString();
    const changedCards: KanbanCard[] = [];

    const nextCards = state.cards.map((card) => {
      if (card.boardId === boardId && card.columnId === 'done' && !card.isArchived) {
        const updated: KanbanCard = {
          ...card,
          isArchived: true,
          archivedAt: nowIso,
          updatedAt: nowIso,
        };
        changedCards.push(updated);
        return updated;
      }
      return card;
    });

    if (changedCards.length === 0) return 0;

    const nextSnap = buildSnapshot(
      state.boards,
      nextCards,
      state.snapshot.deletedBoardIds || [],
      state.snapshot.deletedCardIds || [],
      nowIso
    );
    const parentBoard = state.boards.find((b) => b.id === boardId);

    set({ cards: nextCards, snapshot: nextSnap });
    void persistFullKanbanStateToDexie(nextSnap, { upsertCards: changedCards });
    emitRowSyncEvent({
      kind: 'upsert_cards',
      cards: changedCards,
      ...(parentBoard ? { parentBoards: [parentBoard] } : {}),
    });
    notifyPersistListeners(nextSnap);
    return changedCards.length;
  },

  clearDoneCards: async (boardId) => {
    const state = get();
    const doneIds = state.cards
      .filter((c) => c.boardId === boardId && c.columnId === 'done' && !c.isArchived)
      .map((c) => c.id);

    if (doneIds.length === 0) return 0;

    const nowIso = new Date().toISOString();
    const doneSet = new Set(doneIds);
    const nextCards = state.cards.filter((c) => !doneSet.has(c.id));
    const nextDeletedCards = boundTombstones([
      ...(state.snapshot.deletedCardIds || []),
      ...doneIds,
    ]);
    const nextSnap = buildSnapshot(
      state.boards,
      nextCards,
      state.snapshot.deletedBoardIds || [],
      nextDeletedCards,
      nowIso
    );

    set({ cards: nextCards, snapshot: nextSnap });
    void persistFullKanbanStateToDexie(nextSnap, { deleteCardIds: doneIds });
    emitRowSyncEvent({ kind: 'delete_cards', cardIds: doneIds });
    notifyPersistListeners(nextSnap);
    return doneIds.length;
  },

  restoreArchivedCard: async (cardId, targetColumnId = 'todo', now) => {
    const state = get();
    const existing = state.cards.find((c) => c.id === cardId);
    if (!existing) return;

    const nowIso = (now || new Date()).toISOString();
    const siblings = sortColumnCards(
      state.cards.filter(
        (c) =>
          c.boardId === existing.boardId &&
          c.columnId === targetColumnId &&
          !c.isArchived &&
          c.id !== existing.id
      )
    );
    const { sortOrder } = computeTargetSortOrder(siblings, siblings.length);

    // Keep checklist intact so reusable checklists (e.g. trip packing) restore cleanly
    const restored: KanbanCard = {
      ...existing,
      columnId: targetColumnId,
      sortOrder,
      isArchived: false,
      archivedAt: undefined,
      completedAt: targetColumnId === 'done' ? nowIso : undefined,
      updatedAt: nowIso,
    };

    const nextCards = state.cards.map((c) => (c.id === cardId ? restored : c));
    const nextSnap = buildSnapshot(
      state.boards,
      nextCards,
      state.snapshot.deletedBoardIds || [],
      state.snapshot.deletedCardIds || [],
      nowIso
    );
    const parentBoard = state.boards.find((b) => b.id === restored.boardId);

    set({ cards: nextCards, snapshot: nextSnap });
    void persistFullKanbanStateToDexie(nextSnap, { upsertCards: [restored] });
    emitRowSyncEvent({
      kind: 'upsert_cards',
      cards: [restored],
      ...(parentBoard ? { parentBoards: [parentBoard] } : {}),
    });
    notifyPersistListeners(nextSnap);
  },

  emptyArchive: async (boardId) => {
    const state = get();
    const archivedIds = state.cards
      .filter((c) => c.boardId === boardId && c.isArchived)
      .map((c) => c.id);

    if (archivedIds.length === 0) return 0;

    const nowIso = new Date().toISOString();
    const archivedSet = new Set(archivedIds);
    const nextCards = state.cards.filter((c) => !archivedSet.has(c.id));
    const nextDeletedCards = boundTombstones([
      ...(state.snapshot.deletedCardIds || []),
      ...archivedIds,
    ]);
    const nextSnap = buildSnapshot(
      state.boards,
      nextCards,
      state.snapshot.deletedBoardIds || [],
      nextDeletedCards,
      nowIso
    );

    set({ cards: nextCards, snapshot: nextSnap });
    void persistFullKanbanStateToDexie(nextSnap, { deleteCardIds: archivedIds });
    emitRowSyncEvent({ kind: 'delete_cards', cardIds: archivedIds });
    notifyPersistListeners(nextSnap);
    return archivedIds.length;
  },

  applyRemoteBoardRow: async (row, eventType) => {
    if (!row || !row.id) return;
    const state = get();
    const existing = state.boards.find((b) => b.id === row.id);
    const nowIso = new Date().toISOString();

    if (eventType === 'DELETE') {
      const removedCardIds = state.cards
        .filter((c) => c.boardId === row.id)
        .map((c) => c.id);
      const nextBoards = state.boards.filter((b) => b.id !== row.id);
      const nextCards = state.cards.filter((c) => c.boardId !== row.id);
      const nextDeletedBoards = boundTombstones([
        ...(state.snapshot.deletedBoardIds || []),
        row.id,
      ]);
      const nextDeletedCards = boundTombstones([
        ...(state.snapshot.deletedCardIds || []),
        ...removedCardIds,
      ]);
      const nextSnap = buildSnapshot(
        nextBoards,
        nextCards,
        nextDeletedBoards,
        nextDeletedCards,
        nowIso
      );
      set({ boards: nextBoards, cards: nextCards, snapshot: nextSnap });
      void persistFullKanbanStateToDexie(nextSnap, {
        deleteBoardIds: [row.id],
        deleteCardIds: removedCardIds,
      });
      return;
    }

    if (existing) {
      const localTime = Date.parse(existing.updatedAt || '') || 0;
      const remoteTime = Date.parse(row.updatedAt || '') || 0;
      if (remoteTime < localTime) return;
    }

    const nextBoards = existing
      ? state.boards.map((b) => (b.id === row.id ? row : b))
      : [...state.boards, row];
    const nextDeletedBoards = removeFromIds(
      state.snapshot.deletedBoardIds,
      new Set([row.id])
    );
    const nextSnap = buildSnapshot(
      nextBoards,
      state.cards,
      nextDeletedBoards,
      state.snapshot.deletedCardIds || [],
      row.updatedAt || nowIso
    );

    set({ boards: nextBoards, snapshot: nextSnap });
    void persistFullKanbanStateToDexie(nextSnap, { upsertBoards: [row] });
  },

  applyRemoteCardRow: async (row, eventType) => {
    if (!row || !row.id) return;
    const state = get();
    const existing = state.cards.find((c) => c.id === row.id);
    const nowIso = new Date().toISOString();

    if (eventType === 'DELETE') {
      const nextCards = state.cards.filter((c) => c.id !== row.id);
      const nextDeletedCards = boundTombstones([
        ...(state.snapshot.deletedCardIds || []),
        row.id,
      ]);
      const nextSnap = buildSnapshot(
        state.boards,
        nextCards,
        state.snapshot.deletedBoardIds || [],
        nextDeletedCards,
        nowIso
      );
      set({ cards: nextCards, snapshot: nextSnap });
      void persistFullKanbanStateToDexie(nextSnap, { deleteCardIds: [row.id] });
      return;
    }

    if (existing) {
      const localTime = Date.parse(existing.updatedAt || '') || 0;
      const remoteTime = Date.parse(row.updatedAt || '') || 0;
      if (remoteTime < localTime) return;
    }

    const nextCards = existing
      ? state.cards.map((c) => (c.id === row.id ? row : c))
      : [...state.cards, row];
    const nextDeletedCards = removeFromIds(
      state.snapshot.deletedCardIds,
      new Set([row.id])
    );
    const nextSnap = buildSnapshot(
      state.boards,
      nextCards,
      state.snapshot.deletedBoardIds || [],
      nextDeletedCards,
      row.updatedAt || nowIso
    );

    set({ cards: nextCards, snapshot: nextSnap });
    void persistFullKanbanStateToDexie(nextSnap, { upsertCards: [row] });
  },

  applyRemoteKanbanSnapshot: async (remote) => {
    if (!remote || remote.id !== 'household_kanban') return;
    const merged = mergeKanbanSnapshots(get().snapshot, remote);
    set({
      isInitialized: true,
      snapshot: merged,
      boards: merged.boards,
      cards: merged.cards,
    });
    void persistFullKanbanStateToDexie(merged, { replaceAll: true });
    await get().evaluateAutoArchive();
  },
}));
