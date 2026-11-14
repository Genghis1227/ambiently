import { useSyncExternalStore } from 'react';
import { useDashboardStore } from '../store/dashboardStore';

function getDocumentHiddenSnapshot(): boolean {
  if (typeof document === 'undefined') return false;
  return document.visibilityState === 'hidden';
}

function subscribeVisibilityChange(callback: () => void): () => void {
  if (typeof document === 'undefined') return () => {};
  document.addEventListener('visibilitychange', callback);
  return () => {
    document.removeEventListener('visibilitychange', callback);
  };
}

export interface DisplayActivityState {
  isTabHidden: boolean;
  isNightMode: boolean;
  isOledNightClock: boolean;
  shouldPauseAnimations: boolean;
}

/**
 * Shared display activity state combining browser visibility and Kiosk Night Mode so animated
 * media and slideshow intervals suspend immediately when off-screen or dimmed for night.
 */
export function useDisplayActivity(): DisplayActivityState {
  const isTabHidden = useSyncExternalStore(
    subscribeVisibilityChange,
    getDocumentHiddenSnapshot,
    () => false
  );
  const nightModeEnabled = useDashboardStore((s) => Boolean(s.settings.nightModeEnabled));
  const nightModeStyle = useDashboardStore((s) => s.settings.nightModeStyle);

  return {
    isTabHidden,
    isNightMode: nightModeEnabled,
    isOledNightClock: nightModeEnabled && nightModeStyle === 'oled_clock',
    shouldPauseAnimations: isTabHidden || nightModeEnabled,
  };
}
