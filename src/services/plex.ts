// Plex PIN / OAuth2-style Authentication & Photo Library API Service
import { db } from './db';
import type { PhotoItem } from './photos';

const PLEX_API_URL = 'https://plex.tv/api/v2';
const PLEX_CLIENT_ID_KEY = 'ambiently_plex_client_id';

export interface PlexPinResponse {
  id: number;
  code: string;
  expiresIn: number;
  createdAt: string;
  expiresAt: string;
  authToken?: string | null;
  authUrl: string;
  directLinkUrl?: string;
  hostedAuthUrl?: string;
  qrUrl?: string;
}

export interface PlexServerResource {
  name: string;
  product: string;
  productVersion: string;
  platform: string;
  device: string;
  createdAt: string;
  lastSeenAt: string;
  provides: string;
  ownerId: number | null;
  sourceTitle: string | null;
  publicAddress: string;
  accessToken: string;
  clientIdentifier: string;
  connections: {
    protocol: string;
    address: string;
    port: number;
    uri: string;
    local: boolean;
    relay: boolean;
    IPv6: boolean;
  }[];
}

export interface PlexLibrarySection {
  key: string;
  type: string;
  title: string;
  agent?: string;
  scanner?: string;
  language?: string;
  uuid?: string;
  updatedAt?: number;
  createdAt?: number;
  isPhoto?: boolean;
}

export interface PlexFolderItem {
  key: string;
  title: string;
  type?: string;
  thumb?: string;
  parentTitle?: string;
  depth?: number;
}

// Ensure unique persistent client identifier for this Ambiently kiosk
export function getPlexClientId(): string {
  let id = localStorage.getItem(PLEX_CLIENT_ID_KEY);
  if (!id) {
    id = `ambiently-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15)}`;
    localStorage.setItem(PLEX_CLIENT_ID_KEY, id);
  }
  return id;
}

// Common headers required by Plex API v2
function getPlexHeaders(extraHeaders: Record<string, string> = {}) {
  return {
    'X-Plex-Product': 'Ambiently Smart Display',
    'X-Plex-Version': '1.0.0',
    'X-Plex-Client-Identifier': getPlexClientId(),
    'X-Plex-Device': 'Smart Display',
    'X-Plex-Device-Name': 'Ambiently Dashboard',
    'X-Plex-Platform': 'Web',
    Accept: 'application/json',
    ...extraHeaders,
  };
}

// 1. Request new PIN for OAuth flow (standard 4-character TV linking PIN for plex.tv/link)
export async function requestPlexPin(): Promise<PlexPinResponse> {
  const clientId = getPlexClientId();
  // Notice: Do NOT pass ?strong=true. Without strong=true, Plex returns a 4-character TV link code
  // suitable for display on smart TVs/kiosks and pre-populating on plex.tv/link/?pin=CODE
  const url = `${PLEX_API_URL}/pins`;

  const res = await fetch(url, {
    method: 'POST',
    headers: getPlexHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Failed to request Plex PIN: ${res.statusText}`);
  }

  const data = await res.json();
  const directLinkUrl = `https://plex.tv/link?pin=${encodeURIComponent(data.code)}`;
  const hostedAuthUrl = `https://app.plex.tv/auth#?clientID=${encodeURIComponent(
    clientId
  )}&code=${encodeURIComponent(data.code)}&context[device][product]=Ambiently`;

  return {
    id: data.id,
    code: data.code,
    expiresIn: data.expiresIn,
    createdAt: data.createdAt,
    expiresAt: data.expiresAt,
    authToken: data.authToken,
    authUrl: directLinkUrl,
    directLinkUrl,
    hostedAuthUrl,
    qrUrl: data.qr,
  };
}

// 2. Poll PIN status to retrieve authToken once user approves on plex.tv/link
export async function pollPlexPin(pinId: number): Promise<string | null> {
  const url = `${PLEX_API_URL}/pins/${pinId}`;
  const res = await fetch(url, {
    method: 'GET',
    headers: getPlexHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Failed to check Plex PIN: ${res.statusText}`);
  }

  const data = await res.json();
  return data.authToken || null;
}

// 3. Save / Get / Clear Plex Token in local DB vault
export async function savePlexToken(token: string): Promise<void> {
  await db.vault.put({
    key: 'plex_auth_token',
    value: token,
    updated_at: new Date().toISOString(),
  });
}

export async function getPlexToken(): Promise<string | null> {
  const entry = await db.vault.get('plex_auth_token');
  return entry ? (entry.value as string) : null;
}

export async function clearPlexToken(): Promise<void> {
  await db.vault.delete('plex_auth_token');
  await db.vault.delete('plex_selected_server');
  await db.vault.delete('plex_selected_section');
}

// 4. Discover user Plex Media Servers (including secure plex.direct HTTPS connections)
export async function getPlexServers(authToken: string): Promise<PlexServerResource[]> {
  const url = `${PLEX_API_URL}/resources?includeHttps=1`;
  const res = await fetch(url, {
    method: 'GET',
    headers: getPlexHeaders({
      'X-Plex-Token': authToken,
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Plex servers: ${res.statusText}`);
  }

  const data: PlexServerResource[] = await res.json();
  // Filter only servers that provide the server role
  return data.filter((s) => s.provides && s.provides.includes('server'));
}

// Choose best connection (prefers secure HTTPS / plex.direct connections to avoid mixed content in browser)
export function getBestPlexConnectionUri(server: PlexServerResource): string {
  if (!server.connections || server.connections.length === 0) {
    return '';
  }

  // 1. Prefer HTTPS connections (e.g. *.plex.direct)
  const httpsConn = server.connections.find((c) => c.uri.startsWith('https://'));
  if (httpsConn) return httpsConn.uri;

  // 2. Fallback to first available connection
  return server.connections[0].uri;
}

// Detect photo/image and personal media libraries flexibly (supporting 'photo', 'photos', 'picture', 'pictures', 'image', 'photoalbum', 'homevideo', scanner/agent names, or title keywords)
export function isLikelyPhotoLibrary(section: Partial<PlexLibrarySection>): boolean {
  const t = (section.type || '').toLowerCase();
  const title = (section.title || '').toLowerCase();
  const scanner = (section.scanner || '').toLowerCase();
  const agent = (section.agent || '').toLowerCase();

  const photoTypes = new Set(['photo', 'photos', 'picture', 'pictures', 'image', 'images', 'photoalbum']);
  if (photoTypes.has(t)) return true;
  if (scanner.includes('photo') || agent.includes('photo')) return true;
  if (t === 'homevideo') return true;
  if (
    title.includes('photo') ||
    title.includes('picture') ||
    title.includes('album') ||
    title.includes('camera') ||
    title.includes('pic') ||
    title.includes('family') ||
    title.includes('wallpaper')
  ) {
    return true;
  }
  return false;
}

// 5. Fetch Photo & Media Libraries on selected server
export async function getPlexPhotoLibraries(
  serverUri: string,
  serverAccessToken: string,
  includeAll = true
): Promise<PlexLibrarySection[]> {
  const cleanUri = serverUri.replace(/\/$/, '');
  const url = `${cleanUri}/library/sections?X-Plex-Token=${encodeURIComponent(serverAccessToken)}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch library sections: ${res.statusText}`);
  }

  const data = await res.json();
  const rawDirectories: PlexLibrarySection[] = data.MediaContainer?.Directory || [];
  const directories: PlexLibrarySection[] = rawDirectories.map((d) => ({
    ...d,
    isPhoto: isLikelyPhotoLibrary(d),
  }));

  if (includeAll) {
    // Sort photo libraries first, then alphabetically
    return directories.sort((a, b) => {
      if (a.isPhoto && !b.isPhoto) return -1;
      if (!a.isPhoto && b.isPhoto) return 1;
      return a.title.localeCompare(b.title);
    });
  }

  return directories.filter((d) => d.isPhoto);
}

function isBrowserCompatibleImage(filePathOrKey: string): boolean {
  if (!filePathOrKey) return false;
  const clean = filePathOrKey.split('?')[0].toLowerCase();
  return /\.(jpe?g|png|webp|gif|bmp|svg)$/i.test(clean);
}

function buildPlexItemUrl(
  cleanUri: string,
  key: string,
  tokenParam: string,
  fallbackSectionKey?: string
): string {
  const detailParam = 'includeDetails=1&includeAdvanced=1&checkFiles=1';
  const combinedParam = `${detailParam}&${tokenParam}`;

  if (key.startsWith('http://') || key.startsWith('https://')) {
    return `${key}${key.includes('?') ? '&' : '?'}${combinedParam}`;
  }
  if (key.startsWith('/')) {
    return `${cleanUri}${key}${key.includes('?') ? '&' : '?'}${combinedParam}`;
  }
  if (/^\d+$/.test(key) && fallbackSectionKey) {
    return `${cleanUri}/library/sections/${fallbackSectionKey}/folder?parent=${key}&${combinedParam}`;
  }
  return `${cleanUri}/${key}${key.includes('?') ? '&' : '?'}${combinedParam}`;
}

// Enriches Plex photo items by resolving full Media parts when missing from folder/summary responses
async function enrichPlexPhotoItemsWithParts(
  items: any[],
  cleanUri: string,
  tokenParam: string
): Promise<any[]> {
  const needsEnrichment = items.filter(
    (item) =>
      item &&
      item.type !== 'folder' &&
      item.type !== 'photoalbum' &&
      item.type !== 'directory' &&
      item.type !== 'album' &&
      !item.Media?.[0]?.Part?.[0]?.key &&
      Boolean(item.ratingKey)
  );

  if (needsEnrichment.length === 0) {
    return items;
  }

  const resolvedMap = new Map<string, any>();
  const BATCH_SIZE = 25;

  for (let i = 0; i < needsEnrichment.length; i += BATCH_SIZE) {
    const batch = needsEnrichment.slice(i, i + BATCH_SIZE);
    const ids = batch.map((item) => item.ratingKey).join(',');

    try {
      const batchUrl = `${cleanUri}/library/metadata/${ids}?includeDetails=1&checkFiles=1&${tokenParam}`;
      const res = await fetch(batchUrl, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        const metadata = data.MediaContainer?.Metadata || [];
        for (const meta of metadata) {
          if (meta.ratingKey) {
            resolvedMap.set(String(meta.ratingKey), meta);
          }
        }
      } else {
        // Fallback: parallel individual requests for this batch
        await Promise.allSettled(
          batch.map(async (item) => {
            try {
              const singleUrl = `${cleanUri}/library/metadata/${item.ratingKey}?includeDetails=1&checkFiles=1&${tokenParam}`;
              const sRes = await fetch(singleUrl, { headers: { Accept: 'application/json' } });
              if (sRes.ok) {
                const sData = await sRes.json();
                const meta = sData.MediaContainer?.Metadata?.[0];
                if (meta?.ratingKey) {
                  resolvedMap.set(String(meta.ratingKey), meta);
                }
              }
            } catch {
              // ignore individual failure
            }
          })
        );
      }
    } catch {
      await Promise.allSettled(
        batch.map(async (item) => {
          try {
            const singleUrl = `${cleanUri}/library/metadata/${item.ratingKey}?includeDetails=1&checkFiles=1&${tokenParam}`;
            const sRes = await fetch(singleUrl, { headers: { Accept: 'application/json' } });
            if (sRes.ok) {
              const sData = await sRes.json();
              const meta = sData.MediaContainer?.Metadata?.[0];
              if (meta?.ratingKey) {
                resolvedMap.set(String(meta.ratingKey), meta);
              }
            }
          } catch {
            // ignore
          }
        })
      );
    }
  }

  return items.map((item) => {
    if (item?.ratingKey && resolvedMap.has(String(item.ratingKey))) {
      const enriched = resolvedMap.get(String(item.ratingKey));
      return {
        ...item,
        ...enriched,
        Media: enriched.Media || item.Media,
      };
    }
    return item;
  });
}

function extractPlexPhotoItem(
  item: any,
  cleanUri: string,
  tokenParam: string
): PhotoItem | null {
  // Never treat directories/albums/folders as photos
  if (
    item.type === 'folder' ||
    item.type === 'photoalbum' ||
    item.type === 'directory' ||
    item.type === 'album'
  ) {
    return null;
  }

  // Must be a photo type, or have Media parts / photo metadata
  const isPhoto =
    item.type === 'photo' ||
    item.type === 'picture' ||
    item.type === 'image' ||
    (!item.type &&
      (item.Media?.[0]?.Part?.[0]?.key ||
        (item.thumb && !item.key?.includes('children') && !item.key?.includes('folder'))));

  if (!isPhoto) return null;

  const part = item.Media?.[0]?.Part?.[0];
  const partKey: string | undefined = part?.key;
  const filePath: string = part?.file || partKey || '';
  const thumbKey: string | undefined = item.thumb;
  const ratingKey: string | undefined = item.ratingKey;

  // The resource path to transcode: MUST be partKey or thumb, NEVER item.key (/library/metadata/{id})
  const imageResourcePath =
    partKey || thumbKey || (ratingKey ? `/library/metadata/${ratingKey}/thumb` : undefined);
  if (!imageResourcePath) return null;

  // Direct raw photo URL (Full original camera resolution, zero transcoding, zero compression artifacts)
  const directUrl = partKey
    ? `${cleanUri}${partKey}${partKey.includes('?') ? '&' : '?'}${tokenParam}`
    : `${cleanUri}${imageResourcePath}${imageResourcePath.includes('?') ? '&' : '?'}${tokenParam}`;

  // High-fidelity 4K transcode URL (3840x2160, quality=95, upscale=0)
  // - width/height 3840x2160 ensures full 4K UHD resolution on high-DPI/Retina/TV screens
  // - quality=95 ensures near-lossless clarity
  // - upscale=0 prevents Plex from artificially stretching small images/thumbnails into blurry pixelated messes
  const transcodeUrl = `${cleanUri}/photo/:/transcode?width=3840&height=2160&quality=95&upscale=0&url=${encodeURIComponent(
    imageResourcePath
  )}&${tokenParam}`;

  // If partKey is present and points to a web-compatible image (JPEG, PNG, WebP), directUrl serves
  // native uncompressed resolution with instant local streaming and zero Plex transcode overhead.
  // For RAW / HEIC files, default to transcodeUrl so Plex converts them to high-res JPEG, with directUrl as fallback.
  const isWebNative = Boolean(partKey && (!filePath || isBrowserCompatibleImage(filePath)));
  const primaryUrl = isWebNative ? directUrl : transcodeUrl;
  const fallbackUrl = isWebNative ? transcodeUrl : directUrl;

  return {
    id: `plex-${item.ratingKey || partKey || item.key || Math.random().toString(36).slice(2)}`,
    url: primaryUrl,
    fallbackUrl,
    caption: item.title || item.summary || 'Plex Photo',
    author: item.year ? String(item.year) : undefined,
    date:
      item.originallyAvailableAt ||
      (item.addedAt ? new Date(item.addedAt * 1000).toLocaleDateString() : undefined),
    source: 'plex',
  };
}

// Discover subfolders or albums within a library section (including child subfolders)
export async function getPlexSectionFolders(
  serverUri: string,
  serverAccessToken: string,
  sectionKey: string
): Promise<PlexFolderItem[]> {
  const cleanUri = serverUri.replace(/\/$/, '');
  const tokenParam = `X-Plex-Token=${encodeURIComponent(serverAccessToken)}`;
  const folders: PlexFolderItem[] = [];

  // 1. Try folder hierarchy endpoint: /library/sections/{id}/folder
  try {
    const folderRes = await fetch(`${cleanUri}/library/sections/${sectionKey}/folder?${tokenParam}`, {
      headers: { Accept: 'application/json' },
    });
    if (folderRes.ok) {
      const folderData = await folderRes.json();
      const dirs = folderData.MediaContainer?.Directory || [];

      // For each root folder, fetch immediate child folders (depth: 1)
      const childPromises = dirs.map(async (d: any) => {
        if (!d.title || !d.key) return null;
        const rootItem: PlexFolderItem = {
          key: d.key,
          title: d.title,
          type: d.type || 'folder',
          thumb: d.thumb,
          depth: 0,
        };

        const subItems: PlexFolderItem[] = [];
        try {
          const childUrl = buildPlexItemUrl(cleanUri, d.key, tokenParam, sectionKey);
          const childRes = await fetch(childUrl, { headers: { Accept: 'application/json' } });
          if (childRes.ok) {
            const childData = await childRes.json();
            const childDirs = childData.MediaContainer?.Directory || [];
            for (const c of childDirs) {
              if (c.title && c.key) {
                subItems.push({
                  key: c.key,
                  title: c.title,
                  parentTitle: d.title,
                  type: c.type || 'folder',
                  thumb: c.thumb,
                  depth: 1,
                });
              }
            }
          }
        } catch {
          // ignore failure fetching child directory
        }

        return { rootItem, subItems };
      });

      const results = await Promise.allSettled(childPromises);
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) {
          folders.push(r.value.rootItem);
          folders.push(...r.value.subItems);
        }
      }
    }
  } catch (err) {
    console.warn('Could not fetch section folders:', err);
  }

  // 2. Also try albums endpoint if no folders found or to complement: /library/sections/{id}/all?type=14
  if (folders.length === 0) {
    try {
      const albumRes = await fetch(`${cleanUri}/library/sections/${sectionKey}/all?type=14&${tokenParam}`, {
        headers: { Accept: 'application/json' },
      });
      if (albumRes.ok) {
        const albumData = await albumRes.json();
        const dirs = albumData.MediaContainer?.Metadata || albumData.MediaContainer?.Directory || [];
        for (const d of dirs) {
          if (d.title && (d.key || d.ratingKey)) {
            folders.push({
              key: d.key || `/library/metadata/${d.ratingKey}/children`,
              title: d.title,
              type: 'photoalbum',
              thumb: d.thumb,
              depth: 0,
            });
          }
        }
      }
    } catch (err) {
      console.warn('Could not fetch section albums:', err);
    }
  }

  return folders;
}

// Fetch photos from a section (or specific subfolder/album), recursively traversing subfolders
export async function getPlexPhotosFromSection(
  serverUri: string,
  serverAccessToken: string,
  sectionKey: string,
  folderOrAlbumKey?: string,
  maxPhotos: number = Infinity,
  onProgress?: (count: number) => void
): Promise<PhotoItem[]> {
  const cleanUri = serverUri.replace(/\/$/, '');
  const tokenParam = `X-Plex-Token=${encodeURIComponent(serverAccessToken)}`;

  const isSpecificFolder = Boolean(
    folderOrAlbumKey && folderOrAlbumKey.trim() !== '' && folderOrAlbumKey !== 'all'
  );

  const isUnlimited = !maxPhotos || maxPhotos <= 0 || !isFinite(maxPhotos);

  const photos: PhotoItem[] = [];
  const seenPhotoIds = new Set<string>();
  const visitedDirectoryKeys = new Set<string>();
  const directoryQueue: { key: string; depth: number }[] = [];

  const addPhoto = (photo: PhotoItem) => {
    if (!seenPhotoIds.has(photo.id) && (isUnlimited || photos.length < maxPhotos)) {
      seenPhotoIds.add(photo.id);
      photos.push(photo);
      if (onProgress && photos.length % 25 === 0) {
        onProgress(photos.length);
      }
    }
  };

  if (isSpecificFolder && folderOrAlbumKey) {
    directoryQueue.push({ key: folderOrAlbumKey, depth: 0 });
  } else {
    // 1. When requesting entire section, try type=13 (photos) to flatten hierarchy
    const allPhotosUrl = `${cleanUri}/library/sections/${sectionKey}/all?type=13&includeDetails=1&includeAdvanced=1&checkFiles=1&${tokenParam}`;
    try {
      const res = await fetch(allPhotosUrl, {
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        const rawMetadata = data.MediaContainer?.Metadata || [];
        const metadataItems = await enrichPlexPhotoItemsWithParts(rawMetadata, cleanUri, tokenParam);
        for (const item of metadataItems) {
          const photo = extractPlexPhotoItem(item, cleanUri, tokenParam);
          if (photo) addPhoto(photo);
        }
      }
    } catch (e) {
      console.warn('Plex /all?type=13 query failed, falling back to folder traversal:', e);
    }

    // If type=13 returned photos across the library, report progress & return them
    if (photos.length > 0) {
      if (onProgress) onProgress(photos.length);
      return photos;
    }

    // Fallback: start traversing from the section folder root
    directoryQueue.push({ key: `/library/sections/${sectionKey}/folder`, depth: 0 });
  }

  // Breadth-first recursive directory traversal (up to depth 12, unlimited photos)
  const MAX_DEPTH = 12;
  const BATCH_SIZE = 6;

  while (directoryQueue.length > 0 && (isUnlimited || photos.length < maxPhotos)) {
    const currentBatch = directoryQueue.splice(0, BATCH_SIZE);

    const batchPromises = currentBatch.map(async ({ key, depth }) => {
      if (visitedDirectoryKeys.has(key)) return null;
      visitedDirectoryKeys.add(key);

      const targetUrl = buildPlexItemUrl(cleanUri, key, tokenParam, sectionKey);
      try {
        const res = await fetch(targetUrl, { headers: { Accept: 'application/json' } });
        if (!res.ok) return null;
        const data = await res.json();
        return { data, depth };
      } catch (err) {
        console.warn(`Failed to fetch Plex directory ${key}:`, err);
        return null;
      }
    });

    const results = await Promise.allSettled(batchPromises);

    for (const res of results) {
      if (res.status !== 'fulfilled' || !res.value) continue;
      const { data, depth } = res.value;

      // 1. Extract leaf photo items from Metadata (enriched with full Part keys for sharp high-res rendering)
      const rawMetadata = data.MediaContainer?.Metadata || [];
      const metadata = await enrichPlexPhotoItemsWithParts(rawMetadata, cleanUri, tokenParam);
      for (const item of metadata) {
        const photo = extractPlexPhotoItem(item, cleanUri, tokenParam);
        if (photo) {
          addPhoto(photo);
          if (!isUnlimited && photos.length >= maxPhotos) break;
        }
      }

      // 2. Discover subdirectories to traverse recursively
      if (depth < MAX_DEPTH && (isUnlimited || photos.length < maxPhotos)) {
        const directories = data.MediaContainer?.Directory || [];
        for (const dir of directories) {
          if (dir.key && !visitedDirectoryKeys.has(dir.key)) {
            directoryQueue.push({ key: dir.key, depth: depth + 1 });
          }
        }
      }
    }
  }

  if (onProgress) onProgress(photos.length);
  return photos;
}
