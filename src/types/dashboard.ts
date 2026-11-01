export type DockPosition = 'left' | 'top' | 'right' | 'bottom';

export type LayoutMode = 'grid' | 'freeform';

export type WidgetType =
  | 'clock_weather'
  | 'sticky_notes'
  | 'photo_frame'
  | 'calendar'
  | 'countdown'
  | 'rss'
  | 'quotes';

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
  rotation: number; // degrees (-45 to 45)
}

export interface DashboardTab {
  id: string;
  name: string;
  icon?: string;
  order: number;
  layoutMode: LayoutMode;
  autoRotateDurationSec: number; // 0 = do not rotate, >0 = rotate after N seconds
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

  // PIN Protection
  pinLockEnabled: boolean;
  pinHash?: string | null; // SHA-256 hex
  isLocked: boolean;

  updated_at: string;
}

export interface LocalDeviceVaultItem {
  key: string;
  value: string;
  description?: string;
  updated_at: string;
}
