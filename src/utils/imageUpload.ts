/**
 * High-Resolution Image Uploader & 4K Wallpaper Presets
 * Supports up to 4K Ultra HD (3840x2160) so 1440p and 4K displays remain razor-sharp.
 */

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

/**
 * Converts an uploaded image file into a persistent Data URL optimized for up to 4K Ultra HD (3840x2160) displays.
 * - If the file is already <= 3.5 MB and <= 3840px, preserves native resolution directly.
 * - Otherwise scales down proportionally to fit within 3840x2160 (4K UHD) using high-quality WebP/JPEG encoding.
 */
export async function processUploadedWallpaper(
  file: File,
  maxWidth = 3840,
  maxHeight = 2160,
  quality = 0.9
): Promise<string> {
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

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      const rawDataUrl = reader.result as string;

      // Load into Image to inspect dimensions
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file'));
      img.onload = () => {
        const { width, height } = img;

        // If already within target resolution and reasonable file size (<= 3.5 MB), keep original untouched
        if (width <= targetMaxW && height <= targetMaxH && file.size <= 3.5 * 1024 * 1024) {
          resolve(rawDataUrl);
          return;
        }

        const scale = Math.min(1, targetMaxW / width, targetMaxH / height);
        const outW = Math.round(width * scale);
        const outH = Math.round(height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = outW;
        canvas.height = outH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(rawDataUrl);
          return;
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, outW, outH);

        // Prefer WebP for crisp 4K detail at compact byte size, fallback to JPEG
        const webpUrl = canvas.toDataURL('image/webp', quality);
        if (webpUrl.startsWith('data:image/webp')) {
          resolve(webpUrl);
        } else {
          resolve(canvas.toDataURL('image/jpeg', quality));
        }
      };
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
}
