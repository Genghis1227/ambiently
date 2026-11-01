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
  LayoutMode,
} from '../types/dashboard';
import { saveSnapshotToFile, hasActiveLocalFile } from '../services/fileSync';

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

  // Actions
  initStore: () => Promise<void>;
  setActiveTabId: (tabId: string) => void;
  setDockPosition: (pos: DockPosition) => Promise<void>;
  setLayoutMode: (tabId: string, mode: LayoutMode) => Promise<void>;
  setDisplayDensity: (density: 0.75 | 1.0 | 1.25 | 1.5) => Promise<void>;
  pauseCarouselTemporarily: (durationMs?: number) => void;
  toggleNightModeManual: () => void;
  setPinLock: (pin: string | null) => Promise<void>;
  unlockKiosk: (enteredPin: string) => boolean;
  lockKiosk: () => void;
  saveLocalBackup: () => Promise<void>;
  
  // Widget / Note operations
  addNote: (note: Partial<StickyNoteItem>) => Promise<void>;
  updateNote: (noteId: string, updates: Partial<StickyNoteItem>) => Promise<void>;
  deleteNote: (noteId: string) => Promise<void>;
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

export const useDashboardStore = create<DashboardState>((set, get) => ({
  isInitialized: false,
  settings: DEFAULT_SETTINGS,
  tabs: [],
  activeTabId: 'tab-overview',
  widgets: [],
  notes: [],

  isCarouselPaused: false,
  carouselPauseTimer: null,
  needsFileReconnect: false,
  isUnlocked: true,

  initStore: async () => {
    // Load from Dexie or seed fresh database
    const settingsCount = await db.settings.count();
    if (settingsCount === 0) {
      await db.settings.add(DEFAULT_SETTINGS);
      await db.tabs.bulkAdd(DEFAULT_TABS);
      await db.widgets.bulkAdd(DEFAULT_WIDGETS);
      await db.notes.bulkAdd(DEFAULT_NOTES);
    }

    const loadedSettings = (await db.settings.get('global')) || DEFAULT_SETTINGS;
    const allTabs = await db.tabs.toArray();
    const loadedTabs = allTabs
      .filter((t: DashboardTab) => !t.deleted_at)
      .sort((a: DashboardTab, b: DashboardTab) => a.order - b.order);
    const loadedWidgets = (await db.widgets.toArray()).filter((w) => !w.deleted_at);
    const loadedNotes = (await db.notes.toArray()).filter((n) => !n.deleted_at);

    const initialTabId = loadedTabs[0]?.id || 'tab-overview';

    set({
      isInitialized: true,
      settings: loadedSettings,
      tabs: loadedTabs.length > 0 ? loadedTabs : DEFAULT_TABS,
      activeTabId: initialTabId,
      widgets: loadedWidgets.length > 0 ? loadedWidgets : DEFAULT_WIDGETS,
      notes: loadedNotes.length > 0 ? loadedNotes : DEFAULT_NOTES,
      isUnlocked: !loadedSettings.pinLockEnabled,
    });
  },

  setActiveTabId: (tabId) => {
    set({ activeTabId: tabId });
    get().pauseCarouselTemporarily();
  },

  setDockPosition: async (dockPosition) => {
    const updated = { ...get().settings, dockPosition, updated_at: new Date().toISOString() };
    await db.settings.put(updated);
    set({ settings: updated });
    get().saveLocalBackup();
  },

  setLayoutMode: async (tabId, layoutMode) => {
    const tab = get().tabs.find((t) => t.id === tabId);
    if (!tab) return;
    const updatedTab = { ...tab, layoutMode, updated_at: new Date().toISOString() };
    await db.tabs.put(updatedTab);
    set({
      tabs: get().tabs.map((t) => (t.id === tabId ? updatedTab : t)),
    });
    get().saveLocalBackup();
  },

  setDisplayDensity: async (displayDensity) => {
    const updated = { ...get().settings, displayDensity, updated_at: new Date().toISOString() };
    await db.settings.put(updated);
    set({ settings: updated });
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

  setPinLock: async (pin) => {
    let pinHash: string | null = null;
    let pinLockEnabled = false;
    if (pin && pin.length >= 4) {
      pinHash = await hashPin(pin);
      pinLockEnabled = true;
    }
    const updated = {
      ...get().settings,
      pinLockEnabled,
      pinHash,
      updated_at: new Date().toISOString(),
    };
    await db.settings.put(updated);
    set({ settings: updated, isUnlocked: !pinLockEnabled });
  },

  unlockKiosk: (enteredPin) => {
    const { settings } = get();
    if (!settings.pinLockEnabled || !settings.pinHash) {
      set({ isUnlocked: true });
      return true;
    }
    // Verify hash synchronously by testing against known
    hashPin(enteredPin).then((hash) => {
      if (hash === settings.pinHash) {
        set({ isUnlocked: true });
      }
    });
    return false;
  },

  lockKiosk: () => {
    if (get().settings.pinLockEnabled) {
      set({ isUnlocked: false });
    }
  },

  saveLocalBackup: async () => {
    if (!hasActiveLocalFile()) return;
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

  addNote: async (newNote) => {
    const note: StickyNoteItem = {
      id: newNote.id || `note-${Date.now()}`,
      tabId: newNote.tabId || get().activeTabId,
      widgetId: newNote.widgetId,
      title: newNote.title,
      content: newNote.content || '',
      isChecklist: Boolean(newNote.isChecklist),
      checklistItems: newNote.checklistItems,
      bgColor: newNote.bgColor || '#fef08a',
      fontSize: newNote.fontSize || 'base',
      expiresAt: newNote.expiresAt,
      freeformPos: newNote.freeformPos || {
        xRatio: 0.15 + Math.random() * 0.2,
        yRatio: 0.15 + Math.random() * 0.2,
        wRatio: 0.3,
        hRatio: 0.35,
        zIndex: 10,
        rotation: Math.floor(Math.random() * 6) - 3,
      },
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

  deleteNote: async (noteId) => {
    const existing = get().notes.find((n) => n.id === noteId);
    if (!existing) return;
    // Soft delete to archive
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
