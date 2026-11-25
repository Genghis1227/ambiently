import type { NowPlayingTrackState } from '../types/nowPlaying';
import {
  getPlexClientId,
  getPlexServers,
  getPlexToken,
  getBestPlexConnectionUri,
  type PlexServerResource,
} from './plex';
import { matchPlexServerFromList } from './photoSyncService';
import { fetchHomeAssistantMediaPlayer } from './homelab';

function isSafeRelativePlexThumb(thumb: unknown): thumb is string {
  if (typeof thumb !== 'string') return false;
  const trimmed = thumb.trim();
  return (
    trimmed.startsWith('/') &&
    !trimmed.startsWith('//') &&
    !/(^|\/)\.\.($|\/|\?)/.test(trimmed)
  );
}

/**
 * Normalizes a Plex `/status/sessions` JSON payload into the active media track state.
 * Prefers playing streams over paused ones and supports optional player/room name filtering.
 */
export function parsePlexSessionsPayload(
  payload: unknown,
  baseUri: string,
  serverToken: string,
  playerFilter?: string
): NowPlayingTrackState {
  const cleanUri = (baseUri || '').replace(/\/+$/, '');
  const container =
    payload && typeof payload === 'object'
      ? (payload as { MediaContainer?: { Metadata?: unknown[] } }).MediaContainer
      : undefined;
  const items = Array.isArray(container?.Metadata) ? container.Metadata : [];

  const filterNeedle = (playerFilter || '').trim().toLowerCase();
  const candidates = items.filter((raw): raw is Record<string, unknown> => {
    if (!raw || typeof raw !== 'object') return false;
    if (!filterNeedle) return true;
    const candidate = raw as Record<string, unknown>;
    const player = candidate.Player as { title?: unknown; product?: unknown } | undefined;
    const playerTitle = String(player?.title || player?.product || '').toLowerCase();
    return playerTitle.includes(filterNeedle);
  });

  if (candidates.length === 0) {
    return {
      status: 'idle',
      title: 'Nothing playing right now',
      mediaKind: 'unknown',
      canControl: false,
    };
  }

  const chosen =
    candidates.find((item) => {
      const player = item.Player as { state?: unknown } | undefined;
      return String(player?.state || '').toLowerCase() === 'playing';
    }) || candidates[0];

  const playerObj = chosen.Player as { state?: unknown; title?: unknown; product?: unknown } | undefined;
  const userObj = chosen.User as { title?: unknown } | undefined;
  const rawState = String(playerObj?.state || 'playing').trim().toLowerCase();
  const status: NowPlayingTrackState['status'] =
    rawState === 'paused'
      ? 'paused'
      : rawState === 'buffering'
        ? 'buffering'
        : rawState === 'idle' || rawState === 'stopped'
          ? 'idle'
          : 'playing';

  const typeStr = String(chosen.type || '').toLowerCase();
  const mediaKind: NowPlayingTrackState['mediaKind'] =
    typeStr === 'track' ? 'music' : typeStr === 'episode' || typeStr === 'movie' ? 'video' : 'unknown';

  const title =
    typeof chosen.title === 'string' && chosen.title.trim()
      ? chosen.title.trim()
      : 'Plex Session';

  const artistOrSubtitle =
    typeof chosen.grandparentTitle === 'string' && chosen.grandparentTitle.trim()
      ? chosen.grandparentTitle.trim()
      : typeof chosen.originalTitle === 'string' && chosen.originalTitle.trim()
        ? chosen.originalTitle.trim()
        : typeof chosen.year === 'number'
          ? String(chosen.year)
          : undefined;

  const albumOrSeries =
    typeof chosen.parentTitle === 'string' && chosen.parentTitle.trim()
      ? chosen.parentTitle.trim()
      : undefined;

  const thumbPath = isSafeRelativePlexThumb(chosen.thumb)
    ? chosen.thumb
    : isSafeRelativePlexThumb(chosen.parentThumb)
      ? chosen.parentThumb
      : isSafeRelativePlexThumb(chosen.grandparentThumb)
        ? chosen.grandparentThumb
        : undefined;

  const artworkUrl =
    thumbPath && cleanUri && serverToken
      ? `${cleanUri}${thumbPath}${thumbPath.includes('?') ? '&' : '?'}X-Plex-Token=${encodeURIComponent(serverToken)}`
      : undefined;

  const durationMs = Number(chosen.duration);
  const viewOffsetMs = Number(chosen.viewOffset);

  return {
    status,
    title,
    ...(artistOrSubtitle ? { artistOrSubtitle } : {}),
    ...(albumOrSeries ? { albumOrSeries } : {}),
    ...(artworkUrl ? { artworkUrl } : {}),
    playerName:
      typeof playerObj?.title === 'string' && playerObj.title.trim()
        ? playerObj.title.trim()
        : typeof playerObj?.product === 'string'
          ? playerObj.product.trim()
          : undefined,
    userName:
      typeof userObj?.title === 'string' && userObj.title.trim()
        ? userObj.title.trim()
        : undefined,
    mediaKind,
    ...(Number.isFinite(durationMs) && durationMs > 0 ? { durationSec: durationMs / 1000 } : {}),
    ...(Number.isFinite(viewOffsetMs) && viewOffsetMs >= 0
      ? { positionSec: viewOffsetMs / 1000, positionSampledAtMs: Date.now() }
      : {}),
    canControl: false,
  };
}

export async function fetchHaNowPlaying(params: {
  baseUrl: string;
  accessToken?: string;
  entityId: string;
  allowControls?: boolean;
  signal?: AbortSignal;
}): Promise<NowPlayingTrackState> {
  const res = await fetchHomeAssistantMediaPlayer(
    {
      baseUrl: params.baseUrl,
      accessToken: params.accessToken,
      entityId: params.entityId,
    },
    params.signal
  );

  if (!res.ok) {
    return {
      status: 'idle',
      title: res.blockedByLanGate ? 'LAN Mode Required' : 'Player Unavailable',
      mediaKind: 'unknown',
      canControl: false,
      blockedByLanGate: res.blockedByLanGate,
      error: res.error,
    };
  }

  const isActive = res.state === 'playing' || res.state === 'paused' || res.state === 'buffering';
  const sampledAtMs = res.positionUpdatedAt ? Date.parse(res.positionUpdatedAt) : Date.now();
  const safeSampledAt = Number.isFinite(sampledAtMs) ? sampledAtMs : Date.now();

  return {
    status:
      res.state === 'playing'
        ? 'playing'
        : res.state === 'paused'
          ? 'paused'
          : res.state === 'buffering'
            ? 'buffering'
            : 'idle',
    title: res.title || (isActive ? res.friendlyName || params.entityId : 'Nothing playing right now'),
    artistOrSubtitle: res.artist || (isActive ? undefined : res.friendlyName),
    albumOrSeries: res.album,
    artworkUrl: res.artworkDataUrl,
    playerName: res.friendlyName,
    mediaKind:
      res.mediaContentType === 'music'
        ? 'music'
        : res.mediaContentType === 'video' || res.mediaContentType === 'tvshow' || res.mediaContentType === 'movie'
          ? 'video'
          : 'unknown',
    durationSec: res.durationSec,
    positionSec: res.positionSec,
    positionSampledAtMs: safeSampledAt,
    isMuted: res.isMuted,
    canControl: Boolean(params.allowControls && params.accessToken && res.state !== 'unavailable'),
  };
}

export async function fetchPlexNowPlaying(params: {
  serverClientId?: string;
  serverName?: string;
  playerFilter?: string;
  signal?: AbortSignal;
}): Promise<NowPlayingTrackState> {
  const accountToken = await getPlexToken();
  if (!accountToken) {
    return {
      status: 'idle',
      title: 'Plex Not Connected',
      mediaKind: 'unknown',
      canControl: false,
      error: 'Pair your Plex account in Settings to view active sessions.',
    };
  }

  const servers = await getPlexServers(accountToken);
  const chosen: PlexServerResource | undefined = matchPlexServerFromList(
    servers,
    params.serverClientId || params.serverName
      ? {
          serverClientIdentifier: params.serverClientId,
          serverName: params.serverName,
          serverUri: '',
          sectionKey: '',
          scopeMode: 'timeline',
        }
      : undefined
  );

  if (!chosen) {
    return {
      status: 'idle',
      title: 'Plex Server Offline',
      mediaKind: 'unknown',
      canControl: false,
      error: 'Could not find a reachable Plex server for this account.',
    };
  }

  const uri = getBestPlexConnectionUri(chosen).replace(/\/+$/, '');
  const serverToken = chosen.accessToken || accountToken;
  if (!uri || !serverToken) {
    return {
      status: 'idle',
      title: 'Plex Server Unreachable',
      mediaKind: 'unknown',
      canControl: false,
      error: 'No direct Plex connection URL was available.',
    };
  }

  const res = await fetch(`${uri}/status/sessions`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'X-Plex-Token': serverToken,
      'X-Plex-Client-Identifier': getPlexClientId(),
      'X-Plex-Product': 'Ambiently Smart Display',
    },
    signal: params.signal,
  });

  if (!res.ok) {
    return {
      status: 'idle',
      title: `Plex Error (${res.status})`,
      mediaKind: 'unknown',
      canControl: false,
      error: `Plex returned HTTP ${res.status}`,
    };
  }

  const payload = await res.json();
  return parsePlexSessionsPayload(payload, uri, serverToken, params.playerFilter);
}
