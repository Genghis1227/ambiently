export type DisplayOrientation = 'landscape' | 'portrait';

export const MOBILE_COMPANION_MAX_WIDTH_PX = 768;
export const DESKTOP_MODE_OVERRIDE_STORAGE_KEY = 'ambiently_force_desktop_mode';

export interface ViewportLayoutMode {
  width: number;
  height: number;
  isMobileViewport: boolean;
  isMobileCompanionActive: boolean;
  isPortraitViewport: boolean;
  isPortraitDesktop: boolean;
  orientation: DisplayOrientation;
  aspectRatio: number;
}

/**
 * Classifies viewport dimensions and desktop override state cleanly across mobile,
 * landscape desktop/kiosk, and rotated portrait (9:16) wall displays.
 */
export function resolveViewportLayoutMode(
  width: number,
  height: number,
  forceDesktopMode = false
): ViewportLayoutMode {
  const safeW = Number.isFinite(width) && width > 0 ? width : 1280;
  const safeH = Number.isFinite(height) && height > 0 ? height : 800;
  const isMobileViewport = safeW < MOBILE_COMPANION_MAX_WIDTH_PX;
  const isMobileCompanionActive = isMobileViewport && !forceDesktopMode;
  const isPortraitViewport = safeH > safeW;
  const isPortraitDesktop = !isMobileCompanionActive && isPortraitViewport;
  const orientation: DisplayOrientation = isPortraitViewport ? 'portrait' : 'landscape';
  const aspectRatio = Number((safeW / safeH).toFixed(4));

  return {
    width: safeW,
    height: safeH,
    isMobileViewport,
    isMobileCompanionActive,
    isPortraitViewport,
    isPortraitDesktop,
    orientation,
    aspectRatio,
  };
}

/**
 * Reads device-local Desktop View preference (used by rotated <768px portrait kiosks
 * such as 720x1280 displays so Desktop Portrait persists across reloads).
 */
export function readPersistedForceDesktopMode(): boolean {
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return false;
    }
    return window.localStorage.getItem(DESKTOP_MODE_OVERRIDE_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Persists device-local Desktop View preference strictly in localStorage (never Cloud Synced).
 */
export function writePersistedForceDesktopMode(enabled: boolean): void {
  try {
    if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
      return;
    }
    if (enabled) {
      window.localStorage.setItem(DESKTOP_MODE_OVERRIDE_STORAGE_KEY, 'true');
    } else {
      window.localStorage.removeItem(DESKTOP_MODE_OVERRIDE_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota or sandbox restrictions
  }
}

/**
 * Reads the current browser viewport orientation, falling back safely to 'landscape' outside DOM environments.
 */
export function resolveCurrentDisplayOrientation(): DisplayOrientation {
  if (typeof window === 'undefined') {
    return 'landscape';
  }
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return 'landscape';
  }
  return h > w ? 'portrait' : 'landscape';
}

/**
 * Reads the current viewport width/height ratio, falling back cleanly to 16:9 outside DOM environments.
 */
export function resolveCurrentViewportAspectRatio(): number {
  if (typeof window === 'undefined') {
    return 16 / 9;
  }
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    return 16 / 9;
  }
  return Number((w / h).toFixed(4));
}

/**
 * Widens narrow landscape-proportioned spawn sizes when adding new tiles onto a tall portrait board.
 */
export function resolvePortraitSpawnDimensions(
  orientation: DisplayOrientation,
  requestedW: number,
  requestedH: number
): { wRatio: number; hRatio: number } {
  if (orientation !== 'portrait') {
    return { wRatio: requestedW, hRatio: requestedH };
  }
  if (requestedW < 0.55 && requestedH > 0.3) {
    return {
      wRatio: Number(Math.min(0.92, Math.max(requestedW * 1.45, 0.46)).toFixed(4)),
      hRatio: Number(Math.min(0.42, Math.max(0.22, requestedH * 0.62)).toFixed(4)),
    };
  }
  return { wRatio: requestedW, hRatio: requestedH };
}

/**
 * Chooses vertical stacking vs horizontal scrolling vs full columns for multi-day Calendar views
 * based on measured container width rather than viewport breakpoints.
 */
export function resolveAdaptiveCalendarColumns(
  view: '3day' | 'week',
  containerWidth: number
): { stacked: boolean; scrollHorizontally: boolean } {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return { stacked: false, scrollHorizontally: false };
  }
  if (view === '3day') {
    return {
      stacked: containerWidth < 460,
      scrollHorizontally: false,
    };
  }
  return {
    stacked: containerWidth < 540,
    scrollHorizontally: containerWidth >= 540 && containerWidth < 760,
  };
}

/**
 * Chooses 1, 2, or 3 day-box columns for Full-Week Meal Planner based on container width.
 */
export function resolveAdaptiveMealWeekColumns(containerWidth: number): 1 | 2 | 3 {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) {
    return 2;
  }
  if (containerWidth < 520) {
    return 1;
  }
  if (containerWidth >= 900) {
    return 3;
  }
  return 2;
}

/**
 * Resolves automatic Finance widget presentation from container dimensions, favoring readable list
 * rows when a tile is tall and narrow on portrait canvases.
 */
export function resolveFinanceAutoMode(
  width: number,
  height: number
): 'ticker' | 'grid' | 'list' {
  if (height > 0 && height < 135 && width >= 280) {
    return 'ticker';
  }
  if (width >= 560 && height >= 175 && width / height >= 0.72) {
    return 'grid';
  }
  return 'list';
}
