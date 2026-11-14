import type { ImageWidgetConfig } from '../types/dashboard';

export const MEDIA_CACHE_NAME = 'ambiently-media-cache-v1';
export const MAX_MEDIA_CACHE_ENTRIES = 100;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const VAULT_MEDIA_PREFIX = 'vault://local-media:';
export const MAX_CLOUD_INLINE_DATA_URL_CHARS = 4096;

export interface OptimizedImageMedia {
  videoUrl: string | null;
  optimizedImgUrl: string;
  fallbackImgUrl: string;
  isAnimated: boolean;
}

const warmingUrls = new Set<string>();

/**
 * Matches GIPHY media CDN hostnames while excluding api.giphy.com.
 */
export function isGiphyCdnHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  return /(^|\.)giphy\.com$/i.test(lower) && !lower.startsWith('api.');
}

/**
 * True when an external HTTPS URL points to a static GIPHY or Wikimedia media asset
 * safe for bounded local CacheStorage caching. Never matches Plex/tokenised URLs.
 */
export function isCacheableExternalMediaUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    return isGiphyCdnHost(parsed.hostname) || parsed.hostname.toLowerCase() === 'upload.wikimedia.org';
  } catch {
    return false;
  }
}

function deriveGiphyVariantUrl(rawUrl: string, extension: '.webp' | '.mp4'): string | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' || !isGiphyCdnHost(parsed.hostname)) return null;
    if (!/\.gif$/i.test(parsed.pathname)) return null;
    parsed.pathname = parsed.pathname.replace(/\.gif$/i, extension);
    return parsed.toString();
  } catch {
    return null;
  }
}

export function deriveGiphyWebpUrl(rawUrl: string): string | null {
  return deriveGiphyVariantUrl(rawUrl, '.webp');
}

export function deriveGiphyMp4Url(rawUrl: string): string | null {
  return deriveGiphyVariantUrl(rawUrl, '.mp4');
}

/**
 * Resolves the lightest GPU-friendly representation for an ImageWidget configuration
 * while preserving alpha transparency for stickers and legacy unspecified GIPHY URLs.
 */
export function resolveOptimizedImageMedia(
  config: Pick<ImageWidgetConfig, 'url' | 'mp4Url' | 'mediaSource'>
): OptimizedImageMedia {
  const url = config.url?.trim() || '';
  const mp4Url = config.mp4Url?.trim() || '';

  if (!url && !mp4Url) {
    return {
      videoUrl: null,
      optimizedImgUrl: '',
      fallbackImgUrl: '',
      isAnimated: false,
    };
  }

  // Transparent stickers require alpha channel; H.264 MP4 renders an opaque black box.
  if (config.mediaSource === 'giphy_sticker') {
    const webp = deriveGiphyWebpUrl(url);
    return {
      videoUrl: null,
      optimizedImgUrl: webp || url,
      fallbackImgUrl: url,
      isAnimated: true,
    };
  }

  if (mp4Url) {
    const webp = url ? deriveGiphyWebpUrl(url) : null;
    return {
      videoUrl: mp4Url,
      optimizedImgUrl: webp || url,
      fallbackImgUrl: url,
      isAnimated: true,
    };
  }

  if (/\.(mp4|webm)(\?|$)/i.test(url)) {
    return {
      videoUrl: url,
      optimizedImgUrl: '',
      fallbackImgUrl: '',
      isAnimated: true,
    };
  }

  if (config.mediaSource === 'giphy_gif') {
    return {
      videoUrl: deriveGiphyMp4Url(url),
      optimizedImgUrl: deriveGiphyWebpUrl(url) || url,
      fallbackImgUrl: url,
      isAnimated: true,
    };
  }

  // Legacy GIPHY .gif without explicit mediaSource could be a transparent sticker;
  // upgrade to animated .webp (which supports full alpha) rather than MP4.
  const upgradedWebp = deriveGiphyWebpUrl(url);
  const isAnimated =
    Boolean(upgradedWebp) ||
    /\.(gif|webp)(\?|$)/i.test(url) ||
    url.startsWith('data:image/gif') ||
    url.startsWith('data:image/webp');

  return {
    videoUrl: null,
    optimizedImgUrl: upgradedWebp || url,
    fallbackImgUrl: url,
    isAnimated,
  };
}

/**
 * Strips bulky client-only arrays and multi-MB inline Data URLs from widget config before Cloud Sync.
 */
export function sanitizeWidgetConfigForCloud(config: Record<string, any>): Record<string, any> {
  const next = { ...(config || {}) };
  if ('customPhotos' in next) {
    delete next.customPhotos;
  }
  if (
    typeof next.url === 'string' &&
    next.url.startsWith('data:') &&
    next.url.length > MAX_CLOUD_INLINE_DATA_URL_CHARS
  ) {
    delete next.url;
  }
  return next;
}

/**
 * Checks CacheStorage for a cached media response and returns an ObjectURL (caller must revoke).
 * On cache miss, warms CacheStorage in the background for eligible external hosts while returning null
 * so initial streaming starts without waiting.
 */
export async function resolveOrWarmCachedMedia(url: string): Promise<string | null> {
  if (!url || typeof globalThis === 'undefined' || !('caches' in globalThis)) {
    return null;
  }

  try {
    const cache = await globalThis.caches.open(MEDIA_CACHE_NAME);
    const hit = await cache.match(url);
    if (hit && hit.status === 200 && hit.type !== 'opaque') {
      const blob = await hit.blob();
      if (blob.size > 0 && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        return URL.createObjectURL(blob);
      }
    }

    if (isCacheableExternalMediaUrl(url) && !warmingUrls.has(url)) {
      warmingUrls.add(url);
      void fetch(url, { mode: 'cors', credentials: 'omit' })
        .then(async (res) => {
          if (!res.ok || res.status !== 200) return;
          await cache.put(url, res.clone());
          const keys = await cache.keys();
          if (keys.length > MAX_MEDIA_CACHE_ENTRIES) {
            const excess = keys.length - MAX_MEDIA_CACHE_ENTRIES;
            await Promise.all(keys.slice(0, excess).map((key) => cache.delete(key)));
          }
        })
        .catch(() => {})
        .finally(() => {
          warmingUrls.delete(url);
        });
    }
  } catch {
    return null;
  }

  return null;
}
