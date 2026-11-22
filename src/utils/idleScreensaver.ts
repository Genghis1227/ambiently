import type { DashboardWidget } from '../types/dashboard';

export const IDLE_SCREENSAVER_TIMEOUT_OPTIONS = [0, 5, 10, 15, 30] as const;
export type IdleScreensaverTimeoutMin = (typeof IDLE_SCREENSAVER_TIMEOUT_OPTIONS)[number];

export interface ScreensaverWeatherLocation {
  locationName: string;
  latitude: number;
  longitude: number;
  unit: 'F' | 'C';
}

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
