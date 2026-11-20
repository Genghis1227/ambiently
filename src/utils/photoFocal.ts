export const MAX_PHOTO_FOCAL_CACHE = 400;
export const MAX_PHOTO_FOCAL_STATE_KEYS = 120;

const photoFocalCache = new Map<string, string>();
let sharedSaliencyCanvas: HTMLCanvasElement | null = null;
let sharedSaliencyCtx: CanvasRenderingContext2D | null = null;

/**
 * Determines whether pixel readback (`ctx.getImageData`) can run on an already-loaded `<img>`
 * without triggering a CORS-taint error or forcing a duplicate `crossOrigin="anonymous"` network fetch.
 * Only `data:`, `blob:`, and same-origin URLs are pixel-readable without cross-origin refetching.
 */
export function canReadCanvasPixelsWithoutCorsRefetch(
  src: string,
  currentOrigin?: string
): boolean {
  const trimmed = src.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return true;
  }

  const baseOrigin =
    currentOrigin ||
    (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '');
  if (!baseOrigin) {
    // Non-browser environment with explicit relative path is safe only if relative
    return trimmed.startsWith('/') && !trimmed.startsWith('//');
  }

  try {
    const resolved = new URL(trimmed, baseOrigin);
    if (resolved.protocol === 'data:' || resolved.protocol === 'blob:') {
      return true;
    }
    return resolved.origin === baseOrigin;
  } catch {
    return false;
  }
}

export function computeDefaultFocalPosition(naturalWidth: number, naturalHeight: number): string {
  if (!naturalWidth || !naturalHeight) return 'center center';
  return naturalHeight > naturalWidth * 1.05 ? 'center 25%' : 'center center';
}

export function getCachedPhotoFocal(photoId: string): string | undefined {
  const value = photoFocalCache.get(photoId);
  if (value !== undefined) {
    // Refresh LRU order on read
    photoFocalCache.delete(photoId);
    photoFocalCache.set(photoId, value);
  }
  return value;
}

export function setCachedPhotoFocal(photoId: string, focalPos: string): void {
  if (photoFocalCache.has(photoId)) {
    photoFocalCache.delete(photoId);
  } else if (photoFocalCache.size >= MAX_PHOTO_FOCAL_CACHE) {
    const oldestKey = photoFocalCache.keys().next().value;
    if (oldestKey !== undefined) {
      photoFocalCache.delete(oldestKey);
    }
  }
  photoFocalCache.set(photoId, focalPos);
}

export function getPhotoFocalCacheSize(): number {
  return photoFocalCache.size;
}

export function clearPhotoFocalCacheForTests(): void {
  photoFocalCache.clear();
}

/**
 * Updates bounded React focal-position state, skipping unnecessary re-renders when the computed
 * focal point already matches CSS `object-cover` default (`center center`) or current value.
 */
export function appendBoundedFocalState(
  prev: Record<string, string>,
  photoId: string,
  focalPos: string,
  maxKeys: number = MAX_PHOTO_FOCAL_STATE_KEYS
): Record<string, string> {
  const existing = prev[photoId];
  if (existing === focalPos) {
    return prev;
  }
  if (focalPos === 'center center' && existing === undefined) {
    return prev;
  }

  const next: Record<string, string> = { ...prev, [photoId]: focalPos };
  const keys = Object.keys(next);
  if (keys.length > maxKeys) {
    const overflow = keys.length - maxKeys;
    for (let i = 0; i < overflow; i++) {
      delete next[keys[i]];
    }
  }
  return next;
}

/**
 * Reuses a single module-level 64x64 2D canvas context for skin-tone saliency estimation
 * to avoid per-photo DOM canvas allocations in continuous slideshows.
 */
export function getSharedSaliencyContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  if (!sharedSaliencyCanvas) {
    sharedSaliencyCanvas = document.createElement('canvas');
    sharedSaliencyCanvas.width = 64;
    sharedSaliencyCanvas.height = 64;
  }
  if (!sharedSaliencyCtx) {
    sharedSaliencyCtx = sharedSaliencyCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (sharedSaliencyCtx) {
    sharedSaliencyCtx.clearRect(0, 0, 64, 64);
  }
  return sharedSaliencyCtx;
}
