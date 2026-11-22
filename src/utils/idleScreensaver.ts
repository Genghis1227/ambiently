import type {
  AppSettings,
  DashboardTab,
  DashboardWidget,
  IdleScreensaverMode,
  IdleScreensaverPhotoStyle,
  IdleScreensaverPolaroidSizeMode,
} from '../types/dashboard';

export const IDLE_SCREENSAVER_TIMEOUT_OPTIONS = [0, 5, 10, 15, 30] as const;
export type IdleScreensaverTimeoutMin = (typeof IDLE_SCREENSAVER_TIMEOUT_OPTIONS)[number];

export const IDLE_SCREENSAVER_PHOTO_STYLES = [
  'ken_burns',
  'mosaic',
  'polaroid',
  'filmstrip',
] as const;
export const IDLE_SCREENSAVER_ROTATION_OPTIONS = [5, 10, 15, 30, 60] as const;
export const IDLE_SCREENSAVER_POLAROID_PRESETS = [6, 12, 18, 24, 32] as const;
export const IDLE_SCREENSAVER_POLAROID_SIZE_MODES = [
  'mixed',
  'uniform',
  'small',
  'large',
] as const;

export interface ScreensaverWeatherLocation {
  locationName: string;
  latitude: number;
  longitude: number;
  unit: 'F' | 'C';
}

export type EffectiveIdleScreensaverTarget =
  | { mode: 'canvas'; tab: DashboardTab }
  | { mode: 'photos'; tab: null };

/**
 * Normalizes persisted idle screensaver timeout values to supported choices (`0 | 5 | 10 | 15 | 30`).
 */
export function normalizeIdleScreensaverTimeoutMin(value: unknown): IdleScreensaverTimeoutMin {
  const num = Number(value);
  if (num === 5 || num === 10 || num === 15 || num === 30) {
    return num;
  }
  return 0;
}

/**
 * Normalizes screensaver source mode ('photos' vs 'canvas').
 */
export function normalizeIdleScreensaverMode(value: unknown): IdleScreensaverMode {
  return value === 'canvas' ? 'canvas' : 'photos';
}

/**
 * Normalizes standalone slideshow style to supported PhotoDisplayStyle choices.
 */
export function normalizeIdleScreensaverPhotoStyle(value: unknown): IdleScreensaverPhotoStyle {
  if (value === 'mosaic' || value === 'polaroid' || value === 'filmstrip') {
    return value;
  }
  return 'ken_burns';
}

/**
 * Normalizes Scattered Polaroid density into the supported `4..36` integer range (default `12`).
 */
export function normalizeIdleScreensaverPolaroidCount(value: unknown): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 12;
  return Math.max(4, Math.min(36, Math.round(num)));
}

/**
 * Normalizes Polaroid card size variation mode.
 */
export function normalizeIdleScreensaverPolaroidSizeMode(
  value: unknown
): IdleScreensaverPolaroidSizeMode {
  if (value === 'uniform' || value === 'small' || value === 'large') {
    return value;
  }
  return 'mixed';
}

/**
 * Normalizes slideshow rotation interval seconds (`5 | 10 | 15 | 30 | 60`, default `15`).
 */
export function normalizeIdleScreensaverRotationSec(value: unknown): number {
  const num = Number(value);
  if (num === 5 || num === 10 || num === 15 || num === 30 || num === 60) {
    return num;
  }
  return 15;
}

/**
 * Normalizes slideshow playback order (`random` or `sequential`).
 */
export function normalizeIdleScreensaverPhotoOrder(value: unknown): 'random' | 'sequential' {
  return value === 'sequential' ? 'sequential' : 'random';
}

/**
 * Resolves whether the idle screensaver should mirror a configured non-deleted canvas
 * (including canvases hidden from the dock via `enabled === false`) or fall back to
 * the standalone Photo Slideshow when disabled or deleted.
 */
export function resolveEffectiveIdleScreensaverTarget(
  settings: Pick<AppSettings, 'idleScreensaverMode' | 'idleScreensaverTabId'>,
  tabs: DashboardTab[]
): EffectiveIdleScreensaverTarget {
  if (normalizeIdleScreensaverMode(settings.idleScreensaverMode) !== 'canvas') {
    return { mode: 'photos', tab: null };
  }

  const targetId =
    typeof settings.idleScreensaverTabId === 'string' ? settings.idleScreensaverTabId.trim() : '';
  if (!targetId) {
    return { mode: 'photos', tab: null };
  }

  const matchedTab = (tabs || []).find((t) => t && !t.deleted_at && t.id === targetId);
  if (!matchedTab) {
    return { mode: 'photos', tab: null };
  }

  return { mode: 'canvas', tab: matchedTab };
}

/**
 * Picks a sensible default canvas ID when enabling Canvas screensaver mode for the first time,
 * preferring the first non-deleted board containing a Photo Frame tile.
 */
export function pickDefaultScreensaverCanvasTabId(
  tabs: DashboardTab[],
  widgets: DashboardWidget[]
): string | null {
  const activeTabs = (tabs || [])
    .filter((t) => Boolean(t && !t.deleted_at))
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (activeTabs.length === 0) return null;

  const photoTabIds = new Set(
    (widgets || [])
      .filter((w) => Boolean(w && !w.deleted_at && w.type === 'photo_frame'))
      .map((w) => w.tabId)
  );

  const photoTab = activeTabs.find((t) => photoTabIds.has(t.id));
  return photoTab?.id ?? activeTabs[0].id;
}

/**
 * Returns true when the idle photo screensaver must stay inactive or yield
 * (disabled, mobile companion, night mode, open modal dialogs, or firing timer alarms).
 */
export function shouldBlockIdleScreensaver(params: {
  timeoutMin: number;
  isMobileCompanionActive: boolean;
  nightModeEnabled: boolean;
  isAnyBlockingOverlayOpen: boolean;
  hasActiveModalOrAlarmInDom: boolean;
}): boolean {
  if (!Number.isFinite(params.timeoutMin) || params.timeoutMin <= 0) {
    return true;
  }
  if (
    params.isMobileCompanionActive ||
    params.nightModeEnabled ||
    params.isAnyBlockingOverlayOpen ||
    params.hasActiveModalOrAlarmInDom
  ) {
    return true;
  }
  return false;
}

/**
 * Selects the household weather location from the newest non-deleted Weather or Clock+Weather widget
 * so the idle screensaver can display a local weather pill without extra setup.
 */
export function resolveScreensaverWeatherLocation(
  widgets: DashboardWidget[]
): ScreensaverWeatherLocation | null {
  const candidates = (widgets || [])
    .filter(
      (w) =>
        w &&
        !w.deleted_at &&
        (w.type === 'weather' || w.type === 'clock_weather') &&
        typeof w.config?.latitude === 'number' &&
        Number.isFinite(w.config.latitude) &&
        typeof w.config?.longitude === 'number' &&
        Number.isFinite(w.config.longitude)
    )
    .sort((a, b) => (Date.parse(b.updated_at || '') || 0) - (Date.parse(a.updated_at || '') || 0));

  const chosen = candidates[0];
  if (!chosen) return null;

  return {
    locationName:
      typeof chosen.config?.locationName === 'string' && chosen.config.locationName.trim()
        ? chosen.config.locationName.trim()
        : 'Local Weather',
    latitude: chosen.config.latitude,
    longitude: chosen.config.longitude,
    unit: chosen.config?.unit === 'C' ? 'C' : 'F',
  };
}
