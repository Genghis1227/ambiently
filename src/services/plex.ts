// Plex PIN / OAuth2-style Authentication & Photo Library API Service
import { db } from './db';
import type { PhotoItem } from './photos';
import { serverTokensFrom } from './plexLinks';

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
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('plex_auth_changed', { detail: { hasToken: true } }));
  }
}

export async function getPlexToken(): Promise<string | null> {
  const entry = await db.vault.get('plex_auth_token');
  return entry ? (entry.value as string) : null;
}

export async function clearPlexToken(): Promise<void> {
  await db.vault.delete(PLEX_SERVER_TOKENS_KEY);
  setServerTokens({ tokens: {}, ready: true });
  await db.vault.delete('plex_auth_token');
  await db.vault.delete('plex_selected_server');
  await db.vault.delete('plex_selected_section');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('plex_auth_changed', { detail: { hasToken: false } }));
  }
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
  const servers = data.filter((s) => s.provides && s.provides.includes('server'));
  await rememberPlexServers(servers, authToken).catch((err) => {
    console.warn('Could not save Plex server tokens on this device:', err);
  });
  return servers;
}

// Each server's token, by connection address, kept on this device only. Saved photo links don't
// carry a token (see plexLinks.ts), so this is what lets this device show them.
const PLEX_SERVER_TOKENS_KEY = 'plex_server_tokens';

export interface PlexServerTokenState {
  tokens: Record<string, string>;
  // False until this device's tokens have been read. A Plex photo shown before then would load
  // without a token, fail, and be skipped.
  ready: boolean;
}

let serverTokenState: PlexServerTokenState = { tokens: {}, ready: false };
let serverTokensLoad: Promise<void> | null = null;
const serverTokenListeners = new Set<() => void>();

function setServerTokens(next: PlexServerTokenState): void {
  serverTokenState = next;
  serverTokenListeners.forEach((listener) => listener());
}

export function getPlexServerTokenState(): PlexServerTokenState {
  return serverTokenState;
}

export function getPlexServerTokens(): Record<string, string> {
  return serverTokenState.tokens;
}

export function subscribePlexServerTokens(listener: () => void): () => void {
  serverTokenListeners.add(listener);
  void loadPlexServerTokens();
  return () => {
    serverTokenListeners.delete(listener);
  };
}

async function rememberPlexServers(servers: PlexServerResource[], accountToken: string): Promise<void> {
  const tokens = serverTokensFrom(servers, accountToken);
  setServerTokens({ tokens, ready: true });
  await db.vault.put({
    key: PLEX_SERVER_TOKENS_KEY,
    value: JSON.stringify(tokens),
    description: 'Plex server tokens for this device only',
    updated_at: new Date().toISOString(),
  });
}

// Loads the saved server tokens, then refreshes them from plex.tv once per app start if this device
// is signed in to Plex, so a changed token or a new server address is picked up. With none saved yet
// (the first start after this change), photos wait for that refresh instead of the saved copy.
export function loadPlexServerTokens(): Promise<void> {
  if (!serverTokensLoad) {
    serverTokensLoad = (async () => {
      try {
        const saved = await db.vault.get(PLEX_SERVER_TOKENS_KEY);
        const parsed = saved?.value ? JSON.parse(saved.value) : null;
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          setServerTokens({ tokens: parsed, ready: true });
        }
      } catch {
        // Missing or unreadable, so wait for the refresh below
      }
      try {
        const accountToken = await getPlexToken();
        if (accountToken) await getPlexServers(accountToken);
      } catch {
        // Offline or Plex unreachable: keep the saved tokens
      }
      if (!serverTokenState.ready) setServerTokens({ ...serverTokenState, ready: true });
    })();
  }
  return serverTokensLoad;
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

// Helper to determine if a Plex JSON item represents a subfolder, directory, or photoalbum container
function isPlexDirectoryItem(item: any): boolean {
  if (!item) return false;
  if (
    item.type === 'folder' ||
    item.type === 'photoalbum' ||
    item.type === 'directory' ||
    item.type === 'album'
  ) {
    return true;
  }
  const key = String(item.key || '');
  if (
    key.includes('/folder') ||
    key.endsWith('/children') ||
    key.includes('/children?')
  ) {
    return true;
  }
  return false;
}

// Normalizes the traversal key for a Plex folder/photoalbum item
function getPlexDirectoryTargetKey(item: any): string | null {
  if (!item) return null;
  if (item.key) {
    const k = String(item.key);
    // If a photoalbum's key is /library/metadata/123 without /children, append /children so Plex returns its child items
    if (
      (item.type === 'photoalbum' || item.type === 'album') &&
      /^\/library\/metadata\/\d+$/.test(k)
    ) {
      return `${k}/children`;
    }
    return k;
  }
  if (item.ratingKey && isPlexDirectoryItem(item)) {
    return `/library/metadata/${item.ratingKey}/children`;
  }
  return null;
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
      !isPlexDirectoryItem(item) &&
      !item.Media?.[0]?.Part?.[0]?.key &&
      Boolean(item.ratingKey)
  );

  if (needsEnrichment.length === 0) {
    return items;
  }

  const resolvedMap = new Map<string, any>();
  const BATCH_SIZE = 50;

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

export function matchesPlexYearFilter(item: any, minYear?: number, maxYear?: number): boolean {
  if (!minYear && !maxYear) return true;
  let year: number | undefined = undefined;
  if (typeof item.year === 'number') {
    year = item.year;
  } else if (item.year) {
    const parsed = parseInt(String(item.year), 10);
    if (!isNaN(parsed) && parsed > 1900 && parsed < 2100) year = parsed;
  }
  if (!year && item.originallyAvailableAt) {
    const m = String(item.originallyAvailableAt).match(/^(\d{4})/);
    if (m) year = parseInt(m[1], 10);
  }
  if (!year && item.addedAt) {
    const d = new Date(item.addedAt * 1000);
    if (!isNaN(d.getFullYear())) year = d.getFullYear();
  }
  if (!year) {
    return false;
  }
  if (minYear && year < minYear) return false;
  if (maxYear && year > maxYear) return false;
  return true;
}

function extractPlexPhotoItem(
  item: any,
  cleanUri: string,
  minYear?: number,
  maxYear?: number
): PhotoItem | null {
  if ((minYear || maxYear) && !matchesPlexYearFilter(item, minYear, maxYear)) {
    return null;
  }

  // Never treat directories/albums/folders as photos
  if (isPlexDirectoryItem(item)) {
    return null;
  }

  // Also ignore video clips in mixed libraries so only still images are added to photo frames
  if (item.type === 'clip' || item.type === 'movie' || item.type === 'episode') {
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

  // These links are saved and synced, so they carry no token. The device that shows a photo adds
  // its own token for this server (addPlexToken in plexLinks.ts).

  // Direct raw photo URL (Full original camera resolution, zero transcoding, zero compression artifacts)
  const directUrl = `${cleanUri}${imageResourcePath}`;

  // High-fidelity 4K transcode URL (3840x2160, quality=95, upscale=0)
  // - width/height 3840x2160 ensures full 4K UHD resolution on high-DPI/Retina/TV screens
  // - quality=95 ensures near-lossless clarity
  // - upscale=0 prevents Plex from artificially stretching small images/thumbnails into blurry pixelated messes
  const transcodeUrl = `${cleanUri}/photo/:/transcode?width=3840&height=2160&quality=95&upscale=0&url=${encodeURIComponent(
    imageResourcePath
  )}`;

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

// Helper to extract both Directory and Metadata entries from a Plex MediaContainer response
function getContainerEntries(data: any): any[] {
  const dirs = data?.MediaContainer?.Directory || [];
  const meta = data?.MediaContainer?.Metadata || [];
  return [...dirs, ...meta];
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
  const seenKeys = new Set<string>();

  // 1. Try folder hierarchy endpoint: /library/sections/{id}/folder
  try {
    const folderRes = await fetch(`${cleanUri}/library/sections/${sectionKey}/folder?${tokenParam}`, {
      headers: { Accept: 'application/json' },
    });
    if (folderRes.ok) {
      const folderData = await folderRes.json();
      const rawEntries = getContainerEntries(folderData).filter(isPlexDirectoryItem);

      // For each root folder, fetch immediate child folders (depth: 1)
      const childPromises = rawEntries.map(async (d: any) => {
        const rootKey = getPlexDirectoryTargetKey(d);
        if (!d.title || !rootKey) return null;
        const rootItem: PlexFolderItem = {
          key: rootKey,
          title: d.title,
          type: d.type || 'folder',
          thumb: d.thumb,
          depth: 0,
        };

        const subItems: PlexFolderItem[] = [];
        try {
          const childUrl = buildPlexItemUrl(cleanUri, rootKey, tokenParam, sectionKey);
          const childRes = await fetch(childUrl, { headers: { Accept: 'application/json' } });
          if (childRes.ok) {
            const childData = await childRes.json();
            const childEntries = getContainerEntries(childData).filter(isPlexDirectoryItem);
            for (const c of childEntries) {
              const childKey = getPlexDirectoryTargetKey(c);
              if (c.title && childKey) {
                subItems.push({
                  key: childKey,
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
          if (!seenKeys.has(r.value.rootItem.key)) {
            seenKeys.add(r.value.rootItem.key);
            folders.push(r.value.rootItem);
          }
          for (const sub of r.value.subItems) {
            if (!seenKeys.has(sub.key)) {
              seenKeys.add(sub.key);
              folders.push(sub);
            }
          }
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
        const dirs = getContainerEntries(albumData);
        for (const d of dirs) {
          const albumKey = getPlexDirectoryTargetKey(d) || (d.ratingKey ? `/library/metadata/${d.ratingKey}/children` : d.key);
          if (d.title && albumKey && !seenKeys.has(albumKey)) {
            seenKeys.add(albumKey);
            folders.push({
              key: albumKey,
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

// Discover capture years available in a Plex library section
export async function getPlexSectionYears(
  serverUri: string,
  serverAccessToken: string,
  sectionKey: string
): Promise<number[]> {
  const cleanUri = serverUri.replace(/\/$/, '');
  const tokenParam = `X-Plex-Token=${encodeURIComponent(serverAccessToken)}`;
  try {
    const res = await fetch(`${cleanUri}/library/sections/${sectionKey}/year?${tokenParam}`, {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      const entries = getContainerEntries(data);
      const years: number[] = [];
      for (const entry of entries) {
        const title = entry.title || entry.key;
        const parsed = parseInt(String(title).trim(), 10);
        if (!isNaN(parsed) && parsed > 1900 && parsed < 2100) {
          years.push(parsed);
        }
      }
      return Array.from(new Set(years)).sort((a, b) => b - a);
    }
  } catch (err) {
    console.warn('Could not fetch section years from Plex:', err);
  }
  return [];
}

// Quick server-side query to get the total number of photos available in a section
export async function getPlexSectionTotalPhotos(
  serverUri: string,
  serverAccessToken: string,
  sectionKey: string
): Promise<number | null> {
  const cleanUri = serverUri.replace(/\/$/, '');
  const tokenParam = `X-Plex-Token=${encodeURIComponent(serverAccessToken)}`;
  try {
    const res = await fetch(
      `${cleanUri}/library/sections/${sectionKey}/all?type=13&X-Plex-Container-Start=0&X-Plex-Container-Size=0&${tokenParam}`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const count = data.MediaContainer?.totalSize ?? data.MediaContainer?.size;
    return typeof count === 'number' ? count : null;
  } catch (err) {
    console.warn('Could not fetch section photo count from Plex:', err);
    return null;
  }
}

export interface PlexScanOptions {
  maxPhotos?: number;
  onProgress?: (count: number) => void;
  onBatch?: (photos: PhotoItem[], isInitial: boolean, isDone: boolean) => void;
  signal?: AbortSignal;
  minYear?: number;
  maxYear?: number;
}

// Fetch photos from a section (or specific subfolder/album), recursively traversing subfolders
export async function getPlexPhotosFromSection(
  serverUri: string,
  serverAccessToken: string,
  sectionKey: string,
  folderOrAlbumKeys?: string | string[],
  maxPhotosOrOptions: number | PlexScanOptions = Infinity,
  legacyOnProgress?: (count: number) => void
): Promise<PhotoItem[]> {
  const cleanUri = serverUri.replace(/\/$/, '');
  const tokenParam = `X-Plex-Token=${encodeURIComponent(serverAccessToken)}`;

  const options: PlexScanOptions =
    typeof maxPhotosOrOptions === 'number'
      ? { maxPhotos: maxPhotosOrOptions, onProgress: legacyOnProgress }
      : maxPhotosOrOptions || {};

  const maxPhotos = options.maxPhotos ?? Infinity;
  const onProgress = options.onProgress;
  const onBatch = options.onBatch;
  const signal = options.signal;

  const targetFolderKeys: string[] = Array.isArray(folderOrAlbumKeys)
    ? folderOrAlbumKeys.filter((k) => k && k.trim() !== '' && k !== 'all')
    : folderOrAlbumKeys && folderOrAlbumKeys.trim() !== '' && folderOrAlbumKeys !== 'all'
    ? [folderOrAlbumKeys]
    : [];

  const isSpecificFolder = targetFolderKeys.length > 0;

  const isUnlimited = !maxPhotos || maxPhotos <= 0 || !isFinite(maxPhotos);

  const photos: PhotoItem[] = [];
  const seenPhotoIds = new Set<string>();
  const visitedDirectoryKeys = new Set<string>();
  const directoryQueue: { key: string; depth: number }[] = [];

  let hasEmittedInitial = false;
  let lastEmittedCount = 0;

  const checkEmitInitial = () => {
    if (!hasEmittedInitial && photos.length >= 25 && onBatch) {
      hasEmittedInitial = true;
      lastEmittedCount = photos.length;
      onBatch([...photos], true, false);
    }
  };

  const addPhoto = (photo: PhotoItem) => {
    if (!seenPhotoIds.has(photo.id) && (isUnlimited || photos.length < maxPhotos)) {
      seenPhotoIds.add(photo.id);
      photos.push(photo);
      if (onProgress && photos.length % 25 === 0) {
        onProgress(photos.length);
      }
      checkEmitInitial();
    }
  };

  if (signal?.aborted) return photos;

  if (isSpecificFolder) {
    for (const key of targetFolderKeys) {
      directoryQueue.push({ key, depth: 0 });
    }
  } else {
    // 1. When requesting entire section, query type=13 (photos) with pagination to get all photos
    let filterParams = '';
    if (options.minYear) {
      filterParams += `&year>=${encodeURIComponent(options.minYear)}`;
    }
    if (options.maxYear) {
      filterParams += `&year<=${encodeURIComponent(options.maxYear)}`;
    }
    const sortParam = '&sort=originallyAvailableAt:desc';
    const PAGE_SIZE = 250;
    let offset = 0;
    let hasMorePages = true;
    let serverTotalSize: number | null = null;

    while (hasMorePages && (isUnlimited || photos.length < maxPhotos)) {
      if (signal?.aborted) break;

      const pageUrl = `${cleanUri}/library/sections/${sectionKey}/all?type=13&includeDetails=1&includeAdvanced=1&checkFiles=1${filterParams}${sortParam}&X-Plex-Container-Start=${offset}&X-Plex-Container-Size=${PAGE_SIZE}&${tokenParam}`;
      try {
        const res = await fetch(pageUrl, {
          headers: { Accept: 'application/json' },
          signal,
        });
        if (!res.ok) {
          hasMorePages = false;
          break;
        }

        const data = await res.json();
        if (serverTotalSize === null && typeof data.MediaContainer?.totalSize === 'number') {
          serverTotalSize = data.MediaContainer.totalSize;
        }

        const rawEntries = getContainerEntries(data);
        const leafCandidates = rawEntries.filter((item) => !isPlexDirectoryItem(item));

        if (leafCandidates.length === 0) {
          hasMorePages = false;
          break;
        }

        // Fast-path: extract photos immediately so initial display has 0 latency
        for (const item of leafCandidates) {
          const photo = extractPlexPhotoItem(item, cleanUri, options.minYear, options.maxYear);
          if (photo) addPhoto(photo);
          if (!isUnlimited && photos.length >= maxPhotos) break;
        }

        checkEmitInitial();

        // Enrich first batch if needed for full part paths
        if (offset === 0 && leafCandidates.length > 0 && photos.length < 50) {
          try {
            const enrichedLeaves = await enrichPlexPhotoItemsWithParts(leafCandidates.slice(0, 50), cleanUri, tokenParam);
            for (const item of enrichedLeaves) {
              const photo = extractPlexPhotoItem(item, cleanUri, options.minYear, options.maxYear);
              if (photo) addPhoto(photo);
            }
          } catch {
            // ignore
          }
        }

        if (onBatch && photos.length - lastEmittedCount >= 100) {
          lastEmittedCount = photos.length;
          onBatch([...photos], false, false);
        }

        offset += leafCandidates.length;

        // If we reached the server's reported totalSize or received fewer items than requested, we're done
        if (serverTotalSize !== null && offset >= serverTotalSize) {
          hasMorePages = false;
        }
        if (leafCandidates.length < PAGE_SIZE) {
          hasMorePages = false;
        }
      } catch (e: any) {
        if (e?.name !== 'AbortError') {
          console.warn('Plex /all?type=13 page query failed:', e);
        }
        hasMorePages = false;
        break;
      }
    }

    if (signal?.aborted) return photos;

    if (photos.length > 0) {
      if (onProgress) onProgress(photos.length);
      if (onBatch) {
        onBatch([...photos], !hasEmittedInitial, true);
      }
      return photos;
    }

    // Fallback: If section /all?type=13 query returned 0 photos, traverse from the section folder root
    directoryQueue.push({ key: `/library/sections/${sectionKey}/folder`, depth: 0 });
  }

  // Breadth-first recursive directory traversal (up to depth 15, unlimited photos)
  const MAX_DEPTH = 15;
  const BATCH_SIZE = 8;

  while (directoryQueue.length > 0 && (isUnlimited || photos.length < maxPhotos)) {
    if (signal?.aborted) break;

    const currentBatch = directoryQueue.splice(0, BATCH_SIZE);

    const batchPromises = currentBatch.map(async ({ key, depth }) => {
      if (signal?.aborted) return null;
      if (visitedDirectoryKeys.has(key)) return null;
      visitedDirectoryKeys.add(key);

      const targetUrl = buildPlexItemUrl(cleanUri, key, tokenParam, sectionKey);
      try {
        const res = await fetch(targetUrl, { headers: { Accept: 'application/json' }, signal });
        if (!res.ok) return null;
        const data = await res.json();
        return { data, depth };
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.warn(`Failed to fetch Plex directory ${key}:`, err);
        }
        return null;
      }
    });

    const results = await Promise.allSettled(batchPromises);

    for (const res of results) {
      if (res.status !== 'fulfilled' || !res.value) continue;
      const { data, depth } = res.value;

      // Plex returns folders/photoalbums and leaf photos across BOTH MediaContainer.Metadata and MediaContainer.Directory!
      const allEntries = getContainerEntries(data);

      // 1. Extract leaf photo items
      const leafCandidates = allEntries.filter((item) => !isPlexDirectoryItem(item));
      if (leafCandidates.length > 0) {
        for (const item of leafCandidates) {
          const photo = extractPlexPhotoItem(item, cleanUri, options.minYear, options.maxYear);
          if (photo) {
            addPhoto(photo);
            if (!isUnlimited && photos.length >= maxPhotos) break;
          }
        }
      }

      // 2. Discover subdirectories and child photoalbums from BOTH Directory and Metadata to traverse recursively
      if (depth < MAX_DEPTH && (isUnlimited || photos.length < maxPhotos)) {
        const subDirEntries = allEntries.filter(isPlexDirectoryItem);
        for (const dir of subDirEntries) {
          const targetKey = getPlexDirectoryTargetKey(dir);
          if (targetKey && !visitedDirectoryKeys.has(targetKey)) {
            directoryQueue.push({ key: targetKey, depth: depth + 1 });
          }
        }
      }
    }

    checkEmitInitial();

    if (onBatch && photos.length - lastEmittedCount >= 100) {
      lastEmittedCount = photos.length;
      onBatch([...photos], false, false);
    }
  }

  if (onProgress) onProgress(photos.length);
  if (onBatch) {
    onBatch([...photos], !hasEmittedInitial, true);
  }
  return photos;
}
