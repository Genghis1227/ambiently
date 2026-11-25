import {
  MAX_HA_ENTITIES,
  MAX_HOMELAB_CAMERAS,
  MAX_HOMELAB_SERVICES,
  type HomeAssistantEntityReading,
  type HomeAssistantEntityTarget,
  type HomelabCameraTarget,
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
  allowControl?: boolean;
  requirePin?: boolean;
}> = [
  { entityId: 'sensor.indoor_temperature', label: 'Indoor Temp', iconHint: 'thermometer' },
  { entityId: 'sensor.indoor_humidity', label: 'Humidity', iconHint: 'droplets' },
  {
    entityId: 'light.living_room',
    label: 'Living Room Light',
    iconHint: 'lightbulb',
    allowControl: true,
  },
  {
    entityId: 'cover.garage_door',
    label: 'Garage Door',
    iconHint: 'door',
    allowControl: true,
    requirePin: true,
  },
  { entityId: 'binary_sensor.front_door', label: 'Front Door', iconHint: 'shield' },
  { entityId: 'sensor.solar_power', label: 'Solar Power', iconHint: 'zap' },
];

const ENTITY_ID_RE = /^[a-z0-9_]+\.[a-z0-9_]+$/;
const CAMERA_ENTITY_ID_RE = /^camera\.[a-z0-9_]+$/;
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

const SENSITIVE_HA_DOMAINS = new Set(['lock', 'cover', 'alarm_control_panel']);

const ALLOWED_HA_DOMAIN_SERVICES: Record<string, readonly string[]> = {
  light: ['toggle', 'turn_on', 'turn_off'],
  switch: ['toggle', 'turn_on', 'turn_off'],
  fan: ['toggle', 'turn_on', 'turn_off'],
  input_boolean: ['toggle', 'turn_on', 'turn_off'],
  scene: ['turn_on'],
  script: ['turn_on'],
  button: ['press'],
  input_button: ['press'],
  lock: ['lock', 'unlock'],
  cover: ['open_cover', 'close_cover', 'stop_cover'],
  alarm_control_panel: ['alarm_arm_home', 'alarm_arm_away', 'alarm_disarm'],
  media_player: [
    'media_play_pause',
    'media_play',
    'media_pause',
    'media_next_track',
    'media_previous_track',
    'volume_mute',
  ],
};

export function isValidHomeAssistantEntityId(entityId: string): boolean {
  const clean = (entityId || '').trim();
  return clean.length >= 3 && clean.length <= 120 && ENTITY_ID_RE.test(clean);
}

export function isValidHomeAssistantCameraEntityId(entityId: string): boolean {
  const clean = (entityId || '').trim().toLowerCase();
  return clean.length >= 8 && clean.length <= 120 && CAMERA_ENTITY_ID_RE.test(clean);
}

export function extractHaDomain(entityId: string): string {
  const idx = (entityId || '').indexOf('.');
  return idx > 0 ? entityId.slice(0, idx).toLowerCase() : '';
}

export function isSensitiveHomeAssistantEntity(entityId: string): boolean {
  return SENSITIVE_HA_DOMAINS.has(extractHaDomain(entityId));
}

export function getControllableHaActions(entityId: string): string[] {
  const domain = extractHaDomain(entityId);
  const actions = ALLOWED_HA_DOMAIN_SERVICES[domain];
  return actions ? [...actions] : [];
}

/**
 * Validates and resolves an allowlisted Home Assistant domain/service call for an entity.
 * Rejects dangerous/admin domains such as hassio, shell_command, homeassistant, or read-only sensors.
 */
export function resolveAllowedHaServiceCall(
  entityId: string,
  requestedAction?: string
): { domain: string; service: string } | null {
  const cleanEntity = (entityId || '').trim().toLowerCase();
  if (!isValidHomeAssistantEntityId(cleanEntity)) return null;
  const domain = extractHaDomain(cleanEntity);
  const allowed = ALLOWED_HA_DOMAIN_SERVICES[domain];
  if (!allowed || allowed.length === 0) return null;

  const normalizedAction = (requestedAction || '').trim().toLowerCase();
  if (!normalizedAction) {
    return { domain, service: allowed[0] };
  }
  if (!allowed.includes(normalizedAction)) {
    return null;
  }
  return { domain, service: normalizedAction };
}

export function normalizeHomelabBaseUrl(raw?: string): string {
  return (raw || '').trim().replace(/\/+$/, '');
}

let homelabIdSeq = 0;

export function createHomelabItemId(prefix: 'svc' | 'ent' | 'cam'): string {
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

    const supportsControl = getControllableHaActions(entityId).length > 0;
    const sensitive = isSensitiveHomeAssistantEntity(entityId);

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
      allowControl: supportsControl && Boolean(item.allowControl),
      requirePin:
        typeof item.requirePin === 'boolean' ? item.requirePin : sensitive,
    });
  }

  return out;
}

export function resolveHomelabCameras(raw: unknown): HomelabCameraTarget[] {
  if (!Array.isArray(raw)) return [];
  const out: HomelabCameraTarget[] = [];

  for (let i = 0; i < raw.length; i++) {
    if (out.length >= MAX_HOMELAB_CAMERAS) break;
    const item = raw[i] as Partial<HomelabCameraTarget> | null | undefined;
    if (!item || typeof item !== 'object') continue;

    const sourceType = item.sourceType === 'snapshot_url' ? 'snapshot_url' : 'ha_entity';
    const entityId =
      typeof item.entityId === 'string' ? item.entityId.trim().toLowerCase() : undefined;
    const snapshotUrl =
      typeof item.snapshotUrl === 'string' ? item.snapshotUrl.trim() : undefined;

    if (sourceType === 'ha_entity') {
      if (!entityId || !isValidHomeAssistantCameraEntityId(entityId)) continue;
    } else {
      if (!snapshotUrl || !/^https?:\/\//i.test(snapshotUrl)) continue;
    }

    const name =
      typeof item.name === 'string' && item.name.trim()
        ? item.name.trim()
        : entityId || 'Camera';

    out.push({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `cam-${i + 1}`,
      name,
      sourceType,
      ...(sourceType === 'ha_entity' ? { entityId } : { snapshotUrl }),
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
  if (
    lower.startsWith('light.') ||
    lower.startsWith('switch.') ||
    lower.startsWith('fan.') ||
    lower.startsWith('scene.') ||
    lower.startsWith('input_boolean.')
  ) {
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
  } else if (lower === 'home' || lower === 'playing') {
    formattedValue = lower === 'playing' ? 'Playing' : 'Home';
    tone = 'good';
  } else if (lower === 'away' || lower === 'not_home' || lower === 'paused' || lower === 'idle') {
    formattedValue =
      lower === 'away' || lower === 'not_home'
        ? 'Away'
        : lower.charAt(0).toUpperCase() + lower.slice(1);
    tone = 'neutral';
  } else if (lower.startsWith('armed')) {
    formattedValue = lower.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    tone = 'good';
  } else if (lower === 'disarmed' || lower === 'triggered') {
    formattedValue = lower.charAt(0).toUpperCase() + lower.slice(1);
    tone = lower === 'triggered' ? 'alert' : 'warn';
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

  const domain = extractHaDomain(target.entityId);
  const supportedActions = getControllableHaActions(target.entityId);
  const controllable = Boolean(target.allowControl && supportedActions.length > 0);
  const requiresPin =
    typeof target.requirePin === 'boolean'
      ? target.requirePin
      : isSensitiveHomeAssistantEntity(target.entityId);

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
    domain,
    controllable,
    requiresPin,
    ...(controllable ? { supportedActions } : {}),
  };
}
