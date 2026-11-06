import type { PhotoItem } from '../services/photos';

export type DockPosition = 'left' | 'top' | 'right' | 'bottom';

export const MAX_CANVASES = 10;

export type CanvasBackgroundTheme =
  | 'midnight_dots'
  | 'warm_cork'
  | 'oled_black'
  | 'aurora'
  | 'blueprint'
  | 'custom';

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
  | 'image';

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
  wakeLockEnabled: boolean;
  
  // Night Mode
  nightModeEnabled: boolean;
  nightModeStart: string; // "22:00"
  nightModeEnd: string;   // "07:00"
  nightModeStyle: 'dim' | 'oled_clock';
  nightDimOpacity: number; // 0.0 - 0.95

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
