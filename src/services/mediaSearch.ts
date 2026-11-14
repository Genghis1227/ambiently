/**
 * Media Search Service
 *
 * Provides instant search and trending media for GIPHY (GIFs & transparent stickers)
 * and Wikimedia Commons (free public domain images).
 */

export interface MediaSearchResult {
  id: string;
  title: string;
  url: string; // Full resolution URL (WebP for GIPHY animations/stickers)
  previewUrl: string; // Thumbnail / optimized preview
  mp4Url?: string; // Hardware-decoded MP4 video stream for opaque GIPHY GIFs
  width?: number;
  height?: number;
  source: 'giphy_gif' | 'giphy_sticker' | 'wikimedia';
}

const GIPHY_API_KEY = 'Gc7131jiJuvI7IdN0HZ1D7nh0ow5BU6g';

/**
 * Search GIPHY for animated GIFs or transparent stickers
 */
export async function searchGiphy(
  query = '',
  type: 'gifs' | 'stickers' = 'gifs',
  limit = 24,
  signal?: AbortSignal
): Promise<MediaSearchResult[]> {
  const trimmed = query.trim();
  const endpoint = trimmed
    ? `https://api.giphy.com/v1/${type}/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(
        trimmed
      )}&limit=${limit}&rating=g`
    : `https://api.giphy.com/v1/${type}/trending?api_key=${GIPHY_API_KEY}&limit=${limit}&rating=g`;

  try {
    const res = await fetch(endpoint, { signal });
    if (!res.ok) {
      console.warn(`GIPHY API responded with status ${res.status}`);
      return [];
    }
    const json = await res.json();
    if (!json?.data || !Array.isArray(json.data)) return [];

    return json.data.map((item: any) => ({
      id: item.id,
      title: item.title || `${type === 'stickers' ? 'Sticker' : 'GIF'} ${item.id}`,
      url:
        item.images?.original?.webp ||
        item.images?.original?.url ||
        item.images?.downsized?.url ||
        item.images?.fixed_height?.url,
      previewUrl:
        item.images?.fixed_height?.webp ||
        item.images?.fixed_height_small?.webp ||
        item.images?.fixed_height?.url ||
        item.images?.fixed_height_small?.url ||
        item.images?.original?.url,
      mp4Url:
        type === 'gifs'
          ? item.images?.original?.mp4 || item.images?.fixed_height?.mp4 || undefined
          : undefined,
      width: parseInt(item.images?.original?.width || '0', 10),
      height: parseInt(item.images?.original?.height || '0', 10),
      source: type === 'stickers' ? 'giphy_sticker' : 'giphy_gif',
    }));
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') return [];
    console.error('Failed to fetch from GIPHY:', err);
    return [];
  }
}

/**
 * Search Wikimedia Commons for free public domain images
 */
export async function searchWikimediaImages(
  query: string,
  limit = 24,
  signal?: AbortSignal
): Promise<MediaSearchResult[]> {
  const trimmed = query.trim() || 'scenery wallpaper';
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(
    trimmed
  )}&gsrnamespace=6&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=800&format=json&origin=*`;

  try {
    const res = await fetch(url, { signal });
    if (!res.ok) {
      console.warn(`Wikimedia Commons responded with status ${res.status}`);
      return [];
    }
    const json = await res.json();
    const pages = json?.query?.pages;
    if (!pages || typeof pages !== 'object') return [];

    const results: MediaSearchResult[] = [];
    for (const key of Object.keys(pages)) {
      const page = pages[key];
      const info = page.imageinfo?.[0];
      if (info && info.thumburl) {
        // Strip out SVG/TIFF files that may not render as standard photos in <img>
        const extension = (info.url || '').split('.').pop()?.toLowerCase();
        if (['svg', 'tif', 'tiff', 'pdf', 'ogg', 'webm', 'ogv'].includes(extension || '')) {
          continue;
        }

        results.push({
          id: String(page.pageid || key),
          title: (page.title || '').replace(/^File:/, '').replace(/\.[^/.]+$/, ''),
          url: info.thumburl || info.url,
          previewUrl: info.thumburl || info.url,
          width: info.width,
          height: info.height,
          source: 'wikimedia',
        });
      }
      if (results.length >= limit) break;
    }
    return results;
  } catch (err) {
    if ((err as { name?: string })?.name === 'AbortError') return [];
    console.error('Failed to fetch from Wikimedia Commons:', err);
    return [];
  }
}
