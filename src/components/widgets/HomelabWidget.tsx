import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  DoorOpen,
  Droplets,
  Gauge,
  KeyRound,
  Lightbulb,
  RefreshCw,
  Server,
  Settings,
  Shield,
  Sun,
  Thermometer,
  WifiOff,
  Zap,
} from 'lucide-react';
import type {
  HomeAssistantEntityReading,
  HomelabApiCheckResponse,
  HomelabEntityIconHint,
  HomelabServiceState,
  HomelabServiceStatus,
  HomelabWidgetConfig,
} from '../../types/phase5Widgets';
import {
  normalizeHomelabBaseUrl,
  resolveHomeAssistantEntities,
  resolveHomelabServices,
} from '../../utils/homelabEngine';
import {
  HOMELAB_VAULT_UPDATED_EVENT,
  loadHomelabCredentialsFromVault,
  resolveBoundHomelabToken,
} from '../../utils/homelabVault';
import type { HomelabLocalVaultCredentials } from '../../types/phase5Widgets';
import {
  fetchHomelabStatus,
  readCachedHomelabStatus,
  writeCachedHomelabStatus,
} from '../../services/homelab';
import { useDisplayActivity } from '../../utils/displayActivity';
import { useIsCursorHidden } from '../../hooks/useIdleCursor';

interface HomelabWidgetProps {
  widgetId: string;
  title?: string;
  config?: HomelabWidgetConfig;
  isLight?: boolean;
  transparentBg?: boolean;
  onOpenSettings?: () => void;
}

const ENTITY_ICONS: Record<
  HomelabEntityIconHint,
  React.ComponentType<{ className?: string }>
> = {
  thermometer: Thermometer,
  door: DoorOpen,
  zap: Zap,
  droplets: Droplets,
  shield: Shield,
  sun: Sun,
  lightbulb: Lightbulb,
  gauge: Gauge,
};

function getServiceStatusBadge(state: HomelabServiceState, isLight: boolean): {
  label: string;
  dotClass: string;
  pillClass: string;
} {
  if (state === 'UP') {
    return {
      label: 'Up',
      dotClass: 'bg-emerald-400',
      pillClass: isLight
        ? 'bg-emerald-500/12 text-emerald-700 border-emerald-500/25'
        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    };
  }
  if (state === 'DEGRADED') {
    return {
      label: 'Slow',
      dotClass: 'bg-amber-400',
      pillClass: isLight
        ? 'bg-amber-500/15 text-amber-800 border-amber-500/30'
        : 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    };
  }
  return {
    label: 'Down',
    dotClass: 'bg-rose-400',
    pillClass: isLight
      ? 'bg-rose-500/12 text-rose-700 border-rose-500/25'
      : 'bg-rose-500/15 text-rose-300 border-rose-500/30',
  };
}

function getEntityToneClass(tone: HomeAssistantEntityReading['tone'], isLight: boolean): string {
  switch (tone) {
    case 'good':
      return isLight ? 'text-emerald-700' : 'text-emerald-300';
    case 'warn':
      return isLight ? 'text-amber-700' : 'text-amber-300';
    case 'alert':
      return isLight ? 'text-rose-700' : 'text-rose-300';
    default:
      return isLight ? 'text-slate-900' : 'text-white';
  }
}

export const HomelabWidget: React.FC<HomelabWidgetProps> = ({
  widgetId,
  title,
  config,
  isLight = false,
  transparentBg = false,
  onOpenSettings,
}) => {
  const isCursorHidden = useIsCursorHidden();
  const { shouldPauseAnimations } = useDisplayActivity();

  const services = useMemo(
    () => resolveHomelabServices(config?.services).filter((s) => s.enabled && s.url),
    [config?.services]
  );
  const haBaseUrl = useMemo(() => normalizeHomelabBaseUrl(config?.haBaseUrl), [config?.haBaseUrl]);
  const haEntities = useMemo(
    () => (haBaseUrl ? resolveHomeAssistantEntities(config?.haEntities).filter((e) => e.enabled) : []),
    [haBaseUrl, config?.haEntities]
  );

  const showLatency = config?.showLatency !== false;
  const refreshSec =
    config?.refreshIntervalSec === 30 ||
    config?.refreshIntervalSec === 120 ||
    config?.refreshIntervalSec === 300
      ? config.refreshIntervalSec
      : 60;

  const [vaultCreds, setVaultCreds] = useState<HomelabLocalVaultCredentials | null>(null);
  const [vaultReady, setVaultReady] = useState(false);
  const [statusData, setStatusData] = useState<HomelabApiCheckResponse | null>(() =>
    readCachedHomelabStatus(widgetId)
  );
  const [isUsingCache, setIsUsingCache] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [containerWidth, setContainerWidth] = useState(420);

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

  const { token: haToken, originMismatch } = useMemo(
    () => resolveBoundHomelabToken(vaultCreds, haBaseUrl),
    [vaultCreds, haBaseUrl]
  );

  // Load device-local Home Assistant token strictly from db.vault
  useEffect(() => {
    let active = true;
    const loadToken = () => {
      void loadHomelabCredentialsFromVault(widgetId)
        .then((creds) => {
          if (!active) return;
          setVaultCreds(creds);
          setVaultReady(true);
        })
        .catch(() => {
          if (!active) return;
          setVaultCreds(null);
          setVaultReady(true);
        });
    };

    loadToken();

    const handleVaultUpdate = (ev: Event) => {
      const detail = (ev as CustomEvent<{ widgetId?: string }>).detail;
      if (!detail || detail.widgetId === widgetId) {
        loadToken();
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener(HOMELAB_VAULT_UPDATED_EVENT, handleVaultUpdate);
    }
    return () => {
      active = false;
      if (typeof window !== 'undefined') {
        window.removeEventListener(HOMELAB_VAULT_UPDATED_EVENT, handleVaultUpdate);
      }
    };
  }, [widgetId]);

  const hasTargets = services.length > 0 || (Boolean(haBaseUrl) && haEntities.length > 0);

  const runProbe = useCallback(
    (signal?: AbortSignal) => {
      if (!hasTargets || !vaultReady) return;
      void fetchHomelabStatus(
        {
          services,
          ...(haBaseUrl && haEntities.length > 0
            ? {
                homeAssistant: {
                  baseUrl: haBaseUrl,
                  accessToken: haToken || undefined,
                  entities: haEntities,
                },
              }
            : {}),
        },
        signal
      )
        .then((res) => {
          setStatusData(res);
          setIsUsingCache(false);
          setIsRefreshing(false);
          writeCachedHomelabStatus(widgetId, res);
        })
        .catch(() => {
          if (signal?.aborted) return;
          const cached = readCachedHomelabStatus(widgetId);
          if (cached) {
            setStatusData(cached);
            setIsUsingCache(true);
          }
          setIsRefreshing(false);
        });
    },
    [hasTargets, vaultReady, services, haBaseUrl, haEntities, haToken, widgetId]
  );

  useEffect(() => {
    if (!hasTargets || !vaultReady || shouldPauseAnimations) return;
    const controller = new AbortController();
    runProbe(controller.signal);

    const intervalMs = Math.max(30, refreshSec) * 1000;
    const timer =
      typeof window !== 'undefined'
        ? window.setInterval(() => runProbe(controller.signal), intervalMs)
        : null;

    return () => {
      controller.abort();
      if (timer !== null && typeof window !== 'undefined') {
        window.clearInterval(timer);
      }
    };
  }, [hasTargets, vaultReady, shouldPauseAnimations, refreshSec, runProbe]);

  const serviceItems: HomelabServiceStatus[] = useMemo(() => {
    if (statusData?.services && statusData.services.length > 0) {
      return statusData.services;
    }
    return services.map((s) => ({
      id: s.id,
      name: s.name,
      preset: s.preset,
      state: 'DOWN',
      statusCode: null,
      latencyMs: null,
      detail: 'Checking...',
    }));
  }, [statusData, services]);

  const entityItems: HomeAssistantEntityReading[] = useMemo(() => {
    if (statusData?.entities && statusData.entities.length > 0) {
      return statusData.entities;
    }
    return haEntities.map((e) => ({
      id: e.id,
      entityId: e.entityId,
      label: e.label || e.entityId,
      state: 'unknown',
      formattedValue: '...',
      tone: 'neutral',
      iconHint: e.iconHint,
    }));
  }, [statusData, haEntities]);

  const lanBlockedDetected = useMemo(
    () =>
      Boolean(
        serviceItems.some((s) => s.blockedByLanGate) ||
          entityItems.some((e) => e.blockedByLanGate)
      ),
    [serviceItems, entityItems]
  );

  const upCount = useMemo(
    () => serviceItems.filter((s) => s.state === 'UP').length,
    [serviceItems]
  );

  const displayMode = config?.displayMode || 'auto';
  const showTwoColumns =
    displayMode === 'split' ||
    (displayMode === 'auto' &&
      containerWidth >= 430 &&
      services.length > 0 &&
      haEntities.length > 0);
  const isCompact = displayMode === 'compact';

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

  return (
    <div
      ref={rootRef}
      className={`w-full h-full flex flex-col justify-between gap-2.5 p-3.5 overflow-y-auto rounded-[inherit] ${rootToneClass}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Server className="w-4 h-4 text-cyan-400 shrink-0" />
          <span className="text-xs font-bold tracking-tight truncate">
            {title || 'Home Lab & Home Assistant'}
          </span>
        </div>

        <div
          data-no-drag="true"
          data-no-canvas-swipe="true"
          onPointerDown={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 shrink-0"
        >
          {isUsingCache && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold flex items-center gap-1 ${
                isLight ? 'bg-amber-500/15 text-amber-800' : 'bg-amber-500/15 text-amber-300'
              }`}
            >
              <WifiOff className="w-2.5 h-2.5" />
              Cached
            </span>
          )}

          {services.length > 0 && statusData && (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                upCount === serviceItems.length
                  ? isLight
                    ? 'bg-emerald-500/12 text-emerald-700 border-emerald-500/25'
                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  : isLight
                    ? 'bg-amber-500/12 text-amber-800 border-amber-500/25'
                    : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              }`}
            >
              {upCount}/{serviceItems.length} Up
            </span>
          )}

          {hasTargets && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsRefreshing(true);
                runProbe();
              }}
              title={isCursorHidden ? undefined : 'Refresh service & Home Assistant status'}
              className={`p-1 rounded-lg transition-colors cursor-pointer ${
                isLight ? 'hover:bg-slate-200 text-slate-600' : 'hover:bg-gray-800 text-gray-300'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Onboarding Empty State */}
      {!hasTargets ? (
        <div
          className={`flex-1 flex flex-col items-center justify-center text-center p-4 rounded-2xl ${cardSurfaceClass}`}
        >
          <Server className="w-7 h-7 text-cyan-400/80 mb-2" />
          <p className="text-xs font-semibold">Monitor Your Self-Hosted Stack</p>
          <p className={`text-[11px] mt-1 max-w-xs leading-relaxed ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
            Track local Docker/NAS services (Plex, Pi-hole, Immich, Uptime Kuma) and Home
            Assistant entities with device-local <code className="font-mono">db.vault</code> token
            isolation.
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
              className="mt-3 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Configure Services & HA</span>
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto pr-0.5">
          {/* Self-Hosted LAN Policy Notice */}
          {lanBlockedDetected && (
            <div className="px-2.5 py-2 rounded-xl border border-amber-500/35 bg-amber-500/12 text-amber-200 text-[10px] flex items-start gap-2 shrink-0">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span>
                Private LAN / <code className="font-mono">.local</code> probes require{' '}
                <code className="font-mono">AMBIENTLY_ALLOW_PRIVATE_FEEDS=true</code> on your
                self-hosted Docker or Raspberry Pi server (or use a public HTTPS reverse-proxy URL).
              </span>
            </div>
          )}

          {/* Missing Device-Local HA Token Notice */}
          {haBaseUrl && haEntities.length > 0 && vaultReady && !haToken && (
            <div
              className={`px-2.5 py-1.5 rounded-xl border text-[10px] flex items-center justify-between gap-2 shrink-0 ${
                originMismatch
                  ? isLight
                    ? 'border-amber-500/35 bg-amber-500/10 text-amber-800'
                    : 'border-amber-500/35 bg-amber-500/12 text-amber-200'
                  : isLight
                    ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-800'
                    : 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'
              }`}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <KeyRound className="w-3 h-3 shrink-0" />
                <span className="truncate">
                  {originMismatch ? (
                    'Home Assistant URL changed — re-save access token in Settings for this address.'
                  ) : (
                    <>
                      Add your Home Assistant token on this device (<code className="font-mono">db.vault</code>).
                    </>
                  )}
                </span>
              </span>
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
                  className="px-2 py-0.5 rounded-lg bg-cyan-600 text-white font-semibold shrink-0 cursor-pointer"
                >
                  Set Token
                </button>
              )}
            </div>
          )}

          {/* Services & HA Grid */}
          <div className={showTwoColumns ? 'grid grid-cols-2 gap-2.5' : 'space-y-2.5'}>
            {services.length > 0 && (
              <div className="space-y-1.5">
                <span className="block text-[10px] font-bold uppercase tracking-wider opacity-60">
                  Services
                </span>
                <div className={isCompact ? 'flex flex-wrap gap-1.5' : 'space-y-1.5'}>
                  {serviceItems.map((svc) => {
                    const meta = getServiceStatusBadge(svc.state, isLight);
                    if (isCompact) {
                      return (
                        <div
                          key={svc.id}
                          className={`px-2 py-1 rounded-xl flex items-center gap-1.5 text-[11px] font-medium ${cardSurfaceClass}`}
                        >
                          <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dotClass}`} />
                          <span className="truncate max-w-[110px]">{svc.name}</span>
                          {showLatency && svc.latencyMs !== null && (
                            <span className="text-[9px] font-mono opacity-65">
                              {svc.latencyMs}ms
                            </span>
                          )}
                        </div>
                      );
                    }
                    return (
                      <div
                        key={svc.id}
                        className={`px-2.5 py-2 rounded-xl flex items-center justify-between gap-2 ${cardSurfaceClass}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${meta.dotClass}`} />
                          <div className="min-w-0">
                            <div className="text-xs font-semibold truncate">{svc.name}</div>
                            {svc.detail && (
                              <div
                                className={`text-[10px] truncate ${
                                  isLight ? 'text-slate-500' : 'text-gray-400'
                                }`}
                              >
                                {svc.detail}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {showLatency && svc.latencyMs !== null && (
                            <span className="text-[10px] font-mono opacity-75">
                              {svc.latencyMs}ms
                            </span>
                          )}
                          <span
                            className={`px-1.5 py-0.5 rounded-md border text-[9px] font-bold uppercase tracking-wider ${meta.pillClass}`}
                          >
                            {meta.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {haBaseUrl && haEntities.length > 0 && (
              <div className="space-y-1.5">
                <span className="block text-[10px] font-bold uppercase tracking-wider opacity-60">
                  Home Assistant
                </span>
                <div className="grid grid-cols-2 gap-1.5">
                  {entityItems.map((ent) => {
                    const Icon = ENTITY_ICONS[ent.iconHint || 'gauge'];
                    const valueToneClass = getEntityToneClass(ent.tone, isLight);
                    return (
                      <div
                        key={ent.id}
                        title={
                          isCursorHidden
                            ? undefined
                            : ent.error || `${ent.entityId}: ${ent.formattedValue}`
                        }
                        className={`px-2.5 py-2 rounded-xl flex flex-col justify-between gap-1 ${cardSurfaceClass}`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={`text-[10px] font-medium truncate ${
                              isLight ? 'text-slate-600' : 'text-gray-400'
                            }`}
                          >
                            {ent.label}
                          </span>
                          <Icon className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        </div>
                        <div className={`text-sm font-bold tracking-tight truncate ${valueToneClass}`}>
                          {ent.formattedValue}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
