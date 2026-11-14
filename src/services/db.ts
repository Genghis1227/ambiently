import Dexie, { type EntityTable } from 'dexie';
import type {
  DashboardTab,
  DashboardWidget,
  StickyNoteItem,
  AppSettings,
  LocalDeviceVaultItem,
} from '../types/dashboard';
import type { ChoreEngineSnapshot } from '../types/chores';
import { HOUSEHOLD_PROFILE_PALETTE, type HouseholdProfile } from '../types/profiles';
import {
  DEFAULT_AISLE_ORDER,
  type MealPlannerSnapshot,
  type StapleItem,
} from '../types/meals';
import type { KanbanBoard, KanbanCard, KanbanEngineSnapshot } from '../types/kanban';

export class AmbientlyDatabase extends Dexie {
  tabs!: EntityTable<DashboardTab, 'id'>;
  widgets!: EntityTable<DashboardWidget, 'id'>;
  notes!: EntityTable<StickyNoteItem, 'id'>;
  settings!: EntityTable<AppSettings, 'id'>;
  vault!: EntityTable<LocalDeviceVaultItem, 'key'>;
  chores!: EntityTable<ChoreEngineSnapshot, 'id'>;
  profiles!: EntityTable<HouseholdProfile, 'id'>;
  meals!: EntityTable<MealPlannerSnapshot, 'id'>;
  kanbanBoards!: EntityTable<KanbanBoard, 'id'>;
  kanbanCards!: EntityTable<KanbanCard, 'id'>;
  kanban!: EntityTable<KanbanEngineSnapshot, 'id'>;

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
      profiles: 'id, role, updatedAt, deletedAt',
    });
    this.version(3).stores({
      tabs: 'id, order, updated_at, deleted_at',
      widgets: 'id, tabId, type, updated_at, deleted_at',
      notes: 'id, tabId, widgetId, expiresAt, archivedAt, updated_at, deleted_at',
      settings: 'id, updated_at',
      vault: 'key, updated_at',
      chores: 'id, updated_at',
      profiles: 'id, role, updatedAt, deletedAt',
      meals: 'id, updated_at',
    });
    this.version(4).stores({
      tabs: 'id, order, updated_at, deleted_at',
      widgets: 'id, tabId, type, updated_at, deleted_at',
      notes: 'id, tabId, widgetId, expiresAt, archivedAt, updated_at, deleted_at',
      settings: 'id, updated_at',
      vault: 'key, updated_at',
      chores: 'id, updated_at',
      profiles: 'id, role, updatedAt, deletedAt',
      meals: 'id, updated_at',
      kanbanBoards: 'id, sortOrder, updatedAt',
      kanbanCards: 'id, boardId, [boardId+columnId+isArchived+sortOrder], updatedAt',
      kanban: 'id, updated_at',
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
  defaultWidgetStyle: 'auto',
  isDockHidden: false,
  autoHideCursor: true,
  cursorIdleTimeoutSec: 3,
  commonPhotos: [],
  commonPhotoSourceLabel: undefined,
  commonPhotoSourceUrl: undefined,
  commonPhotoSourceType: undefined,
  commonPhotoPlexConfig: undefined,
  photoAutoSyncInterval: 'daily',
  pinLockEnabled: false,
  pinHash: null,
  isLocked: false,
  lockFullscreenKiosk: true,
  lockCanvasEditing: false,
  lockSettingsAccess: true,
  settingsPinOptOut: false,
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
    title: '🛒 Shopping List',
    content: '',
    isChecklist: true,
    isShoppingList: true,
    checklistItems: [
      { id: '1', text: 'Organic Whole Milk', done: false, category: 'Dairy & Eggs' },
      { id: '2', text: 'Sourdough Bread', done: true, category: 'Bakery' },
      { id: '3', text: 'Avocados & Honeycrisp Apples', done: false, category: 'Produce' },
      { id: '4', text: 'Cold Brew Coffee', done: false, category: 'Beverages' },
    ],
    bgColor: '#bbf7d0', // Emerald light
    fontSize: 'base',
    freeformPos: {
      xRatio: 0.52,
      yRatio: 0.2,
      wRatio: 0.38,
      hRatio: 0.45,
      zIndex: 11,
      rotation: 3,
      isShoppingList: true,
    },
    updated_at: '1970-01-01T00:00:00.000Z',
  },
];

export const DEFAULT_HOUSEHOLD_PROFILES: HouseholdProfile[] = [
  {
    id: 'p_parent_1',
    name: 'Parent 1',
    role: 'parent',
    color: HOUSEHOLD_PROFILE_PALETTE[1].hex, // Slate Blue
    emoji: '🛡️',
    createdAt: '1970-01-01T00:00:00.000Z',
    updatedAt: '1970-01-01T00:00:00.000Z',
  },
  {
    id: 'p_parent_2',
    name: 'Parent 2',
    role: 'parent',
    color: HOUSEHOLD_PROFILE_PALETTE[2].hex, // Dusty Rose
    emoji: '🌸',
    createdAt: '1970-01-01T00:00:00.000Z',
    updatedAt: '1970-01-01T00:00:00.000Z',
  },
  {
    id: 'p_kid_1',
    name: 'Alex',
    role: 'kid',
    color: HOUSEHOLD_PROFILE_PALETTE[0].hex, // Sage Green
    emoji: '🌿',
    createdAt: '1970-01-01T00:00:00.000Z',
    updatedAt: '1970-01-01T00:00:00.000Z',
  },
  {
    id: 'p_kid_2',
    name: 'Maya',
    role: 'kid',
    color: HOUSEHOLD_PROFILE_PALETTE[3].hex, // Lavender-Gray
    emoji: '🦋',
    createdAt: '1970-01-01T00:00:00.000Z',
    updatedAt: '1970-01-01T00:00:00.000Z',
  },
];

export const DEFAULT_CHORE_SNAPSHOT: ChoreEngineSnapshot = {
  id: 'household_chores',
  profiles: [
    {
      id: 'p_kid_1',
      name: 'Alex',
      role: 'kid',
      color: HOUSEHOLD_PROFILE_PALETTE[0].hex, // Sage Green
      emoji: '🌿',
      balance: 0,
      lifetimePoints: 0,
    },
    {
      id: 'p_kid_2',
      name: 'Maya',
      role: 'kid',
      color: HOUSEHOLD_PROFILE_PALETTE[3].hex, // Lavender-Gray
      emoji: '🦋',
      balance: 0,
      lifetimePoints: 0,
    },
    {
      id: 'p_parent_1',
      name: 'Parent 1',
      role: 'parent',
      color: HOUSEHOLD_PROFILE_PALETTE[1].hex, // Slate Blue
      emoji: '🛡️',
      balance: 0,
      lifetimePoints: 0,
    },
    {
      id: 'p_parent_2',
      name: 'Parent 2',
      role: 'parent',
      color: HOUSEHOLD_PROFILE_PALETTE[2].hex, // Dusty Rose
      emoji: '🌸',
      balance: 0,
      lifetimePoints: 0,
    },
  ],
  templates: [
    {
      id: 'chore-tpl-bed-1',
      title: 'Make Bed & Tidy Room',
      points: 10,
      assignedTo: 'p_kid_1',
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
      assignedTo: 'p_kid_2',
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
      assignedTo: 'p_kid_1',
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
      assignedTo: 'p_kid_2',
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
      profileId: 'p_kid_1',
      title: 'Pick Friday Family Movie & Popcorn',
      pointsCost: 100,
      status: 'active_goal',
      createdAt: '1970-01-01T00:00:00.000Z',
      pricedAt: '1970-01-01T00:00:00.000Z',
    },
    {
      id: 'reward-2',
      profileId: 'p_kid_2',
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

export const DEFAULT_HOUSEHOLD_STAPLES: StapleItem[] = [
  {
    id: 'staple-milk',
    name: 'Milk',
    defaultQuantity: 1,
    defaultUnit: 'gallon',
    category: 'Dairy & Eggs',
    createdAt: '1970-01-01T00:00:00.000Z',
    updatedAt: '1970-01-01T00:00:00.000Z',
  },
  {
    id: 'staple-eggs',
    name: 'Eggs',
    defaultQuantity: 12,
    defaultUnit: null,
    category: 'Dairy & Eggs',
    createdAt: '1970-01-01T00:00:00.000Z',
    updatedAt: '1970-01-01T00:00:00.000Z',
  },
  {
    id: 'staple-butter',
    name: 'Butter',
    defaultQuantity: 1,
    defaultUnit: 'lb',
    category: 'Dairy & Eggs',
    createdAt: '1970-01-01T00:00:00.000Z',
    updatedAt: '1970-01-01T00:00:00.000Z',
  },
  {
    id: 'staple-bread',
    name: 'Sourdough Bread',
    defaultQuantity: 1,
    defaultUnit: null,
    category: 'Bakery',
    createdAt: '1970-01-01T00:00:00.000Z',
    updatedAt: '1970-01-01T00:00:00.000Z',
  },
  {
    id: 'staple-bananas',
    name: 'Bananas',
    defaultQuantity: 1,
    defaultUnit: 'bunch',
    category: 'Produce',
    createdAt: '1970-01-01T00:00:00.000Z',
    updatedAt: '1970-01-01T00:00:00.000Z',
  },
  {
    id: 'staple-onions',
    name: 'Yellow Onions',
    defaultQuantity: 3,
    defaultUnit: null,
    category: 'Produce',
    createdAt: '1970-01-01T00:00:00.000Z',
    updatedAt: '1970-01-01T00:00:00.000Z',
  },
  {
    id: 'staple-garlic',
    name: 'Garlic',
    defaultQuantity: 2,
    defaultUnit: 'head',
    category: 'Produce',
    createdAt: '1970-01-01T00:00:00.000Z',
    updatedAt: '1970-01-01T00:00:00.000Z',
  },
  {
    id: 'staple-chicken',
    name: 'Chicken Breast',
    defaultQuantity: 2,
    defaultUnit: 'lb',
    category: 'Meat & Seafood',
    createdAt: '1970-01-01T00:00:00.000Z',
    updatedAt: '1970-01-01T00:00:00.000Z',
  },
  {
    id: 'staple-olive-oil',
    name: 'Olive Oil',
    defaultQuantity: 1,
    defaultUnit: 'bottle',
    category: 'Pantry & Dry Goods',
    createdAt: '1970-01-01T00:00:00.000Z',
    updatedAt: '1970-01-01T00:00:00.000Z',
  },
  {
    id: 'staple-rice',
    name: 'Jasmine Rice',
    defaultQuantity: 1,
    defaultUnit: 'bag',
    category: 'Pantry & Dry Goods',
    createdAt: '1970-01-01T00:00:00.000Z',
    updatedAt: '1970-01-01T00:00:00.000Z',
  },
];

export const DEFAULT_MEAL_SNAPSHOT: MealPlannerSnapshot = {
  id: 'household_meals',
  recipes: [],
  scheduledMeals: [],
  shoppingItems: [],
  staples: DEFAULT_HOUSEHOLD_STAPLES,
  aisleOrder: [...DEFAULT_AISLE_ORDER],
  weekStartsOn: 'sunday',
  deletedRecipeIds: [],
  deletedScheduledMealIds: [],
  deletedShoppingItemIds: [],
  deletedStapleIds: [],
  updated_at: '1970-01-01T00:00:00.000Z',
};

export const DEFAULT_KANBAN_BOARDS: KanbanBoard[] = [
  {
    id: 'board-household-projects',
    name: 'Household Projects',
    autoArchiveDays: 7,
    sortOrder: 1000,
    createdAt: '1970-01-01T00:00:00.000Z',
    updatedAt: '1970-01-01T00:00:00.000Z',
  },
];

export const DEFAULT_KANBAN_CARDS: KanbanCard[] = [];

export const DEFAULT_KANBAN_SNAPSHOT: KanbanEngineSnapshot = {
  id: 'household_kanban',
  boards: DEFAULT_KANBAN_BOARDS,
  cards: DEFAULT_KANBAN_CARDS,
  deletedBoardIds: [],
  deletedCardIds: [],
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
