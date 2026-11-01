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

// 1. Request new PIN for OAuth flow
export async function requestPlexPin(): Promise<PlexPinResponse> {
  const clientId = getPlexClientId();
  const url = `${PLEX_API_URL}/pins?strong=true`;

  const res = await fetch(url, {
    method: 'POST',
    headers: getPlexHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Failed to request Plex PIN: ${res.statusText}`);
  }

  const data = await res.json();
  const authUrl = `https://app.plex.tv/auth#?clientID=${encodeURIComponent(
    clientId
  )}&code=${encodeURIComponent(data.code)}&context[device][product]=Ambiently`;

  return {
    id: data.id,
    code: data.code,
    expiresIn: data.expiresIn,
    createdAt: data.createdAt,
    expiresAt: data.expiresAt,
    authToken: data.authToken,
    authUrl,
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

// 5. Fetch Photo Libraries on selected server
export async function getPlexPhotoLibraries(
  serverUri: string,
  serverAccessToken: string
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
  const directories: PlexLibrarySection[] = data.MediaContainer?.Directory || [];
  return directories.filter((d) => d.type === 'photo');
}

// 6. Fetch photos from a section and generate transcode URLs
export async function getPlexPhotosFromSection(
  serverUri: string,
  serverAccessToken: string,
  sectionKey: string
): Promise<PhotoItem[]> {
  const cleanUri = serverUri.replace(/\/$/, '');
  const url = `${cleanUri}/library/sections/${sectionKey}/all?X-Plex-Token=${encodeURIComponent(
    serverAccessToken
  )}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch section photos: ${res.statusText}`);
  }

  const data = await res.json();
  const metadata = data.MediaContainer?.Metadata || [];

  const photos: PhotoItem[] = [];
  for (const item of metadata) {
    // Only process photo items with a key
    if (item.type === 'photo' && item.key) {
      // Build Plex transcode URL for crisp smart-display presentation
      const transcodeUrl = `${cleanUri}/photo/:/transcode?width=1920&height=1080&minSize=1&upscale=1&url=${encodeURIComponent(
        item.key
      )}&X-Plex-Token=${encodeURIComponent(serverAccessToken)}`;

      photos.push({
        id: `plex-${item.ratingKey || item.key}`,
        url: transcodeUrl,
        caption: item.title || item.summary || 'Plex Photo',
        author: item.year ? String(item.year) : undefined,
        date: item.originallyAvailableAt,
        source: 'plex',
      });
    }
  }

  return photos;
}
