import type {
  AppSettings,
  DashboardTab,
  DashboardWidget,
  StickyNoteItem,
} from '../types/dashboard';
import type { PhotoItem } from './photos';
import { isSameWidgetPhotoSource } from '../utils/photoSourceIsolation';

// Some fields never reach the cloud tables:
// - a photo frame's photo list (customPhotos) and a widget's order on the phone view (mobileOrder) stay
//   on each device
// - a canvas's look (theme, wallpaper, dimming, hidden notes, home canvas) syncs inside the board
//   settings (canvasThemes), not in the tabs table
// - a note closed from the canvas, and a note's text color and pictures, have no column
// A row from the cloud doesn't carry them, so these copy them over from this device's copy rather
// than erase them.

const TAB_FIELDS_KEPT_ELSEWHERE = [
  'backgroundTheme',
  'customWallpaperUrl',
  'backgroundDimLevel',
  'hideNotes',
  'isHome',
  'enabled',
] as const;

const NOTE_FIELDS_NOT_IN_CLOUD = ['isPinnedToCanvas', 'textColor', 'imageUrl', 'giphyUrl'] as const;

export function keepLocalWidgetFields(incoming: DashboardWidget, local?: DashboardWidget): DashboardWidget {
  if (!local) return incoming;
  const merged: DashboardWidget = { ...incoming };
  if (incoming.mobileOrder === undefined && local.mobileOrder !== undefined) {
    merged.mobileOrder = local.mobileOrder;
  }
  const localPhotos = local.config?.customPhotos;
  if (
    Array.isArray(localPhotos) &&
    localPhotos.length > 0 &&
    !incoming.config?.customPhotos?.length &&
    isSameWidgetPhotoSource(incoming.config, local.config)
  ) {
    merged.config = { ...(incoming.config || {}), customPhotos: localPhotos };
  }
  return merged;
}

export function keepLocalTabFields(incoming: DashboardTab, local?: DashboardTab): DashboardTab {
  if (!local) return incoming;
  const merged: DashboardTab = { ...incoming };
  for (const field of TAB_FIELDS_KEPT_ELSEWHERE) {
    if (merged[field] === undefined && local[field] !== undefined) {
      (merged as unknown as Record<string, unknown>)[field] = local[field];
    }
  }
  return merged;
}

export function keepLocalNoteFields(incoming: StickyNoteItem, local?: StickyNoteItem): StickyNoteItem {
  if (!local) return incoming;
  const merged: StickyNoteItem = { ...incoming };
  for (const field of NOTE_FIELDS_NOT_IN_CLOUD) {
    if (merged[field] === undefined && local[field] !== undefined) {
      (merged as unknown as Record<string, unknown>)[field] = local[field];
    }
  }
  return merged;
}

/** The canvas look fields of a tab, which sync inside the board settings (canvasThemes). */
export const CANVAS_LOOK_FIELDS = ['backgroundTheme', 'customWallpaperUrl', 'backgroundDimLevel', 'hideNotes', 'isHome'] as const;

export interface CloudSettingsDecisionParams {
  switchingBoards: boolean;
  joiningExistingCloudBoard: boolean;
  overwriteLocal: boolean;
  hasLocalSettings: boolean;
  isMember: boolean;
  firstSyncThisWay: boolean;
  localTime: number;
  cloudTime: number;
  boardTime: number;
}

/**
 * Determines whether downloaded cloud board settings should replace local Dexie settings.
 */
export function shouldAcceptCloudSettings(params: CloudSettingsDecisionParams): boolean {
  if (
    params.switchingBoards ||
    params.joiningExistingCloudBoard ||
    params.overwriteLocal ||
    !params.hasLocalSettings
  ) {
    return true;
  }
  if (params.isMember) {
    return params.cloudTime !== params.localTime;
  }
  if (params.firstSyncThisWay) {
    return params.boardTime >= params.localTime;
  }
  return params.cloudTime > params.localTime;
}

export interface MergeCloudSettingsParams {
  defaultSettings: AppSettings;
  cloudSettings: Partial<AppSettings>;
  currentSettings?: AppSettings;
  resolvedCommonPhotos: PhotoItem[];
  cloudSettingsAt: string;
  preserveDeviceLocks: boolean;
}

/**
 * Merges cloud settings with local defaults while preserving device-local PIN/kiosk locks
 * and reusing the resolved shared photo catalog when appropriate.
 */
export function mergeCloudSettingsForLocal(params: MergeCloudSettingsParams): AppSettings {
  const {
    defaultSettings,
    cloudSettings,
    currentSettings,
    resolvedCommonPhotos,
    cloudSettingsAt,
    preserveDeviceLocks,
  } = params;
  const hasLocalPin = Boolean(currentSettings?.pinLockEnabled && currentSettings?.pinHash);
  const keepLocalLocks = Boolean(preserveDeviceLocks && hasLocalPin);
  const settingsPinOptOut = keepLocalLocks ? Boolean(currentSettings?.settingsPinOptOut) : false;
  return {
    ...defaultSettings,
    ...cloudSettings,
    commonPhotos: resolvedCommonPhotos,
    pinHash: keepLocalLocks ? (currentSettings?.pinHash ?? null) : null,
    pinLockEnabled: keepLocalLocks,
    lockCanvasEditing: keepLocalLocks && currentSettings ? Boolean(currentSettings.lockCanvasEditing) : false,
    lockFullscreenKiosk:
      keepLocalLocks && currentSettings ? Boolean(currentSettings.lockFullscreenKiosk ?? true) : false,
    lockSettingsAccess: settingsPinOptOut ? false : true,
    settingsPinOptOut,
    id: 'global',
    updated_at: cloudSettingsAt,
  };
}

/**
 * Determines whether a cloud tab/widget/note row should replace the local copy.
 */
export function shouldAcceptCloudRow(params: {
  overwriteLocal: boolean;
  hasLocalRow: boolean;
  localTime: number;
  cloudTime: number;
}): boolean {
  if (!params.hasLocalRow || params.overwriteLocal) return true;
  return params.cloudTime >= params.localTime;
}
