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

// Discover subfolders or albums within a library section
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
      for (const d of dirs) {
        if (d.title && d.key) {
          folders.push({
            key: d.key,
            title: d.title,
            type: d.type || 'folder',
            thumb: d.thumb,
          });
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

// 6. Fetch photos from a section (or specific subfolder/album) and generate transcode URLs
export async function getPlexPhotosFromSection(
  serverUri: string,
  serverAccessToken: string,
  sectionKey: string,
  folderOrAlbumKey?: string
): Promise<PhotoItem[]> {
  const cleanUri = serverUri.replace(/\/$/, '');
  const tokenParam = `X-Plex-Token=${encodeURIComponent(serverAccessToken)}`;

  let url: string;
  const isSpecificFolder = Boolean(folderOrAlbumKey && folderOrAlbumKey.trim() !== '' && folderOrAlbumKey !== 'all');

  if (isSpecificFolder && folderOrAlbumKey) {
    const cleanFolderKey = folderOrAlbumKey.startsWith('/') ? folderOrAlbumKey : `/${folderOrAlbumKey}`;
    url = `${cleanUri}${cleanFolderKey}${cleanFolderKey.includes('?') ? '&' : '?'}${tokenParam}`;
  } else {
    // When requesting entire section, try type=13 (photo) to flatten hierarchy
    url = `${cleanUri}/library/sections/${sectionKey}/all?type=13&${tokenParam}`;
  }

  let res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  let data: any = null;
  if (res.ok) {
    data = await res.json();
  }

  // Fallback if type=13 was empty or returned nothing (e.g. for Home Video or custom sections)
  if (!isSpecificFolder && (!data?.MediaContainer?.Metadata?.length && !data?.MediaContainer?.Directory?.length)) {
    const fallbackUrl = `${cleanUri}/library/sections/${sectionKey}/all?${tokenParam}`;
    try {
      const fallbackRes = await fetch(fallbackUrl, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (fallbackRes.ok) {
        data = await fallbackRes.json();
      }
    } catch (e) {
      console.warn('Plex section fallback fetch failed:', e);
    }
  }

  if (!data) {
    throw new Error(`Failed to fetch photos: ${res.statusText}`);
  }

  const items = [
    ...(data.MediaContainer?.Metadata || []),
    ...(data.MediaContainer?.Directory || []),
  ];

  const photos: PhotoItem[] = [];
  for (const item of items) {
    const isPhotoItem =
      item.type === 'photo' ||
      item.type === 'picture' ||
      item.type === 'image' ||
      (!item.type && (item.thumb || item.key));

    const itemPath = item.key || item.thumb;
    if (isPhotoItem && itemPath) {
      // Build Plex transcode URL for crisp smart-display presentation
      const transcodeUrl = `${cleanUri}/photo/:/transcode?width=1920&height=1080&minSize=1&upscale=1&url=${encodeURIComponent(
        itemPath
      )}&${tokenParam}`;

      photos.push({
        id: `plex-${item.ratingKey || item.key || Math.random().toString(36).slice(2)}`,
        url: transcodeUrl,
        caption: item.title || item.summary || 'Plex Photo',
        author: item.year ? String(item.year) : undefined,
        date: item.originallyAvailableAt || (item.addedAt ? new Date(item.addedAt * 1000).toLocaleDateString() : undefined),
        source: 'plex',
      });
    }
  }

  return photos;
}
