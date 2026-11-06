import { create } from 'zustand';
import {
  db,
  DEFAULT_SETTINGS,
  DEFAULT_TABS,
  DEFAULT_WIDGETS,
  DEFAULT_NOTES,
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
import type { PhotoItem } from '../services/photos';
import { getSupabase, getCurrentUser, pushToCloud, pushNotesToJoinedBoard } from '../services/supabase';

let backupDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let cloudAutoSyncTimer: ReturnType<typeof setTimeout> | null = null;

async function scheduleCloudAutoPush(get: () => DashboardState) {
  try {
    const sb = getSupabase();
    if (!sb) return;
    const user = await getCurrentUser();
    if (user) {
      if (cloudAutoSyncTimer) {
        clearTimeout(cloudAutoSyncTimer);
      }
      cloudAutoSyncTimer = setTimeout(async () => {
        const state = get();
        await pushToCloud(state.settings, state.tabs, state.widgets, state.notes);
      }, 1200);
      return;
    }

    // Unauthenticated family member / kid joined via family invite code
    const joinedDashboardId = localStorage.getItem('joined_dashboard_id');
    if (joinedDashboardId) {
      if (cloudAutoSyncTimer) {
        clearTimeout(cloudAutoSyncTimer);
      }
      cloudAutoSyncTimer = setTimeout(async () => {
        const state = get();
        await pushNotesToJoinedBoard(state.notes);
      }, 800);
    }
  } catch (err) {
    console.warn('Cloud auto-push skipped:', err);
  }
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

  // Actions
  initStore: () => Promise<void>;
  setActiveTabId: (tabId: string) => void;
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
    sourceType?: 'plex' | 'local' | 'web' | 'curated'
  ) => Promise<void>;
  applyCommonPhotosToAllWidgets: (
    photos: PhotoItem[],
    sourceLabel?: string,
    sourceUrl?: string,
    sourceType?: 'plex' | 'local' | 'web' | 'curated'
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

  initStore: async () => {
    // Load from Dexie or seed fresh database
    const settingsCount = await db.settings.count();
    if (settingsCount === 0) {
      await db.settings.add(DEFAULT_SETTINGS);
      await db.tabs.bulkAdd(DEFAULT_TABS);
      await db.widgets.bulkAdd(DEFAULT_WIDGETS);
      await db.notes.bulkAdd(DEFAULT_NOTES);
    }

    const rawSettings = await db.settings.get('global');
    const loadedSettings = {
      ...DEFAULT_SETTINGS,
      ...(rawSettings || {}),
      carouselEnabled: rawSettings?.carouselEnabled ?? true,
    };
    const allTabs = await db.tabs.toArray();
    const loadedTabs = allTabs
      .filter((t: DashboardTab) => !t.deleted_at)
      .sort((a: DashboardTab, b: DashboardTab) => a.order - b.order);
    const loadedWidgets = (await db.widgets.toArray()).filter((w) => !w.deleted_at);
    const loadedNotes = (await db.notes.toArray()).filter((n) => !n.deleted_at);

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
      widgets: loadedWidgets.length > 0 ? loadedWidgets : DEFAULT_WIDGETS,
      notes: loadedNotes.length > 0 ? loadedNotes : DEFAULT_NOTES,
      isUnlocked: !loadedSettings.pinLockEnabled,
    });
  },

  setActiveTabId: (tabId) => {
    set({ activeTabId: tabId });
    get().pauseCarouselTemporarily();
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
    const maxOrder = get().tabs.reduce((max, t) => Math.max(max, t.order), -1);
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
    get().saveLocalBackup();
  },

  deleteTab: async (tabId) => {
    if (get().tabs.length <= 1) return;
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;

    const updated = { ...tab, deleted_at: new Date().toISOString() };
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

  setCommonPhotos: async (photos, sourceLabel, sourceUrl, sourceType) => {
    const updated = {
      ...get().settings,
      commonPhotos: photos,
      commonPhotoSourceLabel: sourceLabel,
      commonPhotoSourceUrl: sourceType === 'web' ? (sourceUrl || '') : undefined,
      commonPhotoSourceType: sourceType,
      updated_at: new Date().toISOString(),
    };
    await db.settings.put(updated);
    set({ settings: updated });
    get().saveLocalBackup();
  },

  applyCommonPhotosToAllWidgets: async (photos, sourceLabel, sourceUrl, sourceType) => {
    await get().setCommonPhotos(photos, sourceLabel, sourceUrl, sourceType);
    const updatedWidgets = get().widgets.map((w) => {
      if (w.type === 'photo_frame') {
        return {
          ...w,
          config: {
            ...w.config,
            useCommonSource: true,
            sourceLabel: sourceLabel || w.config?.sourceLabel,
            sourceUrl: sourceType === 'web' ? (sourceUrl || '') : undefined,
            sourceType: sourceType || w.config?.sourceType,
          },
          updated_at: new Date().toISOString(),
        };
      }
      return w;
    });
    await db.widgets.bulkPut(updatedWidgets);
    set({ widgets: updatedWidgets });
    get().saveLocalBackup();
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

    const timer = window.setTimeout(() => {
      set({ isCarouselPaused: false, carouselPauseTimer: null });
    }, durationMs);

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
    const updated = {
      ...current,
      pinLockEnabled,
      pinHash,
      // If PIN is disabled, reset all kiosk locks so no lingering locks remain
      ...(pinLockEnabled
        ? {}
        : {
            lockCanvasEditing: false,
            lockFullscreenKiosk: false,
            lockSettingsAccess: false,
          }),
      updated_at: new Date().toISOString(),
    };
    await db.settings.put(updated);
    set({ settings: updated, isUnlocked: true });
    get().saveLocalBackup();
  },

  unlockKiosk: async (enteredPin) => {
    const { settings } = get();
    if (!settings.pinLockEnabled || !settings.pinHash || enteredPin === '') {
      set({ isUnlocked: true });
      return true;
    }
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

    const note: StickyNoteItem = {
      id: newNote.id || `note-${Date.now()}`,
      tabId: targetTabId,
      widgetId: newNote.widgetId,
      title: newNote.title,
      content: newNote.content || '',
      isChecklist: Boolean(newNote.isChecklist),
      checklistItems: newNote.checklistItems,
      bgColor: newNote.bgColor || '#fef08a',
      fontSize: newNote.fontSize || 'base',
      expiresAt: newNote.expiresAt,
      freeformPos: newNote.freeformPos || defaultPos,
      updated_at: new Date().toISOString(),
    };
    await db.notes.put(note);
    set({ notes: [note, ...get().notes] });
    get().saveLocalBackup();
  },

  updateNote: async (noteId, updates) => {
    const existing = get().notes.find((n) => n.id === noteId);
    if (!existing) return;
    const updated: StickyNoteItem = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };
    await db.notes.put(updated);
    set({
      notes: get().notes.map((n) => (n.id === noteId ? updated : n)),
    });
    get().saveLocalBackup();
  },

  syncRemoteNoteChange: (remoteNote, eventType) => {
    const existing = get().notes.find((n) => n.id === remoteNote.id);
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

  syncRemoteWidgetChange: (remoteWidget, eventType) => {
    const existing = get().widgets.find((w) => w.id === remoteWidget.id);
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

  syncRemoteTabChange: (remoteTab, eventType) => {
    const existing = get().tabs.find((t) => t.id === remoteTab.id);
    if (existing) {
      const localTime = new Date(existing.updated_at || 0).getTime();
      const remoteTime = new Date(remoteTab.updated_at || 0).getTime();
      if (remoteTime < localTime) {
        return;
      }
    }

    if (eventType === 'DELETE' || remoteTab.deleted_at) {
      set({ tabs: get().tabs.filter((t) => t.id !== remoteTab.id) });
      db.tabs.delete(remoteTab.id).catch(() => {});
    } else if (eventType === 'INSERT') {
      const exists = get().tabs.some((t) => t.id === remoteTab.id);
      let nextTabs: DashboardTab[];
      if (!exists) {
        nextTabs = [...get().tabs, remoteTab];
      } else {
        nextTabs = get().tabs.map((t) => (t.id === remoteTab.id ? remoteTab : t));
      }
      nextTabs.sort((a, b) => a.order - b.order);
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
      nextTabs.sort((a, b) => a.order - b.order);
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

  addWidget: async (partialWidget) => {
    const state = get();
    const id = partialWidget.id || 'widget-' + Date.now();
    const targetTabId = partialWidget.tabId || state.activeTabId;
    const targetW = partialWidget.freeformPos?.wRatio || 0.35;
    const targetH = partialWidget.freeformPos?.hRatio || 0.45;
    const existingBoxes = getExistingBoxesForTab(targetTabId, state.widgets, state.notes);
    const openPos = findOpenCanvasSpot(existingBoxes, targetW, targetH, 0);

    const newWidget: DashboardWidget = {
      id,
      tabId: targetTabId,
      type: partialWidget.type || 'weather',
      title: partialWidget.title || 'Widget',
      gridPos: partialWidget.gridPos || { x: 0, y: 0, w: 4, h: 4 },
      freeformPos: partialWidget.freeformPos
        ? {
            ...openPos,
            ...partialWidget.freeformPos,
          }
        : openPos,
      config: partialWidget.config || {},
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
    const updated: StickyNoteItem = {
      ...note,
      freeformPos,
      updated_at: new Date().toISOString(),
    };
    await db.notes.put(updated);
    set({
      notes: get().notes.map((n) => (n.id === noteId ? updated : n)),
    });
    get().saveLocalBackup();
  },
}));
