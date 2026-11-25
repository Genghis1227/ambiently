export type NowPlayingSource = 'home_assistant' | 'plex';
export type NowPlayingDisplayMode = 'auto' | 'card' | 'compact';

export interface NowPlayingWidgetConfig {
  source?: NowPlayingSource;
  haBaseUrl?: string;
  haEntityId?: string;
  allowControls?: boolean;
  requirePinForControls?: boolean;
  plexServerClientId?: string;
  plexServerName?: string;
  plexPlayerFilter?: string;
  displayMode?: NowPlayingDisplayMode;
  showProgress?: boolean;
  refreshIntervalSec?: 10 | 15 | 30 | 60;
  transparentBg?: boolean;
  themeMode?: 'auto' | 'light' | 'dark';
}

export interface NowPlayingTrackState {
  status: 'playing' | 'paused' | 'buffering' | 'idle';
  title: string;
  artistOrSubtitle?: string;
  albumOrSeries?: string;
  artworkUrl?: string;
  playerName?: string;
  userName?: string;
  mediaKind: 'music' | 'video' | 'unknown';
  durationSec?: number;
  positionSec?: number;
  positionSampledAtMs?: number;
  isMuted?: boolean;
  canControl: boolean;
  blockedByLanGate?: boolean;
  error?: string;
}
