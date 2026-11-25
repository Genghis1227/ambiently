import type {
  HaMediaPlayerRequest,
  HaMediaPlayerResponse,
  HomelabApiCheckRequest,
  HomelabApiCheckResponse,
  HomelabServiceActionRequest,
  HomelabServiceActionResponse,
} from '../types/phase5Widgets';

const HOMELAB_CACHE_PREFIX = 'ambiently_homelab_status_v1_';

export async function fetchHomelabCapabilities(
  signal?: AbortSignal
): Promise<{ lanAllowed: boolean }> {
  const res = await fetch('/api/homelab', {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal,
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const data = (await res.json()) as { lanAllowed?: boolean };
  return { lanAllowed: Boolean(data.lanAllowed) };
}

export async function fetchHomelabStatus(
  payload: HomelabApiCheckRequest,
  signal?: AbortSignal
): Promise<HomelabApiCheckResponse> {
  const res = await fetch('/api/homelab', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ mode: 'check', ...payload }),
    cache: 'no-store',
    signal,
  });
  if (!res.ok) {
    throw new Error(`Home Lab check failed (${res.status})`);
  }
  return (await res.json()) as HomelabApiCheckResponse;
}

export async function callHomeAssistantService(
  payload: Omit<HomelabServiceActionRequest, 'mode'>,
  signal?: AbortSignal
): Promise<HomelabServiceActionResponse> {
  const res = await fetch('/api/homelab', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ mode: 'ha_service', ...payload }),
    cache: 'no-store',
    signal,
  });
  const data = (await res.json()) as HomelabServiceActionResponse;
  if (!res.ok) {
    return {
      ok: false,
      blockedByLanGate: data?.blockedByLanGate,
      error: data?.error || `Action failed (${res.status})`,
    };
  }
  return data;
}

export async function fetchHomeAssistantMediaPlayer(
  payload: Omit<HaMediaPlayerRequest, 'mode'>,
  signal?: AbortSignal
): Promise<HaMediaPlayerResponse> {
  const res = await fetch('/api/homelab', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ mode: 'ha_media_player', ...payload }),
    cache: 'no-store',
    signal,
  });
  const data = (await res.json()) as HaMediaPlayerResponse;
  if (!res.ok && !data?.error) {
    return { ok: false, state: 'error', error: `Media check failed (${res.status})` };
  }
  return data;
}

export function readCachedHomelabStatus(widgetId: string): HomelabApiCheckResponse | null {
  if (typeof localStorage === 'undefined' || !widgetId) return null;
  try {
    const raw = localStorage.getItem(`${HOMELAB_CACHE_PREFIX}${widgetId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HomelabApiCheckResponse;
    if (!parsed || !Array.isArray(parsed.services) || !Array.isArray(parsed.entities)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeCachedHomelabStatus(
  widgetId: string,
  response: HomelabApiCheckResponse
): void {
  if (typeof localStorage === 'undefined' || !widgetId) return;
  try {
    const sanitized: HomelabApiCheckResponse = {
      ...response,
      ...(response.cameras
        ? {
            cameras: response.cameras.map(({ imageDataUrl: _ignored, ...rest }) => rest),
          }
        : {}),
    };
    localStorage.setItem(`${HOMELAB_CACHE_PREFIX}${widgetId}`, JSON.stringify(sanitized));
  } catch {
    // Ignore storage quota errors on restricted devices
  }
}
