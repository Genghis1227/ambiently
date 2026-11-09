import type { PhotoItem } from '../services/photos';

export type DockPosition = 'left' | 'top' | 'right' | 'bottom';

export const MAX_CANVASES = 10;

export type CanvasBackgroundTheme =
  | 'midnight_dots'
  | 'warm_cork'
  | 'oled_black'
  | 'aurora'
  | 'blueprint'
  | 'paper_dots'
  | 'warm_linen'
  | 'minimal_light'
  | 'custom';

export type WidgetThemeMode = 'auto' | 'light' | 'dark';

export type AutoOrganizeMode = 'bento' | 'pack' | 'split';

export type WidgetType =
  | 'clock_weather'
  | 'clock'
  | 'world_clock'
  | 'weather'
  | 'sticky_notes'
  | 'photo_frame'
  | 'calendar'
  | 'countdown'
  | 'rss'
  | 'quotes'
  | 'embed'
  | 'textbox'
  | 'image'
  | 'chores'
  | 'meal_plan';

/** A family member on a chores tile. */
export interface ChorePerson {
  id: string;
  name: string;
  color: string; // hex
  emoji?: string;
}

export interface ChoreItem {
  id: string;
  title: string;
  emoji?: string;
  personId: string | null; // null = anyone can do it
  repeat: 'daily' | 'weekly' | 'once';
  days?: number[]; // daily chores only: weekdays it's due (0 = Sunday); empty or missing = every day
  stars: number;
}

export interface ChoreReward {
  id: string;
  title: string;
  emoji?: string;
  cost: number;
}

/** Who finished a chore, in which period (a day, a week, or 'once'), and the stars it gave. */
export interface ChoreDone {
  period: string;
  by?: string;
  stars: number;
  on: string; // local date it was finished, YYYY-MM-DD
}

export interface ChoresWidgetConfig {
  people?: ChorePerson[];
  chores?: ChoreItem[];
  rewards?: ChoreReward[];
  done?: Record<string, ChoreDone>;
  stars?: Record<string, number>; // star balance per person
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

export interface MealEntry {
  title: string;
  ingredients?: string[];
}

export interface MealPlanWidgetConfig {
  slots?: MealSlot[]; // default: dinner only
  meals?: Record<string, Partial<Record<MealSlot, MealEntry>>>; // keyed by local date YYYY-MM-DD
  library?: MealEntry[]; // recently planned meals, newest first
  listNoteId?: string; // the checklist note ingredients are added to
}

export interface RssWidgetConfig {
  feedUrl?: string;
  displayMode?: 'ticker' | 'list';
  textSize?: 'auto' | 'sm' | 'base' | 'lg' | 'xl';
  showSnippet?: boolean;
}

export interface ImageWidgetConfig {
  url?: string;
  title?: string;
  caption?: string;
  fit?: 'contain' | 'cover' | 'fill';
  transparentBg?: boolean;
  linkUrl?: string;
}

export interface GridDimensions {
  cols: number; // e.g., 12
  rows: number; // e.g., 8
}

export interface GridPosition {
  x: number; // grid col index (0..cols-1)
  y: number; // grid row index (0..rows-1)
  w: number; // grid col span
  h: number; // grid row span
}

export interface FreeformPosition {
  xRatio: number; // 0.0 to 1.0 (normalized percentage of canvas)
  yRatio: number; // 0.0 to 1.0 (normalized percentage of canvas)
  wRatio: number; // 0.05 to 1.0
  hRatio: number; // 0.05 to 1.0
  zIndex: number;
  rotation: number; // degrees (-60 to 60)
  isFullScreen?: boolean;
  isBackground?: boolean;
}

export interface DashboardTab {
  id: string;
  name: string;
  icon?: string;
  order: number;
  isHome?: boolean; // when true, designated as default home canvas
  backgroundTheme?: CanvasBackgroundTheme;
  customWallpaperUrl?: string;
  backgroundDimLevel?: number; // 0 to 90 (percentage dark overlay on custom picture)
  hideNotes?: boolean; // when true, hides sticky notes on this canvas
  layoutMode?: string;
  autoRotateDurationSec: number; // 0 = do not rotate, >0 = rotate after N seconds
  enabled?: boolean;
  updated_at: string;
  deleted_at?: string | null;
}

export interface DashboardWidget<TConfig = Record<string, any>> {
  id: string;
  tabId: string;
  type: WidgetType;
  title: string;
  gridPos: GridPosition;
  freeformPos: FreeformPosition;
  mobileOrder?: number; // independent vertical order for mobile companion (does not affect desktop/kiosk)
  config: TConfig;
  updated_at: string;
  deleted_at?: string | null;
}

export interface StickyNoteItem {
  id: string;
  tabId?: string;
  widgetId?: string;
  title?: string;
  content: string;
  isChecklist: boolean;
  checklistItems?: { id: string; text: string; done: boolean }[];
  bgColor: string; // e.g. '#fef08a' or hex
  textColor?: string;
  fontSize?: 'sm' | 'base' | 'lg' | 'xl';
  imageUrl?: string;
  giphyUrl?: string;
  expiresAt?: string | null; // ISO string or null for permanent
  archivedAt?: string | null; // soft deleted/trash
  isPinnedToCanvas?: boolean; // when false, closed from canvas and contained in Notes Tile
  freeformPos?: FreeformPosition;
  updated_at: string;
  deleted_at?: string | null;
}

export interface AppSettings {
  id: string; // 'global'
  dashboardTitle: string;
  dockPosition: DockPosition;
  carouselEnabled: boolean;
  defaultRotateDurationSec: number;
  displayDensity: 0.75 | 1.0 | 1.25 | 1.5; // per-device UI density
  timeFormat?: 'auto' | '12h' | '24h'; // 'auto' (or unset) follows the device's language
  weekStartsOn?: 'sunday' | 'monday'; // unset = Sunday
  wakeLockEnabled: boolean;
  
  // Night Mode
  nightModeEnabled: boolean;
  nightModeStart: string; // "22:00"
  nightModeEnd: string;   // "07:00"
  nightModeStyle: 'dim' | 'oled_clock';
  nightDimOpacity: number; // 0.0 - 0.95
  nightModeWakeTimeoutMin?: number; // Inactivity timeout in minutes before returning to night mode (0 = keep awake until morning)
  nightScheduleEnabled?: boolean; // false = night mode only starts by hand (unset counts as on)

  // Canvas & Dock Options
  snapToGrid?: boolean;
  isDockHidden?: boolean;
  autoHideCursor?: boolean;
  cursorIdleTimeoutSec?: number;

  // Common Photo Library (shared across photo widgets)
  commonPhotos?: PhotoItem[];
  commonPhotoSourceLabel?: string;
  commonPhotoSourceUrl?: string;
  commonPhotoSourceType?: 'plex' | 'local' | 'web' | 'curated';
  commonPhotoShowDateTaken?: boolean;

  // PIN Protection & Kid Kiosk Controls
  pinLockEnabled: boolean;
  pinHash?: string | null; // SHA-256 hex
  isLocked: boolean;
  lockFullscreenKiosk?: boolean; // Prevent exiting fullscreen without PIN
  lockCanvasEditing?: boolean;   // Disable modifying canvases (freezes moving, resizing, rotating & organizing)
  lockSettingsAccess?: boolean;  // Require PIN to open settings

  updated_at: string;
}

export interface LocalDeviceVaultItem {
  key: string;
  value: string;
  description?: string;
  updated_at: string;
}
