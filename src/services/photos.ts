// Multi-source Photo Feed Service & Cache API integration
import { makeStableWebPhotoId } from '../utils/photoSyncPolicy';

export interface PhotoItem {
  id: string;
  url: string;
  caption?: string;
  author?: string;
  date?: string;
  source: 'curated' | 'local' | 'plex' | 'gdrive' | 'web';
  fallbackUrl?: string;
}

export type PhotoDisplayStyle = 'ken_burns' | 'mosaic' | 'polaroid' | 'filmstrip';

/**
 * Formats a photo date string (e.g. "2023-08-15", "8/15/2023", or "2021")
 * into a human-friendly format (e.g. "Aug 15, 2023").
 */
export function formatPhotoDate(dateStr?: string): string | null {
  if (!dateStr || !dateStr.trim()) return null;
  const trimmed = dateStr.trim();
  if (/^(19|20)\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const ymdMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymdMatch) {
    const year = parseInt(ymdMatch[1], 10);
    const month = parseInt(ymdMatch[2], 10) - 1;
    const day = parseInt(ymdMatch[3], 10);
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }
  }
  const d = new Date(trimmed);
  if (!isNaN(d.getTime())) {
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }
  return trimmed;
}

import {
  ALL_CURATED_PHOTOS,
  CURATED_CATEGORIES,
  getCuratedCategoryById,
  inferCuratedCategoryId,
  resolveCuratedPhotos,
  type CuratedCategory,
} from '../data/curatedScenery';

export {
  CURATED_CATEGORIES,
  getCuratedCategoryById,
  inferCuratedCategoryId,
  resolveCuratedPhotos,
  type CuratedCategory,
};
export const CURATED_AMBIENT_PHOTOS: PhotoItem[] = ALL_CURATED_PHOTOS;

// Offline photo cache. Keeps copies of up to 50 recent web photos so the photo frame still shows
// pictures when the screen loses its connection; the service worker (vite.config.ts) reads them back
// when an image can't be downloaded. Copies are fetched with CORS so the browser stores them at their
// real size (~35 MB instead of ~400 MB of opaque padding) and skips error responses. Hosts that don't
// allow CORS are simply not cached. Plex photos are skipped so device tokens are never persisted in
// shared browser CacheStorage.
export const PHOTO_CACHE_NAME = 'ambiently-photo-cache-v1';
const CACHE_NAME = PHOTO_CACHE_NAME;
const MAX_CACHE_ENTRIES = 50;
const IMAGE_EXT_REGEX = /\.(jpe?g|png|webp|avif|gif|bmp|heic|heif)$/i;
const photosBeingCached = new Set<string>();

export async function cachePhotosLocally(photos: PhotoItem[]): Promise<void> {
  if (typeof globalThis.caches === 'undefined') return;
  try {
    const cache = await globalThis.caches.open(CACHE_NAME);
    const writes: Promise<void>[] = [];
    for (const photo of photos.slice(0, 30)) {
      if (!photo?.url || photo.source === 'plex') continue;
      const url = photo.url.includes('googleusercontent.com')
        ? getOptimizedPhotoUrl(photo.url, 1920)
        : photo.url;
      if (!url.startsWith('https://') || photosBeingCached.has(url)) continue;
      photosBeingCached.add(url);
      if (await cache.match(url)) {
        photosBeingCached.delete(url);
        continue;
      }
      writes.push(
        fetch(url, { mode: 'cors', credentials: 'omit' })
          .then(async (res) => {
            if (res.ok && res.type !== 'opaque') {
              await cache.put(url, res);
            }
          })
          .catch(() => {})
          .finally(() => photosBeingCached.delete(url))
      );
    }
    await Promise.all(writes);

    // Keep only the newest entries (Cache Storage lists them oldest first)
    const keys = await cache.keys();
    if (keys.length > MAX_CACHE_ENTRIES) {
      await Promise.all(
        keys.slice(0, keys.length - MAX_CACHE_ENTRIES).map((req) => cache.delete(req))
      );
    }
  } catch (err) {
    console.warn('Cache API error:', err);
  }
}

const activeLocalBlobUrls: string[] = [];

function createTrackedBlobUrl(file: File): string {
  const url = URL.createObjectURL(file);
  activeLocalBlobUrls.push(url);
  return url;
}

export function revokePreviousLocalBlobUrls(): void {
  if (activeLocalBlobUrls.length === 0) return;
  for (let i = 0; i < activeLocalBlobUrls.length; i++) {
    try {
      URL.revokeObjectURL(activeLocalBlobUrls[i]);
    } catch {
      // ignore
    }
  }
  activeLocalBlobUrls.length = 0;
}

export async function scanDirectoryHandle(
  dirHandle: any,
  photos: PhotoItem[],
  maxPhotos = Infinity,
  currentDepth = 0,
  maxDepth = 12,
  onProgress?: (count: number, currentDirName: string) => void
): Promise<void> {
  const isUnlimited = !maxPhotos || maxPhotos <= 0 || !isFinite(maxPhotos);
  if (currentDepth > maxDepth || (!isUnlimited && photos.length >= maxPhotos)) return;

  for await (const entry of dirHandle.values()) {
    if (!isUnlimited && photos.length >= maxPhotos) break;

    if (entry.kind === 'file') {
      const isImgExt = IMAGE_EXT_REGEX.test(entry.name);
      if (isImgExt) {
        try {
          const file = await entry.getFile();
          const url = createTrackedBlobUrl(file);
          photos.push({
            id: `local-${entry.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
            url,
            caption: entry.name.replace(/\.[^/.]+$/, ''),
            date: new Date(file.lastModified).toLocaleDateString(),
            source: 'local',
          });
          if (photos.length % 50 === 0 && onProgress) {
            onProgress(photos.length, dirHandle.name);
          }
        } catch {
          // ignore unreadable network file
        }
      } else {
        // Fallback: check file.type if extension was unusual
        try {
          const file = await entry.getFile();
          if (file.type && file.type.startsWith('image/')) {
            const url = createTrackedBlobUrl(file);
            photos.push({
              id: `local-${entry.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
              url,
              caption: entry.name.replace(/\.[^/.]+$/, ''),
              date: new Date(file.lastModified).toLocaleDateString(),
              source: 'local',
            });
            if (photos.length % 50 === 0 && onProgress) {
              onProgress(photos.length, dirHandle.name);
            }
          }
        } catch {
          // ignore
        }
      }
    } else if (entry.kind === 'directory') {
      // Recursively scan subdirectories (e.g. subfolders, albums on NAS)
      try {
        await scanDirectoryHandle(entry, photos, maxPhotos, currentDepth + 1, maxDepth, onProgress);
      } catch {
        // ignore inaccessible subfolder
      }
    }
  }
}

export interface LocalSubfolderItem {
  name: string;
  handle?: any;
  files?: File[];
  isYear?: boolean;
  yearNum?: number;
}

export interface LocalDirectoryInspection {
  rootName: string;
  dirHandle?: any;
  files?: File[];
  subfolders: LocalSubfolderItem[];
  hasDirectPhotos: boolean;
  directPhotosCount: number;
}

export async function promptLocalDirectoryHandle(): Promise<{
  success: boolean;
  dirHandle?: any;
  error?: string;
  cancelled?: boolean;
}> {
  try {
    if (!('showDirectoryPicker' in window)) {
      return {
        success: false,
        error: 'Directory Picker is not supported in this browser. Please use the folder browse fallback.',
      };
    }
    const dirHandle = await (window as any).showDirectoryPicker({
      id: 'ambiently-photos',
      mode: 'read',
    });
    return { success: true, dirHandle };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, cancelled: true };
    }
    return { success: false, error: err.message };
  }
}

export async function inspectLocalDirectory(dirHandle: any): Promise<LocalDirectoryInspection> {
  const rootName = dirHandle.name || 'Selected Folder';
  const subfolders: LocalSubfolderItem[] = [];
  let hasDirectPhotos = false;
  let directPhotosCount = 0;

  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'directory') {
      const isYear = /^(19|20)\d{2}$/.test(entry.name.trim());
      const yearNum = isYear ? parseInt(entry.name.trim(), 10) : undefined;
      subfolders.push({
        name: entry.name,
        handle: entry,
        isYear,
        yearNum,
      });
    } else if (entry.kind === 'file') {
      if (IMAGE_EXT_REGEX.test(entry.name)) {
        hasDirectPhotos = true;
        directPhotosCount++;
      }
    }
  }

  // Sort subfolders: newest years first (e.g. 2026, 2025, 2024...), then natural alphanumeric sort
  subfolders.sort((a, b) => {
    if (a.isYear && b.isYear && a.yearNum && b.yearNum) {
      return b.yearNum - a.yearNum;
    }
    return b.name.localeCompare(a.name, undefined, { numeric: true });
  });

  return { rootName, dirHandle, subfolders, hasDirectPhotos, directPhotosCount };
}

export function inspectLocalFileList(files: FileList | File[]): LocalDirectoryInspection {
  let detectedRoot = 'Selected Folder';
  const subfolderMap = new Map<string, File[]>();
  let hasDirectPhotos = false;
  let directPhotosCount = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const path = (file as any).webkitRelativePath || file.name;
    const parts = path.split('/');
    const isImage = IMAGE_EXT_REGEX.test(file.name) || (file.type && file.type.startsWith('image/'));

    if (parts.length > 1 && detectedRoot === 'Selected Folder') {
      detectedRoot = parts[0];
    }

    // The path always starts with the selected folder, so [root, file] sits directly inside it
    if (parts.length > 2) {
      if (isImage) {
        const subName = parts[1];
        if (!subfolderMap.has(subName)) {
          subfolderMap.set(subName, []);
        }
        subfolderMap.get(subName)!.push(file);
      }
    } else if (isImage) {
      hasDirectPhotos = true;
      directPhotosCount++;
    }
  }

  const subfolders: LocalSubfolderItem[] = Array.from(subfolderMap.entries()).map(([name, subFiles]) => {
    const isYear = /^(19|20)\d{2}$/.test(name.trim());
    const yearNum = isYear ? parseInt(name.trim(), 10) : undefined;
    return {
      name,
      files: subFiles,
      isYear,
      yearNum,
    };
  });

  subfolders.sort((a, b) => {
    if (a.isYear && b.isYear && a.yearNum && b.yearNum) {
      return b.yearNum - a.yearNum;
    }
    return b.name.localeCompare(a.name, undefined, { numeric: true });
  });

  return { rootName: detectedRoot, files: Array.from(files), subfolders, hasDirectPhotos, directPhotosCount };
}

export interface LocalScanOptions {
  maxPhotos?: number;
  onProgress?: (count: number, currentDirName: string) => void;
  onBatch?: (photos: PhotoItem[], isInitial: boolean, isDone: boolean) => void;
  signal?: AbortSignal;
}

export async function scanSelectedSubfolders(
  inspection: LocalDirectoryInspection,
  selectedSubfolderNames: Set<string>,
  includeRootPhotos: boolean,
  maxPhotosOrOptions: number | LocalScanOptions = Infinity,
  legacyOnProgress?: (count: number, currentDirName: string) => void
): Promise<{ folderEntries: { id: string; name: string; photos: PhotoItem[] }[]; totalPhotos: PhotoItem[] }> {
  const options: LocalScanOptions =
    typeof maxPhotosOrOptions === 'number'
      ? { maxPhotos: maxPhotosOrOptions, onProgress: legacyOnProgress }
      : maxPhotosOrOptions || {};

  const maxPhotos = options.maxPhotos ?? Infinity;
  const onProgress = options.onProgress;
  const onBatch = options.onBatch;
  const signal = options.signal;

  const folderEntries: { id: string; name: string; photos: PhotoItem[] }[] = [];
  const totalPhotos: PhotoItem[] = [];
  const isUnlimited = !maxPhotos || maxPhotos <= 0 || !isFinite(maxPhotos);

  let hasEmittedInitial = false;
  const checkEmitInitial = () => {
    if (!hasEmittedInitial && totalPhotos.length > 0 && onBatch) {
      hasEmittedInitial = true;
      onBatch([...totalPhotos], true, false);
    }
  };

  if (signal?.aborted) return { folderEntries, totalPhotos };
  revokePreviousLocalBlobUrls();

  if (inspection.dirHandle) {
    if (includeRootPhotos && inspection.hasDirectPhotos) {
      const rootPhotos: PhotoItem[] = [];
      for await (const entry of inspection.dirHandle.values()) {
        if (signal?.aborted) break;
        if (!isUnlimited && totalPhotos.length >= maxPhotos) break;
        if (entry.kind === 'file' && IMAGE_EXT_REGEX.test(entry.name)) {
          try {
            const file = await entry.getFile();
            const url = createTrackedBlobUrl(file);
            const p: PhotoItem = {
              id: `local-${entry.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
              url,
              caption: entry.name.replace(/\.[^/.]+$/, ''),
              date: new Date(file.lastModified).toLocaleDateString(),
              source: 'local',
            };
            rootPhotos.push(p);
            totalPhotos.push(p);
          } catch {
            // ignore
          }
        }
      }
      if (rootPhotos.length > 0) {
        folderEntries.push({
          id: `folder-root-${Date.now()}`,
          name: `${inspection.rootName} (Root)`,
          photos: rootPhotos,
        });
        checkEmitInitial();
      }
    }

    for (const sub of inspection.subfolders) {
      if (signal?.aborted) break;
      if (!selectedSubfolderNames.has(sub.name)) continue;
      if (!isUnlimited && totalPhotos.length >= maxPhotos) break;

      const subPhotos: PhotoItem[] = [];
      const remainingLimit = isUnlimited ? Infinity : maxPhotos - totalPhotos.length;
      await scanDirectoryHandle(sub.handle, subPhotos, remainingLimit, 0, 12, onProgress);
      if (subPhotos.length > 0) {
        totalPhotos.push(...subPhotos);
        folderEntries.push({
          id: `folder-${sub.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: `${inspection.rootName} ❯ ${sub.name}`,
          photos: subPhotos,
        });
        checkEmitInitial();
        if (onBatch) {
          onBatch([...totalPhotos], false, false);
        }
      }
    }
  } else if (inspection.files) {
    if (includeRootPhotos && inspection.hasDirectPhotos) {
      const rootFiles = inspection.files.filter(
        (file) => ((file as any).webkitRelativePath || file.name).split('/').length <= 2
      );
      const { photos } = parseFileListToPhotos(rootFiles, isUnlimited ? Infinity : maxPhotos);
      if (photos.length > 0) {
        totalPhotos.push(...photos);
        folderEntries.push({
          id: `folder-root-${Date.now()}`,
          name: `${inspection.rootName} (Root)`,
          photos,
        });
        checkEmitInitial();
      }
    }

    for (const sub of inspection.subfolders) {
      if (signal?.aborted) break;
      if (!selectedSubfolderNames.has(sub.name)) continue;
      if (!isUnlimited && totalPhotos.length >= maxPhotos) break;

      const subFiles = sub.files || [];
      const remainingLimit = isUnlimited ? Infinity : maxPhotos - totalPhotos.length;
      const { photos } = parseFileListToPhotos(subFiles, remainingLimit);
      if (photos.length > 0) {
        totalPhotos.push(...photos);
        folderEntries.push({
          id: `folder-${sub.name}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: `${inspection.rootName} ❯ ${sub.name}`,
          photos,
        });
        checkEmitInitial();
        if (onBatch) {
          onBatch([...totalPhotos], false, false);
        }
      }
    }
  }

  if (onBatch) {
    onBatch([...totalPhotos], !hasEmittedInitial, true);
  }

  return { folderEntries, totalPhotos };
}

// Local Directory Picker (showDirectoryPicker) for local PC / mapped NAS photos
export async function pickLocalPhotoDirectory(
  maxPhotos = Infinity,
  onProgress?: (count: number, currentDirName: string) => void
): Promise<{
  success: boolean;
  photos: PhotoItem[];
  folderName?: string;
  error?: string;
}> {
  try {
    const promptRes = await promptLocalDirectoryHandle();
    if (!promptRes.success) {
      if (promptRes.cancelled) {
        return { success: false, photos: [] };
      }
      return { success: false, photos: [], error: promptRes.error };
    }

    const dirHandle = promptRes.dirHandle;
    const folderName = dirHandle.name || 'Selected Folder';
    revokePreviousLocalBlobUrls();
    const localPhotos: PhotoItem[] = [];
    await scanDirectoryHandle(dirHandle, localPhotos, maxPhotos, 0, 12, onProgress);

    if (localPhotos.length === 0) {
      return {
        success: false,
        photos: [],
        folderName,
        error: `No photos (.jpg, .png, .webp, .heic) found in "${folderName}" or its subfolders.`,
      };
    }

    return { success: true, photos: localPhotos, folderName };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      return { success: false, photos: [] };
    }
    return { success: false, photos: [], error: err.message };
  }
}

// Fallback directory parser for standard HTML5 file inputs (<input type="file" webkitdirectory />)
export function parseFileListToPhotos(
  files: FileList | File[],
  maxPhotos = 5000
): { folderName: string; photos: PhotoItem[] } {
  const photos: PhotoItem[] = [];
  let detectedFolder = 'Selected Folder';

  for (let i = 0; i < files.length && photos.length < maxPhotos; i++) {
    const file = files[i];
    const path = (file as any).webkitRelativePath || file.name;
    const parts = path.split('/');
    if (parts.length > 1 && detectedFolder === 'Selected Folder') {
      detectedFolder = parts[0];
    }

    if (IMAGE_EXT_REGEX.test(file.name) || (file.type && file.type.startsWith('image/'))) {
      const url = createTrackedBlobUrl(file);
      photos.push({
        id: `local-${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
        url,
        caption: file.name.replace(/\.[^/.]+$/, ''),
        date: new Date(file.lastModified).toLocaleDateString(),
        source: 'local',
      });
    }
  }

  return { folderName: detectedFolder, photos };
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

export function isGooglePhotosUrl(url: string): boolean {
  return /photos\.(app\.goo\.gl|google\.com)/i.test(url);
}

/**
 * Tailors image resolution for Google Photos and Plex transcode URLs.
 * Dynamically adjusts requested dimensions to prevent 429 rate limits and eliminate heavy bandwidth spikes.
 */
export function getOptimizedPhotoUrl(url: string, targetWidth: number = 800): string {
  if (!url) return '';
  if (url.includes('googleusercontent.com')) {
    if (/=(w\d+.*|s\d+.*)$/.test(url)) {
      return url.replace(/=(w\d+.*|s\d+.*)$/, `=w${targetWidth}`);
    }
    return `${url}=w${targetWidth}`;
  }
  if (url.includes('/photo/:/transcode')) {
    // If requesting a small thumbnail (e.g. 120-600px in picker modal or small card), optimize dimensions
    if (targetWidth <= 600) {
      const height = Math.round(targetWidth * 0.75);
      let updated = url.replace(/([?&])width=\d+/, `$1width=${targetWidth}`);
      updated = updated.replace(/([?&])height=\d+/, `$1height=${height}`);
      return updated;
    }
  }
  return url;
}

export function isGoogleDriveFolderUrl(url: string): boolean {
  if (!url || !url.includes('drive.google.com')) return false;
  return /\/folders\/([a-zA-Z0-9_-]+)/i.test(url) || /[?&]id=([a-zA-Z0-9_-]+)/i.test(url);
}

export async function fetchGooglePhotosAlbum(
  albumUrl: string,
  maxPhotos: number = 10000,
  signal?: AbortSignal
): Promise<{
  title: string;
  count: number;
  totalAlbumCount: number;
  photos: PhotoItem[];
  error?: string;
}> {
  const trimmed = albumUrl.trim();
  if (!trimmed) return { title: '', count: 0, totalAlbumCount: 0, photos: [], error: 'Empty URL' };

  try {
    let res = await fetch(
      `/api/gphotos?url=${encodeURIComponent(trimmed)}&maxPhotos=${maxPhotos}`,
      { signal }
    );
    if (res.status === 404) {
      res = await fetch(
        `/functions/api/gphotos?url=${encodeURIComponent(trimmed)}&maxPhotos=${maxPhotos}`,
        { signal }
      );
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return {
        title: '',
        count: 0,
        totalAlbumCount: 0,
        photos: [],
        error: `Unexpected response from Google Photos service (HTTP ${res.status}). Server returned non-JSON.`,
      };
    }

    const data = await res.json();
    if (!res.ok) {
      return {
        title: '',
        count: 0,
        totalAlbumCount: 0,
        photos: [],
        error: data.error || `Failed to fetch Google Photos album (HTTP ${res.status}).`,
      };
    }

    if (!data.photos || data.photos.length === 0) {
      return {
        title: data.title || 'Google Photos Album',
        count: 0,
        totalAlbumCount: data.totalAlbumCount || 0,
        photos: [],
        error: 'No photos found in this Google Photos album. Make sure the album is set to Shared/Anyone with the link.',
      };
    }

    return {
      title: data.title || 'Google Photos Album',
      count: data.photos.length,
      totalAlbumCount: data.totalAlbumCount || data.photos.length,
      photos: data.photos,
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    return {
      title: '',
      count: 0,
      totalAlbumCount: 0,
      photos: [],
      error: `Network error connecting to Google Photos service: ${err.message}`,
    };
  }
}

export async function fetchGoogleDriveFolder(
  folderUrl: string,
  signal?: AbortSignal
): Promise<{
  title: string;
  count: number;
  totalAlbumCount: number;
  photos: PhotoItem[];
  error?: string;
}> {
  const trimmed = folderUrl.trim();
  if (!trimmed) return { title: '', count: 0, totalAlbumCount: 0, photos: [], error: 'Empty URL' };

  try {
    let res = await fetch(`/api/gdrive?url=${encodeURIComponent(trimmed)}`, { signal });
    if (res.status === 404) {
      res = await fetch(`/functions/api/gdrive?url=${encodeURIComponent(trimmed)}`, { signal });
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      return {
        title: '',
        count: 0,
        totalAlbumCount: 0,
        photos: [],
        error: `Unexpected response from Google Drive service (HTTP ${res.status}). Server returned non-JSON.`,
      };
    }

    const data = await res.json();
    if (!res.ok) {
      return {
        title: '',
        count: 0,
        totalAlbumCount: 0,
        photos: [],
        error: data.error || `Failed to fetch Google Drive folder (HTTP ${res.status}).`,
      };
    }

    if (!data.photos || data.photos.length === 0) {
      return {
        title: data.title || 'Google Drive Folder',
        count: 0,
        totalAlbumCount: 0,
        photos: [],
        error: 'No images found in this Google Drive folder. Please ensure files are images and General Access is "Anyone with the link".',
      };
    }

    return {
      title: data.title || 'Google Drive Folder',
      count: data.photos.length,
      totalAlbumCount: data.totalAlbumCount || data.photos.length,
      photos: data.photos,
    };
  } catch (err: any) {
    if (err?.name === 'AbortError') throw err;
    return {
      title: '',
      count: 0,
      totalAlbumCount: 0,
      photos: [],
      error: `Network error connecting to Google Drive service: ${err.message}`,
    };
  }
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
      id: makeStableWebPhotoId(idx, finalUrl),
      url: finalUrl,
      caption: isGdrive ? 'Google Drive Photo' : `Web Photo ${idx + 1}`,
      source: isGdrive ? 'gdrive' : 'web',
    });
  });

  return items;
}

export interface WebScanOptions {
  maxPhotos?: number;
  onBatch?: (photos: PhotoItem[], sourceTitle: string, isInitial: boolean, isDone: boolean) => void;
  signal?: AbortSignal;
}

// Resolves both Google Photos shared albums, Google Drive links, and direct web images
export async function resolveWebAndCloudPhotoUrls(
  text: string,
  maxPhotosOrOptions: number | WebScanOptions = 10000
): Promise<{
  photos: PhotoItem[];
  sourceTitle: string;
  totalAlbumCount?: number;
  error?: string;
}> {
  if (!text.trim()) return { photos: [], sourceTitle: '' };

  const options: WebScanOptions =
    typeof maxPhotosOrOptions === 'number'
      ? { maxPhotos: maxPhotosOrOptions }
      : maxPhotosOrOptions || {};

  const maxPhotos = options.maxPhotos ?? 10000;
  const onBatch = options.onBatch;
  const signal = options.signal;

  const lines = text
    .split(/[\r\n,]+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 5);

  const directItems: PhotoItem[] = [];
  const gphotosUrls: string[] = [];
  const gdriveUrls: string[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    if (isGooglePhotosUrl(line)) {
      gphotosUrls.push(line);
    } else if (isGoogleDriveFolderUrl(line)) {
      gdriveUrls.push(line);
    } else {
      const gdriveResolved = parseGoogleDriveLink(line);
      const finalUrl = gdriveResolved || line;
      const isGdrive = !!gdriveResolved;
      directItems.push({
        id: makeStableWebPhotoId(idx, finalUrl),
        url: finalUrl,
        caption: isGdrive ? 'Google Drive Photo' : `Web Photo ${idx + 1}`,
        source: isGdrive ? 'gdrive' : 'web',
      });
    }
  }

  // Fast initial batch: for Google Photos albums, fetch first 150 items for instant response
  const initialGPhotosLimit = onBatch ? Math.min(150, maxPhotos) : maxPhotos;

  const initialAlbumPromises = [
    ...gphotosUrls.map((u) => fetchGooglePhotosAlbum(u, initialGPhotosLimit, signal)),
    ...gdriveUrls.map((u) => fetchGoogleDriveFolder(u, signal)),
  ];

  const albumResults = await Promise.all(initialAlbumPromises);
  const albumItems: PhotoItem[] = [];
  const albumTitles: string[] = [];
  let highestAlbumTotal = 0;

  for (const res of albumResults) {
    if (res.photos && res.photos.length > 0) {
      albumItems.push(...res.photos);
      if (res.title && !albumTitles.includes(res.title)) {
        albumTitles.push(res.title);
      }
      if (res.totalAlbumCount && res.totalAlbumCount > highestAlbumTotal) {
        highestAlbumTotal = res.totalAlbumCount;
      }
    }
  }

  const initialCombined = [...albumItems, ...directItems];

  if (initialCombined.length === 0) {
    const firstError = albumResults.find((r) => r.error)?.error;
    return {
      photos: [],
      sourceTitle: '',
      error: firstError || 'No valid photos found. Please check your links.',
    };
  }

  const mainAlbumTitle = albumTitles.join(' + ');
  const sourceTitle =
    mainAlbumTitle && directItems.length === 0
      ? mainAlbumTitle
      : mainAlbumTitle
      ? `${mainAlbumTitle} & Web`
      : `Web Images (${initialCombined.length})`;

  // Emit initial batch immediately so PhotoFrame starts playing right away
  if (onBatch) {
    onBatch(initialCombined, sourceTitle, true, false);
  }

  // Check if deep pagination is needed in background for Google Photos albums
  const needsDeepPagination =
    Boolean(onBatch) &&
    gphotosUrls.length > 0 &&
    maxPhotos > initialGPhotosLimit &&
    albumResults.some((r) => (r.totalAlbumCount || 0) > r.count);

  if (needsDeepPagination && !signal?.aborted) {
    // Background deep pagination
    (async () => {
      try {
        const deepGPhotos = await Promise.all(
          gphotosUrls.map((u) => fetchGooglePhotosAlbum(u, maxPhotos, signal))
        );
        if (signal?.aborted) return;

        const deepItems: PhotoItem[] = [];
        for (const res of deepGPhotos) {
          if (res.photos && res.photos.length > 0) {
            deepItems.push(...res.photos);
          }
        }
        // Retain Drive and direct items
        const gdriveItems = albumResults
          .filter((_, idx) => idx >= gphotosUrls.length)
          .flatMap((r) => r.photos || []);
        const fullCombined = [...deepItems, ...gdriveItems, ...directItems];

        if (onBatch && fullCombined.length > initialCombined.length) {
          onBatch(fullCombined, sourceTitle, false, true);
        }
      } catch {
        // Deep pagination failed or completed
      }
    })();
  } else if (onBatch) {
    onBatch(initialCombined, sourceTitle, false, true);
  }

  return {
    photos: initialCombined,
    sourceTitle,
    totalAlbumCount: highestAlbumTotal,
  };
}
