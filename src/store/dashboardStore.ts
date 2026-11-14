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
import { computeNonOverlappingLayout, findOpenCanvasSpot } from '../utils/autoLayout';
import { getDefaultWidgetStickerMode, isStickerCapableWidget } from '../utils/widgetStickerMode';
import type { PhotoTargetSyncMeta, PlexPhotoSyncConfig } from '../utils/photoSyncPolicy';
import type { PhotoItem } from '../services/photos';
import { getSupabase, getCurrentUser, pushToCloud } from '../services/supabase';
import { CANVAS_LOOK_FIELDS, keepLocalNoteFields, keepLocalTabFields, keepLocalWidgetFields } from '../services/syncMerge';
import { inferCuratedCategoryId } from '../data/curatedScenery';
import { applySharedPhotoUpdateToWidgets, sanitizeRestoredPhotoWidget } from '../utils/photoSourceIsolation';
import { applyPinLockTransition, normalizePinLockSettings } from '../utils/pinValidation';
import { useChoreStore, registerChorePersistListener } from './choreStore';
import type { ChoreEngineSnapshot } from '../types/chores';
import { useProfileStore, registerProfileSyncListener } from '../stores/useProfileStore';
import type { HouseholdProfile } from '../types/profiles';
import { useMealStore, registerMealPersistListener } from '../stores/useMealStore';
import type { MealPlannerSnapshot } from '../types/meals';

const CHORE_ENGINE_CLOUD_ROW_ID = '__ambiently_chore_engine__';
const HOUSEHOLD_PROFILES_CLOUD_ROW_ID = '__ambiently_household_profiles__';
const MEAL_PLANNER_CLOUD_ROW_ID = '__ambiently_meal_planner__';

let backupDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let cloudAutoSyncTimer: ReturnType<typeof setTimeout> | null = null;
let hasPendingCloudPush = false;
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

  try {
    const sb = getSupabase();
    if (!sb) return;
    const user = await getCurrentUser();
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

async function scheduleCloudAutoPush(get: () => DashboardState) {
  latestDashboardGet = get;
  try {
    const sb = getSupabase();
    if (!sb) return;
    const user = await getCurrentUser();
    if (user) {
      hasPendingCloudPush = true;
      if (cloudAutoSyncTimer) {
        clearTimeout(cloudAutoSyncTimer);
      }
      cloudAutoSyncTimer = setTimeout(() => {
        cloudAutoSyncTimer = null;
        if (!hasPendingCloudPush) return;
        hasPendingCloudPush = false;
        const state = get();
        const runPush = Promise.resolve(
          pushToCloud(state.settings, state.tabs, state.widgets, state.notes)
        ).then(
          () => undefined,
          (err) => {
            console.warn('Cloud auto-push skipped:', err);
          }
        );
        activeCloudPushPromise = runPush;
        void runPush.finally(() => {
          if (activeCloudPushPromise === runPush) {
            activeCloudPushPromise = null;
          }
        });
      }, 2500);
    }
  } catch (err) {
    console.warn('Cloud auto-push skipped:', err);
  }
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
  await db.settings.put(settings);
  set({ settings });
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
  notes: StickyNoteItem[];

  // Ephemeral Kiosk controls
  isCarouselPaused: boolean;
  carouselPauseTimer: number | null;
  needsFileReconnect: boolean;
  isUnlocked: boolean; // runtime unlock state when pinLockEnabled is on
  lastLayoutSnapshot: LayoutSnapshot | null;
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
    backgroundDimLevel?: number
  ) => Promise<string | null>;
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
  saveLocalBackup: () => Promise<void>;
  saveLocalBackupImmediate: () => Promise<void>;
  syncRemoteNoteChange: (note: StickyNoteItem, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void;
  syncRemoteWidgetChange: (widget: DashboardWidget, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void;
  syncRemoteTabChange: (tab: DashboardTab, eventType: 'INSERT' | 'UPDATE' | 'DELETE') => void;

  // Auto-Organize / Auto-Tile Actions
  autoOrganizeCanvas: (tabId: string, mode?: AutoOrganizeMode) => Promise<void>;
  undoAutoOrganize: () => Promise<void>;

  // Widget / Note operations
  addWidget: (widget: Partial<DashboardWidget>) => Promise<void>;
  removeWidget: (widgetId: string) => Promise<void>;
  updateWidget: (widgetId: string, updates: Partial<DashboardWidget>) => Promise<void>;
  updateWidgetConfig: (widgetId: string, configUpdates: Record<string, any>) => Promise<void>;
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

export const useDashboardStore = create<DashboardState>((set, get) => ({
  isInitialized: false,
  settings: DEFAULT_SETTINGS,
  tabs: [],
  activeTabId: 'tab-corkboard',
  widgets: [],
  notes: [],

  isCarouselPaused: false,
  carouselPauseTimer: null,
  needsFileReconnect: false,
  isUnlocked: true,
  lastLayoutSnapshot: null,
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
    const rawLoadedWidgets = (await db.widgets.toArray()).filter(
      (w) =>
        !w.deleted_at &&
        w.id !== CHORE_ENGINE_CLOUD_ROW_ID &&
        w.id !== HOUSEHOLD_PROFILES_CLOUD_ROW_ID &&
        w.id !== MEAL_PLANNER_CLOUD_ROW_ID
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
    const loadedNotes = (await db.notes.toArray())
      .filter((n) => !n.deleted_at)
      .map((n) =>
        n.isShoppingList || n.freeformPos?.isShoppingList
          ? { ...n, isShoppingList: true, isChecklist: true }
          : n
      );

    // Initialize Global Household Profile Store, Chore Engine Store & Meal Planner Store
    await useProfileStore.getState().initProfileStore();
    await useChoreStore.getState().initChoreStore();
    await useMealStore.getState().initMealStore();

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
      notes: loadedNotes,
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
    backgroundDimLevel = 45
  ) => {
    const activeTabs = get().tabs.filter((t) => !t.deleted_at);
    if (activeTabs.length >= MAX_CANVASES) {
      console.warn(`Canvas limit of ${MAX_CANVASES} reached.`);
      return null;
    }
    const newId = `tab-${Date.now()}`;
    const maxOrder = get().tabs.reduce(
      (max, t, idx) => Math.max(max, Number.isFinite(t.order) ? t.order : idx),
      -1
    );
    const newTab: DashboardTab = {
      id: newId,
      name: name.trim() || 'New Canvas',
      icon: icon || 'Pin',
      order: maxOrder + 1,
      backgroundTheme,
      customWallpaperUrl: customWallpaperUrl?.trim() || undefined,
      backgroundDimLevel,
      hideNotes: false,
      autoRotateDurationSec: 30,
      enabled: true,
      updated_at: new Date().toISOString(),
    };
    await db.tabs.add(newTab);
    set({
      tabs: [...get().tabs, newTab],
      activeTabId: newId,
    });
    await markCanvasLooksChanged(get, set);
    get().saveLocalBackup();
    return newId;
  },

  updateTab: async (tabId, updates) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const updated = {
      ...tab,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    await db.tabs.put(updated);
    set({
      tabs: get().tabs.map((t) => (t.id === tabId ? updated : t)),
    });
    if (CANVAS_LOOK_FIELDS.some((field) => field in updates)) {
      await markCanvasLooksChanged(get, set);
    }
    get().saveLocalBackup();
  },

  setHomeTab: async (tabId) => {
    const currentTabs = get().tabs;
    const now = new Date().toISOString();
    const updatedTabs = currentTabs.map((t) => ({
      ...t,
      isHome: t.id === tabId,
      updated_at: now,
    }));
    await db.tabs.bulkPut(updatedTabs);
    set({ tabs: updatedTabs });
    await markCanvasLooksChanged(get, set);
    get().saveLocalBackup();
  },

  deleteTab: async (tabId) => {
    if (get().tabs.length <= 1) return;
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;

    const now = new Date().toISOString();
    const updated = { ...tab, deleted_at: now, updated_at: now };
    await db.tabs.put(updated);

    const remainingTabs = get().tabs.filter((t) => t.id !== tabId);
    let nextActiveTabId = get().activeTabId;
    if (get().activeTabId === tabId) {
      nextActiveTabId = remainingTabs[0]?.id || '';
    }

    let updatedRemainingTabs = remainingTabs;
    if (tab.isHome && remainingTabs.length > 0) {
      updatedRemainingTabs = remainingTabs.map((t, idx) =>
        idx === 0 ? { ...t, isHome: true, updated_at: new Date().toISOString() } : t
      );
      await db.tabs.bulkPut(updatedRemainingTabs);
    }

    set({
      tabs: updatedRemainingTabs,
      activeTabId: nextActiveTabId,
    });
    if (tab.isHome) {
      await markCanvasLooksChanged(get, set);
    }
    get().saveLocalBackup();
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
    get().saveLocalBackup();
  },

  setDockPosition: async (dockPosition) => {
    const updated = { ...get().settings, dockPosition, updated_at: new Date().toISOString() };
    await db.settings.put(updated);
    set({ settings: updated });
    get().saveLocalBackup();
  },

  setSnapToGrid: async (snapToGrid) => {
    const updated = { ...get().settings, snapToGrid, updated_at: new Date().toISOString() };
    await db.settings.put(updated);
    set({ settings: updated });
    get().saveLocalBackup();
  },

  toggleSnapToGrid: async () => {
    const current = Boolean(get().settings.snapToGrid);
    await get().setSnapToGrid(!current);
  },

  setDockHidden: async (isDockHidden) => {
    const updated = { ...get().settings, isDockHidden, updated_at: new Date().toISOString() };
    await db.settings.put(updated);
    set({ settings: updated });
    get().saveLocalBackup();
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
    get().saveLocalBackup();
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
    get().saveLocalBackup();
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
    get().saveLocalBackup();
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
        get().saveLocalBackup();
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
    get().saveLocalBackup();
  },

  setDisplayDensity: async (displayDensity) => {
    const updated = { ...get().settings, displayDensity, updated_at: new Date().toISOString() };
    await db.settings.put(updated);
    set({ settings: updated });
  },

  setCarouselEnabled: async (carouselEnabled) => {
    const updated = { ...get().settings, carouselEnabled, updated_at: new Date().toISOString() };
    await db.settings.put(updated);
    set({ settings: updated });
    get().saveLocalBackup();
  },

  setCarouselDuration: async (defaultRotateDurationSec) => {
    const updated = { ...get().settings, defaultRotateDurationSec, updated_at: new Date().toISOString() };
    await db.settings.put(updated);
    set({ settings: updated });
    get().saveLocalBackup();
  },

  pauseCarouselTemporarily: (durationMs = 20000) => {
    const currentTimer = get().carouselPauseTimer;
    if (currentTimer) clearTimeout(currentTimer);

    // The carousel effect starts a fresh `rotateDurationSec` interval once `isCarouselPaused`
    // clears, so only hold `isCarouselPaused` for the difference needed to guarantee at least
    // `durationMs` (and at least 50ms to reset the active interval timer) rather than stacking
    // 20s + rotateDurationSec on every tap.
    const rotateMs = (get().settings.defaultRotateDurationSec || 30) * 1000;
    const holdMs = Math.max(50, durationMs - rotateMs);

    const timer = window.setTimeout(() => {
      set({ isCarouselPaused: false, carouselPauseTimer: null });
    }, holdMs);

    set({ isCarouselPaused: true, carouselPauseTimer: timer });
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
    get().saveLocalBackup();
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
    get().saveLocalBackup();
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

  saveLocalBackup: async () => {
    scheduleCloudAutoPush(get);
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
      });
    }, 400);
  },

  saveLocalBackupImmediate: async () => {
    scheduleCloudAutoPush(get);
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

    const nowIso = new Date().toISOString();
    const updatedWidgets: DashboardWidget[] = [];
    const nextWidgets = state.widgets.map((w) => {
      const nextPos = widgetPositions[w.id];
      if (!nextPos) return w;
      const updated = { ...w, freeformPos: nextPos, updated_at: nowIso };
      updatedWidgets.push(updated);
      return updated;
    });

    const updatedNotes: StickyNoteItem[] = [];
    const nextNotes = state.notes.map((n) => {
      const nextPos = notePositions[n.id];
      if (!nextPos) return n;
      const updated = { ...n, freeformPos: nextPos, updated_at: nowIso };
      updatedNotes.push(updated);
      return updated;
    });

    if (updatedWidgets.length > 0) await db.widgets.bulkPut(updatedWidgets);
    if (updatedNotes.length > 0) await db.notes.bulkPut(updatedNotes);

    set({
      widgets: nextWidgets,
      notes: nextNotes,
      lastLayoutSnapshot:
        state.lastLayoutSnapshot?.tabId === tabId
          ? state.lastLayoutSnapshot
          : {
              tabId,
              widgetPositions: prevWidgetPositions,
              notePositions: prevNotePositions,
            },
    });
    get().saveLocalBackup();
  },

  undoAutoOrganize: async () => {
    const snapshot = get().lastLayoutSnapshot;
    if (!snapshot) return;

    const nowIso = new Date().toISOString();
    const updatedWidgets: DashboardWidget[] = [];
    const nextWidgets = get().widgets.map((w) => {
      const prevPos = snapshot.widgetPositions[w.id];
      if (!prevPos) return w;
      const updated = { ...w, freeformPos: prevPos, updated_at: nowIso };
      updatedWidgets.push(updated);
      return updated;
    });

    const updatedNotes: StickyNoteItem[] = [];
    const nextNotes = get().notes.map((n) => {
      const prevPos = snapshot.notePositions[n.id];
      if (!prevPos) return n;
      const updated = { ...n, freeformPos: prevPos, updated_at: nowIso };
      updatedNotes.push(updated);
      return updated;
    });

    if (updatedWidgets.length > 0) await db.widgets.bulkPut(updatedWidgets);
    if (updatedNotes.length > 0) await db.notes.bulkPut(updatedNotes);

    set({
      widgets: nextWidgets,
      notes: nextNotes,
      lastLayoutSnapshot: null,
    });
    get().saveLocalBackup();
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

    const isShoppingList = Boolean(newNote.isShoppingList || newNote.freeformPos?.isShoppingList);
    const resolvedPos = {
      ...(newNote.freeformPos || defaultPos),
      ...(isShoppingList ? { isShoppingList: true } : {}),
    };

    const note: StickyNoteItem = {
      id: newNote.id || `note-${Date.now()}`,
      tabId: targetTabId,
      widgetId: newNote.widgetId,
      title: newNote.title,
      content: newNote.content || '',
      isChecklist: Boolean(newNote.isChecklist || isShoppingList),
      isShoppingList,
      checklistItems: newNote.checklistItems,
      bgColor: newNote.bgColor || '#fef08a',
      fontSize: newNote.fontSize || 'base',
      expiresAt: newNote.expiresAt,
      freeformPos: resolvedPos,
      updated_at: new Date().toISOString(),
    };
    await db.notes.put(note);
    set({ notes: [note, ...get().notes] });
    get().saveLocalBackup();
  },

  updateNote: async (noteId, updates) => {
    const existing = get().notes.find((n) => n.id === noteId);
    if (!existing) return;
    const isShoppingList =
      updates.isShoppingList !== undefined
        ? Boolean(updates.isShoppingList)
        : Boolean(existing.isShoppingList || existing.freeformPos?.isShoppingList);
    const basePos = updates.freeformPos || existing.freeformPos;
    const updatedPos = basePos
      ? {
          ...basePos,
          isShoppingList,
        }
      : undefined;
    const updated: StickyNoteItem = {
      ...existing,
      ...updates,
      isShoppingList,
      ...(isShoppingList ? { isChecklist: true } : {}),
      ...(updatedPos ? { freeformPos: updatedPos } : {}),
      updated_at: new Date().toISOString(),
    };
    await db.notes.put(updated);
    set({
      notes: get().notes.map((n) => (n.id === noteId ? updated : n)),
    });
    get().saveLocalBackup();
  },

  syncRemoteNoteChange: (incomingNote, eventType) => {
    const existing = get().notes.find((n) => n.id === incomingNote.id);
    const remoteNote = keepLocalNoteFields(incomingNote, existing);
    if (existing) {
      const localTime = new Date(existing.updated_at || 0).getTime();
      const remoteTime = new Date(remoteNote.updated_at || 0).getTime();
      if (remoteTime < localTime) {
        return;
      }
    }

    if (eventType === 'DELETE' || remoteNote.deleted_at) {
      set({ notes: get().notes.filter((n) => n.id !== remoteNote.id) });
      db.notes.delete(remoteNote.id).catch(() => {});
    } else if (eventType === 'INSERT') {
      const exists = get().notes.some((n) => n.id === remoteNote.id);
      if (!exists) {
        set({ notes: [remoteNote, ...get().notes] });
      } else {
        set({
          notes: get().notes.map((n) => (n.id === remoteNote.id ? remoteNote : n)),
        });
      }
      db.notes.put(remoteNote).catch(() => {});
    } else if (eventType === 'UPDATE') {
      const exists = get().notes.some((n) => n.id === remoteNote.id);
      if (exists) {
        set({
          notes: get().notes.map((n) => (n.id === remoteNote.id ? remoteNote : n)),
        });
      } else {
        set({ notes: [remoteNote, ...get().notes] });
      }
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

    const existing = get().widgets.find((w) => w.id === incomingWidget.id);
    const remoteWidget = keepLocalWidgetFields(incomingWidget, existing);
    if (existing) {
      const localTime = new Date(existing.updated_at || 0).getTime();
      const remoteTime = new Date(remoteWidget.updated_at || 0).getTime();
      if (remoteTime < localTime) {
        return;
      }
    }

    if (eventType === 'DELETE' || remoteWidget.deleted_at) {
      set({ widgets: get().widgets.filter((w) => w.id !== remoteWidget.id) });
      db.widgets.delete(remoteWidget.id).catch(() => {});
    } else if (eventType === 'INSERT') {
      const exists = get().widgets.some((w) => w.id === remoteWidget.id);
      if (!exists) {
        set({ widgets: [...get().widgets, remoteWidget] });
      } else {
        set({
          widgets: get().widgets.map((w) => (w.id === remoteWidget.id ? remoteWidget : w)),
        });
      }
      db.widgets.put(remoteWidget).catch(() => {});
    } else if (eventType === 'UPDATE') {
      const exists = get().widgets.some((w) => w.id === remoteWidget.id);
      if (exists) {
        set({
          widgets: get().widgets.map((w) => (w.id === remoteWidget.id ? remoteWidget : w)),
        });
      } else {
        set({ widgets: [...get().widgets, remoteWidget] });
      }
      db.widgets.put(remoteWidget).catch(() => {});
    }
  },

  syncRemoteTabChange: (incomingTab, eventType) => {
    const existing = get().tabs.find((t) => t.id === incomingTab.id);
    const mergedTab = keepLocalTabFields(incomingTab, existing);
    const remoteTab: DashboardTab = {
      ...mergedTab,
      order: Number.isFinite(mergedTab.order)
        ? mergedTab.order
        : existing && Number.isFinite(existing.order)
          ? existing.order
          : get().tabs.length,
      enabled:
        mergedTab.id === 'tab-overview' ? Boolean(mergedTab.enabled) : mergedTab.enabled !== false,
    };
    if (existing) {
      const localTime = new Date(existing.updated_at || 0).getTime();
      const remoteTime = new Date(remoteTab.updated_at || 0).getTime();
      if (remoteTime < localTime) {
        return;
      }
    }

    if (eventType === 'DELETE' || remoteTab.deleted_at) {
      const remaining = get().tabs.filter((t) => t.id !== remoteTab.id);
      const nextActiveTabId =
        get().activeTabId === remoteTab.id ? remaining[0]?.id || 'tab-corkboard' : get().activeTabId;
      set({ tabs: remaining, activeTabId: nextActiveTabId });
      db.tabs.delete(remoteTab.id).catch(() => {});
    } else if (eventType === 'INSERT') {
      const exists = get().tabs.some((t) => t.id === remoteTab.id);
      let nextTabs: DashboardTab[];
      if (!exists) {
        nextTabs = [...get().tabs, remoteTab];
      } else {
        nextTabs = get().tabs.map((t) => (t.id === remoteTab.id ? remoteTab : t));
      }
      nextTabs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      set({ tabs: nextTabs });
      db.tabs.put(remoteTab).catch(() => {});
    } else if (eventType === 'UPDATE') {
      const exists = get().tabs.some((t) => t.id === remoteTab.id);
      let nextTabs: DashboardTab[];
      if (exists) {
        nextTabs = get().tabs.map((t) => (t.id === remoteTab.id ? remoteTab : t));
      } else {
        nextTabs = [...get().tabs, remoteTab];
      }
      nextTabs.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      set({ tabs: nextTabs });
      db.tabs.put(remoteTab).catch(() => {});
    }
  },

  deleteNote: async (noteId) => {
    const existing = get().notes.find((n) => n.id === noteId);
    if (!existing) return;
    const updated: StickyNoteItem = {
      ...existing,
      archivedAt: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await db.notes.put(updated);
    set({
      notes: get().notes.map((n) => (n.id === noteId ? updated : n)),
    });
    get().saveLocalBackup();
  },

  permanentlyDeleteNote: async (noteId) => {
    const existing = get().notes.find((n) => n.id === noteId);
    if (!existing) return;
    const updated: StickyNoteItem = {
      ...existing,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await db.notes.put(updated);
    set({
      notes: get().notes.filter((n) => n.id !== noteId),
    });
    get().saveLocalBackup();
  },

  permanentlyDeleteNotes: async (noteIds) => {
    if (!noteIds || noteIds.length === 0) return;
    const idSet = new Set(noteIds);
    const nowIso = new Date().toISOString();
    const tombstones: StickyNoteItem[] = [];
    for (const n of get().notes) {
      if (idSet.has(n.id)) {
        tombstones.push({
          ...n,
          deleted_at: nowIso,
          updated_at: nowIso,
        });
      }
    }
    if (tombstones.length === 0) return;
    await db.notes.bulkPut(tombstones);
    set({
      notes: get().notes.filter((n) => !idSet.has(n.id)),
    });
    get().saveLocalBackup();
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
      updated_at: new Date().toISOString(),
    };
    await db.widgets.put(newWidget);
    set({
      widgets: [...get().widgets, newWidget],
    });
    get().saveLocalBackup();
  },

  removeWidget: async (widgetId) => {
    const existing = get().widgets.find((w) => w.id === widgetId);
    if (!existing) return;
    const updated: DashboardWidget = {
      ...existing,
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await db.widgets.put(updated);
    set({
      widgets: get().widgets.filter((w) => w.id !== widgetId),
    });
    get().saveLocalBackup();
  },

  updateWidget: async (widgetId, updates) => {
    const existing = get().widgets.find((w) => w.id === widgetId);
    if (!existing) return;
    const updated: DashboardWidget = {
      ...existing,
      ...updates,
      config: updates.config ? { ...existing.config, ...updates.config } : existing.config,
      updated_at: new Date().toISOString(),
    };
    await db.widgets.put(updated);
    set({
      widgets: get().widgets.map((w) => (w.id === widgetId ? updated : w)),
    });
    get().saveLocalBackup();
  },

  updateWidgetConfig: async (widgetId, configUpdates) => {
    const existing = get().widgets.find((w) => w.id === widgetId);
    if (!existing) return;
    const updated: DashboardWidget = {
      ...existing,
      config: { ...existing.config, ...configUpdates },
      updated_at: new Date().toISOString(),
    };
    await db.widgets.put(updated);
    set({
      widgets: get().widgets.map((w) => (w.id === widgetId ? updated : w)),
    });
    get().saveLocalBackup();
  },

  updateWidgetPosition: async (widgetId, gridPos, freeformPos) => {
    const widget = get().widgets.find((w) => w.id === widgetId);
    if (!widget) return;
    const updated: DashboardWidget = {
      ...widget,
      ...(gridPos ? { gridPos } : {}),
      ...(freeformPos ? { freeformPos } : {}),
      updated_at: new Date().toISOString(),
    };
    await db.widgets.put(updated);
    set({
      widgets: get().widgets.map((w) => (w.id === widgetId ? updated : w)),
    });
    get().saveLocalBackup();
  },

  updateNotePosition: async (noteId, freeformPos) => {
    const note = get().notes.find((n) => n.id === noteId);
    if (!note) return;
    const isShoppingList = Boolean(note.isShoppingList || note.freeformPos?.isShoppingList);
    const updated: StickyNoteItem = {
      ...note,
      isShoppingList,
      freeformPos: freeformPos
        ? {
            ...freeformPos,
            ...(isShoppingList ? { isShoppingList: true } : {}),
          }
        : freeformPos,
      updated_at: new Date().toISOString(),
    };
    await db.notes.put(updated);
    set({
      notes: get().notes.map((n) => (n.id === noteId ? updated : n)),
    });
    get().saveLocalBackup();
  },
}));

registerChorePersistListener(() => {
  const dashState = useDashboardStore.getState();
  if (dashState.isInitialized) {
    dashState.saveLocalBackup();
  }
});

registerMealPersistListener(() => {
  const dashState = useDashboardStore.getState();
  if (dashState.isInitialized) {
    dashState.saveLocalBackup();
  }
});

registerProfileSyncListener(() => {
  const dashState = useDashboardStore.getState();
  if (dashState.isInitialized) {
    dashState.saveLocalBackup();
  }
});
