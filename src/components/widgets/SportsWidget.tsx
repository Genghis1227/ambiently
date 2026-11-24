import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Star,
  Trophy,
  Tv,
  WifiOff,
} from 'lucide-react';
import {
  SPORTS_LEAGUE_META,
  type SportsDisplayMode,
  type SportsFollowedTeam,
  type SportsGame,
  type SportsGameState,
  type SportsLeagueId,
  type SportsTeamSummary,
  type SportsWidgetConfig,
} from '../../types/phase3Widgets';
import {
  fetchSportsScoreboard,
  getCachedSportsGames,
  isFollowedTeamInGame,
  resolveFollowedTeams,
  resolveSportsLayoutMode,
  resolveSportsLeagues,
  sortAndFilterGamesForWidget,
} from '../../services/sports';
import { useDashboardStore } from '../../store/dashboardStore';
import { isAmbientlyInNightMode } from '../../utils/confetti';
import { useDisplayActivity } from '../../utils/displayActivity';

interface SportsWidgetProps {
  title?: string;
  config?: SportsWidgetConfig;
  isLight?: boolean;
  transparentBg?: boolean;
  onUpdateConfig?: (updates: Record<string, any>) => void;
}

function formatGameTimeLabel(game: SportsGame): string {
  if (game.state === 'LIVE') {
    if (game.shortDetail && game.shortDetail !== 'LIVE') return game.shortDetail;
    const parts = [game.displayClock, game.period ? `P${game.period}` : ''].filter(Boolean);
    return parts.join(' • ') || 'LIVE';
  }
  if (game.state === 'FINAL') return game.shortDetail || 'Final';
  if (game.state === 'POSTPONED') return game.shortDetail || 'Postponed';
  if (game.startTime) {
    const parsed = new Date(game.startTime);
    if (!Number.isNaN(parsed.getTime())) {
      const now = new Date();
      const sameDay =
        parsed.getFullYear() === now.getFullYear() &&
        parsed.getMonth() === now.getMonth() &&
        parsed.getDate() === now.getDate();
      const timeStr = parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      if (sameDay) return timeStr;
      const dayStr = parsed.toLocaleDateString([], { weekday: 'short' });
      return `${dayStr} ${timeStr}`;
    }
  }
  return game.shortDetail || 'Scheduled';
}

function getGameBadgeMeta(
  state: SportsGameState,
  isLight: boolean,
  isNightMode: boolean
): { label: string; dotClass: string; badgeClass: string } {
  if (state === 'LIVE') {
    return {
      label: 'LIVE',
      dotClass: isNightMode ? 'bg-emerald-400/70' : 'bg-emerald-400 animate-pulse',
      badgeClass: isLight
        ? 'bg-emerald-600/12 text-emerald-800 border-emerald-600/25'
        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    };
  }
  if (state === 'FINAL') {
    return {
      label: 'FINAL',
      dotClass: isLight ? 'bg-slate-400' : 'bg-slate-500',
      badgeClass: isLight
        ? 'bg-slate-500/10 text-slate-600 border-slate-400/25'
        : 'bg-slate-700/35 text-slate-300 border-slate-600/35',
    };
  }
  if (state === 'POSTPONED') {
    return {
      label: 'PPD',
      dotClass: 'bg-amber-400',
      badgeClass: isLight
        ? 'bg-amber-600/12 text-amber-800 border-amber-500/30'
        : 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    };
  }
  return {
    label: 'SCHED',
    dotClass: isLight ? 'bg-sky-500' : 'bg-sky-400',
    badgeClass: isLight
      ? 'bg-sky-600/10 text-sky-800 border-sky-500/25'
      : 'bg-sky-500/12 text-sky-300 border-sky-500/25',
  };
}

const TeamCrest: React.FC<{
  team: SportsTeamSummary;
  sizeClass?: string;
}> = ({ team, sizeClass = 'w-6 h-6' }) => {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(team.logoUrl && team.logoUrl !== failedUrl);

  if (showImage) {
    return (
      <img
        src={team.logoUrl}
        alt={team.abbreviation}
        loading="lazy"
        decoding="async"
        onError={() => setFailedUrl(team.logoUrl || null)}
        className={`${sizeClass} object-contain shrink-0`}
      />
    );
  }

  return (
    <span
      className={`${sizeClass} rounded-full flex items-center justify-center text-[9px] font-black text-white shrink-0 border border-white/15`}
      style={{ backgroundColor: team.color || '#334155' }}
    >
      {team.abbreviation.slice(0, 3)}
    </span>
  );
};

export const SportsWidget: React.FC<SportsWidgetProps> = ({
  title,
  config,
  isLight = false,
  transparentBg = false,
}) => {
  const nightModeSetting = useDashboardStore((state) => Boolean(state.settings?.nightModeEnabled));
  const { isNightMode: activityNightMode, shouldPauseAnimations } = useDisplayActivity();
  const isNightMode = activityNightMode || nightModeSetting || isAmbientlyInNightMode();
  const shouldPauseRef = useRef(shouldPauseAnimations);
  useEffect(() => {
    shouldPauseRef.current = shouldPauseAnimations;
  }, [shouldPauseAnimations]);
  const wasPausedRef = useRef(false);
  const lastFetchAtRef = useRef(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const tickerMeasureRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [tickerShouldScroll, setTickerShouldScroll] = useState(false);

  const leagues = useMemo(() => resolveSportsLeagues(config?.leagues), [config?.leagues]);
  const leaguesKey = leagues.join(',');
  const followedTeams: SportsFollowedTeam[] = useMemo(
    () => resolveFollowedTeams(config?.followedTeams),
    [config?.followedTeams]
  );

  const configuredMode: SportsDisplayMode =
    config?.displayMode === 'single' ||
    config?.displayMode === 'grid' ||
    config?.displayMode === 'ticker'
      ? config.displayMode
      : 'auto';
  const showRecords = config?.showRecords !== false;
  const showBroadcast = config?.showBroadcast !== false;
  const refreshIntervalMin: 1 | 2 | 5 | 15 =
    config?.refreshIntervalMin === 1 ||
    config?.refreshIntervalMin === 2 ||
    config?.refreshIntervalMin === 15
      ? config.refreshIntervalMin
      : 5;

  const [activeLeagueFilter, setActiveLeagueFilter] = useState<'all' | SportsLeagueId>('all');
  const [prevLeaguesKey, setPrevLeaguesKey] = useState(leaguesKey);
  if (leaguesKey !== prevLeaguesKey) {
    setPrevLeaguesKey(leaguesKey);
    if (activeLeagueFilter !== 'all' && !leagues.includes(activeLeagueFilter)) {
      setActiveLeagueFilter('all');
    }
  }

  const [singleIndex, setSingleIndex] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchResult, setFetchResult] = useState<{
    key: string;
    games: SportsGame[];
    isStaleCache: boolean;
    error: string | null;
  }>({
    key: '',
    games: [],
    isStaleCache: false,
    error: null,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setContainerSize((prev) =>
        prev.width === w && prev.height === h ? prev : { width: w, height: h }
      );
      if (tickerMeasureRef.current && w > 0) {
        const overflow = tickerMeasureRef.current.scrollWidth > w - 16;
        setTickerShouldScroll((prev) => (prev === overflow ? prev : overflow));
      }
    };

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const w = Math.round(entry.contentRect.width);
          const h = Math.round(entry.contentRect.height);
          setContainerSize((prev) =>
            prev.width === w && prev.height === h ? prev : { width: w, height: h }
          );
        }
        if (tickerMeasureRef.current && el.clientWidth > 0) {
          const overflow = tickerMeasureRef.current.scrollWidth > el.clientWidth - 16;
          setTickerShouldScroll((prev) => (prev === overflow ? prev : overflow));
        }
      });
      ro.observe(el);
      return () => ro.disconnect();
    }

    const frame = window.requestAnimationFrame(measure);
    return () => window.cancelAnimationFrame(frame);
  }, [leaguesKey, configuredMode, activeLeagueFilter]);

  useEffect(() => {
    const leagueList = leaguesKey
      .split(',')
      .filter((x): x is SportsLeagueId => Object.prototype.hasOwnProperty.call(SPORTS_LEAGUE_META, x));
    if (leagueList.length === 0) return;

    let active = true;
    let activeController: AbortController | null = null;

    const runFetch = async () => {
      lastFetchAtRef.current = Date.now();
      if (activeController) activeController.abort();
      const controller = new AbortController();
      activeController = controller;
      try {
        const res = await fetchSportsScoreboard(leagueList, controller.signal);
        if (!active) return;
        setFetchResult({
          key: leaguesKey,
          games: res.games,
          isStaleCache: res.isStaleCache,
          error: null,
        });
      } catch (err: any) {
        if (!active || err?.name === 'AbortError') return;
        setFetchResult((prev) => ({
          key: leaguesKey,
          games: prev.key === leaguesKey ? prev.games : [],
          isStaleCache: true,
          error: err?.message || 'Unable to load sports scores',
        }));
      } finally {
        if (active) setIsRefreshing(false);
      }
    };

    void runFetch();

    const intervalMs = refreshIntervalMin * 60_000;
    const interval = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (shouldPauseRef.current) return;
      void runFetch();
    }, intervalMs);

    const handleVisibility = () => {
      if (
        document.visibilityState === 'visible' &&
        !shouldPauseRef.current &&
        Date.now() - lastFetchAtRef.current >= intervalMs
      ) {
        void runFetch();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      active = false;
      activeController?.abort();
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [leaguesKey, refreshTick, refreshIntervalMin]);

  useEffect(() => {
    const intervalMs = refreshIntervalMin * 60_000;
    if (
      wasPausedRef.current &&
      !shouldPauseAnimations &&
      Date.now() - lastFetchAtRef.current >= intervalMs
    ) {
      setRefreshTick((t) => t + 1);
    }
    wasPausedRef.current = shouldPauseAnimations;
  }, [shouldPauseAnimations, refreshIntervalMin]);

  const rawGames = useMemo(() => {
    if (fetchResult.key === leaguesKey && fetchResult.games.length > 0) {
      return fetchResult.games;
    }
    return getCachedSportsGames(leagues);
  }, [fetchResult, leaguesKey, leagues]);

  const visibleGames = useMemo(() => {
    const ordered = sortAndFilterGamesForWidget(rawGames, config);
    if (activeLeagueFilter === 'all') return ordered;
    return ordered.filter((g) => g.league === activeLeagueFilter);
  }, [rawGames, config, activeLeagueFilter]);

  const effectiveMode = resolveSportsLayoutMode(
    configuredMode,
    containerSize.width,
    containerSize.height,
    visibleGames.length
  );

  // Re-measure horizontal ticker overflow after cold data loads or filters change
  useEffect(() => {
    const containerEl = containerRef.current;
    const measureEl = tickerMeasureRef.current;
    if (!containerEl || !measureEl) return;

    const checkOverflow = () => {
      if (containerEl.clientWidth <= 0) return;
      const overflow = measureEl.scrollWidth > containerEl.clientWidth - 16;
      setTickerShouldScroll((prev) => (prev === overflow ? prev : overflow));
    };

    const frame = window.requestAnimationFrame(checkOverflow);
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(checkOverflow);
      ro.observe(measureEl);
      return () => {
        window.cancelAnimationFrame(frame);
        ro.disconnect();
      };
    }
    return () => window.cancelAnimationFrame(frame);
  }, [effectiveMode, visibleGames.length, isRefreshing]);

  const hasLiveGame = useMemo(
    () => visibleGames.some((g) => g.state === 'LIVE'),
    [visibleGames]
  );

  const fetchError =
    fetchResult.key === leaguesKey && rawGames.length === 0 ? fetchResult.error : null;
  const isStaleCache = fetchResult.key === leaguesKey && fetchResult.isStaleCache;

  const gridColsClass =
    containerSize.width >= 640
      ? 'grid-cols-3'
      : containerSize.width >= 390
        ? 'grid-cols-2'
        : 'grid-cols-1';

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    setRefreshTick((t) => t + 1);
  };

  const safeSingleIdx =
    visibleGames.length > 0 ? ((singleIndex % visibleGames.length) + visibleGames.length) % visibleGames.length : 0;
  const featuredGame = visibleGames[safeSingleIdx];

  const stickerShadow = transparentBg && !isLight ? 'drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]' : '';
  const headingText = title || 'Live Sports';

  return (
    <div
      ref={containerRef}
      className={`w-full h-full flex flex-col overflow-hidden select-none ${
        transparentBg ? stickerShadow : ''
      }`}
    >
      {/* Compact Header (hidden in Ticker Ribbon mode) */}
      {effectiveMode !== 'ticker' && (
        <div className="flex items-center justify-between gap-2 mb-2 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <Trophy
              className={`w-3.5 h-3.5 shrink-0 ${
                isLight ? 'text-amber-600' : 'text-amber-400'
              }`}
            />
            <span
              className={`text-xs font-bold tracking-tight truncate ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}
            >
              {headingText}
            </span>
            {hasLiveGame && (
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-bold shrink-0 ${
                  isLight
                    ? 'bg-emerald-600/12 text-emerald-800 border-emerald-600/25'
                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isNightMode ? 'bg-emerald-400/70' : 'bg-emerald-400 animate-pulse'
                  }`}
                />
                LIVE
              </span>
            )}
            {isStaleCache && (
              <span
                className={`px-1.5 py-0.5 rounded-full border text-[10px] font-semibold shrink-0 ${
                  isLight
                    ? 'bg-amber-500/12 text-amber-800 border-amber-500/25'
                    : 'bg-amber-500/12 text-amber-200 border-amber-500/25'
                }`}
              >
                Cached
              </span>
            )}
          </div>

          <div
            className="flex items-center gap-1 shrink-0"
            data-no-drag="true"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {leagues.length > 1 && (
              <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar max-w-[180px]">
                <button
                  type="button"
                  onClick={() => setActiveLeagueFilter('all')}
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold transition-colors cursor-pointer ${
                    activeLeagueFilter === 'all'
                      ? isLight
                        ? 'bg-slate-800 text-white'
                        : 'bg-white/15 text-white'
                      : isLight
                        ? 'text-slate-500 hover:text-slate-900'
                        : 'text-gray-400 hover:text-white'
                  }`}
                >
                  All
                </button>
                {leagues.map((lg) => (
                  <button
                    key={lg}
                    type="button"
                    onClick={() => setActiveLeagueFilter(lg)}
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold transition-colors cursor-pointer ${
                      activeLeagueFilter === lg
                        ? isLight
                          ? 'bg-slate-800 text-white'
                          : 'bg-white/15 text-white'
                        : isLight
                          ? 'text-slate-500 hover:text-slate-900'
                          : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    {SPORTS_LEAGUE_META[lg].shortLabel}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={handleManualRefresh}
              title="Refresh scores"
              className={`p-1 rounded-lg border transition-colors cursor-pointer ${
                transparentBg
                  ? isLight
                    ? 'border-transparent hover:bg-slate-200/50 text-slate-600'
                    : 'border-transparent hover:bg-white/10 text-gray-300'
                  : isLight
                    ? 'bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900'
                    : 'bg-gray-900/70 border-gray-800 text-gray-400 hover:text-gray-100'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      )}

      {/* Body */}
      {fetchError && visibleGames.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4 gap-2">
          <WifiOff className={`w-5 h-5 ${isLight ? 'text-slate-400' : 'text-gray-500'}`} />
          <p className={`text-xs font-medium ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
            Scoreboard temporarily unavailable
          </p>
          <button
            type="button"
            data-no-drag="true"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleManualRefresh}
            className="px-3 py-1 rounded-lg bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/35 text-sky-300 text-xs font-semibold cursor-pointer"
          >
            Try Again
          </button>
        </div>
      ) : visibleGames.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4 gap-1.5">
          <Trophy className={`w-5 h-5 ${isLight ? 'text-slate-400' : 'text-gray-500'}`} />
          <p className={`text-xs font-semibold ${isLight ? 'text-slate-700' : 'text-gray-200'}`}>
            No games scheduled right now
          </p>
          <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
            Check back closer to kickoff or tip-off, or add another league in settings.
          </p>
        </div>
      ) : effectiveMode === 'ticker' ? (
        /* TICKER RIBBON MODE */
        <div className="flex-1 flex items-center overflow-hidden relative min-h-0">
          <div
            ref={tickerMeasureRef}
            aria-hidden="true"
            className="flex items-center gap-3 absolute opacity-0 pointer-events-none whitespace-nowrap"
          >
            {visibleGames.map((game) => (
              <div key={game.id} className="flex items-center gap-2 px-2.5 py-1">
                <span className="text-[10px] font-bold">{game.leagueLabel}</span>
                <span className="text-xs font-bold">
                  {game.awayTeam.abbreviation} {game.awayTeam.score ?? '-'} @{' '}
                  {game.homeTeam.abbreviation} {game.homeTeam.score ?? '-'}
                </span>
                <span className="text-[11px]">{formatGameTimeLabel(game)}</span>
              </div>
            ))}
          </div>

          <div
            className={
              tickerShouldScroll
                ? `ambiently-ticker-track hover:[animation-play-state:paused]${shouldPauseAnimations ? ' ambiently-ticker-paused' : ''}`
                : 'flex items-center gap-2.5 overflow-x-auto no-scrollbar w-full'
            }
            style={
              tickerShouldScroll
                ? ({
                    '--ticker-duration': `${Math.max(18, visibleGames.length * 6)}s`,
                    animationPlayState: shouldPauseAnimations ? 'paused' : undefined,
                  } as React.CSSProperties)
                : undefined
            }
          >
            {(tickerShouldScroll ? [0, 1] : [0]).map((pass) => (
              <div key={pass} className="flex items-center gap-2.5 pr-2.5 shrink-0">
                {visibleGames.map((game) => {
                  const isLive = game.state === 'LIVE';
                  return (
                    <div
                      key={`${pass}-${game.id}`}
                      className={`flex items-center gap-2 px-2.5 py-1 rounded-xl border shrink-0 ${
                        transparentBg
                          ? 'border-transparent bg-transparent'
                          : isLight
                            ? 'bg-slate-50/90 border-slate-200/80'
                            : 'bg-gray-900/60 border-gray-800/80'
                      }`}
                    >
                      <span
                        className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          isLight ? 'bg-slate-200/80 text-slate-700' : 'bg-white/10 text-gray-300'
                        }`}
                      >
                        {game.leagueLabel}
                      </span>
                      <div className="flex items-center gap-1.5 text-xs font-bold tabular-nums">
                        <span className={isLight ? 'text-slate-900' : 'text-white'}>
                          {game.awayTeam.abbreviation}
                        </span>
                        {game.awayTeam.score !== null && (
                          <span className={isLight ? 'text-slate-800' : 'text-gray-200'}>
                            {game.awayTeam.score}
                          </span>
                        )}
                        <span className="text-gray-500 text-[10px]">@</span>
                        <span className={isLight ? 'text-slate-900' : 'text-white'}>
                          {game.homeTeam.abbreviation}
                        </span>
                        {game.homeTeam.score !== null && (
                          <span className={isLight ? 'text-slate-800' : 'text-gray-200'}>
                            {game.homeTeam.score}
                          </span>
                        )}
                      </div>
                      <span
                        className={`text-[10px] font-semibold ${
                          isLive
                            ? isLight
                              ? 'text-emerald-700'
                              : 'text-emerald-300'
                            : isLight
                              ? 'text-slate-500'
                              : 'text-gray-400'
                        }`}
                      >
                        {formatGameTimeLabel(game)}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : effectiveMode === 'single' && featuredGame ? (
        /* SINGLE FEATURED TEAM CARD */
        <div
          className={`flex-1 min-h-0 flex flex-col justify-between rounded-2xl p-3 border ${
            transparentBg
              ? 'border-transparent bg-transparent'
              : isLight
                ? 'bg-slate-50/90 border-slate-200/80'
                : 'bg-gray-900/55 border-gray-800/85'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span
                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                  isLight ? 'bg-slate-200/80 text-slate-700' : 'bg-white/10 text-gray-300'
                }`}
              >
                {featuredGame.leagueLabel}
              </span>
              {(() => {
                const badge = getGameBadgeMeta(featuredGame.state, isLight, isNightMode);
                return (
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] font-bold ${badge.badgeClass}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${badge.dotClass}`} />
                    {formatGameTimeLabel(featuredGame)}
                  </span>
                );
              })()}
            </div>

            {showBroadcast && featuredGame.broadcast && (
              <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                <Tv className="w-3 h-3" />
                {featuredGame.broadcast}
              </span>
            )}
          </div>

          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 my-2">
            {[featuredGame.awayTeam, featuredGame.homeTeam].map((team, tIdx) => (
              <React.Fragment key={`${featuredGame.id}-${team.id}-${tIdx}`}>
                {tIdx === 1 && (
                  <div className="flex flex-col items-center px-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">
                      @
                    </span>
                  </div>
                )}
                <div className="flex flex-col items-center text-center gap-1 min-w-0">
                  <TeamCrest team={team} sizeClass="w-9 h-9" />
                  <div className="min-w-0 w-full">
                    <div
                      className={`text-xs font-extrabold truncate ${
                        isLight ? 'text-slate-900' : 'text-white'
                      }`}
                    >
                      {team.shortDisplayName}
                    </div>
                    {showRecords && team.record && (
                      <div className="text-[10px] text-gray-400 tabular-nums">{team.record}</div>
                    )}
                  </div>
                  {team.score !== null && (
                    <div
                      className={`text-2xl font-black tabular-nums leading-none ${
                        team.isWinner
                          ? isLight
                            ? 'text-emerald-700'
                            : 'text-emerald-300'
                          : isLight
                            ? 'text-slate-900'
                            : 'text-white'
                      }`}
                    >
                      {team.score}
                    </div>
                  )}
                </div>
              </React.Fragment>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-gray-800/40">
            <p className={`text-[11px] truncate ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
              {featuredGame.situationText || featuredGame.venue || featuredGame.statusDetail}
            </p>
            {visibleGames.length > 1 && (
              <div
                className="flex items-center gap-1 shrink-0"
                data-no-drag="true"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => setSingleIndex((i) => i - 1)}
                  title="Previous game"
                  className="p-1 rounded-md hover:bg-white/10 text-gray-400 hover:text-white cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-semibold tabular-nums text-gray-400">
                  {safeSingleIdx + 1}/{visibleGames.length}
                </span>
                <button
                  type="button"
                  onClick={() => setSingleIndex((i) => i + 1)}
                  title="Next game"
                  className="p-1 rounded-md hover:bg-white/10 text-gray-400 hover:text-white cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* SCOREBOARD GRID MODE */
        <div
          className={`flex-1 min-h-0 overflow-y-auto grid ${gridColsClass} gap-2 content-start pr-0.5`}
        >
          {visibleGames.map((game) => {
            const badge = getGameBadgeMeta(game.state, isLight, isNightMode);
            const followed = isFollowedTeamInGame(game, followedTeams);
            return (
              <div
                key={game.id}
                className={`rounded-xl p-2.5 border flex flex-col gap-1.5 ${
                  transparentBg
                    ? 'border-transparent bg-transparent'
                    : isLight
                      ? 'bg-slate-50/90 border-slate-200/85'
                      : 'bg-gray-900/55 border-gray-800/85'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1 min-w-0">
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        isLight ? 'bg-slate-200/80 text-slate-700' : 'bg-white/10 text-gray-300'
                      }`}
                    >
                      {game.leagueLabel}
                    </span>
                    {followed && (
                      <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
                    )}
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-semibold truncate max-w-[115px] ${badge.badgeClass}`}
                  >
                    {game.state === 'LIVE' && (
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${badge.dotClass}`} />
                    )}
                    <span className="truncate">{formatGameTimeLabel(game)}</span>
                  </span>
                </div>

                {[game.awayTeam, game.homeTeam].map((team, idx) => (
                  <div
                    key={`${game.id}-${team.id}-${idx}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <TeamCrest team={team} sizeClass="w-5 h-5" />
                      <div className="min-w-0 flex items-baseline gap-1.5">
                        <span
                          className={`text-xs font-bold truncate ${
                            team.isWinner
                              ? isLight
                                ? 'text-slate-950'
                                : 'text-white'
                              : isLight
                                ? 'text-slate-800'
                                : 'text-gray-200'
                          }`}
                        >
                          {team.shortDisplayName}
                        </span>
                        {showRecords && team.record && (
                          <span className="text-[10px] text-gray-500 tabular-nums shrink-0">
                            {team.record}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`text-sm font-black tabular-nums shrink-0 ${
                        team.score === null
                          ? 'text-gray-500 text-xs font-semibold'
                          : team.isWinner
                            ? isLight
                              ? 'text-emerald-700'
                              : 'text-emerald-300'
                            : isLight
                              ? 'text-slate-900'
                              : 'text-white'
                      }`}
                    >
                      {team.score !== null ? team.score : '—'}
                    </span>
                  </div>
                ))}

                {(showBroadcast && game.broadcast) || game.situationText ? (
                  <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-gray-800/35 text-[10px] text-gray-400">
                    <span className="truncate">{game.situationText || game.venue || ''}</span>
                    {showBroadcast && game.broadcast && (
                      <span className="inline-flex items-center gap-0.5 shrink-0">
                        <Tv className="w-2.5 h-2.5" />
                        {game.broadcast}
                      </span>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
