/**
 * Zero-dependency client-side avatar processor.
 * Loads an image file (JPEG, PNG, WebP, HEIC), performs an automatic center-square crop,
 * scales down to 256x256 pixels on an offscreen HTMLCanvasElement, and exports as a
 * compact ~8-15 KB Base64 WebP Data URL (`canvas.toDataURL('image/webp', 0.82)`).
 */
export async function compressAvatarToWebP(
  file: File | Blob,
  targetSize = 256,
  quality = 0.82
): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        URL.revokeObjectURL(objectUrl);

        const srcWidth = img.naturalWidth || img.width;
        const srcHeight = img.naturalHeight || img.height;

        if (!srcWidth || !srcHeight) {
          reject(new Error('Invalid image dimensions.'));
          return;
        }

        // Center-square crop coordinates
        const minSide = Math.min(srcWidth, srcHeight);
        const sx = Math.floor((srcWidth - minSide) / 2);
        const sy = Math.floor((srcHeight - minSide) / 2);

        const canvas = document.createElement('canvas');
        canvas.width = targetSize;
        canvas.height = targetSize;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not initialize 2D canvas context.'));
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.clearRect(0, 0, targetSize, targetSize);
        ctx.drawImage(
          img,
          sx,
          sy,
          minSide,
          minSide,
          0,
          0,
          targetSize,
          targetSize
        );

        let dataUrl = canvas.toDataURL('image/webp', quality);
        // Fallback to JPEG if a legacy browser does not support WebP canvas encoding
        if (!dataUrl.startsWith('data:image/webp')) {
          dataUrl = canvas.toDataURL('image/jpeg', quality);
        }

        resolve(dataUrl);
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Failed to process avatar image.'));
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Could not decode the selected image file.'));
    };

    img.src = objectUrl;
  });
}

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
