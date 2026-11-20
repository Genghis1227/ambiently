export const MAX_HOMELAB_SERVICES = 10;
export const MAX_HA_ENTITIES = 12;

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
}

export type HomelabDisplayMode = 'auto' | 'split' | 'compact';

export interface HomelabLocalVaultCredentials {
  haAccessToken: string;
}

export interface HomelabWidgetConfig {
  services?: HomelabServiceTarget[];
  haBaseUrl?: string;
  haEntities?: HomeAssistantEntityTarget[];
  displayMode?: HomelabDisplayMode;
  showLatency?: boolean;
  refreshIntervalSec?: 30 | 60 | 120 | 300;
  transparentBg?: boolean;
  themeMode?: 'auto' | 'light' | 'dark';
}

export interface HomelabApiCheckRequest {
  services?: HomelabServiceTarget[];
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
}
