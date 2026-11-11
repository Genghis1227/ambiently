/**
 * Client-side avatar decoder, interactive crop renderer & WebP compressor.
 * Supports JPEG, PNG, WebP, GIF, AVIF, and Apple HEIC/HEIF photos across all browsers
 * (using native decoding where available and lazy-loading `heic2any` on Windows/Chromium).
 */

export interface AvatarCropTransform {
  /** Zoom multiplier (1 = fit shortest side to circle, up to 3.5x) */
  zoom: number;
  /** Horizontal pan offset as a fraction of the crop viewport width (-1 to 1) */
  offsetX: number;
  /** Vertical pan offset as a fraction of the crop viewport height (-1 to 1) */
  offsetY: number;
  /** Rotation in degrees (0, 90, 180, 270) */
  rotationDeg: number;
}

function canLoadImageUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if ((img.naturalWidth || img.width) > 0 && (img.naturalHeight || img.height) > 0) {
        resolve(img);
      } else {
        reject(new Error('Invalid image dimensions.'));
      }
    };
    img.onerror = () => reject(new Error('Could not decode image.'));
    img.src = url;
  });
}

function isHeicFile(file: File | Blob): boolean {
  const mime = (file.type || '').toLowerCase();
  if (mime.includes('heic') || mime.includes('heif')) return true;
  const name = ((file as File).name || '').toLowerCase();
  return /\.hei[cf]$/i.test(name);
}

/**
 * Decodes any user-selected image File/Blob (including iPhone .HEIC / .HEIF on Windows Chrome/Edge)
 * into a browser-renderable Object URL that can be previewed in the interactive crop modal.
 */
export async function decodeImageFileForPreview(file: File | Blob): Promise<{
  previewUrl: string;
  revoke: () => void;
}> {
  // 1. If not HEIC, or if Safari supports native HEIC decoding, try direct Object URL first
  const directUrl = URL.createObjectURL(file);
  try {
    await canLoadImageUrl(directUrl);
    return {
      previewUrl: directUrl,
      revoke: () => URL.revokeObjectURL(directUrl),
    };
  } catch {
    URL.revokeObjectURL(directUrl);
  }

  // 2. Fallback to lazy-loaded libheif-js (v1.23.5+) for iPhone .HEIC / .HEIF files
  //    (including modern iOS 17/18 HDR Gain Map / tmap HEIC containers) on Windows / Chrome / Edge / Firefox
  try {
    const heifModule: any = await import('libheif-js');
    const libheif = heifModule.default || heifModule;
    const HeifDecoder = libheif.HeifDecoder || (typeof libheif === 'function' ? libheif().HeifDecoder : null);
    if (!HeifDecoder) {
      throw new Error('HEIC decoder failed to initialize.');
    }

    const arrayBuffer = await file.arrayBuffer();
    const decoder = new HeifDecoder();
    const images = decoder.decode(new Uint8Array(arrayBuffer));
    if (!images || !images.length) {
      throw new Error('No decodable image frames found in HEIC file.');
    }

    const primaryImage = images[0];
    const width = primaryImage.get_width();
    const height = primaryImage.get_height();
    if (!width || !height) {
      throw new Error('Invalid HEIC image dimensions.');
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not initialize 2D canvas context for HEIC decode.');
    }

    const imageData = ctx.createImageData(width, height);
    await new Promise<void>((resolve, reject) => {
      primaryImage.display(imageData, (displayData: ImageData | null) => {
        if (!displayData) {
          reject(new Error('HEIC frame rendering failed.'));
          return;
        }
        resolve();
      });
    });

    ctx.putImageData(imageData, 0, 0);

    const decodedBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to encode decoded HEIC frame.'));
        },
        'image/jpeg',
        0.92
      );
    });

    const convertedUrl = URL.createObjectURL(decodedBlob);
    await canLoadImageUrl(convertedUrl);
    return {
      previewUrl: convertedUrl,
      revoke: () => URL.revokeObjectURL(convertedUrl),
    };
  } catch (err) {
    if (isHeicFile(file)) {
      throw new Error('Could not decode this HEIC photo. Please try another photo.');
    }
    throw err instanceof Error
      ? err
      : new Error('Could not decode the selected image file.');
  }
}

/**
 * Renders an image with user-selected pan, zoom, and 90-degree rotation onto a square
 * 256x256 canvas and exports a compact WebP Data URL (~8-15 KB).
 */
export async function renderCroppedAvatarToWebP(
  sourceUrl: string,
  transform: AvatarCropTransform = { zoom: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 },
  targetSize = 256,
  quality = 0.82
): Promise<string> {
  const img = await canLoadImageUrl(sourceUrl);
  const srcWidth = img.naturalWidth || img.width;
  const srcHeight = img.naturalHeight || img.height;

  const canvas = document.createElement('canvas');
  canvas.width = targetSize;
  canvas.height = targetSize;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not initialize 2D canvas context.');
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.clearRect(0, 0, targetSize, targetSize);

  const normRot = ((transform.rotationDeg % 360) + 360) % 360;
  const isRotated90 = normRot === 90 || normRot === 270;
  const effWidth = isRotated90 ? srcHeight : srcWidth;
  const effHeight = isRotated90 ? srcWidth : srcHeight;

  // Base scale so the shorter side fills the targetSize square (cover fit at zoom = 1)
  const baseScale = Math.max(targetSize / effWidth, targetSize / effHeight);
  const finalScale = baseScale * Math.max(1, Math.min(4, transform.zoom || 1));

  const panX = (transform.offsetX || 0) * targetSize;
  const panY = (transform.offsetY || 0) * targetSize;

  ctx.save();
  ctx.translate(targetSize / 2 + panX, targetSize / 2 + panY);
  if (normRot !== 0) {
    ctx.rotate((normRot * Math.PI) / 180);
  }
  ctx.scale(finalScale, finalScale);
  ctx.drawImage(img, -srcWidth / 2, -srcHeight / 2, srcWidth, srcHeight);
  ctx.restore();

  let dataUrl = canvas.toDataURL('image/webp', quality);
  if (!dataUrl.startsWith('data:image/webp')) {
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  return dataUrl;
}

/**
 * Convenience one-shot center-cropper for direct File/Blob compression.
 */
export async function compressAvatarToWebP(
  file: File | Blob,
  targetSize = 256,
  quality = 0.82
): Promise<string> {
  const { previewUrl, revoke } = await decodeImageFileForPreview(file);
  try {
    return await renderCroppedAvatarToWebP(
      previewUrl,
      { zoom: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 },
      targetSize,
      quality
    );
  } finally {
    revoke();
  }
}

export const compressAvatar = compressAvatarToWebP;

/**
 * Extracts up to 2 uppercase initials from a profile name for the fallback avatar badge.
 */
export function getProfileInitials(name: string): string {
  const cleaned = (name || '').trim();
  if (!cleaned) return '?';
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return cleaned.slice(0, 2).toUpperCase();
}
