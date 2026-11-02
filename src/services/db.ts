import Dexie, { type EntityTable } from 'dexie';
import type {
  DashboardTab,
  DashboardWidget,
  StickyNoteItem,
  AppSettings,
  LocalDeviceVaultItem,
} from '../types/dashboard';

export class AmbientlyDatabase extends Dexie {
  tabs!: EntityTable<DashboardTab, 'id'>;
  widgets!: EntityTable<DashboardWidget, 'id'>;
  notes!: EntityTable<StickyNoteItem, 'id'>;
  settings!: EntityTable<AppSettings, 'id'>;
  vault!: EntityTable<LocalDeviceVaultItem, 'key'>;

  constructor() {
    super('AmbientlyDB');
    this.version(1).stores({
      tabs: 'id, order, updated_at, deleted_at',
      widgets: 'id, tabId, type, updated_at, deleted_at',
      notes: 'id, tabId, widgetId, expiresAt, archivedAt, updated_at, deleted_at',
      settings: 'id, updated_at',
      vault: 'key, updated_at', // Not synced externally
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
  pinLockEnabled: false,
  pinHash: null,
  isLocked: false,
  updated_at: new Date().toISOString(),
};

export const DEFAULT_TABS: DashboardTab[] = [
  {
    id: "tab-corkboard",
    name: "Family Board",
    icon: "Pin",
    order: 0,
    layoutMode: "freeform",
    autoRotateDurationSec: 30,
    enabled: true,
    updated_at: new Date().toISOString(),
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
    updated_at: new Date().toISOString(),
  },
  {
    id: 'widget-notes-tile',
    tabId: 'tab-corkboard',
    type: 'sticky_notes',
    title: 'Quick Reminders',
    gridPos: { x: 4, y: 0, w: 4, h: 8 },
    freeformPos: { xRatio: 0.45, yRatio: 0.05, wRatio: 0.4, hRatio: 0.6, zIndex: 2, rotation: 0 },
    config: {},
    updated_at: new Date().toISOString(),
  },
  {
    id: 'widget-photo-tile',
    tabId: 'tab-corkboard',
    type: 'photo_frame',
    title: 'Ambient Memories',
    gridPos: { x: 8, y: 0, w: 4, h: 8 },
    freeformPos: { xRatio: 0.45, yRatio: 0.55, wRatio: 0.5, hRatio: 0.4, zIndex: 3, rotation: 0 },
    config: { displayStyle: 'ken_burns', source: 'curated' },
    updated_at: new Date().toISOString(),
  },
  {
    id: 'widget-countdown-tile',
    tabId: 'tab-corkboard',
    type: 'countdown',
    title: 'Upcoming Milestone',
    gridPos: { x: 0, y: 4, w: 4, h: 4 },
    freeformPos: { xRatio: 0.05, yRatio: 0.55, wRatio: 0.35, hRatio: 0.4, zIndex: 1, rotation: 0 },
    config: { eventName: 'Family Vacation', targetDate: '2026-12-25T00:00:00Z' },
    updated_at: new Date().toISOString(),
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
    updated_at: new Date().toISOString(),
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
    updated_at: new Date().toISOString(),
  },
];
