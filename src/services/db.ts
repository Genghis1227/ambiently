import Dexie, { type EntityTable } from 'dexie';
import type {
  DashboardTab,
  DashboardWidget,
  StickyNoteItem,
  AppSettings,
  LocalDeviceVaultItem,
} from '../types/dashboard';
import type { ChoreEngineSnapshot } from '../types/chores';
import { CHORE_PROFILE_COLORS } from '../utils/choreEngine';

export class AmbientlyDatabase extends Dexie {
  tabs!: EntityTable<DashboardTab, 'id'>;
  widgets!: EntityTable<DashboardWidget, 'id'>;
  notes!: EntityTable<StickyNoteItem, 'id'>;
  settings!: EntityTable<AppSettings, 'id'>;
  vault!: EntityTable<LocalDeviceVaultItem, 'key'>;
  chores!: EntityTable<ChoreEngineSnapshot, 'id'>;

  constructor() {
    super('AmbientlyDB');
    this.version(1).stores({
      tabs: 'id, order, updated_at, deleted_at',
      widgets: 'id, tabId, type, updated_at, deleted_at',
      notes: 'id, tabId, widgetId, expiresAt, archivedAt, updated_at, deleted_at',
      settings: 'id, updated_at',
      vault: 'key, updated_at', // Not synced externally
    });
    this.version(2).stores({
      tabs: 'id, order, updated_at, deleted_at',
      widgets: 'id, tabId, type, updated_at, deleted_at',
      notes: 'id, tabId, widgetId, expiresAt, archivedAt, updated_at, deleted_at',
      settings: 'id, updated_at',
      vault: 'key, updated_at',
      chores: 'id, updated_at',
    });
  }
}

export const db = new AmbientlyDatabase();

// Default initial state for a fresh setup
export const DEFAULT_SETTINGS: AppSettings = {
  id: 'global',
  dashboardTitle: 'Ambiently Command Center',
  dockPosition: 'left',
  carouselEnabled: true,
  defaultRotateDurationSec: 30,
  displayDensity: 1.0,
  wakeLockEnabled: true,
  nightModeEnabled: false,
  nightModeStart: '22:00',
  nightModeEnd: '07:00',
  nightModeStyle: 'dim',
  nightDimOpacity: 0.85,
  nightModeWakeTimeoutMin: 2,
  nightScheduleEnabled: true,
  snapToGrid: false,
  isDockHidden: false,
  autoHideCursor: true,
  cursorIdleTimeoutSec: 3,
  commonPhotos: [],
  commonPhotoSourceLabel: undefined,
  commonPhotoSourceUrl: undefined,
  commonPhotoSourceType: undefined,
  pinLockEnabled: false,
  pinHash: null,
  isLocked: false,
  lockFullscreenKiosk: true,
  lockCanvasEditing: false,
  lockSettingsAccess: true,
  updated_at: '1970-01-01T00:00:00.000Z',
};

export const DEFAULT_TABS: DashboardTab[] = [
  {
    id: "tab-corkboard",
    name: "Family Board",
    icon: "Pin",
    order: 0,
    isHome: true,
    layoutMode: "freeform",
    autoRotateDurationSec: 30,
    enabled: true,
    updated_at: '1970-01-01T00:00:00.000Z',
  },
];

export const DEFAULT_WIDGETS: DashboardWidget[] = [
  {
    id: 'widget-clock',
    tabId: 'tab-corkboard',
    type: 'clock_weather',
    title: 'Clock & Weather',
    gridPos: { x: 0, y: 0, w: 4, h: 4 },
    freeformPos: { xRatio: 0.05, yRatio: 0.05, wRatio: 0.35, hRatio: 0.45, zIndex: 1, rotation: 0 },
    config: { face: 'digital', locationName: 'Austin, TX', latitude: 30.2672, longitude: -97.7431 },
    updated_at: '1970-01-01T00:00:00.000Z',
  },
  {
    id: 'widget-notes-tile',
    tabId: 'tab-corkboard',
    type: 'sticky_notes',
    title: 'Quick Reminders',
    gridPos: { x: 4, y: 0, w: 4, h: 8 },
    freeformPos: { xRatio: 0.45, yRatio: 0.05, wRatio: 0.4, hRatio: 0.6, zIndex: 2, rotation: 0 },
    config: {},
    updated_at: '1970-01-01T00:00:00.000Z',
  },
  {
    id: 'widget-photo-tile',
    tabId: 'tab-corkboard',
    type: 'photo_frame',
    title: 'Ambient Memories',
    gridPos: { x: 8, y: 0, w: 4, h: 8 },
    freeformPos: { xRatio: 0.45, yRatio: 0.55, wRatio: 0.5, hRatio: 0.4, zIndex: 3, rotation: 0 },
    config: { displayStyle: 'ken_burns', source: 'curated' },
    updated_at: '1970-01-01T00:00:00.000Z',
  },
  {
    id: 'widget-countdown-tile',
    tabId: 'tab-corkboard',
    type: 'countdown',
    title: 'Upcoming Milestone',
    gridPos: { x: 0, y: 4, w: 4, h: 4 },
    freeformPos: { xRatio: 0.05, yRatio: 0.55, wRatio: 0.35, hRatio: 0.4, zIndex: 1, rotation: 0 },
    config: { eventName: 'Family Vacation', targetDate: '2026-12-25T00:00:00Z' },
    updated_at: '1970-01-01T00:00:00.000Z',
  },
];

export const DEFAULT_NOTES: StickyNoteItem[] = [
  {
    id: 'note-welcome',
    tabId: 'tab-corkboard',
    title: '👋 Welcome to Ambiently!',
    content: 'This is your ambient smart-display board. You can pin notes, checklists, and drag cards around freely in Corkboard mode.',
    isChecklist: false,
    bgColor: '#fef08a', // Amber light
    fontSize: 'base',
    freeformPos: { xRatio: 0.1, yRatio: 0.15, wRatio: 0.35, hRatio: 0.35, zIndex: 10, rotation: -2 },
    updated_at: '1970-01-01T00:00:00.000Z',
  },
  {
    id: 'note-groceries',
    tabId: 'tab-corkboard',
    title: '🛒 Weekly Essentials',
    content: '',
    isChecklist: true,
    checklistItems: [
      { id: '1', text: 'Organic Whole Milk', done: false },
      { id: '2', text: 'Sourdough Bread', done: true },
      { id: '3', text: 'Avocados & Honeycrisp Apples', done: false },
      { id: '4', text: 'Cold Brew Coffee', done: false },
    ],
    bgColor: '#bbf7d0', // Emerald light
    fontSize: 'base',
    freeformPos: { xRatio: 0.52, yRatio: 0.2, wRatio: 0.38, hRatio: 0.45, zIndex: 11, rotation: 3 },
    updated_at: '1970-01-01T00:00:00.000Z',
  },
];

export const DEFAULT_CHORE_SNAPSHOT: ChoreEngineSnapshot = {
  id: 'household_chores',
  profiles: [
    {
      id: 'profile-1',
      name: 'Olivia',
      color: CHORE_PROFILE_COLORS[0], // Sage Green
      emoji: '🌿',
      balance: 0,
      lifetimePoints: 0,
    },
    {
      id: 'profile-2',
      name: 'Alyssa',
      color: CHORE_PROFILE_COLORS[1], // Slate Blue
      emoji: '🦋',
      balance: 0,
      lifetimePoints: 0,
    },
  ],
  templates: [
    {
      id: 'chore-tpl-bed-1',
      title: 'Make Bed & Tidy Room',
      points: 10,
      assignedTo: 'profile-1',
      cadence: 'daily',
      requiresApproval: false,
      rolloverUntilDone: false,
      overduePolicy: 'half',
      icon: '🛏️',
    },
    {
      id: 'chore-tpl-bed-2',
      title: 'Make Bed & Tidy Room',
      points: 10,
      assignedTo: 'profile-2',
      cadence: 'daily',
      requiresApproval: false,
      rolloverUntilDone: false,
      overduePolicy: 'half',
      icon: '🛏️',
    },
    {
      id: 'chore-tpl-backpack-1',
      title: 'Unpack School Backpack & Lunchbox',
      points: 15,
      assignedTo: 'profile-1',
      cadence: 'weekdays',
      requiresApproval: false,
      rolloverUntilDone: true,
      overduePolicy: 'half',
      icon: '🎒',
    },
    {
      id: 'chore-tpl-backpack-2',
      title: 'Unpack School Backpack & Lunchbox',
      points: 15,
      assignedTo: 'profile-2',
      cadence: 'weekdays',
      requiresApproval: false,
      rolloverUntilDone: true,
      overduePolicy: 'half',
      icon: '🎒',
    },
    {
      id: 'chore-tpl-table',
      title: 'Clear & Wipe Dinner Table',
      points: 20,
      assignedTo: 'shared',
      cadence: 'daily',
      requiresApproval: true,
      rolloverUntilDone: false,
      overduePolicy: 'zero',
      icon: '🍽️',
    },
    {
      id: 'chore-tpl-playroom',
      title: 'Organize Bookshelf & Play Area',
      points: 30,
      assignedTo: 'shared',
      cadence: 'weekends',
      requiresApproval: true,
      rolloverUntilDone: true,
      overduePolicy: 'full',
      icon: '📚',
    },
  ],
  instances: [],
  rewards: [
    {
      id: 'reward-1',
      profileId: 'profile-1',
      title: 'Pick Friday Family Movie & Popcorn',
      pointsCost: 100,
      status: 'active_goal',
      createdAt: '1970-01-01T00:00:00.000Z',
      pricedAt: '1970-01-01T00:00:00.000Z',
    },
    {
      id: 'reward-2',
      profileId: 'profile-2',
      title: 'Ice Cream Outing',
      pointsCost: 100,
      status: 'active_goal',
      createdAt: '1970-01-01T00:00:00.000Z',
      pricedAt: '1970-01-01T00:00:00.000Z',
    },
  ],
  trophies: [],
  ledger: [],
  householdSettings: {
    vacationMode: false,
    pointsPerDollar: 10,
    soundEffectsEnabled: false,
  },
  updated_at: '1970-01-01T00:00:00.000Z',
};

/**
 * Permanently purges soft-deleted records older than 30 days from local IndexedDB
 * to keep memory and disk footprint lean over time.
 */
export async function purgeOldTombstones(retentionDays = 30): Promise<{ tabs: number; widgets: number; notes: number }> {
  const threshold = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let tabsCount = 0;
  let widgetsCount = 0;
  let notesCount = 0;

  try {
    const [allTabs, allWidgets, allNotes] = await Promise.all([
      db.tabs.toArray(),
      db.widgets.toArray(),
      db.notes.toArray(),
    ]);

    const expiredTabIds = allTabs
      .filter((t) => t.deleted_at && new Date(t.deleted_at).getTime() < threshold)
      .map((t) => t.id);
    const expiredWidgetIds = allWidgets
      .filter((w) => w.deleted_at && new Date(w.deleted_at).getTime() < threshold)
      .map((w) => w.id);
    const expiredNoteIds = allNotes
      .filter((n) => n.deleted_at && new Date(n.deleted_at).getTime() < threshold)
      .map((n) => n.id);

    if (expiredTabIds.length > 0) {
      await db.tabs.bulkDelete(expiredTabIds);
      tabsCount = expiredTabIds.length;
    }
    if (expiredWidgetIds.length > 0) {
      await db.widgets.bulkDelete(expiredWidgetIds);
      widgetsCount = expiredWidgetIds.length;
    }
    if (expiredNoteIds.length > 0) {
      await db.notes.bulkDelete(expiredNoteIds);
      notesCount = expiredNoteIds.length;
    }
  } catch (err) {
    console.warn('Tombstone cleanup failed:', err);
  }

  return { tabs: tabsCount, widgets: widgetsCount, notes: notesCount };
}
