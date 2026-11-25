import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Disc3,
  Film,
  KeyRound,
  Lock,
  Music,
  Pause,
  Play,
  RefreshCw,
  Settings,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { NowPlayingTrackState, NowPlayingWidgetConfig } from '../../types/nowPlaying';
import type { HomelabLocalVaultCredentials } from '../../types/phase5Widgets';
import { normalizeHomelabBaseUrl } from '../../utils/homelabEngine';
import {
  HOMELAB_VAULT_UPDATED_EVENT,
  loadHomelabCredentialsWithSharedFallback,
  resolveBoundHomelabToken,
} from '../../utils/homelabVault';
import { callHomeAssistantService } from '../../services/homelab';
import { fetchHaNowPlaying, fetchPlexNowPlaying } from '../../services/nowPlaying';
import { usePlexServerTokens } from '../../hooks/usePlexServerTokens';
import { useDisplayActivity } from '../../utils/displayActivity';
import { useSharedClock } from '../../utils/sharedClock';
import { useDashboardStore } from '../../store/dashboardStore';
import { isSettingsPinRequired } from '../../utils/pinValidation';

interface NowPlayingWidgetProps {
  widgetId: string;
  title?: string;
  config?: NowPlayingWidgetConfig;
  isLight?: boolean;
  transparentBg?: boolean;
  onOpenSettings?: () => void;
  onAuthorizeAction?: (
    onAuthorized: () => void,
    prompt?: { title?: string; subtitle?: string }
  ) => void;
}

function formatDurationClock(totalSec?: number): string {
  if (typeof totalSec !== 'number' || !Number.isFinite(totalSec) || totalSec < 0) return '0:00';
  const rounded = Math.floor(totalSec);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const seconds = rounded % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export const NowPlayingWidget: React.FC<NowPlayingWidgetProps> = ({
  widgetId,
  title,
  config,
  isLight = false,
  transparentBg = false,
  onOpenSettings,
  onAuthorizeAction,
}) => {
  const { shouldPauseAnimations, isCanvasOccluded } = useDisplayActivity();
  const isPaused = shouldPauseAnimations || isCanvasOccluded;
  const isPinLockActive = useDashboardStore((s) => isSettingsPinRequired(s.settings));
  const plexTokenState = usePlexServerTokens();

  const source = config?.source === 'plex' ? 'plex' : 'home_assistant';
  const plexServerClientId = config?.plexServerClientId;
  const plexServerName = config?.plexServerName;
  const plexPlayerFilter = config?.plexPlayerFilter;
  const haBaseUrl = normalizeHomelabBaseUrl(config?.haBaseUrl);
  const haEntityId = (config?.haEntityId || '').trim().toLowerCase();
  const allowControls = config?.allowControls !== false;
  const requirePinForControls = Boolean(config?.requirePinForControls);
  const showProgress = config?.showProgress !== false;
  const refreshSec =
    config?.refreshIntervalSec === 10 ||
    config?.refreshIntervalSec === 30 ||
    config?.refreshIntervalSec === 60
      ? config.refreshIntervalSec
      : 15;

  const [vaultCreds, setVaultCreds] = useState<HomelabLocalVaultCredentials | null>(null);
  const [vaultLoaded, setVaultLoaded] = useState(false);
  const vaultReady = source !== 'home_assistant' || vaultLoaded;
  const [track, setTrack] = useState<NowPlayingTrackState | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSendingCommand, setIsSendingCommand] = useState(false);
  const [containerWidth, setContainerWidth] = useState(380);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width;
      if (width && Number.isFinite(width)) {
        setContainerWidth(Math.round(width));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { token: haToken, originMismatch } = resolveBoundHomelabToken(vaultCreds, haBaseUrl);

  useEffect(() => {
    if (source !== 'home_assistant') {
      return;
    }
    let active = true;
    const loadToken = () => {
      void loadHomelabCredentialsWithSharedFallback(widgetId, haBaseUrl)
        .then((creds) => {
          if (!active) return;
          setVaultCreds(creds);
          setVaultLoaded(true);
        })
        .catch(() => {
          if (!active) return;
          setVaultCreds(null);
          setVaultLoaded(true);
        });
    };
    loadToken();

    const onVaultChange = (ev: Event) => {
      const detail = (ev as CustomEvent<{ widgetId?: string }>).detail;
      if (!detail || detail.widgetId === widgetId || !detail.widgetId) {
        loadToken();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener(HOMELAB_VAULT_UPDATED_EVENT, onVaultChange);
    }
    return () => {
      active = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener(HOMELAB_VAULT_UPDATED_EVENT, onVaultChange);
      }
    };
  }, [source, widgetId, haBaseUrl]);

  const isConfigured =
    source === 'plex'
      ? Boolean(plexTokenState.ready)
      : Boolean(haBaseUrl && haEntityId.startsWith('media_player.'));

  const refreshTrack = (signal?: AbortSignal) => {
    if (!isConfigured || !vaultReady) return;
    const promise =
      source === 'plex'
        ? fetchPlexNowPlaying({
            serverClientId: plexServerClientId,
            serverName: plexServerName,
            playerFilter: plexPlayerFilter,
            signal,
          })
        : fetchHaNowPlaying({
            baseUrl: haBaseUrl,
            accessToken: haToken || undefined,
            entityId: haEntityId,
            allowControls,
            signal,
          });

    void promise
      .then((nextState) => {
        if (signal?.aborted) return;
        setTrack(nextState);
        setIsRefreshing(false);
      })
      .catch(() => {
        if (signal?.aborted) return;
        setIsRefreshing(false);
      });
  };

  useEffect(() => {
    if (!isConfigured || !vaultReady || isPaused) return;
    const controller = new AbortController();
    const poll = () => {
      const promise =
        source === 'plex'
          ? fetchPlexNowPlaying({
              serverClientId: plexServerClientId,
              serverName: plexServerName,
              playerFilter: plexPlayerFilter,
              signal: controller.signal,
            })
          : fetchHaNowPlaying({
              baseUrl: haBaseUrl,
              accessToken: haToken || undefined,
              entityId: haEntityId,
              allowControls,
              signal: controller.signal,
            });

      void promise
        .then((nextState) => {
          if (controller.signal.aborted) return;
          setTrack(nextState);
          setIsRefreshing(false);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          setIsRefreshing(false);
        });
    };

    poll();

    const timer =
      typeof window !== 'undefined'
        ? window.setInterval(poll, refreshSec * 1000)
        : null;
    return () => {
      controller.abort();
      if (timer !== null && typeof window !== 'undefined') {
        window.clearInterval(timer);
      }
    };
  }, [
    isConfigured,
    vaultReady,
    isPaused,
    refreshSec,
    source,
    plexServerClientId,
    plexServerName,
    plexPlayerFilter,
    haBaseUrl,
    haToken,
    haEntityId,
    allowControls,
  ]);

  const clockNow = useSharedClock(
    'second',
    Boolean(track && track.status === 'playing' && showProgress && !isPaused)
  );

  const livePositionSec = (() => {
    if (!track || typeof track.positionSec !== 'number') return undefined;
    if (track.status !== 'playing' || !track.positionSampledAtMs) {
      return track.positionSec;
    }
    const elapsed = Math.max(0, (clockNow.getTime() - track.positionSampledAtMs) / 1000);
    const total = track.positionSec + elapsed;
    return track.durationSec ? Math.min(track.durationSec, total) : total;
  })();

  const executeTransport = (action: string, serviceData?: { is_volume_muted?: boolean }) => {
    if (source !== 'home_assistant' || !haBaseUrl || !haToken || !haEntityId) return;
    setIsSendingCommand(true);
    void callHomeAssistantService({
      baseUrl: haBaseUrl,
      accessToken: haToken,
      entityId: haEntityId,
      action,
      ...(serviceData ? { serviceData } : {}),
    })
      .then(() => {
        refreshTrack();
      })
      .finally(() => {
        setIsSendingCommand(false);
      });
  };

  const handleTransportClick = (action: string, serviceData?: { is_volume_muted?: boolean }) => {
    if (requirePinForControls && isPinLockActive) {
      if (!onAuthorizeAction) return;
      onAuthorizeAction(
        () => {
          executeTransport(action, serviceData);
          useDashboardStore.getState().lockKiosk();
        },
        {
          title: 'Confirm Media Control',
          subtitle: 'Enter parent PIN to control media playback',
        }
      );
      return;
    }
    executeTransport(action, serviceData);
  };

  const displayMode = config?.displayMode || 'auto';
  const isCompact = displayMode === 'compact' || (displayMode === 'auto' && containerWidth < 300);
  const isHorizontal = !isCompact && (displayMode === 'auto' ? containerWidth >= 340 : true);

  const rootToneClass = transparentBg
    ? `bg-transparent ${isLight ? 'text-slate-900' : 'text-white'}`
    : isLight
      ? 'bg-white/95 text-slate-900 border border-slate-200/80 shadow-sm'
      : 'bg-gray-900/90 text-white border border-gray-800/90';

  const cardSurfaceClass = isLight
    ? transparentBg
      ? 'bg-slate-900/5 border border-slate-900/10'
      : 'bg-slate-100/85 border border-slate-200/80'
    : transparentBg
      ? 'bg-white/8 border border-white/12'
      : 'bg-gray-950/60 border border-gray-800/80';

  const progressPct =
    typeof livePositionSec === 'number' &&
    typeof track?.durationSec === 'number' &&
    track.durationSec > 0
      ? Math.min(100, Math.max(0, (livePositionSec / track.durationSec) * 100))
      : 0;

  return (
    <div
      ref={rootRef}
      className={`w-full h-full flex flex-col justify-between gap-2.5 p-3.5 overflow-hidden rounded-[inherit] ${rootToneClass}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Disc3
            className={`w-4 h-4 text-emerald-400 shrink-0 ${
              track?.status === 'playing' && !isPaused ? 'animate-spin' : ''
            }`}
            style={{ animationDuration: '6s' }}
          />
          <span className="text-xs font-bold tracking-tight truncate">
            {title || 'Now Playing'}
          </span>
        </div>

        <div
          data-no-drag="true"
          data-no-canvas-swipe="true"
          onPointerDown={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 shrink-0"
        >
          {track?.playerName && (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold truncate max-w-[120px] ${
                isLight ? 'bg-slate-200/80 text-slate-700' : 'bg-white/10 text-gray-300'
              }`}
            >
              {track.playerName}
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsRefreshing(true);
              refreshTrack();
            }}
            title="Refresh playback status"
            className={`p-1 rounded-lg cursor-pointer ${
              isLight ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-gray-800 text-gray-300'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Onboarding / Unconfigured */}
      {source === 'home_assistant' && (!haBaseUrl || !haEntityId.startsWith('media_player.')) ? (
        <div
          className={`flex-1 flex flex-col items-center justify-center text-center p-4 rounded-2xl ${cardSurfaceClass}`}
        >
          <Music className="w-7 h-7 text-emerald-400/80 mb-2" />
          <p className="text-xs font-semibold">Connect Media Player or Plex</p>
          <p className={`text-[11px] mt-1 max-w-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
            Choose a Home Assistant <code className="font-mono">media_player.*</code> entity or
            switch source to live Plex active sessions.
          </p>
          {onOpenSettings && (
            <button
              type="button"
              data-no-drag="true"
              data-no-canvas-swipe="true"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onOpenSettings();
              }}
              className="mt-3 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Configure Now Playing</span>
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col justify-between gap-2.5">
          {source === 'home_assistant' && vaultReady && !haToken && (
            <div className="px-2.5 py-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 text-cyan-200 text-[10px] flex items-center gap-1.5 shrink-0">
              <KeyRound className="w-3 h-3 shrink-0" />
              <span className="truncate">
                {originMismatch
                  ? 'Home Assistant URL changed — re-save token in Settings.'
                  : 'Add Home Assistant token in Settings for playback & artwork.'}
              </span>
            </div>
          )}

          {track?.blockedByLanGate && (
            <div className="px-2.5 py-1.5 rounded-xl border border-amber-500/35 bg-amber-500/12 text-amber-200 text-[10px] flex items-center gap-1.5 shrink-0">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>
                Requires <code className="font-mono">AMBIENTLY_ALLOW_PRIVATE_FEEDS=true</code> for
                LAN Home Assistant players.
              </span>
            </div>
          )}

          {/* Main Track Body */}
          <div
            className={`flex-1 min-h-0 flex items-center gap-3 ${
              isHorizontal ? 'flex-row' : 'flex-col justify-center text-center'
            }`}
          >
            {/* Artwork */}
            <div
              className={`rounded-2xl overflow-hidden shrink-0 flex items-center justify-center relative ${cardSurfaceClass} ${
                isCompact
                  ? 'w-14 h-14'
                  : isHorizontal
                    ? 'w-24 h-24 sm:w-28 sm:h-28'
                    : 'w-28 h-28'
              }`}
            >
              {track?.artworkUrl ? (
                <img
                  src={track.artworkUrl}
                  alt={track.title}
                  className="w-full h-full object-cover"
                />
              ) : track?.mediaKind === 'video' ? (
                <Film className="w-8 h-8 text-emerald-400/75" />
              ) : (
                <Music className="w-8 h-8 text-emerald-400/75" />
              )}
            </div>

            {/* Track Info & Progress */}
            <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
              <div className="flex items-center gap-1.5">
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${
                    track?.status === 'playing'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35'
                      : track?.status === 'paused'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/35'
                        : isLight
                          ? 'bg-slate-200 text-slate-600'
                          : 'bg-white/10 text-gray-400'
                  }`}
                >
                  {track?.status === 'playing'
                    ? 'Playing'
                    : track?.status === 'paused'
                      ? 'Paused'
                      : track?.status === 'buffering'
                        ? 'Buffering'
                        : 'Idle'}
                </span>
                {track?.userName && (
                  <span className={`text-[10px] truncate ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                    {track.userName}
                  </span>
                )}
              </div>

              <div className="text-sm sm:text-base font-bold tracking-tight truncate">
                {track?.title || 'Checking playback...'}
              </div>
              {track?.artistOrSubtitle && (
                <div
                  className={`text-xs truncate ${
                    isLight ? 'text-slate-600' : 'text-gray-300'
                  }`}
                >
                  {track.artistOrSubtitle}
                  {track.albumOrSeries ? ` • ${track.albumOrSeries}` : ''}
                </div>
              )}

              {showProgress && typeof track?.durationSec === 'number' && track.durationSec > 0 && (
                <div className="pt-1 space-y-1">
                  <div
                    className={`w-full h-1.5 rounded-full overflow-hidden ${
                      isLight ? 'bg-slate-200' : 'bg-white/10'
                    }`}
                  >
                    <div
                      className="h-full bg-emerald-400 transition-[width] duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-mono opacity-70">
                    <span>{formatDurationClock(livePositionSec)}</span>
                    <span>{formatDurationClock(track.durationSec)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Playback Controls (Home Assistant media_player) */}
          {track?.canControl && (
            <div
              data-no-drag="true"
              data-no-canvas-swipe="true"
              onPointerDown={(e) => e.stopPropagation()}
              className="flex items-center justify-between gap-2 pt-1 border-t border-white/10 shrink-0"
            >
              <div className="flex items-center gap-1.5">
                {requirePinForControls && isPinLockActive && (
                  <Lock className="w-3 h-3 text-amber-300" />
                )}
                <button
                  type="button"
                  disabled={isSendingCommand}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTransportClick('volume_mute', {
                      is_volume_muted: !track.isMuted,
                    });
                  }}
                  title={track.isMuted ? 'Unmute' : 'Mute'}
                  className={`p-1.5 rounded-xl cursor-pointer disabled:opacity-50 ${
                    isLight ? 'hover:bg-slate-200 text-slate-700' : 'hover:bg-white/10 text-gray-300'
                  }`}
                >
                  {track.isMuted ? (
                    <VolumeX className="w-4 h-4 text-rose-400" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={isSendingCommand}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTransportClick('media_previous_track');
                  }}
                  title="Previous track"
                  className={`p-1.5 rounded-xl cursor-pointer disabled:opacity-50 ${
                    isLight ? 'hover:bg-slate-200 text-slate-700' : 'hover:bg-white/10 text-gray-200'
                  }`}
                >
                  <SkipBack className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={isSendingCommand}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTransportClick('media_play_pause');
                  }}
                  title={track.status === 'playing' ? 'Pause' : 'Play'}
                  className="p-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white shadow cursor-pointer disabled:opacity-50"
                >
                  {track.status === 'playing' ? (
                    <Pause className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                </button>
                <button
                  type="button"
                  disabled={isSendingCommand}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleTransportClick('media_next_track');
                  }}
                  title="Next track"
                  className={`p-1.5 rounded-xl cursor-pointer disabled:opacity-50 ${
                    isLight ? 'hover:bg-slate-200 text-slate-700' : 'hover:bg-white/10 text-gray-200'
                  }`}
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
