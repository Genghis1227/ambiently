/**
 * High-Resolution Image Uploader & 4K Wallpaper Presets
 * Supports up to 4K Ultra HD (3840x2160) so 1440p and 4K displays remain razor-sharp.
 */

import { decodeImageFileForPreview } from './avatarCompressor';

export interface WallpaperPreset {
  id: string;
  label: string;
  url: string;
  thumbUrl: string;
}

export const CURATED_WALLPAPER_PRESETS: WallpaperPreset[] = [
  {
    id: 'misty_pines',
    label: 'Misty Alpine Pines (4K)',
    url: 'https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=3840&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1511497584788-876760111969?auto=format&fit=crop&w=400&q=70',
  },
  {
    id: 'cozy_cabin',
    label: 'Warm Nordic Interior (4K)',
    url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=3840&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=400&q=70',
  },
  {
    id: 'starry_peaks',
    label: 'Starry Night Peaks (4K)',
    url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=3840&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=400&q=70',
  },
  {
    id: 'minimal_coast',
    label: 'Minimalist Ocean Dusk (4K)',
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=3840&q=85',
    thumbUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=400&q=70',
  },
];

const ALLOWED_WALLPAPER_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/heic',
  'image/heif',
]);
const RASTER_EXT_TO_MIME = new Map<string, string>([
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
  ['gif', 'image/gif'],
  ['avif', 'image/avif'],
  ['heic', 'image/heic'],
  ['heif', 'image/heif'],
]);
const SAFE_RASTER_DATA_URL_PREFIX_RE =
  /^data:image\/(?:jpeg|jpg|png|webp|gif|avif);base64,/i;
const MAX_WALLPAPER_UPLOAD_BYTES = 15 * 1024 * 1024;

export interface RasterImageClassification {
  allowed: boolean;
  isHeic: boolean;
  inferredMime: string | null;
}

/**
 * Classifies an uploaded file as an allowed raster image (falling back to filename extension
 * when browsers omit `file.type` or report `application/octet-stream`, while blocking SVGs).
 */
export function classifyRasterImageFile(
  file: Pick<File, 'type' | 'name'>
): RasterImageClassification {
  const mime = (file.type || '').trim().toLowerCase();
  const extMatch = (file.name || '').trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  const extMime = extMatch ? RASTER_EXT_TO_MIME.get(extMatch[1]) ?? null : null;

  if (mime && mime !== 'application/octet-stream') {
    if (!ALLOWED_WALLPAPER_MIMES.has(mime)) {
      return { allowed: false, isHeic: false, inferredMime: null };
    }
    const normalizedMime = mime === 'image/jpg' ? 'image/jpeg' : mime;
    const isHeic = normalizedMime === 'image/heic' || normalizedMime === 'image/heif';
    return { allowed: true, isHeic, inferredMime: normalizedMime };
  }

  if (extMime) {
    const isHeic = extMime === 'image/heic' || extMime === 'image/heif';
    return { allowed: true, isHeic, inferredMime: extMime };
  }

  return { allowed: false, isHeic: false, inferredMime: null };
}

function normalizeGenericDataUrlMime(rawDataUrl: string, inferredMime: string | null): string {
  if (!inferredMime) return rawDataUrl;
  return rawDataUrl.replace(
    /^data:(?:application\/octet-stream)?;base64,/i,
    `data:${inferredMime};base64,`
  );
}

function encodeImageElementToDataUrl(
  img: HTMLImageElement,
  targetMaxW: number,
  targetMaxH: number,
  quality: number
): string | null {
  const naturalW = img.naturalWidth || img.width;
  const naturalH = img.naturalHeight || img.height;
  if (!naturalW || !naturalH) return null;

  const scale = Math.min(1, targetMaxW / naturalW, targetMaxH / naturalH);
  const outW = Math.max(1, Math.round(naturalW * scale));
  const outH = Math.max(1, Math.round(naturalH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, outW, outH);

  const webpUrl = canvas.toDataURL('image/webp', quality);
  if (webpUrl.startsWith('data:image/webp')) {
    return webpUrl;
  }
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * Converts an uploaded image file into a persistent Data URL optimized for up to 4K Ultra HD (3840x2160) displays.
 * - Rejects SVG or non-raster file types while supporting empty browser MIME types and iPhone HEIC/HEIF photos.
 * - If the file is already raster base64, <= 1.5 MB, and <= 3840px, preserves native encoding directly.
 * - Otherwise scales down proportionally to fit within 3840x2160 (4K UHD) using high-quality WebP/JPEG encoding.
 */
export async function processUploadedWallpaper(
  file: File,
  maxWidth = 3840,
  maxHeight = 2160,
  quality = 0.9
): Promise<string> {
  const classification = classifyRasterImageFile(file);
  if (!classification.allowed) {
    throw new Error('Only raster image files (JPEG, PNG, WebP, GIF, AVIF, HEIC) are supported.');
  }
  if (file.size > MAX_WALLPAPER_UPLOAD_BYTES) {
    throw new Error('Wallpaper file exceeds the 15 MB upload limit.');
  }

  // Detect if user's physical screen is even higher than 4K (e.g., 5K iMac / Studio Display)
  const physicalScreenW =
    typeof window !== 'undefined'
      ? Math.round(window.screen.width * (window.devicePixelRatio || 1))
      : 3840;
  const physicalScreenH =
    typeof window !== 'undefined'
      ? Math.round(window.screen.height * (window.devicePixelRatio || 1))
      : 2160;

  const targetMaxW = Math.max(maxWidth, Math.min(5120, physicalScreenW));
  const targetMaxH = Math.max(maxHeight, Math.min(2880, physicalScreenH));

  if (classification.isHeic) {
    const { previewUrl, revoke } = await decodeImageFileForPreview(file);
    try {
      const encoded = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.onerror = () => reject(new Error('Invalid HEIC image file'));
        img.onload = () => {
          const out = encodeImageElementToDataUrl(img, targetMaxW, targetMaxH, quality);
          if (out && SAFE_RASTER_DATA_URL_PREFIX_RE.test(out)) {
            resolve(out);
          } else {
            reject(new Error('Failed to encode HEIC image as raster wallpaper.'));
          }
        };
        img.src = previewUrl;
      });
      return encoded;
    } finally {
      revoke();
    }
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const normalizedDataUrl = normalizeGenericDataUrlMime(
        reader.result as string,
        classification.inferredMime
      );

      // Load into Image to inspect dimensions & verify valid raster bytes
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file'));
      img.onload = () => {
        const { width, height } = img;

        // If already within target resolution and compact raster base64 (<= 1.5 MB), keep untouched
        if (
          SAFE_RASTER_DATA_URL_PREFIX_RE.test(normalizedDataUrl) &&
          width <= targetMaxW &&
          height <= targetMaxH &&
          file.size <= 1.5 * 1024 * 1024
        ) {
          resolve(normalizedDataUrl);
          return;
        }

        const encoded = encodeImageElementToDataUrl(img, targetMaxW, targetMaxH, quality);
        if (encoded && SAFE_RASTER_DATA_URL_PREFIX_RE.test(encoded)) {
          resolve(encoded);
          return;
        }
        if (SAFE_RASTER_DATA_URL_PREFIX_RE.test(normalizedDataUrl)) {
          resolve(normalizedDataUrl);
          return;
        }
        reject(new Error('Uploaded file must decode to a valid raster image.'));
      };
      img.src = normalizedDataUrl;
    };
    reader.readAsDataURL(file);
  });
}
