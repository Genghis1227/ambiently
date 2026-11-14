import type {
  AppSettings,
  DashboardTab,
  DashboardWidget,
  FreeformPosition,
  StickyNoteItem,
} from '../types/dashboard';
import type { PhotoItem } from './photos';
import { isSameWidgetPhotoSource } from '../utils/photoSourceIsolation';

// Some fields never reach dedicated columns in the cloud tables:
// - a photo frame's photo list (customPhotos) and a widget's order on the phone view (mobileOrder) stay
//   on each device
// - a canvas's look (theme, wallpaper, dimming, hidden notes, home canvas) syncs inside the board
//   settings (canvasThemes), not in the tabs table
// - a note's canvas pin state (isPinnedToCanvas), shopping-list flag, and text color sync inside
//   freeform_pos JSONB, while imageUrl/giphyUrl remain device-local and legacy cloud rows without
//   those JSONB fields fall back to this device's copy rather than erasing them.

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
 * Returns an ISO timestamp strictly greater than any previous timestamp on the record so local
 * edits, archives, or deletions always beat earlier cross-device writes even under minor clock skew.
 */
export function nextMonotonicIso(previousIso?: string | null, nowMs = Date.now()): string {
  const prevMs = previousIso ? Date.parse(previousIso) : 0;
  const safePrev = Number.isFinite(prevMs) ? prevMs : 0;
  return new Date(Math.max(nowMs, safePrev + 1)).toISOString();
}

/**
 * Serializes StickyNoteItem canvas metadata (`isShoppingList`, `isPinnedToCanvas`, `textColor`)
 * into `freeformPos` so JSONB storage in Supabase (`notes.freeform_pos`) syncs pin/close state
 * across screens without requiring extra table columns.
 */
export function buildNoteFreeformPos(
  note: Pick<
    StickyNoteItem,
    'freeformPos' | 'isShoppingList' | 'isPinnedToCanvas' | 'textColor' | 'deleted_at'
  >,
  nextPos?: FreeformPosition
): FreeformPosition {
  if (note.deleted_at) {
    return { xRatio: 0, yRatio: 0, wRatio: 0.24, hRatio: 0.28, zIndex: 1, rotation: 0 };
  }
  const basePos: FreeformPosition = {
    ...((nextPos || note.freeformPos || {}) as FreeformPosition),
  };

  const isShoppingList = Boolean(note.isShoppingList ?? basePos.isShoppingList);
  if (isShoppingList) {
    basePos.isShoppingList = true;
  } else {
    delete basePos.isShoppingList;
  }

  const pinned = note.isPinnedToCanvas ?? basePos.isPinnedToCanvas;
  if (typeof pinned === 'boolean') {
    basePos.isPinnedToCanvas = pinned;
  } else {
    delete basePos.isPinnedToCanvas;
  }

  const textColor = note.textColor ?? basePos.textColor;
  if (typeof textColor === 'string' && textColor.length > 0) {
    basePos.textColor = textColor;
  } else {
    delete basePos.textColor;
  }

  return basePos;
}

/**
 * Produces the `freeform_pos` JSONB payload sent to Supabase `public.notes`, stripping layout and
 * metadata for tombstoned (`deleted_at`) rows so deleted notes occupy minimal cloud storage.
 */
export function buildNoteCloudFreeformPos(
  note: Pick<
    StickyNoteItem,
    'freeformPos' | 'isShoppingList' | 'isPinnedToCanvas' | 'textColor' | 'deleted_at'
  >
): FreeformPosition | Record<string, never> {
  if (note.deleted_at) return {};
  return buildNoteFreeformPos(note);
}

/**
 * Normalizes a note loaded from Dexie so metadata persisted in `freeformPos` (`isShoppingList`,
 * `isPinnedToCanvas`, `textColor`) is reflected on top-level fields consistently.
 */
export function normalizeLoadedNote(note: StickyNoteItem): StickyNoteItem {
  const isShoppingList = Boolean(note.isShoppingList || note.freeformPos?.isShoppingList);
  const resolvedPinned =
    typeof note.isPinnedToCanvas === 'boolean'
      ? note.isPinnedToCanvas
      : typeof note.freeformPos?.isPinnedToCanvas === 'boolean'
        ? note.freeformPos.isPinnedToCanvas
        : undefined;
  const resolvedTextColor =
    typeof note.textColor === 'string' && note.textColor.length > 0
      ? note.textColor
      : typeof note.freeformPos?.textColor === 'string' && note.freeformPos.textColor.length > 0
        ? note.freeformPos.textColor
        : undefined;

  return {
    ...note,
    ...(isShoppingList ? { isShoppingList: true, isChecklist: true } : {}),
    ...(resolvedPinned !== undefined ? { isPinnedToCanvas: resolvedPinned } : {}),
    ...(resolvedTextColor ? { textColor: resolvedTextColor } : {}),
  };
}

/**
 * Hydrates a Supabase `public.notes` row (used by both full pull and Realtime events) into a
 * `StickyNoteItem`, restoring `isShoppingList`, `isPinnedToCanvas`, and `textColor` from `freeform_pos`.
 */
export function hydrateNoteFromCloudRow(raw: Record<string, any>): StickyNoteItem {
  const freeformPos =
    raw.freeform_pos && typeof raw.freeform_pos === 'object' ? raw.freeform_pos : undefined;
  const isShoppingList = Boolean(raw.is_shopping_list || freeformPos?.isShoppingList);
  const pinnedFromPos =
    typeof freeformPos?.isPinnedToCanvas === 'boolean' ? freeformPos.isPinnedToCanvas : undefined;
  const textColorFromPos =
    typeof freeformPos?.textColor === 'string' && freeformPos.textColor.length > 0
      ? freeformPos.textColor
      : undefined;

  return {
    id: raw.id,
    tabId: raw.tab_id,
    widgetId: raw.widget_id,
    title: raw.title,
    content: raw.content || '',
    isChecklist: Boolean(raw.is_checklist || isShoppingList),
    isShoppingList,
    checklistItems: Array.isArray(raw.checklist_items) ? raw.checklist_items : [],
    bgColor: raw.bg_color || '#fef08a',
    ...(textColorFromPos ? { textColor: textColorFromPos } : {}),
    fontSize: raw.font_size || 'base',
    expiresAt: raw.expires_at,
    archivedAt: raw.archived_at,
    ...(pinnedFromPos !== undefined ? { isPinnedToCanvas: pinnedFromPos } : {}),
    freeformPos: (freeformPos || {}) as FreeformPosition,
    updated_at: raw.updated_at || new Date().toISOString(),
    deleted_at: raw.deleted_at,
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
  localDeletedOrArchived?: boolean;
  cloudDeletedOrArchived?: boolean;
}): boolean {
  if (!params.hasLocalRow || params.overwriteLocal) return true;
  if (params.cloudTime > params.localTime) return true;
  if (params.cloudTime < params.localTime) return false;
  if (params.localDeletedOrArchived && !params.cloudDeletedOrArchived) return false;
  return true;
}

/**
 * Determines whether a local row should be pushed up to Supabase. Prevents even `force: true`
 * pushes from a lagging device from overwriting a newer cloud deletion or archival tombstone.
 */
export function shouldPushLocalRowToCloud(params: {
  force?: boolean;
  localTime: number;
  remoteTime?: number;
  localDeletedOrArchived?: boolean;
  remoteDeletedOrArchived?: boolean;
}): boolean {
  if (params.remoteTime === undefined) return true;
  if (params.force) {
    if (
      params.remoteDeletedOrArchived &&
      !params.localDeletedOrArchived &&
      params.remoteTime >= params.localTime
    ) {
      return false;
    }
    return true;
  }
  if (params.localTime > params.remoteTime) return true;
  if (
    params.localTime === params.remoteTime &&
    params.localDeletedOrArchived &&
    !params.remoteDeletedOrArchived
  ) {
    return true;
  }
  return false;
}

/**
 * Determines whether an incoming Postgres Realtime row event should mutate local state, guarding
 * local deletions and archives against stale or tied non-deleted broadcasts.
 */
export function shouldApplyRealtimeRow(params: {
  hasLocalRow: boolean;
  localTime: number;
  remoteTime: number;
  localDeletedOrArchived?: boolean;
  remoteDeletedOrArchived?: boolean;
}): boolean {
  if (!params.hasLocalRow) return true;
  if (params.remoteTime < params.localTime) return false;
  if (
    params.remoteTime === params.localTime &&
    params.localDeletedOrArchived &&
    !params.remoteDeletedOrArchived
  ) {
    return false;
  }
  return true;
}
