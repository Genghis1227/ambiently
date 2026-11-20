import {
  MAX_HA_ENTITIES,
  MAX_HOMELAB_SERVICES,
  type HomeAssistantEntityReading,
  type HomeAssistantEntityTarget,
  type HomelabEntityIconHint,
  type HomelabServicePresetId,
  type HomelabServiceState,
  type HomelabServiceTarget,
} from '../types/phase5Widgets';

export interface HomelabServicePresetMeta {
  preset: Exclude<HomelabServicePresetId, 'custom'>;
  label: string;
  defaultName: string;
  sampleUrl: string;
}

export const HOMELAB_SERVICE_PRESETS: HomelabServicePresetMeta[] = [
  {
    preset: 'plex',
    label: 'Plex',
    defaultName: 'Plex Media Server',
    sampleUrl: 'http://192.168.1.50:32400/identity',
  },
  {
    preset: 'nas',
    label: 'NAS',
    defaultName: 'Home NAS',
    sampleUrl: 'http://192.168.1.50:5000',
  },
  {
    preset: 'pihole',
    label: 'Pi-hole',
    defaultName: 'Pi-hole DNS',
    sampleUrl: 'http://192.168.1.2/admin',
  },
  {
    preset: 'immich',
    label: 'Immich',
    defaultName: 'Immich Photos',
    sampleUrl: 'http://192.168.1.50:2283/api/server/ping',
  },
  {
    preset: 'uptime_kuma',
    label: 'Uptime Kuma',
    defaultName: 'Uptime Kuma',
    sampleUrl: 'http://192.168.1.50:3001',
  },
  {
    preset: 'jellyfin',
    label: 'Jellyfin',
    defaultName: 'Jellyfin',
    sampleUrl: 'http://192.168.1.50:8096/System/Info/Public',
  },
  {
    preset: 'proxmox',
    label: 'Proxmox',
    defaultName: 'Proxmox VE',
    sampleUrl: 'https://192.168.1.10:8006',
  },
  {
    preset: 'home_assistant',
    label: 'Home Assistant',
    defaultName: 'Home Assistant UI',
    sampleUrl: 'http://homeassistant.local:8123',
  },
];

export const HOMELAB_HA_ENTITY_TEMPLATES: Array<{
  entityId: string;
  label: string;
  iconHint: HomelabEntityIconHint;
  unitOverride?: string;
}> = [
  { entityId: 'sensor.indoor_temperature', label: 'Indoor Temp', iconHint: 'thermometer' },
  { entityId: 'sensor.indoor_humidity', label: 'Humidity', iconHint: 'droplets' },
  { entityId: 'cover.garage_door', label: 'Garage Door', iconHint: 'door' },
  { entityId: 'binary_sensor.front_door', label: 'Front Door', iconHint: 'shield' },
  { entityId: 'sensor.solar_power', label: 'Solar Power', iconHint: 'zap' },
];

const ENTITY_ID_RE = /^[a-z0-9_]+\.[a-z0-9_]+$/;
const VALID_PRESETS = new Set<HomelabServicePresetId>([
  'plex',
  'nas',
  'pihole',
  'immich',
  'uptime_kuma',
  'jellyfin',
  'proxmox',
  'home_assistant',
  'custom',
]);
const VALID_ICON_HINTS = new Set<HomelabEntityIconHint>([
  'thermometer',
  'door',
  'zap',
  'droplets',
  'shield',
  'sun',
  'lightbulb',
  'gauge',
]);

export function isValidHomeAssistantEntityId(entityId: string): boolean {
  const clean = (entityId || '').trim();
  return clean.length >= 3 && clean.length <= 120 && ENTITY_ID_RE.test(clean);
}

export function normalizeHomelabBaseUrl(raw?: string): string {
  return (raw || '').trim().replace(/\/+$/, '');
}

let homelabIdSeq = 0;

export function createHomelabItemId(prefix: 'svc' | 'ent'): string {
  homelabIdSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${homelabIdSeq}`;
}

export function resolveHomelabServices(raw: unknown): HomelabServiceTarget[] {
  if (!Array.isArray(raw)) return [];
  const out: HomelabServiceTarget[] = [];

  for (let i = 0; i < raw.length; i++) {
    if (out.length >= MAX_HOMELAB_SERVICES) break;
    const item = raw[i] as Partial<HomelabServiceTarget> | null | undefined;
    if (!item || typeof item !== 'object') continue;
    const url = typeof item.url === 'string' ? item.url.trim() : '';
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (!url && !name) continue;

    out.push({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `svc-${i + 1}`,
      name: name || url || 'Service',
      url,
      preset: VALID_PRESETS.has(item.preset as HomelabServicePresetId)
        ? (item.preset as HomelabServicePresetId)
        : 'custom',
      enabled: item.enabled !== false,
    });
  }

  return out;
}

export function resolveHomeAssistantEntities(raw: unknown): HomeAssistantEntityTarget[] {
  if (!Array.isArray(raw)) return [];
  const out: HomeAssistantEntityTarget[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < raw.length; i++) {
    if (out.length >= MAX_HA_ENTITIES) break;
    const item = raw[i] as Partial<HomeAssistantEntityTarget> | null | undefined;
    if (!item || typeof item !== 'object') continue;
    const entityId = typeof item.entityId === 'string' ? item.entityId.trim().toLowerCase() : '';
    if (!isValidHomeAssistantEntityId(entityId) || seen.has(entityId)) continue;
    seen.add(entityId);

    out.push({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `ent-${i + 1}`,
      entityId,
      label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : undefined,
      unitOverride:
        typeof item.unitOverride === 'string' && item.unitOverride.trim()
          ? item.unitOverride.trim()
          : undefined,
      iconHint: VALID_ICON_HINTS.has(item.iconHint as HomelabEntityIconHint)
        ? (item.iconHint as HomelabEntityIconHint)
        : inferIconHintFromEntityId(entityId),
      enabled: item.enabled !== false,
    });
  }

  return out;
}

export function inferIconHintFromEntityId(entityId: string): HomelabEntityIconHint {
  const lower = entityId.toLowerCase();
  if (lower.includes('temp') || lower.includes('thermostat') || lower.startsWith('climate.')) {
    return 'thermometer';
  }
  if (lower.includes('humid') || lower.includes('moisture') || lower.includes('rain')) {
    return 'droplets';
  }
  if (lower.startsWith('cover.') || lower.includes('garage') || lower.includes('door')) {
    return 'door';
  }
  if (lower.startsWith('lock.') || lower.includes('alarm') || lower.startsWith('binary_sensor.')) {
    return 'shield';
  }
  if (lower.includes('solar') || lower.includes('power') || lower.includes('watt') || lower.includes('energy')) {
    return 'zap';
  }
  if (lower.startsWith('light.') || lower.startsWith('switch.')) {
    return 'lightbulb';
  }
  if (lower.startsWith('sun.')) {
    return 'sun';
  }
  return 'gauge';
}

export function classifyServiceProbeResult(params: {
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  bodySnippet?: string;
  errorMessage?: string;
}): { state: HomelabServiceState; detail: string } {
  const { ok, status, latencyMs, bodySnippet, errorMessage } = params;

  if (status === null) {
    return {
      state: 'DOWN',
      detail: errorMessage || 'Unreachable',
    };
  }

  // Reachable admin portals returning 401/403 (e.g., Pi-hole, Proxmox, NAS login gates) are alive
  const isReachableAuthGate = status === 401 || status === 403;
  if (ok || (status >= 200 && status < 400) || isReachableAuthGate) {
    const trimmed = (bodySnippet || '').trim();
    if (
      trimmed.startsWith('{') &&
      /"status"\s*:\s*"(?:down|error|fail|unhealthy)"/i.test(trimmed)
    ) {
      return { state: 'DEGRADED', detail: 'Reported degraded' };
    }

    if (typeof latencyMs === 'number' && latencyMs >= 2500) {
      return {
        state: 'DEGRADED',
        detail: `Slow (${latencyMs}ms)`,
      };
    }

    if (isReachableAuthGate) {
      return { state: 'UP', detail: `Auth Gate (${status})` };
    }

    return { state: 'UP', detail: `${status} OK` };
  }

  if (status === 429) {
    return { state: 'DEGRADED', detail: 'Rate limited (429)' };
  }

  return { state: 'DOWN', detail: `HTTP ${status}` };
}

export function formatHomeAssistantEntityReading(
  target: HomeAssistantEntityTarget,
  payload: {
    state?: unknown;
    attributes?: Record<string, unknown>;
    last_updated?: unknown;
  }
): HomeAssistantEntityReading {
  const attrs = payload.attributes && typeof payload.attributes === 'object' ? payload.attributes : {};
  const friendlyName =
    typeof attrs.friendly_name === 'string' && attrs.friendly_name.trim()
      ? attrs.friendly_name.trim()
      : target.entityId;
  const label = target.label || friendlyName;
  const unit =
    target.unitOverride ||
    (typeof attrs.unit_of_measurement === 'string' && attrs.unit_of_measurement.trim()
      ? attrs.unit_of_measurement.trim()
      : undefined);

  const rawState = payload.state !== undefined && payload.state !== null ? String(payload.state) : 'unknown';
  const lower = rawState.trim().toLowerCase();
  const iconHint = target.iconHint || inferIconHintFromEntityId(target.entityId);

  let formattedValue = rawState;
  let tone: HomeAssistantEntityReading['tone'] = 'neutral';

  if (lower === 'unavailable' || lower === 'unknown' || lower === '') {
    formattedValue = 'Unavailable';
    tone = 'neutral';
  } else if (lower === 'open' || lower === 'opening' || lower === 'unlocked' || lower === 'problem') {
    formattedValue = lower.charAt(0).toUpperCase() + lower.slice(1);
    tone = lower === 'problem' ? 'alert' : 'warn';
  } else if (lower === 'closed' || lower === 'closing' || lower === 'locked') {
    formattedValue = lower.charAt(0).toUpperCase() + lower.slice(1);
    tone = 'good';
  } else if (lower === 'on') {
    formattedValue = target.entityId.startsWith('binary_sensor.') && iconHint === 'door' ? 'Open' : 'On';
    tone = iconHint === 'door' || iconHint === 'shield' ? 'warn' : 'good';
  } else if (lower === 'off') {
    formattedValue = target.entityId.startsWith('binary_sensor.') && iconHint === 'door' ? 'Closed' : 'Off';
    tone = iconHint === 'door' || iconHint === 'shield' ? 'good' : 'neutral';
  } else if (lower === 'home') {
    formattedValue = 'Home';
    tone = 'good';
  } else if (lower === 'away' || lower === 'not_home') {
    formattedValue = 'Away';
    tone = 'neutral';
  } else {
    const num = Number(rawState);
    if (Number.isFinite(num)) {
      const rounded = Number.isInteger(num) ? String(num) : num.toFixed(1).replace(/\.0$/, '');
      formattedValue = unit ? `${rounded}${unit.startsWith('°') || unit === '%' ? '' : ' '}${unit}` : rounded;
      tone = 'neutral';
    } else if (unit) {
      formattedValue = `${rawState} ${unit}`;
    }
  }

  return {
    id: target.id,
    entityId: target.entityId,
    label,
    state: rawState,
    formattedValue,
    unit,
    tone,
    iconHint,
    updatedAt: typeof payload.last_updated === 'string' ? payload.last_updated : undefined,
  };
}
