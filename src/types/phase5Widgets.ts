export const MAX_HOMELAB_SERVICES = 10;
export const MAX_HA_ENTITIES = 12;
export const MAX_HOMELAB_CAMERAS = 4;

export type HomelabServicePresetId =
  | 'plex'
  | 'nas'
  | 'pihole'
  | 'immich'
  | 'uptime_kuma'
  | 'jellyfin'
  | 'proxmox'
  | 'home_assistant'
  | 'custom';

export interface HomelabServiceTarget {
  id: string;
  name: string;
  url: string;
  preset?: HomelabServicePresetId;
  enabled: boolean;
}

export type HomelabServiceState = 'UP' | 'DEGRADED' | 'DOWN';

export interface HomelabServiceStatus {
  id: string;
  name: string;
  preset?: HomelabServicePresetId;
  state: HomelabServiceState;
  statusCode: number | null;
  latencyMs: number | null;
  detail?: string;
  blockedByLanGate?: boolean;
}

export type HomelabEntityIconHint =
  | 'thermometer'
  | 'door'
  | 'zap'
  | 'droplets'
  | 'shield'
  | 'sun'
  | 'lightbulb'
  | 'gauge';

export interface HomeAssistantEntityTarget {
  id: string;
  entityId: string;
  label?: string;
  unitOverride?: string;
  iconHint?: HomelabEntityIconHint;
  enabled: boolean;
  allowControl?: boolean;
  requirePin?: boolean;
}

export interface HomeAssistantEntityReading {
  id: string;
  entityId: string;
  label: string;
  state: string;
  formattedValue: string;
  unit?: string;
  tone: 'good' | 'warn' | 'alert' | 'neutral';
  iconHint?: HomelabEntityIconHint;
  updatedAt?: string;
  error?: string;
  blockedByLanGate?: boolean;
  domain?: string;
  controllable?: boolean;
  requiresPin?: boolean;
  supportedActions?: string[];
}

export interface HomelabCameraTarget {
  id: string;
  name: string;
  sourceType: 'ha_entity' | 'snapshot_url';
  entityId?: string;
  snapshotUrl?: string;
  enabled: boolean;
}

export interface HomelabCameraSnapshot {
  id: string;
  name: string;
  state: 'OK' | 'ERROR';
  imageDataUrl?: string;
  fetchedAt?: string;
  blockedByLanGate?: boolean;
  error?: string;
}

export type HomelabDisplayMode = 'auto' | 'split' | 'compact';

export interface HomelabLocalVaultCredentials {
  haAccessToken: string;
  boundOrigin?: string;
}

export interface HomelabWidgetConfig {
  services?: HomelabServiceTarget[];
  haBaseUrl?: string;
  haEntities?: HomeAssistantEntityTarget[];
  cameras?: HomelabCameraTarget[];
  displayMode?: HomelabDisplayMode;
  showLatency?: boolean;
  refreshIntervalSec?: 30 | 60 | 120 | 300;
  transparentBg?: boolean;
  themeMode?: 'auto' | 'light' | 'dark';
}

export interface HomelabApiCheckRequest {
  mode?: 'check';
  services?: HomelabServiceTarget[];
  cameras?: HomelabCameraTarget[];
  homeAssistant?: {
    baseUrl: string;
    accessToken?: string;
    entities: HomeAssistantEntityTarget[];
  };
}

export interface HomelabApiCheckResponse {
  lanAllowed: boolean;
  checkedAt: string;
  services: HomelabServiceStatus[];
  entities: HomeAssistantEntityReading[];
  cameras?: HomelabCameraSnapshot[];
}

export interface HomelabServiceActionRequest {
  mode: 'ha_service';
  baseUrl: string;
  accessToken: string;
  entityId: string;
  action?: string;
  serviceData?: {
    is_volume_muted?: boolean;
  };
  targetConfig?: Pick<HomeAssistantEntityTarget, 'id' | 'label' | 'unitOverride' | 'iconHint' | 'allowControl' | 'requirePin'>;
}

export interface HomelabServiceActionResponse {
  ok: boolean;
  entity?: HomeAssistantEntityReading;
  blockedByLanGate?: boolean;
  error?: string;
}

export interface HaMediaPlayerRequest {
  mode: 'ha_media_player';
  baseUrl: string;
  accessToken?: string;
  entityId: string;
}

export interface HaMediaPlayerResponse {
  ok: boolean;
  state: 'playing' | 'paused' | 'buffering' | 'idle' | 'off' | 'unavailable' | 'error';
  friendlyName?: string;
  title?: string;
  artist?: string;
  album?: string;
  mediaContentType?: string;
  durationSec?: number;
  positionSec?: number;
  positionUpdatedAt?: string;
  volumeLevel?: number;
  isMuted?: boolean;
  artworkDataUrl?: string;
  blockedByLanGate?: boolean;
  error?: string;
}

export type HomelabApiPostPayload =
  | HomelabApiCheckRequest
  | HomelabServiceActionRequest
  | HaMediaPlayerRequest;
