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

export function isPermanentlyPurgedWidget(
  widget?: Pick<DashboardWidget, 'permanentlyDeleted' | 'config'> | null
): boolean {
  if (!widget) return false;
  if (widget.permanentlyDeleted) return true;
  const cfg = widget.config as Record<string, unknown> | undefined;
  return Boolean(cfg && cfg.__purged === true);
}

export function keepLocalWidgetFields(incoming: DashboardWidget, local?: DashboardWidget): DashboardWidget {
  const merged: DashboardWidget = { ...incoming };
  if (isPermanentlyPurgedWidget(incoming)) {
    merged.permanentlyDeleted = true;
  }
  if (!local) return merged;
  if (incoming.mobileOrder === undefined && local.mobileOrder !== undefined) {
    merged.mobileOrder = local.mobileOrder;
  }
  if (
    !merged.permanentlyDeleted &&
    incoming.deleted_at &&
    Object.keys(incoming.config || {}).length === 0 &&
    local.config &&
    !isPermanentlyPurgedWidget(local) &&
    Object.keys(local.config).length > 0
  ) {
    merged.config = { ...local.config };
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

const DIRTY_SETTINGS_KEYS_STORAGE_KEY = 'ambiently_dirty_settings_keys';
const dirtySettingsKeys = new Set<string>();

function persistDirtySettingsKeysToStorage(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    if (dirtySettingsKeys.size === 0) {
      localStorage.removeItem(DIRTY_SETTINGS_KEYS_STORAGE_KEY);
    } else {
      localStorage.setItem(DIRTY_SETTINGS_KEYS_STORAGE_KEY, JSON.stringify([...dirtySettingsKeys]));
    }
  } catch {
    // Ignore storage quota or sandbox restrictions
  }
}

function hydrateDirtySettingsKeysFromStorage(): void {
  if (dirtySettingsKeys.size > 0 || typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(DIRTY_SETTINGS_KEYS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (typeof item === 'string' && item.trim()) {
          dirtySettingsKeys.add(item);
        }
      }
    }
  } catch {
    // Ignore malformed storage entries
  }
}

const DANGEROUS_SETTING_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Records which `AppSettings` keys were modified locally since the last successful Cloud Sync
 * pull or push so concurrent cross-device pushes can merge modified fields rather than clobbering.
 */
export function markDirtySettingsKeys(keys: Iterable<string>): void {
  hydrateDirtySettingsKeysFromStorage();
  let added = false;
  for (const key of keys) {
    if (typeof key === 'string' && key.trim() && !DANGEROUS_SETTING_KEYS.has(key)) {
      dirtySettingsKeys.add(key);
      added = true;
    }
  }
  if (added) {
    persistDirtySettingsKeysToStorage();
  }
}

/**
 * Returns the set of locally modified `AppSettings` keys awaiting Cloud Sync reconciliation.
 */
export function getDirtySettingsKeys(): ReadonlySet<string> {
  hydrateDirtySettingsKeysFromStorage();
  return new Set(dirtySettingsKeys);
}

/**
 * Clears tracked local dirty `AppSettings` keys after Cloud Sync finishes pushing or pulling.
 */
export function clearDirtySettingsKeys(): void {
  dirtySettingsKeys.clear();
  persistDirtySettingsKeysToStorage();
}

let beforeUpdateReloadHandler: (() => Promise<void>) | null = null;

/**
 * Registers an async hook (such as flushing pending cloud pushes) invoked before `applyUpdate`
 * swaps the Service Worker or reloads the window.
 */
export function registerBeforeUpdateReload(fn: () => Promise<void>): void {
  beforeUpdateReloadHandler = fn;
}

/**
 * Runs the registered pre-reload hook (if any) with a bounded timeout before an app update reload.
 */
export async function invokeBeforeUpdateReload(timeoutMs = 1200): Promise<void> {
  if (!beforeUpdateReloadHandler) return;
  await Promise.race([
    beforeUpdateReloadHandler(),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]).catch(() => {});
}

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
  hasExplicitCloudSettingsTime?: boolean;
  knownCloudSettingsTime?: number | null;
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
    if (params.knownCloudSettingsTime !== undefined && params.knownCloudSettingsTime !== null) {
      return params.cloudTime !== params.knownCloudSettingsTime;
    }
    return params.cloudTime !== params.localTime;
  }
  if (params.firstSyncThisWay && !params.hasExplicitCloudSettingsTime) {
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
 * Merges cloud settings with local defaults while preserving device-local PIN/kiosk locks,
 * runtime nightModeEnabled state, displayDensity, and the resolved shared photo catalog.
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
    nightModeEnabled: preserveDeviceLocks ? Boolean(currentSettings?.nightModeEnabled) : false,
    displayDensity: preserveDeviceLocks
      ? (currentSettings?.displayDensity ??
          cloudSettings.displayDensity ??
          defaultSettings.displayDensity)
      : (cloudSettings.displayDensity ?? defaultSettings.displayDensity),
    pinHash: keepLocalLocks ? (currentSettings?.pinHash ?? null) : null,
    pinLockEnabled: keepLocalLocks,
    lockCanvasEditing: keepLocalLocks && currentSettings ? Boolean(currentSettings.lockCanvasEditing) : false,
    lockFullscreenKiosk:
      keepLocalLocks && currentSettings ? Boolean(currentSettings.lockFullscreenKiosk ?? true) : false,
    lockSettingsAccess: settingsPinOptOut ? false : true,
    settingsPinOptOut,
    externalBrowserLinksPolicy: preserveDeviceLocks
      ? currentSettings?.externalBrowserLinksPolicy || defaultSettings.externalBrowserLinksPolicy || 'auto'
      : defaultSettings.externalBrowserLinksPolicy || 'auto',
    id: 'global',
    updated_at: cloudSettingsAt,
  };
}

export interface MergeConcurrentCloudSettingsParams {
  defaultSettings: AppSettings;
  baseCloudSettings: Partial<AppSettings>;
  localSettings: AppSettings;
  dirtyKeys?: Iterable<string>;
}

/**
 * Reconciles concurrent cross-device `AppSettings` edits when a device pushes local changes
 * while newer cloud settings already exist from another device, overlaying only `dirtyKeys`
 * plus device-local runtime/kiosk fields so unrelated fields (such as screensaver mode) survive.
 */
export function mergeConcurrentCloudSettings(params: MergeConcurrentCloudSettingsParams): AppSettings {
  const { defaultSettings, baseCloudSettings, localSettings, dirtyKeys } = params;
  const dirtyList = dirtyKeys ? Array.from(dirtyKeys) : [];
  const dirtySet = dirtyList.length > 0 ? new Set(dirtyList) : null;

  const merged: Record<string, unknown> = {
    ...defaultSettings,
    ...baseCloudSettings,
  };

  if (dirtySet) {
    const localRecord = localSettings as unknown as Record<string, unknown>;
    for (const key of dirtySet) {
      if (!DANGEROUS_SETTING_KEYS.has(key) && Object.hasOwn(localRecord, key)) {
        merged[key] = localRecord[key];
      }
    }
    if (!dirtySet.has('commonPhotos')) {
      const hasCloudCommonPhotos =
        Array.isArray(baseCloudSettings.commonPhotos) && baseCloudSettings.commonPhotos.length > 0;
      const sameSource =
        !dirtySet.has('commonPhotoSourceType') &&
        baseCloudSettings.commonPhotoSourceType === localSettings.commonPhotoSourceType &&
        baseCloudSettings.commonPhotoSourceLabel === localSettings.commonPhotoSourceLabel &&
        baseCloudSettings.commonPhotoSourceUrl === localSettings.commonPhotoSourceUrl;
      if (
        !hasCloudCommonPhotos &&
        sameSource &&
        Array.isArray(localSettings.commonPhotos) &&
        localSettings.commonPhotos.length > 0
      ) {
        merged.commonPhotos = localSettings.commonPhotos;
      }
    }
  } else {
    Object.assign(merged, localSettings);
  }

  return {
    ...(merged as unknown as AppSettings),
    pinLockEnabled: localSettings.pinLockEnabled,
    pinHash: localSettings.pinHash,
    lockCanvasEditing: localSettings.lockCanvasEditing,
    lockFullscreenKiosk: localSettings.lockFullscreenKiosk,
    lockSettingsAccess: localSettings.lockSettingsAccess,
    settingsPinOptOut: localSettings.settingsPinOptOut,
    externalBrowserLinksPolicy: localSettings.externalBrowserLinksPolicy,
    displayDensity: localSettings.displayDensity,
    nightModeEnabled: localSettings.nightModeEnabled,
    id: 'global',
    updated_at: localSettings.updated_at,
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

export interface DirtySyncScopes {
  settings?: boolean;
  tabs?: boolean;
  widgets?: boolean;
  notes?: boolean;
  householdStores?: boolean;
}

export const ALL_DIRTY_SYNC_SCOPES: Required<DirtySyncScopes> = {
  settings: true,
  tabs: true,
  widgets: true,
  notes: true,
  householdStores: true,
};

export function mergeDirtySyncScopes(
  current: DirtySyncScopes,
  addition?: DirtySyncScopes
): DirtySyncScopes {
  if (!addition) {
    return { ...ALL_DIRTY_SYNC_SCOPES };
  }
  return {
    settings: Boolean(current.settings || addition.settings),
    tabs: Boolean(current.tabs || addition.tabs),
    widgets: Boolean(current.widgets || addition.widgets),
    notes: Boolean(current.notes || addition.notes),
    householdStores: Boolean(current.householdStores || addition.householdStores),
  };
}

/**
 * Determines which local/remote entity collections must be read and reconciled during `pushToCloud`.
 * Forced pushes, un-scoped calls, or devices without an established cloud baseline sync all scopes.
 */
export function resolveEffectiveSyncScopes(
  options?: { force?: boolean; dirtyScopes?: DirtySyncScopes },
  hasEstablishedCloudBaseline: boolean = false
): Required<DirtySyncScopes> {
  const dirty = options?.dirtyScopes;
  if (options?.force || !hasEstablishedCloudBaseline || !dirty) {
    return { ...ALL_DIRTY_SYNC_SCOPES };
  }
  const resolved: Required<DirtySyncScopes> = {
    settings: Boolean(dirty.settings),
    tabs: Boolean(dirty.tabs),
    widgets: Boolean(dirty.widgets),
    notes: Boolean(dirty.notes),
    householdStores: Boolean(dirty.householdStores),
  };
  if (
    !resolved.settings &&
    !resolved.tabs &&
    !resolved.widgets &&
    !resolved.notes &&
    !resolved.householdStores
  ) {
    return { ...ALL_DIRTY_SYNC_SCOPES };
  }
  return resolved;
}
