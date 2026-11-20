import type {
  HomelabApiCheckRequest,
  HomelabApiCheckResponse,
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
    body: JSON.stringify(payload),
    cache: 'no-store',
    signal,
  });
  if (!res.ok) {
    throw new Error(`Home Lab check failed (${res.status})`);
  }
  return (await res.json()) as HomelabApiCheckResponse;
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
    localStorage.setItem(`${HOMELAB_CACHE_PREFIX}${widgetId}`, JSON.stringify(response));
  } catch {
    // Ignore storage quota errors on restricted devices
  }
}
