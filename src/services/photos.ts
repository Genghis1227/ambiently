// Multi-source Photo Feed Service & Cache API integration

export interface PhotoItem {
  id: string;
  url: string;
  caption?: string;
  author?: string;
  date?: string;
  source: 'curated' | 'local' | 'plex' | 'gdrive' | 'web';
}

export type PhotoDisplayStyle = 'ken_burns' | 'mosaic' | 'polaroid' | 'filmstrip';

export const CURATED_AMBIENT_PHOTOS: PhotoItem[] = [
  {
    id: 'curated-1',
    url: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1920&q=80',
    caption: 'Yosemite Valley Mist',
    author: 'Bailey Zindel',
    source: 'curated',
  },
  {
    id: 'curated-2',
    url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1920&q=80',
    caption: 'Starry Mountain Night',
    author: 'Benjamin Voros',
    source: 'curated',
  },
  {
    id: 'curated-3',
    url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=1920&q=80',
    caption: 'Misty Redwood Forest',
    author: 'Casey Horner',
    source: 'curated',
  },
  {
    id: 'curated-4',
    url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1920&q=80',
    caption: 'Tropical Dawn',
    author: 'Sean Oulashin',
    source: 'curated',
  },
  {
    id: 'curated-5',
    url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=1920&q=80',
    caption: 'Sunbeam Woodland',
    author: 'Luca Bravo',
    source: 'curated',
  },
  {
    id: 'curated-6',
    url: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?auto=format&fit=crop&w=1920&q=80',
    caption: 'Emerald Alpine Meadow',
    author: 'Sébastien Goldberg',
    source: 'curated',
  },
];

// Offline Photo Cache via Cache Storage API (preserves last 30-50 photos offline)
const CACHE_NAME = 'ambiently-photo-cache-v1';

export async function cachePhotosLocally(photos: PhotoItem[]): Promise<void> {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    const slice = photos.slice(0, 30);
    for (const photo of slice) {
      if (photo.url.startsWith('blob:') || photo.url.startsWith('data:')) {
        continue;
      }
      const match = await cache.match(photo.url);
      if (!match) {
        // Fetch and cache without failing the app if network drops
        fetch(photo.url, { mode: 'no-cors' })
          .then((res) => cache.put(photo.url, res))
          .catch(() => {});
      }
    }
  } catch (err) {
    console.warn('Cache API error:', err);
  }
}

// Local Directory Picker (showDirectoryPicker) for local PC / mapped NAS photos
export async function pickLocalPhotoDirectory(): Promise<{
  success: boolean;
  photos: PhotoItem[];
  error?: string;
}> {
  try {
    if (!('showDirectoryPicker' in window)) {
      return { success: false, photos: [], error: 'Directory Picker not supported in this browser.' };
    }

    const dirHandle = await (window as any).showDirectoryPicker({
      id: 'ambiently-photos',
      mode: 'read',
    });

    const localPhotos: PhotoItem[] = [];
    for await (const entry of dirHandle.values()) {
      if (entry.kind === 'file') {
        const file = await entry.getFile();
        if (file.type.startsWith('image/')) {
          const url = URL.createObjectURL(file);
          localPhotos.push({
            id: `local-${entry.name}`,
            url,
            caption: entry.name.replace(/\.[^/.]+$/, ''),
            date: new Date(file.lastModified).toLocaleDateString(),
            source: 'local',
          });
        }
      }
    }

    return { success: true, photos: localPhotos };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, photos: [] };
    }
    return { success: false, photos: [], error: err.message };
  }
}

// Parse Google Drive share URLs into direct streamable image URLs
export function parseGoogleDriveLink(rawUrl: string): string | null {
  if (!rawUrl || !rawUrl.includes('drive.google.com')) return null;

  // Pattern 1: /file/d/FILE_ID/
  const matchFileD = rawUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (matchFileD && matchFileD[1]) {
    return `https://lh3.googleusercontent.com/d/${matchFileD[1]}`;
  }

  // Pattern 2: id=FILE_ID
  const matchIdParam = rawUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchIdParam && matchIdParam[1]) {
    return `https://lh3.googleusercontent.com/d/${matchIdParam[1]}`;
  }

  return null;
}

// Parse freeform list of web / Google Drive URLs into PhotoItems
export function parseWebPhotoUrls(text: string): PhotoItem[] {
  if (!text.trim()) return [];

  const lines = text
    .split(/[\r\n,]+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 5);

  const items: PhotoItem[] = [];
  lines.forEach((line, idx) => {
    const gdriveResolved = parseGoogleDriveLink(line);
    const finalUrl = gdriveResolved || line;
    const isGdrive = !!gdriveResolved;

    items.push({
      id: `web-${idx}-${Date.now()}`,
      url: finalUrl,
      caption: isGdrive ? 'Google Drive Photo' : `Web Photo ${idx + 1}`,
      source: isGdrive ? 'gdrive' : 'web',
    });
  });

  return items;
}
