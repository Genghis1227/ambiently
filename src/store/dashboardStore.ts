import { create } from 'zustand';
import {
  db,
  DEFAULT_SETTINGS,
  DEFAULT_TABS,
  DEFAULT_WIDGETS,
  DEFAULT_NOTES,
  purgeOldTombstones,
} from '../services/db';
import type {
  DashboardTab,
  DashboardWidget,
  StickyNoteItem,
  AppSettings,
  DockPosition,
  CanvasBackgroundTheme,
  AutoOrganizeMode,
  FreeformPosition,
} from '../types/dashboard';
import { MAX_CANVASES } from '../types/dashboard';
import { saveSnapshotToFile, hasActiveLocalFile } from '../services/fileSync';
import {
  computeMovedWidgetPosition,
  computeNonOverlappingLayout,
  findOpenCanvasSpot,
} from '../utils/autoLayout';
import type { CanvasBlueprintId } from '../utils/canvasBlueprints';
import { getDefaultWidgetStickerMode, isStickerCapableWidget } from '../utils/widgetStickerMode';
import type { PhotoTargetSyncMeta, PlexPhotoSyncConfig } from '../utils/photoSyncPolicy';
import type { PhotoItem } from '../services/photos';
import {
  hasSupabaseCredentials,
  getCachedSessionUser,
  pushToCloud,
  syncKanbanRowEventToCloud,
  KANBAN_ENGINE_CLOUD_ROW_ID,
} from '../services/supabase';
import {
  CANVAS_LOOK_FIELDS,
  buildNoteFreeformPos,
  isPermanentlyPurgedWidget,
  keepLocalNoteFields,
  keepLocalTabFields,
  keepLocalWidgetFields,
  mergeDirtySyncScopes,
  nextMonotonicIso,
  normalizeLoadedNote,
  shouldApplyRealtimeRow,
  type DirtySyncScopes,
} from '../services/syncMerge';
import { inferCuratedCategoryId } from '../data/curatedScenery';
import { applySharedPhotoUpdateToWidgets, sanitizeRestoredPhotoWidget } from '../utils/photoSourceIsolation';
import { applyPinLockTransition, normalizePinLockSettings } from '../utils/pinValidation';
import { getWifiVaultKey } from '../utils/wifiQr';
import { getHomelabVaultKey } from '../utils/homelabVault';
import { parseVaultMediaKey } from '../utils/localMediaVault';
import { useChoreStore, registerChorePersistListener } from './choreStore';
import type { ChoreEngineSnapshot } from '../types/chores';
import { useProfileStore, registerProfileSyncListener } from '../stores/useProfileStore';
import type { HouseholdProfile } from '../types/profiles';
import { useMealStore, registerMealPersistListener } from '../stores/useMealStore';
import type { MealPlannerSnapshot } from '../types/meals';
import {
  useKanbanStore,
  registerKanbanPersistListener,
  registerKanbanRowSyncListener,
} from '../stores/useKanbanStore';
import type { KanbanEngineSnapshot } from '../types/kanban';
import { useRoutinesStore, registerRoutinesPersistListener } from '../stores/useRoutinesStore';
import { ROUTINES_CLOUD_ROW_ID, type RoutinesSnapshot } from '../types/phase2Widgets';

const CHORE_ENGINE_CLOUD_ROW_ID = '__ambiently_chore_engine__';
const HOUSEHOLD_PROFILES_CLOUD_ROW_ID = '__ambiently_household_profiles__';
const MEAL_PLANNER_CLOUD_ROW_ID = '__ambiently_meal_planner__';
const SYSTEM_WIDGET_CLOUD_ROW_IDS = new Set([
  CHORE_ENGINE_CLOUD_ROW_ID,
  HOUSEHOLD_PROFILES_CLOUD_ROW_ID,
  MEAL_PLANNER_CLOUD_ROW_ID,
  KANBAN_ENGINE_CLOUD_ROW_ID,
  ROUTINES_CLOUD_ROW_ID,
]);

let backupDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let cloudAutoSyncTimer: ReturnType<typeof setTimeout> | null = null;
let carouselPauseTimerId: ReturnType<typeof setTimeout> | null = null;
let hasPendingCloudPush = false;
let pendingDirtyScopes: DirtySyncScopes = {};
let activeCloudPushPromise: Promise<void> | null = null;
let latestDashboardGet: (() => DashboardState) | null = null;

/**
 * Cancels any pending debounced cloud auto-push before an explicit backup or restore.
 */
export function cancelPendingCloudPush(): void {
  if (cloudAutoSyncTimer) {
    clearTimeout(cloudAutoSyncTimer);
    cloudAutoSyncTimer = null;
  }
  hasPendingCloudPush = false;
  pendingDirtyScopes = {};
}

/**
 * Flushes any pending debounced cloud auto-push immediately before sign-out or page unload.
 */
export async function flushPendingCloudPush(): Promise<void> {
  if (cloudAutoSyncTimer) {
    clearTimeout(cloudAutoSyncTimer);
    cloudAutoSyncTimer = null;
  }
  if (activeCloudPushPromise) {
    await activeCloudPushPromise.catch(() => {});
  }
  if (!hasPendingCloudPush) return;
  hasPendingCloudPush = false;
  pendingDirtyScopes = {};
  if (!hasSupabaseCredentials()) return;

  try {
    const user = await getCachedSessionUser();
    if (!user) return;

    const state = (latestDashboardGet || (() => useDashboardStore.getState()))();
    const runPush = Promise.resolve(
      pushToCloud(state.settings, state.tabs, state.widgets, state.notes)
    ).then(
      () => undefined,
      (err) => {
        console.warn('Cloud flush push skipped:', err);
      }
    );
    activeCloudPushPromise = runPush;
    try {
      await runPush;
    } finally {
      if (activeCloudPushPromise === runPush) {
        activeCloudPushPromise = null;
      }
    }
  } catch (err) {
    console.warn('Cloud flush push skipped:', err);
  }
}

function scheduleCloudAutoPush(get: () => DashboardState, scope?: DirtySyncScopes): void {
  latestDashboardGet = get;
  pendingDirtyScopes = mergeDirtySyncScopes(pendingDirtyScopes, scope);
  if (!hasSupabaseCredentials()) return;
  hasPendingCloudPush = true;
  if (cloudAutoSyncTimer) {
    clearTimeout(cloudAutoSyncTimer);
  }
  cloudAutoSyncTimer = setTimeout(() => {
    cloudAutoSyncTimer = null;
    if (!hasPendingCloudPush) return;
    hasPendingCloudPush = false;
    const dirtySnapshot = { ...pendingDirtyScopes };
    pendingDirtyScopes = {};
    void getCachedSessionUser()
      .then((user) => {
        if (!user) return;
        const state = get();
        const runPush = Promise.resolve(
          pushToCloud(state.settings, state.tabs, state.widgets, state.notes, {
            dirtyScopes: dirtySnapshot,
          })
        ).then(
          (res) => {
            if (res && !res.success) {
              pendingDirtyScopes = mergeDirtySyncScopes(pendingDirtyScopes, dirtySnapshot);
            }
          },
          (err) => {
            pendingDirtyScopes = mergeDirtySyncScopes(pendingDirtyScopes, dirtySnapshot);
            console.warn('Cloud auto-push skipped:', err);
          }
        );
        activeCloudPushPromise = runPush;
        void runPush.finally(() => {
          if (activeCloudPushPromise === runPush) {
            activeCloudPushPromise = null;
          }
        });
      })
      .catch((err) => {
        pendingDirtyScopes = mergeDirtySyncScopes(pendingDirtyScopes, dirtySnapshot);
        console.warn('Cloud auto-push skipped:', err);
      });
  }, 2500);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flushPendingCloudPush();
    }
  });
  window.addEventListener('pagehide', () => {
    void flushPendingCloudPush();
  });
}

// A canvas's look (theme, wallpaper, dimming, hidden notes, home canvas) syncs inside the board settings
// (canvasThemes in pushToCloud), and settings are only sent when they've changed. So a change to a look
// marks the settings as changed too, or it would never reach other devices.
async function markCanvasLooksChanged(get: () => DashboardState, set: (partial: Partial<DashboardState>) => void) {
  const settings: AppSettings = { ...get().settings, updated_at: new Date().toISOString() };
  await db.settings.put(settings).catch(() => {});
  set({ settings });
}

export const MAX_LAYOUT_UNDO_STACK = 20;

export interface LayoutHistoryEntry {
  id: string;
  tabId: string;
  label: string;
  createdAtMs: number;
  widgetPositions: Record<string, FreeformPosition>;
  notePositions: Record<string, FreeformPosition>;
}

export interface LayoutUndoToastState {
  entryId: string;
  tabId: string;
  label: string;
  nonce: number;
}

export type LayoutChangeVerb = 'Moved' | 'Resized' | 'Rotated' | 'Maximized' | 'Restored';

export function classifyLayoutGeometryChange(
  prev: FreeformPosition | undefined,
  next: FreeformPosition | undefined
): LayoutChangeVerb | null {
  if (!next) return null;
  const p: FreeformPosition = prev ?? {
    xRatio: 0.1,
    yRatio: 0.1,
    wRatio: 0.35,
    hRatio: 0.45,
    zIndex: 1,
    rotation: 0,
  };
  if (Boolean(p.isFullScreen) !== Boolean(next.isFullScreen)) {
    return next.isFullScreen ? 'Maximized' : 'Restored';
  }
  if (
    Math.abs((p.wRatio ?? 0.35) - (next.wRatio ?? 0.35)) >= 1e-4 ||
    Math.abs((p.hRatio ?? 0.45) - (next.hRatio ?? 0.45)) >= 1e-4
  ) {
    return 'Resized';
  }
  if (Math.round(p.rotation ?? 0) !== Math.round(next.rotation ?? 0)) {
    return 'Rotated';
  }
  if (
    Math.abs((p.xRatio ?? 0.1) - (next.xRatio ?? 0.1)) >= 1e-4 ||
    Math.abs((p.yRatio ?? 0.1) - (next.yRatio ?? 0.1)) >= 1e-4
  ) {
    return 'Moved';
  }
  return null;
}

function appendLayoutHistoryEntry(
  stack: readonly LayoutHistoryEntry[],
  entry: LayoutHistoryEntry
): LayoutHistoryEntry[] {
  return [...stack, entry].slice(-MAX_LAYOUT_UNDO_STACK);
}

export interface MovedWidgetToastState {
  widgetId: string;
  widgetTitle: string;
  targetTabId: string;
  targetTabName: string;
  nonce: number;
}

export interface PhotoSyncState {
  isActive: boolean;
  isSilent?: boolean;
  sourceType: 'plex' | 'local' | 'web' | 'curated' | null;
  sourceLabel: string;
  loadedCount: number;
  totalCount?: number;
  statusMessage: string;
  targetWidgetId?: string;
}

interface LayoutSnapshot {
  tabId: string;
  widgetPositions: Record<string, FreeformPosition>;
  notePositions: Record<string, FreeformPosition>;
}

interface DashboardState {
  isInitialized: boolean;
  settings: AppSettings;
  tabs: DashboardTab[];
  activeTabId: string;
  widgets: DashboardWidget[];
  deletedWidgets: DashboardWidget[];
  notes: StickyNoteItem[];
  deletedNoteTimestamps: Record<string, string>;
  deletedWidgetTimestamps: Record<string, string>;
  deletedTabTimestamps: Record<string, string>;

  // Ephemeral Kiosk controls
  isCarouselPaused: boolean;
  carouselPauseTimer: number | null;
  needsFileReconnect: boolean;
  isUnlocked: boolean; // runtime unlock state when pinLockEnabled is on
  lastLayoutSnapshot: LayoutSnapshot | null;
  layoutUndoStack: LayoutHistoryEntry[];
  layoutUndoToast: LayoutUndoToastState | null;
  movedWidgetToast: MovedWidgetToastState | null;
  photoSyncState: PhotoSyncState | null;
  photoSyncMeta: Record<string, PhotoTargetSyncMeta>;

  // Actions
  initStore: () => Promise<void>;
  setActiveTabId: (tabId: string) => void;
  rotateToTab: (tabId: string) => void;
  addTab: (
    name: string,
    icon: string,
    backgroundTheme?: CanvasBackgroundTheme,
    customWallpaperUrl?: string,
    backgroundDimLevel?: number,
    blueprintId?: CanvasBlueprintId
  ) => Promise<string | null>;
  applyCanvasBlueprint: (tabId: string, blueprintId: CanvasBlueprintId) => Promise<void>;
  updateTab: (tabId: string, updates: Partial<DashboardTab>) => Promise<void>;
  setHomeTab: (tabId: string) => Promise<void>;
  deleteTab: (tabId: string) => Promise<void>;
  reorderTabs: (orderedTabIds: string[]) => Promise<void>;
  setDockPosition: (pos: DockPosition) => Promise<void>;
  setSnapToGrid: (snapToGrid: boolean) => Promise<void>;
  toggleSnapToGrid: () => Promise<void>;
  setDockHidden: (isDockHidden: boolean) => Promise<void>;
  toggleDockHidden: () => Promise<void>;
  setCommonPhotos: (
    photos: PhotoItem[],
    sourceLabel?: string,
    sourceUrl?: string,
    sourceType?: 'plex' | 'local' | 'web' | 'curated',
    plexSyncConfig?: PlexPhotoSyncConfig,
    curatedCategoryId?: string
  ) => Promise<void>;
  applyCommonPhotosToAllWidgets: (
    photos: PhotoItem[],
    sourceLabel?: string,
    sourceUrl?: string,
    sourceType?: 'plex' | 'local' | 'web' | 'curated',
    plexSyncConfig?: PlexPhotoSyncConfig,
    curatedCategoryId?: string,
    optInWidgetId?: string
  ) => Promise<void>;
  setPhotoSyncState: (state: PhotoSyncState | null) => void;
  setPhotoSyncMeta: (meta: Record<string, PhotoTargetSyncMeta>) => void;
  appendPhotosToTarget: (
    targetWidgetId: string | undefined,
    newPhotos: PhotoItem[],
    sourceLabel?: string,
    sourceUrl?: string,
    sourceType?: 'plex' | 'local' | 'web' | 'curated',
    plexSyncConfig?: PlexPhotoSyncConfig
  ) => Promise<void>;
  finalizePhotosToTarget: (
    targetWidgetId: string | undefined,
    allPhotos: PhotoItem[],
    sourceLabel?: string,
    sourceUrl?: string,
    sourceType?: 'plex' | 'local' | 'web' | 'curated',
    plexSyncConfig?: PlexPhotoSyncConfig
  ) => Promise<void>;
  toggleTabEnabled: (tabId: string, enabled: boolean) => Promise<void>;
  setDisplayDensity: (density: 0.75 | 1.0 | 1.25 | 1.5) => Promise<void>;
  setCarouselEnabled: (enabled: boolean) => Promise<void>;
  setCarouselDuration: (seconds: number) => Promise<void>;
  pauseCarouselTemporarily: (durationMs?: number) => void;
  toggleNightModeManual: () => void;
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
  setPinLock: (pin: string | null) => Promise<void>;
  unlockKiosk: (enteredPin: string) => Promise<boolean>;
  lockKiosk: () => void;
  saveLocalBackup: (scope?: DirtySyncScopes) => Promise<void>;
  saveLocalBackupImmediate: (scope?: DirtySyncScopes) => Promise<void>;
  syncRemoteNoteChange: (note: StickyNoteItem, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void;
  syncRemoteWidgetChange: (widget: DashboardWidget, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void;
  syncRemoteTabChange: (tab: DashboardTab, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void;

  // Auto-Organize & Layout Undo Actions
  autoOrganizeCanvas: (tabId: string, mode?: AutoOrganizeMode) => Promise<void>;
  undoAutoOrganize: () => Promise<void>;
  undoLayoutChange: (tabId?: string) => Promise<boolean>;
  dismissLayoutUndoToast: () => void;

  // Widget / Note operations
  addWidget: (widget: Partial<DashboardWidget>) => Promise<void>;
  removeWidget: (widgetId: string) => Promise<void>;
  restoreWidget: (widgetId: string, targetTabId?: string) => Promise<boolean>;
  permanentlyDeleteWidget: (widgetId: string) => Promise<void>;
  permanentlyDeleteWidgets: (widgetIds: string[]) => Promise<void>;
  updateWidget: (widgetId: string, updates: Partial<DashboardWidget>) => Promise<void>;
  updateWidgetConfig: (widgetId: string, configUpdates: Record<string, any>) => Promise<void>;
  moveWidgetToTab: (
    widgetId: string,
    targetTabId: string,
    extraUpdates?: Partial<DashboardWidget>
  ) => Promise<boolean>;
  moveWidgetToNewTab: (
    widgetId: string,
    canvasName?: string,
    extraUpdates?: Partial<DashboardWidget>
  ) => Promise<string | null>;
  dismissMovedWidgetToast: () => void;
  addNote: (note: Partial<StickyNoteItem>) => Promise<void>;
  updateNote: (noteId: string, updates: Partial<StickyNoteItem>) => Promise<void>;
  deleteNote: (noteId: string) => Promise<void>;
  permanentlyDeleteNote: (noteId: string) => Promise<void>;
  permanentlyDeleteNotes: (noteIds: string[]) => Promise<void>;
  updateWidgetPosition: (
    widgetId: string,
    gridPos?: DashboardWidget['gridPos'],
    freeformPos?: DashboardWidget['freeformPos']
  ) => Promise<void>;
  updateNotePosition: (
    noteId: string,
    freeformPos: StickyNoteItem['freeformPos']
  ) => Promise<void>;
}

// Simple SHA-256 helper for PIN
async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function getExistingBoxesForTab(
  tabId: string,
  widgets: DashboardWidget[],
  notes: StickyNoteItem[]
) {
  const now = new Date();
  const tabWidgets = widgets.filter((w) => w.tabId === tabId);
  const tabNotes = notes.filter(
    (n) =>
      ((n.tabId || 'tab-corkboard') === tabId || n.tabId === 'all') &&
      !n.archivedAt &&
      (!n.expiresAt || new Date(n.expiresAt) > now)
  );

  return [
    ...tabWidgets.map((w) => ({
      xRatio: w.freeformPos?.xRatio ?? 0.1,
      yRatio: w.freeformPos?.yRatio ?? 0.1,
      wRatio: w.freeformPos?.wRatio ?? 0.35,
      hRatio: w.freeformPos?.hRatio ?? 0.45,
    })),
    ...tabNotes.map((n) => ({
      xRatio: n.freeformPos?.xRatio ?? 0.15,
      yRatio: n.freeformPos?.yRatio ?? 0.15,
      wRatio: n.freeformPos?.wRatio ?? 0.24,
      hRatio: n.freeformPos?.hRatio ?? 0.28,
    })),
  ];
}

function resolveTombstoneIso(updatedAt?: string | null, deletedAt?: string | null): string {
  const updatedMs = updatedAt ? Date.parse(updatedAt) : 0;
  const deletedMs = deletedAt ? Date.parse(deletedAt) : 0;
  const safeUpdated = Number.isFinite(updatedMs) ? updatedMs : 0;
  const safeDeleted = Number.isFinite(deletedMs) ? deletedMs : 0;
  if (safeUpdated >= safeDeleted && updatedAt) return updatedAt;
  if (deletedAt) return deletedAt;
  return updatedAt || new Date().toISOString();
}

function sortDeletedWidgetsNewestFirst(list: DashboardWidget[]): DashboardWidget[] {
  return [...list].sort((a, b) => {
    const aMs = Date.parse(a.deleted_at || a.updated_at || '') || 0;
    const bMs = Date.parse(b.deleted_at || b.updated_at || '') || 0;
    return bMs - aMs;
  });
}

function computePlacementForTab(
  state: Pick<DashboardState, 'widgets' | 'notes'>,
  movingWidget: Pick<DashboardWidget, 'id' | 'type' | 'freeformPos'>,
  targetTabId: string,
  preferredPos?: FreeformPosition
) {
  const nowMs = Date.now();
  const targetTabWidgets = state.widgets.filter(
    (w) => !w.deleted_at && w.tabId === targetTabId && w.id !== movingWidget.id
  );
  const targetTabNotes = state.notes.filter(
    (n) =>
      !n.deleted_at &&
      !n.archivedAt &&
      n.isPinnedToCanvas !== false &&
      (!n.expiresAt || Date.parse(n.expiresAt) > nowMs) &&
      ((n.tabId || 'tab-corkboard') === targetTabId || n.tabId === 'all')
  );
  return computeMovedWidgetPosition(
    { type: movingWidget.type, freeformPos: movingWidget.freeformPos },
    targetTabWidgets,
    targetTabNotes,
    preferredPos
  );
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  isInitialized: false,
  settings: DEFAULT_SETTINGS,
  tabs: [],
  activeTabId: 'tab-corkboard',
  widgets: [],
  deletedWidgets: [],
  notes: [],
  deletedNoteTimestamps: {},
  deletedWidgetTimestamps: {},
  deletedTabTimestamps: {},

  isCarouselPaused: false,
  carouselPauseTimer: null,
  needsFileReconnect: false,
  isUnlocked: true,
  lastLayoutSnapshot: null,
  layoutUndoStack: [],
  layoutUndoToast: null,
  movedWidgetToast: null,
  photoSyncState: null,
  photoSyncMeta: {},

  initStore: async () => {
    // Non-blocking cleanup of soft-deleted records older than 30 days
    purgeOldTombstones().catch(() => {});

    // Load from Dexie or seed fresh database
    const settingsCount = await db.settings.count();
    if (settingsCount === 0) {
      await db.settings.add(DEFAULT_SETTINGS);
      await db.tabs.bulkAdd(DEFAULT_TABS);
      await db.widgets.bulkAdd(DEFAULT_WIDGETS);
      await db.notes.bulkAdd(DEFAULT_NOTES);
    }

    const rawSettings = await db.settings.get('global');
    const mergedSettings = {
      ...DEFAULT_SETTINGS,
      ...(rawSettings || {}),
      carouselEnabled: rawSettings?.carouselEnabled ?? true,
      // Night mode is what this screen is doing right now. The background cloud refresh re-runs
      // initStore every 60 seconds and must not switch it on or off.
      nightModeEnabled: get().isInitialized
        ? get().settings.nightModeEnabled
        : rawSettings?.nightModeEnabled ?? false,
    };
    const { settings: loadedSettings, repaired: pinSettingsRepaired } =
      normalizePinLockSettings(mergedSettings);
    if (pinSettingsRepaired) {
      await db.settings.put(loadedSettings).catch(() => {});
    }
    const allTabs = await db.tabs.toArray();
    const deletedTabTimestamps: Record<string, string> = {};
    for (const t of allTabs) {
      if (t.deleted_at) {
        deletedTabTimestamps[t.id] = resolveTombstoneIso(t.updated_at, t.deleted_at);
      }
    }
    const tabsToRepair: DashboardTab[] = [];
    const loadedTabs = allTabs
      .filter((t: DashboardTab) => !t.deleted_at)
      .map((t: DashboardTab, idx: number) => {
        const validOrder = Number.isFinite(t.order) ? t.order : idx;
        const validEnabled = t.id === 'tab-overview' ? Boolean(t.enabled) : t.enabled !== false;
        if (t.order !== validOrder || t.enabled !== validEnabled) {
          const repaired = { ...t, order: validOrder, enabled: validEnabled };
          tabsToRepair.push(repaired);
          return repaired;
        }
        return t;
      })
      .sort((a: DashboardTab, b: DashboardTab) => (a.order ?? 0) - (b.order ?? 0));
    if (tabsToRepair.length > 0) {
      await db.tabs.bulkPut(tabsToRepair).catch(() => {});
    }
    const allWidgetsRaw = await db.widgets.toArray();
    const deletedWidgetTimestamps: Record<string, string> = {};
    const deletedWidgetsList: DashboardWidget[] = [];
    for (const w of allWidgetsRaw) {
      if (SYSTEM_WIDGET_CLOUD_ROW_IDS.has(w.id)) continue;
      if (w.deleted_at) {
        deletedWidgetTimestamps[w.id] = resolveTombstoneIso(w.updated_at, w.deleted_at);
        if (!isPermanentlyPurgedWidget(w)) {
          deletedWidgetsList.push(w);
        }
      }
    }
    const deletedWidgets = sortDeletedWidgetsNewestFirst(deletedWidgetsList);
    const rawLoadedWidgets = allWidgetsRaw.filter(
      (w) => !w.deleted_at && !SYSTEM_WIDGET_CLOUD_ROW_IDS.has(w.id)
    );
    const widgetsToRepair: DashboardWidget[] = [];
    const loadedWidgets = rawLoadedWidgets.map((w) => {
      const { widget: sanitized, repaired } = sanitizeRestoredPhotoWidget(w);
      if (repaired) widgetsToRepair.push(sanitized);
      return sanitized;
    });
    if (widgetsToRepair.length > 0) {
      await db.widgets.bulkPut(widgetsToRepair).catch(() => {});
    }
    const allNotes = await db.notes.toArray();
    const deletedNoteTimestamps: Record<string, string> = {};
    for (const n of allNotes) {
      if (n.deleted_at) {
        deletedNoteTimestamps[n.id] = resolveTombstoneIso(n.updated_at, n.deleted_at);
      }
    }
    const loadedNotes = allNotes
      .filter((n) => !n.deleted_at)
      .map((n) => normalizeLoadedNote(n));

    // Initialize Global Household Profile Store, Chore Engine Store, Meal Planner Store, Kanban Store & Routines Store
    await useProfileStore.getState().initProfileStore();
    await useChoreStore.getState().initChoreStore();
    await useMealStore.getState().initMealStore();
    await useKanbanStore.getState().initKanbanStore();
    await useRoutinesStore.getState().initRoutinesStore();

    const tabsToUse = loadedTabs.length > 0 ? loadedTabs : DEFAULT_TABS;
    const explicitHome = tabsToUse.find((t) => t.isHome && (t.id === 'tab-overview' ? Boolean(t.enabled) : t.enabled !== false));
    const initialTab =
      explicitHome ||
      tabsToUse.find((t) => (t.id === 'tab-overview' ? Boolean(t.enabled) : t.enabled !== false)) ||
      tabsToUse[0];
    const initialTabId = initialTab?.id || 'tab-corkboard';

    const currentActiveTabId = get().activeTabId;
    const isCurrentActiveTabValid = tabsToUse.some(
      (t) => t.id === currentActiveTabId && !t.deleted_at && (t.id === 'tab-overview' ? Boolean(t.enabled) : t.enabled !== false)
    );
    const resolvedActiveTabId = get().isInitialized && isCurrentActiveTabValid ? currentActiveTabId : initialTabId;

    set({
      isInitialized: true,
      settings: loadedSettings,
      tabs: tabsToUse,
      activeTabId: resolvedActiveTabId,
      widgets: loadedWidgets,
      deletedWidgets,
      notes: loadedNotes,
      deletedNoteTimestamps,
      deletedWidgetTimestamps,
      deletedTabTimestamps,
      isUnlocked: !loadedSettings.pinLockEnabled,
    });
  },

  setActiveTabId: (tabId) => {
    set({ activeTabId: tabId });
    get().pauseCarouselTemporarily();
  },

  // Used by the carousel itself, which must not trigger the pause meant for a person switching tabs
  rotateToTab: (tabId) => {
    set({ activeTabId: tabId });
  },

  addTab: async (
    name,
    icon,
    backgroundTheme = 'midnight_dots',
    customWallpaperUrl,
    backgroundDimLevel = 45,
    blueprintId
  ) => {
    const state = get();
    const activeTabs = state.tabs.filter((t) => !t.deleted_at);
    if (activeTabs.length >= MAX_CANVASES) {
      console.warn(`Canvas limit of ${MAX_CANVASES} reached.`);
      return null;
    }
    const nowMs = Date.now();
    const newId = `tab-${nowMs}`;
    const maxOrder = state.tabs.reduce(
      (max, t, idx) => Math.max(max, Number.isFinite(t.order) ? t.order : idx),
      -1
    );
    let materialized: Awaited<ReturnType<typeof import('../utils/canvasBlueprints')['materializeCanvasBlueprint']>> | null = null;
    if (blueprintId && blueprintId !== 'blank') {
      const { materializeCanvasBlueprint } = await import('../utils/canvasBlueprints');
      materialized = materializeCanvasBlueprint(blueprintId, {
        tabId: newId,
        existingWidgets: state.widgets,
        defaultWidgetStyle: state.settings.defaultWidgetStyle || 'auto',
        nowMs,
      });
    }

    const newTab: DashboardTab = {
      id: newId,
      name: name.trim() || 'New Canvas',
      icon: icon || 'Pin',
      order: maxOrder + 1,
      backgroundTheme,
      customWallpaperUrl: customWallpaperUrl?.trim() || undefined,
      backgroundDimLevel,
      hideNotes: Boolean(materialized?.tabUpdates.hideNotes),
      autoRotateDurationSec: 30,
      enabled: true,
      updated_at: new Date(nowMs).toISOString(),
    };
    await db.tabs.add(newTab);
    if (materialized && materialized.widgets.length > 0) {
      await db.widgets.bulkPut(materialized.widgets);
    }
    if (materialized && materialized.notes.length > 0) {
      await db.notes.bulkPut(materialized.notes);
    }
    set({
      tabs: [...get().tabs, newTab],
      widgets:
        materialized && materialized.widgets.length > 0
          ? [...get().widgets, ...materialized.widgets]
          : get().widgets,
      notes:
        materialized && materialized.notes.length > 0
          ? [...materialized.notes, ...get().notes]
          : get().notes,
      activeTabId: newId,
    });
    await markCanvasLooksChanged(get, set);
    get().saveLocalBackup({ tabs: true, widgets: true, notes: true, settings: true });
    return newId;
  },

  applyCanvasBlueprint: async (tabId, blueprintId) => {
    if (blueprintId === 'blank') return;
    const state = get();
    const targetTab = state.tabs.find((t) => t.id === tabId && !t.deleted_at);
    if (!targetTab) return;

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const { materializeCanvasBlueprint } = await import('../utils/canvasBlueprints');
    const materialized = materializeCanvasBlueprint(blueprintId, {
      tabId,
      existingWidgets: state.widgets,
      defaultWidgetStyle: state.settings.defaultWidgetStyle || 'auto',
      nowMs,
    });

    const tabUpdates: Partial<DashboardTab> = {};
    if (materialized.tabUpdates.hideNotes) {
      tabUpdates.hideNotes = true;
    }
    if (
      materialized.tabUpdates.backgroundTheme === 'oled_black' &&
      targetTab.backgroundTheme !== 'custom'
    ) {
      tabUpdates.backgroundTheme = 'oled_black';
    }
    const hasTabChanges = Object.keys(tabUpdates).length > 0;
    const updatedTab = hasTabChanges ? { ...targetTab, ...tabUpdates, updated_at: nowIso } : null;

    if (updatedTab) {
      await db.tabs.put(updatedTab);
    }
    if (materialized.widgets.length > 0) {
      await db.widgets.bulkPut(materialized.widgets);
    }
    if (materialized.notes.length > 0) {
      await db.notes.bulkPut(materialized.notes);
    }

    set({
      ...(updatedTab
        ? { tabs: get().tabs.map((t) => (t.id === tabId ? updatedTab : t)) }
        : {}),
      ...(materialized.widgets.length > 0
        ? { widgets: [...get().widgets, ...materialized.widgets] }
        : {}),
      ...(materialized.notes.length > 0
        ? { notes: [...materialized.notes, ...get().notes] }
        : {}),
    });

    if (hasTabChanges) {
      await markCanvasLooksChanged(get, set);
    }
    get().saveLocalBackup({
      tabs: true,
      widgets: true,
      notes: true,
      ...(hasTabChanges ? { settings: true } : {}),
    });
  },

  updateTab: async (tabId, updates) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const updated = {
      ...tab,
      ...updates,
      updated_at: nextMonotonicIso(tab.updated_at),
    };
    await db.tabs.put(updated).catch(() => {});
    set({
      tabs: get().tabs.map((t) => (t.id === tabId ? updated : t)),
    });
    const touchedLooks = CANVAS_LOOK_FIELDS.some((field) => field in updates);
    if (touchedLooks) {
      await markCanvasLooksChanged(get, set);
    }
    get().saveLocalBackup({ tabs: true, ...(touchedLooks ? { settings: true } : {}) });
  },

  setHomeTab: async (tabId) => {
    const currentTabs = get().tabs;
    const updatedTabs = currentTabs.map((t) => ({
      ...t,
      isHome: t.id === tabId,
      updated_at: nextMonotonicIso(t.updated_at),
    }));
    await db.tabs.bulkPut(updatedTabs).catch(() => {});
    set({ tabs: updatedTabs });
    await markCanvasLooksChanged(get, set);
    get().saveLocalBackup({ tabs: true, settings: true });
  },

  deleteTab: async (tabId) => {
    if (get().tabs.length <= 1) return;
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;

    const now = nextMonotonicIso(tab.updated_at);
    const updated = { ...tab, deleted_at: now, updated_at: now };
    await db.tabs.put(updated).catch(() => {});

    const vaultKeysToDeleteOnTabClose = get().widgets
      .filter((w) => w.tabId === tabId && (w.type === 'wifi_qr' || w.type === 'homelab'))
      .map((w) => (w.type === 'homelab' ? getHomelabVaultKey(w.id) : getWifiVaultKey(w.id)));
    if (vaultKeysToDeleteOnTabClose.length > 0) {
      await db.vault.bulkDelete(vaultKeysToDeleteOnTabClose).catch(() => {});
    }

    const remainingTabs = get().tabs.filter((t) => t.id !== tabId);
    let nextActiveTabId = get().activeTabId;
    if (get().activeTabId === tabId) {
      nextActiveTabId = remainingTabs[0]?.id || '';
    }

    let updatedRemainingTabs = remainingTabs;
    if (tab.isHome && remainingTabs.length > 0) {
      updatedRemainingTabs = remainingTabs.map((t, idx) =>
        idx === 0 ? { ...t, isHome: true, updated_at: nextMonotonicIso(t.updated_at) } : t
      );
      await db.tabs.bulkPut(updatedRemainingTabs).catch(() => {});
    }

    set({
      tabs: updatedRemainingTabs,
      activeTabId: nextActiveTabId,
      deletedTabTimestamps: {
        ...get().deletedTabTimestamps,
        [tabId]: now,
      },
    });
    if (tab.isHome) {
      await markCanvasLooksChanged(get, set);
    }
    get().saveLocalBackup({ tabs: true, ...(tab.isHome ? { settings: true } : {}) });
  },

  reorderTabs: async (orderedTabIds) => {
    const updatedTabs = get().tabs
      .map((t) => {
        const idx = orderedTabIds.indexOf(t.id);
        return idx !== -1 ? { ...t, order: idx, updated_at: new Date().toISOString() } : t;
      })
      .sort((a, b) => a.order - b.order);

    await db.tabs.bulkPut(updatedTabs);
    set({ tabs: updatedTabs });
    get().saveLocalBackup({ tabs: true });
  },

  setDockPosition: async (dockPosition) => {
    const updated = { ...get().settings, dockPosition, updated_at: new Date().toISOString() };
    await db.settings.put(updated);
    set({ settings: updated });
    get().saveLocalBackup({ settings: true });
  },

  setSnapToGrid: async (snapToGrid) => {
    const updated = { ...get().settings, snapToGrid, updated_at: new Date().toISOString() };
    await db.settings.put(updated);
    set({ settings: updated });
    get().saveLocalBackup({ settings: true });
  },

  toggleSnapToGrid: async () => {
    const current = Boolean(get().settings.snapToGrid);
    await get().setSnapToGrid(!current);
  },

  setDockHidden: async (isDockHidden) => {
    const updated = { ...get().settings, isDockHidden, updated_at: new Date().toISOString() };
    await db.settings.put(updated);
    set({ settings: updated });
    get().saveLocalBackup({ settings: true });
  },

  toggleDockHidden: async () => {
    const current = Boolean(get().settings.isDockHidden);
    await get().setDockHidden(!current);
  },

  setCommonPhotos: async (photos, sourceLabel, sourceUrl, sourceType, plexSyncConfig, curatedCategoryId) => {
    const prevSettings = get().settings;
    const updated = {
      ...prevSettings,
      commonPhotos: photos,
      commonPhotoSourceLabel: sourceLabel,
      commonPhotoSourceUrl: sourceType === 'web' ? (sourceUrl || '') : undefined,
      commonPhotoSourceType: sourceType,
      commonPhotoCuratedCategory:
        sourceType === 'curated'
          ? (curatedCategoryId || inferCuratedCategoryId(undefined, sourceLabel) || 'all')
          : sourceType
          ? undefined
          : prevSettings.commonPhotoCuratedCategory,
      commonPhotoPlexConfig:
        sourceType === 'plex'
          ? (plexSyncConfig ?? prevSettings.commonPhotoPlexConfig)
          : sourceType
          ? undefined
          : prevSettings.commonPhotoPlexConfig,
      updated_at: new Date().toISOString(),
    };
    await db.settings.put(updated);
    set({ settings: updated });
    get().saveLocalBackup({ settings: true });
  },

  applyCommonPhotosToAllWidgets: async (
    photos,
    sourceLabel,
    sourceUrl,
    sourceType,
    plexSyncConfig,
    curatedCategoryId,
    optInWidgetId
  ) => {
    await get().setCommonPhotos(photos, sourceLabel, sourceUrl, sourceType, plexSyncConfig, curatedCategoryId);
    const { widgets: updatedWidgets, changedWidgets } = applySharedPhotoUpdateToWidgets(
      get().widgets,
      optInWidgetId
    );
    if (changedWidgets.length > 0) {
      await db.widgets.bulkPut(changedWidgets);
      set({ widgets: updatedWidgets });
    }
    get().saveLocalBackup({ settings: true, widgets: true });
  },

  setPhotoSyncState: (photoSyncState) => {
    set({ photoSyncState });
  },

  setPhotoSyncMeta: (photoSyncMeta) => {
    set({ photoSyncMeta });
  },

  appendPhotosToTarget: async (targetWidgetId, incomingPhotos, sourceLabel, sourceUrl, sourceType, plexSyncConfig) => {
    if (!incomingPhotos || incomingPhotos.length === 0) return;

    if (!targetWidgetId) {
      // Common / Shared Photos
      const prevSettings = get().settings;
      const current = prevSettings.commonPhotos || [];
      const seenIds = new Set(current.map((p) => p.id));
      const fresh = incomingPhotos.filter((p) => !seenIds.has(p.id));
      if (fresh.length === 0) return;

      const resolvedSourceType = sourceType || prevSettings.commonPhotoSourceType;
      const combined = [...current, ...fresh];
      const updated = {
        ...prevSettings,
        commonPhotos: combined,
        commonPhotoSourceLabel: sourceLabel || prevSettings.commonPhotoSourceLabel,
        commonPhotoSourceUrl: sourceType === 'web' ? (sourceUrl || '') : undefined,
        commonPhotoSourceType: resolvedSourceType,
        commonPhotoCuratedCategory:
          resolvedSourceType === 'curated'
            ? prevSettings.commonPhotoCuratedCategory
            : sourceType
            ? undefined
            : prevSettings.commonPhotoCuratedCategory,
        commonPhotoPlexConfig:
          resolvedSourceType === 'plex'
            ? (plexSyncConfig ?? prevSettings.commonPhotoPlexConfig)
            : sourceType
            ? undefined
            : prevSettings.commonPhotoPlexConfig,
        updated_at: new Date().toISOString(),
      };
      await db.settings.put(updated);
      set({ settings: updated });
    } else {
      // Specific Widget
      const widget = get().widgets.find((w) => w.id === targetWidgetId);
      if (!widget) return;

      const current = (widget.config?.customPhotos as PhotoItem[]) || [];
      const seenIds = new Set(current.map((p) => p.id));
      const fresh = incomingPhotos.filter((p) => !seenIds.has(p.id));
      if (fresh.length === 0) return;

      const resolvedSourceType = sourceType || widget.config?.sourceType;
      const combined = [...current, ...fresh];
      const updatedWidget: DashboardWidget = {
        ...widget,
        config: {
          ...widget.config,
          customPhotos: combined,
          useCommonSource: false,
          sourceLabel: sourceLabel || widget.config?.sourceLabel,
          sourceType: resolvedSourceType,
          sourceUrl: sourceType === 'web' ? (sourceUrl || '') : undefined,
          curatedCategoryId:
            resolvedSourceType === 'curated'
              ? widget.config?.curatedCategoryId
              : sourceType
              ? undefined
              : widget.config?.curatedCategoryId,
          plexSyncConfig:
            resolvedSourceType === 'plex'
              ? (plexSyncConfig ?? widget.config?.plexSyncConfig)
              : sourceType
              ? undefined
              : widget.config?.plexSyncConfig,
        },
        updated_at: new Date().toISOString(),
      };
      await db.widgets.put(updatedWidget);
      set({
        widgets: get().widgets.map((w) => (w.id === targetWidgetId ? updatedWidget : w)),
      });
    }
    get().saveLocalBackup({ ...(targetWidgetId ? { widgets: true } : { settings: true }) });
  },

  finalizePhotosToTarget: async (targetWidgetId, allPhotos, sourceLabel, sourceUrl, sourceType, plexSyncConfig) => {
    if (!targetWidgetId) {
      await get().setCommonPhotos(allPhotos, sourceLabel, sourceUrl, sourceType, plexSyncConfig);
    } else {
      const widget = get().widgets.find((w) => w.id === targetWidgetId);
      if (widget) {
        const resolvedSourceType = sourceType || widget.config?.sourceType;
        const resolvedLabel = sourceLabel || widget.config?.sourceLabel;
        const updatedWidget: DashboardWidget = {
          ...widget,
          config: {
            ...widget.config,
            customPhotos: allPhotos,
            useCommonSource: false,
            sourceLabel: resolvedLabel,
            sourceType: resolvedSourceType,
            sourceUrl: sourceType === 'web' ? (sourceUrl || '') : undefined,
            curatedCategoryId:
              resolvedSourceType === 'curated'
                ? (inferCuratedCategoryId(widget.config?.curatedCategoryId, resolvedLabel) || 'all')
                : sourceType
                ? undefined
                : widget.config?.curatedCategoryId,
            plexSyncConfig:
              resolvedSourceType === 'plex'
                ? (plexSyncConfig ?? widget.config?.plexSyncConfig)
                : sourceType
                ? undefined
                : widget.config?.plexSyncConfig,
          },
          updated_at: new Date().toISOString(),
        };
        await db.widgets.put(updatedWidget);
        set({
          widgets: get().widgets.map((w) => (w.id === targetWidgetId ? updatedWidget : w)),
        });
        get().saveLocalBackup({ widgets: true });
      }
    }
  },

  toggleTabEnabled: async (tabId, enabled) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const updatedTab = { ...tab, enabled, updated_at: new Date().toISOString() };
    await db.tabs.put(updatedTab);
    const updatedTabs = get().tabs.map((t) => (t.id === tabId ? updatedTab : t));

    let nextActiveTabId = get().activeTabId;
    if (!enabled && get().activeTabId === tabId) {
      const firstEnabled = updatedTabs.find((t) =>
        t.id === 'tab-overview' ? Boolean(t.enabled) : t.enabled !== false
      );
      if (firstEnabled) {
        nextActiveTabId = firstEnabled.id;
      }
    }

    set({
      tabs: updatedTabs,
      activeTabId: nextActiveTabId,
    });
    get().saveLocalBackup({ tabs: true, settings: true });
  },

  setDisplayDensity: async (displayDensity) => {
    const updated = { ...get().settings, displayDensity, updated_at: new Date().toISOString() };
    await db.settings.put(updated);
    set({ settings: updated });
  },

  setCarouselEnabled: async (carouselEnabled) => {
    if (!carouselEnabled && carouselPauseTimerId) {
      clearTimeout(carouselPauseTimerId);
      carouselPauseTimerId = null;
    }
    const updated = { ...get().settings, carouselEnabled, updated_at: new Date().toISOString() };
    await db.settings.put(updated);
    set({ settings: updated, ...(!carouselEnabled && get().isCarouselPaused ? { isCarouselPaused: false } : {}) });
    get().saveLocalBackup({ settings: true });
  },

  setCarouselDuration: async (defaultRotateDurationSec) => {
    const updated = { ...get().settings, defaultRotateDurationSec, updated_at: new Date().toISOString() };
    await db.settings.put(updated);
    set({ settings: updated });
    get().saveLocalBackup({ settings: true });
  },

  pauseCarouselTemporarily: (durationMs = 20000) => {
    if (carouselPauseTimerId) {
      clearTimeout(carouselPauseTimerId);
      carouselPauseTimerId = null;
    }
    const currentTimer = get().carouselPauseTimer;
    if (currentTimer) clearTimeout(currentTimer);

    // The carousel effect starts a fresh `rotateDurationSec` interval once `isCarouselPaused`
    // clears, so only hold `isCarouselPaused` for the difference needed to guarantee at least
    // `durationMs` (and at least 50ms to reset the active interval timer) rather than stacking
    // 20s + rotateDurationSec on every tap.
    const rotateMs = (get().settings.defaultRotateDurationSec || 30) * 1000;
    const holdMs = Math.max(50, durationMs - rotateMs);

    carouselPauseTimerId = setTimeout(() => {
      carouselPauseTimerId = null;
      if (get().isCarouselPaused) {
        set({ isCarouselPaused: false });
      }
    }, holdMs);

    // Avoid emitting redundant Zustand store notifications when already paused
    if (!get().isCarouselPaused) {
      set({ isCarouselPaused: true });
    }
  },

  toggleNightModeManual: () => {
    const current = get().settings;
    set({
      settings: { ...current, nightModeEnabled: !current.nightModeEnabled },
    });
  },

  updateSettings: async (updates) => {
    const updated: AppSettings = {
      ...get().settings,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    await db.settings.put(updated);
    set({ settings: updated });
    if (updates.weekStartsOn === 'monday' || updates.weekStartsOn === 'sunday') {
      void useChoreStore.getState().updateHouseholdSettings({
        weekStartsOn: updates.weekStartsOn,
      });
    }
    get().saveLocalBackup({ settings: true });
  },

  setPinLock: async (pin) => {
    let pinHash: string | null = null;
    let pinLockEnabled = false;
    if (pin && pin.length >= 4) {
      pinHash = await hashPin(pin);
      pinLockEnabled = true;
    }
    const current = get().settings;
    let hasBoundCloudBoard = false;
    try {
      hasBoundCloudBoard =
        typeof localStorage !== 'undefined' && Boolean(localStorage.getItem('ambiently_local_board'));
    } catch {
      hasBoundCloudBoard = false;
    }
    const updated = {
      ...current,
      ...applyPinLockTransition(current, pinHash),
      updated_at: hasBoundCloudBoard ? new Date().toISOString() : current.updated_at,
    };
    await db.settings.put(updated);
    set({ settings: updated, isUnlocked: !pinLockEnabled });
    get().saveLocalBackup({ settings: true });
  },

  unlockKiosk: async (enteredPin) => {
    const { settings } = get();
    if (!settings.pinLockEnabled || !settings.pinHash) {
      set({ isUnlocked: true });
      return true;
    }
    if (!enteredPin) return false;
    const hash = await hashPin(enteredPin);
    if (hash === settings.pinHash) {
      set({ isUnlocked: true });
      return true;
    }
    return false;
  },

  lockKiosk: () => {
    if (get().settings.pinLockEnabled) {
      set({ isUnlocked: false });
    }
  },

  saveLocalBackup: async (scope) => {
    scheduleCloudAutoPush(get, scope);
    if (!hasActiveLocalFile()) return;
    if (backupDebounceTimer) {
      clearTimeout(backupDebounceTimer);
    }
    backupDebounceTimer = setTimeout(async () => {
      const state = get();
      await saveSnapshotToFile({
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: state.settings,
        tabs: state.tabs,
        widgets: state.widgets,
        notes: state.notes,
        profiles: useProfileStore.getState().profiles,
        chores: useChoreStore.getState().snapshot,
        meals: useMealStore.getState().snapshot,
        kanban: useKanbanStore.getState().snapshot,
        routines: useRoutinesStore.getState().snapshot,
      });
    }, 400);
  },

  saveLocalBackupImmediate: async (scope) => {
    scheduleCloudAutoPush(get, scope);
    if (!hasActiveLocalFile()) return;
    if (backupDebounceTimer) {
      clearTimeout(backupDebounceTimer);
      backupDebounceTimer = null;
    }
    const state = get();
    await saveSnapshotToFile({
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: state.settings,
      tabs: state.tabs,
      widgets: state.widgets,
      notes: state.notes,
      profiles: useProfileStore.getState().profiles,
      chores: useChoreStore.getState().snapshot,
      meals: useMealStore.getState().snapshot,
      kanban: useKanbanStore.getState().snapshot,
      routines: useRoutinesStore.getState().snapshot,
    });
  },

  autoOrganizeCanvas: async (tabId, mode = 'bento') => {
    const state = get();
    const targetTab = state.tabs.find((t) => t.id === tabId);
    const tabWidgets = state.widgets.filter((w) => w.tabId === tabId);
    const tabNotes = targetTab?.hideNotes
      ? []
      : state.notes.filter(
          (n) => (n.tabId || 'tab-corkboard') === tabId || n.tabId === 'all'
        );

    if (tabWidgets.length === 0 && tabNotes.length === 0) return;

    // Save snapshot for 1-click Undo if we haven't already saved one for this tab
    const prevWidgetPositions: Record<string, FreeformPosition> = {};
    for (const w of tabWidgets) {
      if (w.freeformPos) prevWidgetPositions[w.id] = { ...w.freeformPos };
    }
    const prevNotePositions: Record<string, FreeformPosition> = {};
    for (const n of tabNotes) {
      if (n.freeformPos) prevNotePositions[n.id] = { ...n.freeformPos };
    }

    const { widgetPositions, notePositions } = computeNonOverlappingLayout(
      tabWidgets,
      tabNotes,
      mode
    );

    const nowMs = Date.now();
    const updatedWidgets: DashboardWidget[] = [];
    const nextWidgets = state.widgets.map((w) => {
      const nextPos = widgetPositions[w.id];
      if (!nextPos) return w;
      const updated = { ...w, freeformPos: nextPos, updated_at: nextMonotonicIso(w.updated_at, nowMs) };
      updatedWidgets.push(updated);
      return updated;
    });

    const updatedNotes: StickyNoteItem[] = [];
    const nextNotes = state.notes.map((n) => {
      const nextPos = notePositions[n.id];
      if (!nextPos) return n;
      const updated = {
        ...n,
        freeformPos: buildNoteFreeformPos(n, nextPos),
        updated_at: nextMonotonicIso(n.updated_at, nowMs),
      };
      updatedNotes.push(updated);
      return updated;
    });

    if (updatedWidgets.length > 0) await db.widgets.bulkPut(updatedWidgets).catch(() => {});
    if (updatedNotes.length > 0) await db.notes.bulkPut(updatedNotes).catch(() => {});

    const autoEntry: LayoutHistoryEntry = {
      id: `undo-${nowMs}-auto`,
      tabId,
      label: 'Auto-organized canvas',
      createdAtMs: nowMs,
      widgetPositions: prevWidgetPositions,
      notePositions: prevNotePositions,
    };
    const nextStack = appendLayoutHistoryEntry(get().layoutUndoStack, autoEntry);

    set({
      widgets: nextWidgets,
      notes: nextNotes,
      layoutUndoStack: nextStack,
      lastLayoutSnapshot: autoEntry,
      layoutUndoToast: {
        entryId: autoEntry.id,
        tabId,
        label: autoEntry.label,
        nonce: nowMs,
      },
      movedWidgetToast: null,
    });
    get().saveLocalBackup({ widgets: true, notes: true });
  },

  undoAutoOrganize: async () => {
    await get().undoLayoutChange(get().activeTabId);
  },

  dismissLayoutUndoToast: () => set({ layoutUndoToast: null }),

  undoLayoutChange: async (tabId) => {
    const state = get();
    const visibleTabs = state.tabs.filter((t) =>
      t.id === 'tab-overview' ? Boolean(t.enabled) : t.enabled !== false
    );
    const homeTab = visibleTabs.find((t) => t.isHome) || visibleTabs[0] || state.tabs[0];
    const resolvedActiveTabId =
      (visibleTabs.find((t) => t.id === state.activeTabId) || homeTab)?.id || 'tab-corkboard';
    const targetTabId = tabId || resolvedActiveTabId;
    const workingStack = [...state.layoutUndoStack];
    const nowMs = Date.now();

    while (workingStack.length > 0) {
      let matchIdx = -1;
      for (let i = workingStack.length - 1; i >= 0; i -= 1) {
        if (workingStack[i].tabId === targetTabId) {
          matchIdx = i;
          break;
        }
      }
      if (matchIdx === -1) break;

      const [entry] = workingStack.splice(matchIdx, 1);
      const updatedWidgets: DashboardWidget[] = [];
      const nextWidgets = state.widgets.map((w) => {
        if (w.deleted_at) return w;
        const prevPos = entry.widgetPositions[w.id];
        if (!prevPos) return w;
        const updated: DashboardWidget = {
          ...w,
          freeformPos: { ...prevPos },
          updated_at: nextMonotonicIso(w.updated_at, nowMs),
        };
        updatedWidgets.push(updated);
        return updated;
      });

      const updatedNotes: StickyNoteItem[] = [];
      const nextNotes = state.notes.map((n) => {
        if (n.deleted_at) return n;
        const prevPos = entry.notePositions[n.id];
        if (!prevPos) return n;
        const updated: StickyNoteItem = {
          ...n,
          freeformPos: buildNoteFreeformPos(n, prevPos),
          updated_at: nextMonotonicIso(n.updated_at, nowMs),
        };
        updatedNotes.push(updated);
        return updated;
      });

      if (updatedWidgets.length === 0 && updatedNotes.length === 0) {
        continue;
      }

      if (updatedWidgets.length > 0) await db.widgets.bulkPut(updatedWidgets).catch(() => {});
      if (updatedNotes.length > 0) await db.notes.bulkPut(updatedNotes).catch(() => {});

      const nextLastSnapshot =
        [...workingStack].reverse().find((item) => item.tabId === targetTabId) || null;
      set({
        widgets: nextWidgets,
        notes: nextNotes,
        layoutUndoStack: workingStack,
        lastLayoutSnapshot: nextLastSnapshot,
        layoutUndoToast: null,
      });
      get().saveLocalBackup({ widgets: true, notes: true });
      return true;
    }

    if (workingStack.length !== state.layoutUndoStack.length) {
      set({
        layoutUndoStack: workingStack,
        lastLayoutSnapshot:
          [...workingStack].reverse().find((item) => item.tabId === targetTabId) || null,
        layoutUndoToast: null,
      });
    }
    return false;
  },

  addNote: async (newNote) => {
    const state = get();
    const targetTabId = newNote.tabId || state.activeTabId;
    const existingBoxes = getExistingBoxesForTab(targetTabId, state.widgets, state.notes);
    const defaultPos = findOpenCanvasSpot(
      existingBoxes,
      0.24,
      0.28,
      Math.floor(Math.random() * 5) - 2
    );

    const noteId = newNote.id || `note-${Date.now()}`;
    const isShoppingList = Boolean(newNote.isShoppingList || newNote.freeformPos?.isShoppingList);
    const resolvedPos = buildNoteFreeformPos(
      {
        freeformPos: newNote.freeformPos || defaultPos,
        isShoppingList,
        isPinnedToCanvas: newNote.isPinnedToCanvas,
        textColor: newNote.textColor,
        deleted_at: newNote.deleted_at,
      },
      newNote.freeformPos || defaultPos
    );

    const note: StickyNoteItem = {
      id: noteId,
      tabId: targetTabId,
      widgetId: newNote.widgetId,
      title: newNote.title,
      content: newNote.content || '',
      isChecklist: Boolean(newNote.isChecklist || isShoppingList),
      isShoppingList,
      checklistItems: newNote.checklistItems,
      bgColor: newNote.bgColor || '#fef08a',
      ...(newNote.textColor ? { textColor: newNote.textColor } : {}),
      fontSize: newNote.fontSize || 'base',
      expiresAt: newNote.expiresAt,
      ...(typeof newNote.isPinnedToCanvas === 'boolean'
        ? { isPinnedToCanvas: newNote.isPinnedToCanvas }
        : {}),
      freeformPos: resolvedPos,
      updated_at: nextMonotonicIso(state.deletedNoteTimestamps[noteId]),
    };
    const nextDeletedNoteTimestamps = { ...get().deletedNoteTimestamps };
    delete nextDeletedNoteTimestamps[noteId];
    await db.notes.put(note).catch(() => {});
    set({ notes: [note, ...get().notes], deletedNoteTimestamps: nextDeletedNoteTimestamps });
    get().saveLocalBackup({ notes: true });
  },

  updateNote: async (noteId, updates) => {
    const existing = get().notes.find((n) => n.id === noteId);
    if (!existing) return;
    const isShoppingList =
      updates.isShoppingList !== undefined
        ? Boolean(updates.isShoppingList)
        : Boolean(existing.isShoppingList || existing.freeformPos?.isShoppingList);
    const resolvedPinned =
      updates.isPinnedToCanvas !== undefined ? updates.isPinnedToCanvas : existing.isPinnedToCanvas;
    const resolvedTextColor =
      updates.textColor !== undefined ? updates.textColor : existing.textColor;
    const basePos = updates.freeformPos || existing.freeformPos;
    const updatedPos = basePos
      ? buildNoteFreeformPos(
          {
            freeformPos: basePos,
            isShoppingList,
            isPinnedToCanvas: resolvedPinned,
            textColor: resolvedTextColor,
            deleted_at: updates.deleted_at ?? existing.deleted_at,
          },
          basePos
        )
      : undefined;
    const updated: StickyNoteItem = {
      ...existing,
      ...updates,
      isShoppingList,
      ...(isShoppingList ? { isChecklist: true } : {}),
      ...(updatedPos ? { freeformPos: updatedPos } : {}),
      updated_at: nextMonotonicIso(existing.updated_at),
    };
    const nextDeletedNoteTimestamps = { ...get().deletedNoteTimestamps };
    delete nextDeletedNoteTimestamps[noteId];
    await db.notes.put(updated).catch(() => {});
    set({
      notes: get().notes.map((n) => (n.id === noteId ? updated : n)),
      deletedNoteTimestamps: nextDeletedNoteTimestamps,
    });
    get().saveLocalBackup({ notes: true });
  },

  syncRemoteNoteChange: (incomingNote, eventType) => {
    const state = get();
    const existing = state.notes.find((n) => n.id === incomingNote.id);
    const tombstoneIso = state.deletedNoteTimestamps[incomingNote.id];
    const hasLocalRow = Boolean(existing || tombstoneIso);
    const localTime = existing
      ? Date.parse(existing.updated_at || '') || 0
      : Date.parse(tombstoneIso || '') || 0;
    const localDeletedOrArchived = Boolean(
      tombstoneIso || existing?.deleted_at || existing?.archivedAt
    );

    const remoteNote = keepLocalNoteFields(incomingNote, existing);
    const remoteTime = Date.parse(remoteNote.updated_at || '') || 0;
    const remoteDeletedOrArchived = Boolean(
      eventType === 'DELETE' || remoteNote.deleted_at || remoteNote.archivedAt
    );

    if (
      !shouldApplyRealtimeRow({
        hasLocalRow,
        localTime,
        remoteTime,
        localDeletedOrArchived,
        remoteDeletedOrArchived,
      })
    ) {
      return;
    }

    if (eventType === 'DELETE' || remoteNote.deleted_at) {
      const recordedTombstone = resolveTombstoneIso(remoteNote.updated_at, remoteNote.deleted_at);
      set({
        notes: get().notes.filter((n) => n.id !== remoteNote.id),
        deletedNoteTimestamps: {
          ...get().deletedNoteTimestamps,
          [remoteNote.id]: recordedTombstone,
        },
      });
      if (remoteNote.deleted_at) {
        db.notes.put(remoteNote).catch(() => {});
      } else {
        db.notes.delete(remoteNote.id).catch(() => {});
      }
    } else if (eventType === 'INSERT' || eventType === 'UPDATE') {
      const nextDeletedTimestamps = { ...get().deletedNoteTimestamps };
      delete nextDeletedTimestamps[remoteNote.id];
      const exists = get().notes.some((n) => n.id === remoteNote.id);
      set({
        notes: exists
          ? get().notes.map((n) => (n.id === remoteNote.id ? remoteNote : n))
          : [remoteNote, ...get().notes],
        deletedNoteTimestamps: nextDeletedTimestamps,
      });
      db.notes.put(remoteNote).catch(() => {});
    }
  },

  syncRemoteWidgetChange: (incomingWidget, eventType) => {
    if (incomingWidget.id === HOUSEHOLD_PROFILES_CLOUD_ROW_ID) {
      if (
        eventType !== 'DELETE' &&
        !incomingWidget.deleted_at &&
        Array.isArray(incomingWidget.config?.profiles)
      ) {
        useProfileStore
          .getState()
          .applyRemoteProfiles(incomingWidget.config.profiles as HouseholdProfile[])
          .catch(() => {});
      }
      return;
    }

    if (incomingWidget.id === CHORE_ENGINE_CLOUD_ROW_ID) {
      if (
        eventType !== 'DELETE' &&
        !incomingWidget.deleted_at &&
        incomingWidget.config?.id === 'household_chores'
      ) {
        useChoreStore
          .getState()
          .applyRemoteSnapshot(incomingWidget.config as ChoreEngineSnapshot)
          .catch(() => {});
      }
      return;
    }

    if (incomingWidget.id === MEAL_PLANNER_CLOUD_ROW_ID) {
      if (
        eventType !== 'DELETE' &&
        !incomingWidget.deleted_at &&
        incomingWidget.config?.id === 'household_meals'
      ) {
        useMealStore
          .getState()
          .applyRemoteMealSnapshot(incomingWidget.config as MealPlannerSnapshot)
          .catch(() => {});
      }
      return;
    }

    if (incomingWidget.id === KANBAN_ENGINE_CLOUD_ROW_ID) {
      if (
        eventType !== 'DELETE' &&
        !incomingWidget.deleted_at &&
        incomingWidget.config?.id === 'household_kanban'
      ) {
        useKanbanStore
          .getState()
          .applyRemoteKanbanSnapshot(incomingWidget.config as KanbanEngineSnapshot)
          .catch(() => {});
      }
      return;
    }

    if (incomingWidget.id === ROUTINES_CLOUD_ROW_ID) {
      if (
        eventType !== 'DELETE' &&
        !incomingWidget.deleted_at &&
        incomingWidget.config?.id === 'household_routines'
      ) {
        useRoutinesStore
          .getState()
          .applyRemoteRoutinesSnapshot(incomingWidget.config as RoutinesSnapshot)
          .catch(() => {});
      }
      return;
    }

    const state = get();
    const existing =
      state.widgets.find((w) => w.id === incomingWidget.id) ||
      state.deletedWidgets.find((w) => w.id === incomingWidget.id);
    const tombstoneIso = state.deletedWidgetTimestamps[incomingWidget.id];
    const hasLocalRow = Boolean(existing || tombstoneIso);
    const localTime = existing
      ? Date.parse(existing.updated_at || '') || 0
      : Date.parse(tombstoneIso || '') || 0;
    const localDeleted = Boolean(tombstoneIso || existing?.deleted_at);

    const remoteWidget = keepLocalWidgetFields(incomingWidget, existing);
    const remoteTime = Date.parse(remoteWidget.updated_at || '') || 0;
    const remoteDeleted = Boolean(eventType === 'DELETE' || remoteWidget.deleted_at);

    if (
      !shouldApplyRealtimeRow({
        hasLocalRow,
        localTime,
        remoteTime,
        localDeletedOrArchived: localDeleted,
        remoteDeletedOrArchived: remoteDeleted,
      })
    ) {
      return;
    }

    if (eventType === 'DELETE' || remoteWidget.deleted_at) {
      if (existing?.type === 'wifi_qr' || remoteWidget.type === 'wifi_qr') {
        db.vault.delete(getWifiVaultKey(remoteWidget.id)).catch(() => {});
      }
      if (existing?.type === 'homelab' || remoteWidget.type === 'homelab') {
        db.vault.delete(getHomelabVaultKey(remoteWidget.id)).catch(() => {});
      }
      const recordedTombstone = resolveTombstoneIso(remoteWidget.updated_at, remoteWidget.deleted_at);
      const purged = eventType === 'DELETE' || isPermanentlyPurgedWidget(remoteWidget);
      const nextDeletedWidgets = purged
        ? get().deletedWidgets.filter((w) => w.id !== remoteWidget.id)
        : sortDeletedWidgetsNewestFirst([
            remoteWidget,
            ...get().deletedWidgets.filter((w) => w.id !== remoteWidget.id),
          ]);
      set({
        widgets: get().widgets.filter((w) => w.id !== remoteWidget.id),
        deletedWidgets: nextDeletedWidgets,
        deletedWidgetTimestamps: {
          ...get().deletedWidgetTimestamps,
          [remoteWidget.id]: recordedTombstone,
        },
      });
      if (remoteWidget.deleted_at) {
        db.widgets.put(remoteWidget).catch(() => {});
      } else {
        db.widgets.delete(remoteWidget.id).catch(() => {});
      }
    } else if (eventType === 'INSERT' || eventType === 'UPDATE') {
      const nextDeletedTimestamps = { ...get().deletedWidgetTimestamps };
      delete nextDeletedTimestamps[remoteWidget.id];
      const exists = get().widgets.some((w) => w.id === remoteWidget.id);
      set({
        widgets: exists
          ? get().widgets.map((w) => (w.id === remoteWidget.id ? remoteWidget : w))
          : [...get().widgets, remoteWidget],
        deletedWidgets: get().deletedWidgets.filter((w) => w.id !== remoteWidget.id),
        deletedWidgetTimestamps: nextDeletedTimestamps,
      });
      db.widgets.put(remoteWidget).catch(() => {});
    }
  },

  syncRemoteTabChange: (incomingTab, eventType) => {
    const state = get();
    const existing = state.tabs.find((t) => t.id === incomingTab.id);
    const tombstoneIso = state.deletedTabTimestamps[incomingTab.id];
    const hasLocalRow = Boolean(existing || tombstoneIso);
    const localTime = existing
      ? Date.parse(existing.updated_at || '') || 0
      : Date.parse(tombstoneIso || '') || 0;
    const localDeleted = Boolean(tombstoneIso || existing?.deleted_at);

    const mergedTab = keepLocalTabFields(incomingTab, existing);
    const remoteTab: DashboardTab = {
      ...mergedTab,
      order: Number.isFinite(mergedTab.order)
        ? mergedTab.order
        : existing && Number.isFinite(existing.order)
          ? existing.order
          : state.tabs.length,
      enabled:
        mergedTab.id === 'tab-overview' ? Boolean(mergedTab.enabled) : mergedTab.enabled !== false,
    };
    const remoteTime = Date.parse(remoteTab.updated_at || '') || 0;
    const remoteDeleted = Boolean(eventType === 'DELETE' || remoteTab.deleted_at);

    if (
      !shouldApplyRealtimeRow({
        hasLocalRow,
        localTime,
        remoteTime,
        localDeletedOrArchived: localDeleted,
        remoteDeletedOrArchived: remoteDeleted,
      })
    ) {
      return;
    }

    if (eventType === 'DELETE' || remoteTab.deleted_at) {
      const recordedTombstone = resolveTombstoneIso(remoteTab.updated_at, remoteTab.deleted_at);
      const remaining = get().tabs.filter((t) => t.id !== remoteTab.id);
      const nextActiveTabId =
        get().activeTabId === remoteTab.id ? remaining[0]?.id || 'tab-corkboard' : get().activeTabId;
      set({
        tabs: remaining,
        activeTabId: nextActiveTabId,
        deletedTabTimestamps: {
          ...get().deletedTabTimestamps,
          [remoteTab.id]: recordedTombstone,
        },
      });
      if (remoteTab.deleted_at) {
        db.tabs.put(remoteTab).catch(() => {});
      } else {
        db.tabs.delete(remoteTab.id).catch(() => {});
      }
    } else if (eventType === 'INSERT' || eventType === 'UPDATE') {
      const nextDeletedTimestamps = { ...get().deletedTabTimestamps };
      delete nextDeletedTimestamps[remoteTab.id];
      const exists = get().tabs.some((t) => t.id === remoteTab.id);
      const nextTabs = exists
        ? get().tabs.map((t) => (t.id === remoteTab.id ? remoteTab : t))
        : [...get().tabs, remoteTab];
      nextTabs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      set({ tabs: nextTabs, deletedTabTimestamps: nextDeletedTimestamps });
      db.tabs.put(remoteTab).catch(() => {});
    }
  },

  deleteNote: async (noteId) => {
    const existing = get().notes.find((n) => n.id === noteId);
    if (!existing) return;
    const nowIso = nextMonotonicIso(existing.updated_at);
    const updated: StickyNoteItem = {
      ...existing,
      archivedAt: nowIso,
      updated_at: nowIso,
    };
    await db.notes.put(updated).catch(() => {});
    set({
      notes: get().notes.map((n) => (n.id === noteId ? updated : n)),
    });
    get().saveLocalBackup({ notes: true });
  },

  permanentlyDeleteNote: async (noteId) => {
    const existing = get().notes.find((n) => n.id === noteId);
    if (!existing) return;
    const nowIso = nextMonotonicIso(existing.updated_at);
    const updated: StickyNoteItem = {
      ...existing,
      deleted_at: nowIso,
      updated_at: nowIso,
    };
    await db.notes.put(updated).catch(() => {});
    set({
      notes: get().notes.filter((n) => n.id !== noteId),
      deletedNoteTimestamps: {
        ...get().deletedNoteTimestamps,
        [noteId]: nowIso,
      },
    });
    get().saveLocalBackup({ notes: true });
  },

  permanentlyDeleteNotes: async (noteIds) => {
    if (!noteIds || noteIds.length === 0) return;
    const idSet = new Set(noteIds);
    const baseNowMs = Date.now();
    const tombstones: StickyNoteItem[] = [];
    const nextDeletedNoteTimestamps = { ...get().deletedNoteTimestamps };
    for (const n of get().notes) {
      if (idSet.has(n.id)) {
        const nowIso = nextMonotonicIso(n.updated_at, baseNowMs);
        nextDeletedNoteTimestamps[n.id] = nowIso;
        tombstones.push({
          ...n,
          deleted_at: nowIso,
          updated_at: nowIso,
        });
      }
    }
    if (tombstones.length === 0) return;
    await db.notes.bulkPut(tombstones).catch(() => {});
    set({
      notes: get().notes.filter((n) => !idSet.has(n.id)),
      deletedNoteTimestamps: nextDeletedNoteTimestamps,
    });
    get().saveLocalBackup({ notes: true });
  },

  addWidget: async (partialWidget) => {
    const state = get();
    const id = partialWidget.id || 'widget-' + Date.now();
    const targetTabId = partialWidget.tabId || state.activeTabId;
    const targetW = partialWidget.freeformPos?.wRatio || 0.35;
    const targetH = partialWidget.freeformPos?.hRatio || 0.45;
    const existingBoxes = getExistingBoxesForTab(targetTabId, state.widgets, state.notes);
    const openPos = findOpenCanvasSpot(existingBoxes, targetW, targetH, 0);

    const widgetType = partialWidget.type || 'weather';
    const resolvedConfig: Record<string, any> = { ...(partialWidget.config || {}) };
    if (isStickerCapableWidget(widgetType) && typeof resolvedConfig.transparentBg !== 'boolean') {
      const defaultSticker = getDefaultWidgetStickerMode(
        widgetType,
        state.settings.defaultWidgetStyle || 'auto'
      );
      resolvedConfig.transparentBg = defaultSticker;
      if (widgetType === 'textbox' && !resolvedConfig.bgStyle) {
        resolvedConfig.bgStyle = defaultSticker ? 'transparent' : 'glass';
      }
    }

    const newWidget: DashboardWidget = {
      id,
      tabId: targetTabId,
      type: widgetType,
      title: partialWidget.title || 'Widget',
      gridPos: partialWidget.gridPos || { x: 0, y: 0, w: 4, h: 4 },
      freeformPos: partialWidget.freeformPos
        ? {
            ...openPos,
            ...partialWidget.freeformPos,
          }
        : openPos,
      config: resolvedConfig,
      updated_at: nextMonotonicIso(state.deletedWidgetTimestamps[id]),
    };
    const nextDeletedWidgetTimestamps = { ...get().deletedWidgetTimestamps };
    delete nextDeletedWidgetTimestamps[id];
    await db.widgets.put(newWidget).catch(() => {});
    set({
      widgets: [...get().widgets, newWidget],
      deletedWidgetTimestamps: nextDeletedWidgetTimestamps,
    });
    get().saveLocalBackup({ widgets: true });
  },

  removeWidget: async (widgetId) => {
    const existing = get().widgets.find((w) => w.id === widgetId);
    if (!existing) return;
    if (existing.type === 'wifi_qr') {
      await db.vault.delete(getWifiVaultKey(widgetId)).catch(() => {});
    }
    if (existing.type === 'homelab') {
      await db.vault.delete(getHomelabVaultKey(widgetId)).catch(() => {});
    }
    const nowIso = nextMonotonicIso(existing.updated_at);
    const updated: DashboardWidget = {
      ...existing,
      permanentlyDeleted: false,
      deleted_at: nowIso,
      updated_at: nowIso,
    };
    await db.widgets.put(updated).catch(() => {});
    set({
      widgets: get().widgets.filter((w) => w.id !== widgetId),
      deletedWidgets: [updated, ...get().deletedWidgets.filter((w) => w.id !== widgetId)],
      deletedWidgetTimestamps: {
        ...get().deletedWidgetTimestamps,
        [widgetId]: nowIso,
      },
    });
    get().saveLocalBackup({ widgets: true });
  },

  restoreWidget: async (widgetId, targetTabId) => {
    const state = get();
    const memoryMatch = state.deletedWidgets.find(
      (w) => w.id === widgetId && !isPermanentlyPurgedWidget(w)
    );
    const dbMatch =
      memoryMatch || typeof indexedDB === 'undefined'
        ? undefined
        : await db.widgets.get(widgetId).catch(() => undefined);
    const existing =
      memoryMatch ||
      (dbMatch && dbMatch.deleted_at && !isPermanentlyPurgedWidget(dbMatch) ? dbMatch : undefined);
    if (!existing) return false;

    const activeTabs = state.tabs.filter((t) => !t.deleted_at);
    const preferredTabId = targetTabId || existing.tabId;
    const resolvedTab =
      activeTabs.find((t) => t.id === preferredTabId) ||
      activeTabs.find((t) => t.id === state.activeTabId) ||
      activeTabs[0];
    if (!resolvedTab) return false;

    const nowMs = Date.now();
    const { freeformPos, configPatch } = computePlacementForTab(
      state,
      existing,
      resolvedTab.id,
      existing.freeformPos
    );

    const cleanConfig: Record<string, any> = { ...(existing.config || {}) };
    delete cleanConfig.__purged;

    const restoredRaw: DashboardWidget = {
      ...existing,
      tabId: resolvedTab.id,
      deleted_at: null,
      permanentlyDeleted: false,
      freeformPos,
      config: {
        ...cleanConfig,
        ...(configPatch || {}),
      },
      updated_at: nextMonotonicIso(
        resolveTombstoneIso(existing.updated_at, existing.deleted_at),
        nowMs
      ),
    };
    const restored = sanitizeRestoredPhotoWidget(restoredRaw).widget;

    await db.widgets.put(restored).catch(() => {});

    const latest = get();
    const nextDeletedTimestamps = { ...latest.deletedWidgetTimestamps };
    delete nextDeletedTimestamps[widgetId];

    set({
      widgets: [...latest.widgets.filter((w) => w.id !== widgetId), restored],
      deletedWidgets: latest.deletedWidgets.filter((w) => w.id !== widgetId),
      deletedWidgetTimestamps: nextDeletedTimestamps,
      ...(resolvedTab.id !== latest.activeTabId
        ? {
            movedWidgetToast: {
              widgetId: restored.id,
              widgetTitle: restored.title || 'Widget',
              targetTabId: resolvedTab.id,
              targetTabName: resolvedTab.name,
              nonce: nowMs,
            },
            layoutUndoToast: null,
          }
        : {}),
    });
    void get().saveLocalBackup({ widgets: true });
    return true;
  },

  permanentlyDeleteWidget: async (widgetId) => {
    await get().permanentlyDeleteWidgets([widgetId]);
  },

  permanentlyDeleteWidgets: async (widgetIds) => {
    if (!widgetIds || widgetIds.length === 0) return;
    const state = get();
    const idSet = new Set(widgetIds);
    const matchedById = new Map<string, DashboardWidget>();
    for (const w of [
      ...state.deletedWidgets.filter((item) => idSet.has(item.id)),
      ...state.widgets.filter((item) => idSet.has(item.id)),
    ]) {
      matchedById.set(w.id, w);
    }

    const missingIds = [...idSet].filter((id) => !matchedById.has(id));
    if (missingIds.length > 0 && typeof indexedDB !== 'undefined') {
      const dbRows = await db.widgets.bulkGet(missingIds).catch(() => []);
      for (const row of dbRows) {
        if (row && !isPermanentlyPurgedWidget(row)) {
          matchedById.set(row.id, row);
        }
      }
    }

    const targets = [...matchedById.values()];
    if (targets.length === 0) return;

    const remainingMediaKeys = new Set<string>();
    for (const w of [...state.widgets, ...state.deletedWidgets]) {
      if (idSet.has(w.id) || isPermanentlyPurgedWidget(w)) continue;
      const key = parseVaultMediaKey(w.config?.url);
      if (key) remainingMediaKeys.add(key);
    }

    const vaultKeysToDelete = new Set<string>();
    const baseNowMs = Date.now();
    const purgedRows: DashboardWidget[] = [];
    const nextDeletedTimestamps = { ...state.deletedWidgetTimestamps };

    for (const w of targets) {
      if (w.type === 'wifi_qr') {
        vaultKeysToDelete.add(getWifiVaultKey(w.id));
      }
      if (w.type === 'homelab') {
        vaultKeysToDelete.add(getHomelabVaultKey(w.id));
      }
      const mediaKey = parseVaultMediaKey(w.config?.url);
      if (mediaKey && !remainingMediaKeys.has(mediaKey)) {
        vaultKeysToDelete.add(mediaKey);
      }

      const nowIso = nextMonotonicIso(
        resolveTombstoneIso(w.updated_at, w.deleted_at),
        baseNowMs
      );
      nextDeletedTimestamps[w.id] = nowIso;
      purgedRows.push({
        ...w,
        config: { __purged: true },
        freeformPos: { xRatio: 0, yRatio: 0, wRatio: 0.3, hRatio: 0.3, zIndex: 1, rotation: 0 },
        permanentlyDeleted: true,
        deleted_at: w.deleted_at || nowIso,
        updated_at: nowIso,
      });
    }

    if (vaultKeysToDelete.size > 0 && typeof indexedDB !== 'undefined') {
      await db.vault.bulkDelete([...vaultKeysToDelete]).catch(() => {});
    }
    await db.widgets.bulkPut(purgedRows).catch(() => {});

    const latest = get();
    set({
      widgets: latest.widgets.filter((w) => !idSet.has(w.id)),
      deletedWidgets: latest.deletedWidgets.filter((w) => !idSet.has(w.id)),
      deletedWidgetTimestamps: nextDeletedTimestamps,
    });
    get().saveLocalBackup({ widgets: true });
  },

  updateWidget: async (widgetId, updates) => {
    const existing = get().widgets.find((w) => w.id === widgetId);
    if (!existing) return;
    const updated: DashboardWidget = {
      ...existing,
      ...updates,
      config: updates.config ? { ...existing.config, ...updates.config } : existing.config,
      updated_at: nextMonotonicIso(existing.updated_at),
    };
    await db.widgets.put(updated).catch(() => {});
    set({
      widgets: get().widgets.map((w) => (w.id === widgetId ? updated : w)),
    });
    get().saveLocalBackup({ widgets: true });
  },

  updateWidgetConfig: async (widgetId, configUpdates) => {
    const existing = get().widgets.find((w) => w.id === widgetId);
    if (!existing) return;
    const updated: DashboardWidget = {
      ...existing,
      config: { ...existing.config, ...configUpdates },
      updated_at: nextMonotonicIso(existing.updated_at),
    };
    await db.widgets.put(updated).catch(() => {});
    set({
      widgets: get().widgets.map((w) => (w.id === widgetId ? updated : w)),
    });
    get().saveLocalBackup({ widgets: true });
  },

  moveWidgetToTab: async (widgetId, targetTabId, extraUpdates) => {
    const state = get();
    const existing = state.widgets.find((w) => w.id === widgetId && !w.deleted_at);
    const targetTab = state.tabs.find((t) => t.id === targetTabId && !t.deleted_at);
    if (!existing || !targetTab) return false;

    if (existing.tabId === targetTabId) {
      if (extraUpdates) {
        await state.updateWidget(widgetId, extraUpdates);
      }
      return false;
    }

    const nowMs = Date.now();
    const { freeformPos, configPatch } = computePlacementForTab(
      state,
      {
        id: existing.id,
        type: extraUpdates?.type || existing.type,
        freeformPos: existing.freeformPos,
      },
      targetTabId,
      extraUpdates?.freeformPos
    );

    const updated: DashboardWidget = {
      ...existing,
      ...(extraUpdates || {}),
      id: existing.id,
      tabId: targetTabId,
      freeformPos,
      config: {
        ...(existing.config || {}),
        ...(extraUpdates?.config || {}),
        ...(configPatch || {}),
      },
      updated_at: nextMonotonicIso(existing.updated_at, nowMs),
    };

    await db.widgets.put(updated).catch(() => {});
    set({
      widgets: get().widgets.map((w) => (w.id === widgetId ? updated : w)),
      movedWidgetToast: {
        widgetId: updated.id,
        widgetTitle: updated.title || 'Widget',
        targetTabId,
        targetTabName: targetTab.name,
        nonce: nowMs,
      },
      layoutUndoToast: null,
    });
    void get().saveLocalBackup({ widgets: true });
    return true;
  },

  moveWidgetToNewTab: async (widgetId, canvasName, extraUpdates) => {
    const state = get();
    const existing = state.widgets.find((w) => w.id === widgetId && !w.deleted_at);
    if (!existing) return null;

    const activeTabs = state.tabs.filter((t) => !t.deleted_at);
    if (activeTabs.length >= MAX_CANVASES) {
      console.warn(`Canvas limit of ${MAX_CANVASES} reached.`);
      return null;
    }

    const nowMs = Date.now();
    const newTabId = `tab-${nowMs}`;
    const maxOrder = state.tabs.reduce(
      (max, t, idx) => Math.max(max, Number.isFinite(t.order) ? t.order : idx),
      -1
    );
    const cleanName = canvasName?.trim().slice(0, 40) || `Canvas ${activeTabs.length + 1}`;

    const newTab: DashboardTab = {
      id: newTabId,
      name: cleanName,
      icon: 'Pin',
      order: maxOrder + 1,
      backgroundTheme: 'midnight_dots',
      backgroundDimLevel: 45,
      hideNotes: false,
      autoRotateDurationSec: state.settings.defaultRotateDurationSec || 30,
      enabled: true,
      updated_at: new Date(nowMs).toISOString(),
    };

    const { freeformPos, configPatch } = computeMovedWidgetPosition(
      { type: extraUpdates?.type || existing.type, freeformPos: existing.freeformPos },
      [],
      [],
      extraUpdates?.freeformPos
    );

    const updatedWidget: DashboardWidget = {
      ...existing,
      ...(extraUpdates || {}),
      id: existing.id,
      tabId: newTabId,
      freeformPos,
      config: {
        ...(existing.config || {}),
        ...(extraUpdates?.config || {}),
        ...(configPatch || {}),
      },
      updated_at: nextMonotonicIso(existing.updated_at, nowMs),
    };

    await db.tabs.put(newTab).catch(() => {});
    await db.widgets.put(updatedWidget).catch(() => {});

    set({
      tabs: [...get().tabs, newTab],
      widgets: get().widgets.map((w) => (w.id === widgetId ? updatedWidget : w)),
      movedWidgetToast: {
        widgetId: updatedWidget.id,
        widgetTitle: updatedWidget.title || 'Widget',
        targetTabId: newTabId,
        targetTabName: cleanName,
        nonce: nowMs,
      },
      layoutUndoToast: null,
    });
    await markCanvasLooksChanged(get, set);
    void get().saveLocalBackup({ tabs: true, widgets: true, settings: true });
    return newTabId;
  },

  dismissMovedWidgetToast: () => set({ movedWidgetToast: null }),

  updateWidgetPosition: async (widgetId, gridPos, freeformPos) => {
    const widget = get().widgets.find((w) => w.id === widgetId);
    if (!widget) return;

    const nowMs = Date.now();
    const prevPos: FreeformPosition = widget.freeformPos
      ? { ...widget.freeformPos }
      : {
          xRatio: 0.1,
          yRatio: 0.1,
          wRatio: 0.35,
          hRatio: 0.45,
          zIndex: 5,
          rotation: 0,
        };
    const verb = classifyLayoutGeometryChange(prevPos, freeformPos);
    const undoEntry: LayoutHistoryEntry | null = verb
      ? {
          id: `undo-${nowMs}-${Math.random().toString(36).slice(2, 7)}`,
          tabId: widget.tabId || get().activeTabId,
          label: `${verb} "${widget.title || 'Widget'}"`,
          createdAtMs: nowMs,
          widgetPositions: { [widgetId]: prevPos },
          notePositions: {},
        }
      : null;

    const updated: DashboardWidget = {
      ...widget,
      ...(gridPos ? { gridPos } : {}),
      ...(freeformPos ? { freeformPos } : {}),
      updated_at: nextMonotonicIso(widget.updated_at, nowMs),
    };
    await db.widgets.put(updated).catch(() => {});

    const latest = get();
    const nextStack = undoEntry
      ? appendLayoutHistoryEntry(latest.layoutUndoStack, undoEntry)
      : latest.layoutUndoStack;
    set({
      widgets: latest.widgets.map((w) => (w.id === widgetId ? updated : w)),
      ...(undoEntry
        ? {
            layoutUndoStack: nextStack,
            lastLayoutSnapshot: undoEntry,
            layoutUndoToast: {
              entryId: undoEntry.id,
              tabId: undoEntry.tabId,
              label: undoEntry.label,
              nonce: nowMs,
            },
            movedWidgetToast: null,
          }
        : {}),
    });
    get().saveLocalBackup({ widgets: true });
  },

  updateNotePosition: async (noteId, freeformPos) => {
    const note = get().notes.find((n) => n.id === noteId);
    if (!note) return;

    const nowMs = Date.now();
    const isShoppingList = Boolean(note.isShoppingList || note.freeformPos?.isShoppingList);
    const prevPos: FreeformPosition = note.freeformPos
      ? { ...note.freeformPos }
      : {
          xRatio: 0.15,
          yRatio: 0.15,
          wRatio: 0.26,
          hRatio: 0.3,
          zIndex: 1,
          rotation: 0,
        };
    const verb = classifyLayoutGeometryChange(prevPos, freeformPos);
    const resolvedTabId =
      !note.tabId || note.tabId === 'all' ? get().activeTabId : note.tabId;
    const noteTitle =
      note.title?.trim() || (isShoppingList ? 'Shopping List' : 'Sticky Note');
    const undoEntry: LayoutHistoryEntry | null = verb
      ? {
          id: `undo-${nowMs}-${Math.random().toString(36).slice(2, 7)}`,
          tabId: resolvedTabId,
          label: `${verb} "${noteTitle}"`,
          createdAtMs: nowMs,
          widgetPositions: {},
          notePositions: { [noteId]: prevPos },
        }
      : null;

    const updated: StickyNoteItem = {
      ...note,
      isShoppingList,
      freeformPos: freeformPos
        ? buildNoteFreeformPos({ ...note, isShoppingList }, freeformPos)
        : freeformPos,
      updated_at: nextMonotonicIso(note.updated_at, nowMs),
    };
    await db.notes.put(updated).catch(() => {});

    const latest = get();
    const nextStack = undoEntry
      ? appendLayoutHistoryEntry(latest.layoutUndoStack, undoEntry)
      : latest.layoutUndoStack;
    set({
      notes: latest.notes.map((n) => (n.id === noteId ? updated : n)),
      ...(undoEntry
        ? {
            layoutUndoStack: nextStack,
            lastLayoutSnapshot: undoEntry,
            layoutUndoToast: {
              entryId: undoEntry.id,
              tabId: undoEntry.tabId,
              label: undoEntry.label,
              nonce: nowMs,
            },
            movedWidgetToast: null,
          }
        : {}),
    });
    get().saveLocalBackup({ notes: true });
  },
}));

registerChorePersistListener(() => {
  const dashState = useDashboardStore.getState();
  if (dashState.isInitialized) {
    dashState.saveLocalBackup({ householdStores: true });
  }
});

registerMealPersistListener(() => {
  const dashState = useDashboardStore.getState();
  if (dashState.isInitialized) {
    dashState.saveLocalBackup({ householdStores: true });
  }
});

registerProfileSyncListener(() => {
  const dashState = useDashboardStore.getState();
  if (dashState.isInitialized) {
    dashState.saveLocalBackup({ householdStores: true });
  }
});

registerKanbanPersistListener(() => {
  const dashState = useDashboardStore.getState();
  if (dashState.isInitialized) {
    dashState.saveLocalBackup({ householdStores: true });
  }
});

registerRoutinesPersistListener(() => {
  const dashState = useDashboardStore.getState();
  if (dashState.isInitialized) {
    dashState.saveLocalBackup({ householdStores: true });
  }
});

registerKanbanRowSyncListener((event) => {
  const dashState = useDashboardStore.getState();
  if (dashState.isInitialized) {
    void syncKanbanRowEventToCloud(event);
  }
});
