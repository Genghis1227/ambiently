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

let isPhotoScreensaverOccluding = false;
const occlusionListeners = new Set<() => void>();

export function setPhotoScreensaverOccludingCanvas(occluded: boolean): void {
  const next = Boolean(occluded);
  if (isPhotoScreensaverOccluding === next) return;
  isPhotoScreensaverOccluding = next;
  occlusionListeners.forEach((cb) => cb());
}

export function getPhotoScreensaverOccludingCanvas(): boolean {
  return isPhotoScreensaverOccluding;
}

function subscribeCanvasOcclusion(callback: () => void): () => void {
  occlusionListeners.add(callback);
  return () => {
    occlusionListeners.delete(callback);
  };
}

export interface DisplayActivityState {
  isTabHidden: boolean;
  isNightMode: boolean;
  isOledNightClock: boolean;
  isCanvasOccluded: boolean;
  shouldPauseAnimations: boolean;
}

/**
 * Shared display activity state combining browser visibility, Kiosk Night Mode, and opaque
 * photo screensaver occlusion so background canvas intervals/animations suspend off-screen.
 */
export function useDisplayActivity(): DisplayActivityState {
  const isTabHidden = useSyncExternalStore(
    subscribeVisibilityChange,
    getDocumentHiddenSnapshot,
    () => false
  );
  const isScreensaverOccluded = useSyncExternalStore(
    subscribeCanvasOcclusion,
    getPhotoScreensaverOccludingCanvas,
    () => false
  );
  const nightModeEnabled = useDashboardStore((s) => Boolean(s.settings.nightModeEnabled));
  const nightModeStyle = useDashboardStore((s) => s.settings.nightModeStyle);
  const isOledNightClock = nightModeEnabled && nightModeStyle === 'oled_clock';
  const isCanvasOccluded = isTabHidden || isOledNightClock || isScreensaverOccluded;

  return {
    isTabHidden,
    isNightMode: nightModeEnabled,
    isOledNightClock,
    isCanvasOccluded,
    shouldPauseAnimations: isTabHidden || nightModeEnabled || isScreensaverOccluded,
  };
}
