import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  Plus,
  X,
  Search,
  WifiOff,
  Loader2,
} from 'lucide-react';
import type {
  FinanceDisplayMode,
  FinanceMarketState,
  FinanceQuote,
  FinanceRange,
  FinanceSearchResult,
  FinanceWidgetConfig,
} from '../../types/finance';
import { MAX_FINANCE_SYMBOLS } from '../../types/finance';
import {
  buildSparklineSvgPaths,
  fetchFinanceQuotes,
  formatQuoteChange,
  formatQuotePrice,
  getCachedFinanceQuotes,
  isIndexQuote,
  normalizeTickerSymbol,
  resolveWatchlistItems,
  searchFinanceSymbols,
} from '../../services/finance';
import { useDashboardStore } from '../../store/dashboardStore';
import { isAmbientlyInNightMode } from '../../utils/confetti';
import { resolveFinanceAutoMode } from '../../utils/displayOrientation';

interface FinanceWidgetProps {
  title?: string;
  config?: FinanceWidgetConfig;
  isLight?: boolean;
  transparentBg?: boolean;
  onUpdateConfig?: (updates: Record<string, any>) => void;
}

const RANGE_OPTIONS: Array<{ id: FinanceRange; label: string }> = [
  { id: '1d', label: '1D' },
  { id: '5d', label: '5D' },
  { id: '1mo', label: '1M' },
];

interface SparklineProps {
  points: number[];
  width: number;
  height: number;
  strokeColor: string;
  gradId: string;
  className?: string;
  showArea?: boolean;
}

const SparklineChart: React.FC<SparklineProps> = ({
  points,
  width,
  height,
  strokeColor,
  gradId,
  className = '',
  showArea = true,
}) => {
  const { linePath, areaPath } = useMemo(
    () => buildSparklineSvgPaths(points, width, height, 3),
    [points, width, height]
  );

  if (!linePath) {
    return <div style={{ width, height }} className={className} />;
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      {showArea && areaPath && (
        <>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.28" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0.01" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gradId})`} />
        </>
      )}
      <path
        d={linePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

function resolveOverallMarketState(quotes: FinanceQuote[]): FinanceMarketState {
  // Prioritize equity/index state if present over 24/7 crypto so badge reflects Wall St session
  const nonCrypto = quotes.find(
    (q) => String(q.instrumentType || '').toUpperCase() !== 'CRYPTOCURRENCY'
  );
  if (nonCrypto) return nonCrypto.marketState;
  return quotes[0]?.marketState || 'CLOSED';
}

function getMarketBadgeMeta(
  state: FinanceMarketState,
  isStaleCache: boolean,
  isLight: boolean,
  isNightMode: boolean
): { label: string; dotClass: string; badgeClass: string } {
  if (isStaleCache) {
    return {
      label: 'Cached',
      dotClass: isNightMode ? 'bg-amber-400/60' : 'bg-amber-400',
      badgeClass: isLight
        ? 'bg-amber-500/12 text-amber-800 border-amber-500/25'
        : 'bg-amber-500/12 text-amber-200/90 border-amber-500/20',
    };
  }
  switch (state) {
    case 'OPEN':
      return {
        label: 'Market Open',
        dotClass: isNightMode ? 'bg-emerald-400/65' : 'bg-emerald-400',
        badgeClass: isLight
          ? 'bg-emerald-600/10 text-emerald-800 border-emerald-600/20'
          : 'bg-emerald-500/10 text-emerald-300/90 border-emerald-500/20',
      };
    case 'PRE':
      return {
        label: 'Pre-Market',
        dotClass: isNightMode ? 'bg-amber-400/60' : 'bg-amber-400',
        badgeClass: isLight
          ? 'bg-amber-600/10 text-amber-800 border-amber-600/20'
          : 'bg-amber-500/10 text-amber-300/90 border-amber-500/20',
      };
    case 'POST':
      return {
        label: 'After Hours',
        dotClass: isNightMode ? 'bg-indigo-400/60' : 'bg-indigo-400',
        badgeClass: isLight
          ? 'bg-indigo-600/10 text-indigo-800 border-indigo-600/20'
          : 'bg-indigo-500/10 text-indigo-300/90 border-indigo-500/20',
      };
    default:
      return {
        label: 'Closed',
        dotClass: isLight ? 'bg-slate-400' : 'bg-slate-500',
        badgeClass: isLight
          ? 'bg-slate-500/10 text-slate-600 border-slate-400/25'
          : 'bg-slate-700/35 text-slate-400 border-slate-600/35',
      };
  }
}

export const FinanceWidget: React.FC<FinanceWidgetProps> = ({
  title,
  config,
  isLight = false,
  transparentBg = false,
  onUpdateConfig,
}) => {
  const dashboardSettings = useDashboardStore((state) => state.settings);
  const isNightMode =
    Boolean(dashboardSettings?.nightModeEnabled) || isAmbientlyInNightMode(dashboardSettings);

  const svgBaseId = useId().replace(/:/g, '');
  const containerRef = useRef<HTMLDivElement>(null);
  const tickerMeasureRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });
  const [tickerShouldScroll, setTickerShouldScroll] = useState(false);

  const watchlist = useMemo(() => resolveWatchlistItems(config?.watchlist), [config?.watchlist]);
  const symbols = useMemo(() => watchlist.map((item) => item.symbol), [watchlist]);
  const symbolsKey = symbols.join(',');

  const range: FinanceRange =
    config?.range === '5d' || config?.range === '1mo' ? config.range : '1d';
  const configuredMode: FinanceDisplayMode =
    config?.displayMode === 'list' ||
    config?.displayMode === 'grid' ||
    config?.displayMode === 'ticker'
      ? config.displayMode
      : 'auto';
  const showSparkline = config?.showSparkline !== false;
  const showAbsoluteChange = config?.showAbsoluteChange !== false;
  const refreshIntervalMin: 1 | 5 | 15 =
    config?.refreshIntervalMin === 1 || config?.refreshIntervalMin === 15
      ? config.refreshIntervalMin
      : 5;

  const requestKey = `${symbolsKey}::${range}`;
  const [refreshTick, setRefreshTick] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchResult, setFetchResult] = useState<{
    key: string;
    quotes: FinanceQuote[];
    isStaleCache: boolean;
    error: string | null;
  }>({
    key: '',
    quotes: [],
    isStaleCache: false,
    error: null,
  });

  // Quick-add / inline edit bar state
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState('');
  const [searchResults, setSearchResults] = useState<FinanceSearchResult[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);

  // Measure tile dimensions cleanly for adaptive layout & marquee overflow detection
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setContainerSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
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
          setContainerSize((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
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
  }, [symbolsKey, configuredMode]);

  // Fetch quotes on mount, symbol/range change, manual refresh, visibility regain, and interval
  useEffect(() => {
    const symbolList = symbolsKey ? symbolsKey.split(',').filter(Boolean) : [];
    if (symbolList.length === 0) return;

    let active = true;
    let activeController: AbortController | null = null;

    const runFetch = async () => {
      if (activeController) {
        activeController.abort();
      }
      const controller = new AbortController();
      activeController = controller;
      try {
        const res = await fetchFinanceQuotes(symbolList, range, controller.signal);
        if (!active) return;
        setFetchResult({
          key: requestKey,
          quotes: res.quotes,
          isStaleCache: res.isStaleCache,
          error: null,
        });
      } catch (err: any) {
        if (!active || err?.name === 'AbortError') return;
        setFetchResult((prev) => ({
          key: requestKey,
          quotes: prev.key === requestKey ? prev.quotes : [],
          isStaleCache: true,
          error: err?.message || 'Unable to load market data',
        }));
      } finally {
        if (active) {
          setIsRefreshing(false);
        }
      }
    };

    void runFetch();

    const intervalMs = refreshIntervalMin * 60_000;
    const interval = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (isNightMode) return;
      void runFetch();
    }, intervalMs);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !isNightMode) {
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
  }, [symbolsKey, range, requestKey, refreshTick, refreshIntervalMin, isNightMode]);

  // Debounced ticker autocomplete when quick-add search is open
  useEffect(() => {
    if (!quickAddOpen) return;
    const trimmed = quickQuery.trim();
    if (trimmed.length < 1) return;

    let active = true;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchFinanceSymbols(trimmed, controller.signal)
        .then((results) => {
          if (active) {
            setSearchResults(results);
            setSearchBusy(false);
          }
        })
        .catch(() => {
          if (active) {
            setSearchResults([]);
            setSearchBusy(false);
          }
        });
    }, 240);

    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [quickAddOpen, quickQuery]);

  // Merge live fetched quotes with offline/instant cached quotes cleanly
  const cachedFallback = useMemo(
    () => getCachedFinanceQuotes(symbols, range),
    [symbols, range]
  );

  const activeQuotes = useMemo(() => {
    const source =
      fetchResult.key === requestKey && fetchResult.quotes.length > 0
        ? fetchResult.quotes
        : cachedFallback;
    const bySymbol = new Map(source.map((q) => [normalizeTickerSymbol(q.symbol), q]));
    return watchlist.map((item) => ({
      item,
      quote: bySymbol.get(item.symbol),
    }));
  }, [fetchResult, requestKey, cachedFallback, watchlist]);

  const loadedQuotes = useMemo(
    () => activeQuotes.map((entry) => entry.quote).filter((q): q is FinanceQuote => Boolean(q)),
    [activeQuotes]
  );

  const isStaleCache =
    fetchResult.key === requestKey ? fetchResult.isStaleCache : loadedQuotes.length > 0;
  const fetchError =
    fetchResult.key === requestKey && loadedQuotes.length === 0 ? fetchResult.error : null;

  const effectiveMode: Exclude<FinanceDisplayMode, 'auto'> = useMemo(() => {
    if (configuredMode !== 'auto') return configuredMode;
    return resolveFinanceAutoMode(containerSize.width, containerSize.height);
  }, [configuredMode, containerSize]);

  // Re-measure ticker overflow once quotes/sparklines finish rendering on cold load
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
  }, [effectiveMode, loadedQuotes.length, range, isRefreshing]);

  const handleManualRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRefreshing(true);
    setRefreshTick((t) => t + 1);
  };

  const handleSelectRange = (nextRange: FinanceRange) => {
    if (nextRange === range) return;
    setIsRefreshing(true);
    onUpdateConfig?.({ range: nextRange });
  };

  const handleAddSymbol = (rawSymbol: string, label?: string) => {
    const clean = normalizeTickerSymbol(rawSymbol);
    if (!clean || !onUpdateConfig) return;
    if (watchlist.some((w) => w.symbol === clean)) {
      setQuickQuery('');
      setSearchResults([]);
      return;
    }
    if (watchlist.length >= MAX_FINANCE_SYMBOLS) return;
    const nextList = [...watchlist, { symbol: clean, ...(label ? { label } : {}) }];
    onUpdateConfig({ watchlist: nextList });
    setQuickQuery('');
    setSearchResults([]);
  };

  const handleRemoveSymbol = (symbol: string) => {
    if (!onUpdateConfig || watchlist.length <= 1) return;
    onUpdateConfig({
      watchlist: watchlist.filter((w) => w.symbol !== symbol),
    });
  };

  const getColorsForQuote = (isPositive: boolean, isFlat: boolean) => {
    if (isFlat) {
      return {
        stroke: isNightMode ? '#64748b' : isLight ? '#64748b' : '#94a3b8',
        pillClass: isLight
          ? 'bg-slate-500/12 text-slate-700 border-slate-500/20'
          : 'bg-slate-600/25 text-slate-300 border-slate-600/30',
        textClass: isLight ? 'text-slate-600' : 'text-slate-400',
      };
    }
    if (isPositive) {
      return {
        stroke: isNightMode ? '#4a7c66' : isLight ? '#15803d' : '#52b788',
        pillClass: isLight
          ? 'bg-emerald-600/12 text-emerald-800 border-emerald-600/25'
          : isNightMode
            ? 'bg-emerald-500/10 text-emerald-300/75 border-emerald-500/15'
            : 'bg-emerald-500/14 text-emerald-300 border-emerald-500/25',
        textClass: isLight
          ? 'text-emerald-700'
          : isNightMode
            ? 'text-emerald-300/80'
            : 'text-emerald-300',
      };
    }
    return {
      stroke: isNightMode ? '#995c63' : isLight ? '#be123c' : '#d9777f',
      pillClass: isLight
        ? 'bg-rose-600/12 text-rose-800 border-rose-600/25'
        : isNightMode
          ? 'bg-rose-500/10 text-rose-300/75 border-rose-500/15'
          : 'bg-rose-500/14 text-rose-300 border-rose-500/25',
      textClass: isLight
        ? 'text-rose-700'
        : isNightMode
          ? 'text-rose-300/80'
          : 'text-rose-300',
    };
  };

  const marketState = resolveOverallMarketState(loadedQuotes);
  const marketBadge = getMarketBadgeMeta(marketState, isStaleCache, isLight, isNightMode);
  const stickerTextClass = transparentBg
    ? isLight
      ? 'drop-shadow-[0_1px_2px_rgba(255,255,255,0.6)]'
      : 'drop-shadow-[0_1px_4px_rgba(0,0,0,0.75)]'
    : '';

  const showRowSparkline = showSparkline && (containerSize.width === 0 || containerSize.width >= 245);
  const gridColsClass = containerSize.width >= 880 ? 'grid-cols-3' : 'grid-cols-2';
  const showHeader = effectiveMode !== 'ticker' || containerSize.height === 0 || containerSize.height >= 92;

  return (
    <div
      ref={containerRef}
      className={`h-full w-full flex flex-col overflow-hidden ${stickerTextClass}`}
    >
      {/* Header Bar */}
      {showHeader && (
        <div
          className={`flex items-center justify-between gap-2 pb-2 mb-1.5 shrink-0 ${
            transparentBg
              ? 'border-b border-transparent'
              : isLight
                ? 'border-b border-slate-200/80'
                : 'border-b border-gray-800/80'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div
              className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                transparentBg
                  ? 'bg-transparent'
                  : isLight
                    ? 'bg-emerald-600/10 text-emerald-700'
                    : 'bg-emerald-500/12 text-emerald-300'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
            </div>
            <span
              className={`text-xs font-bold tracking-tight truncate ${
                isLight ? 'text-slate-800' : 'text-gray-100'
              }`}
            >
              {title || 'Markets'}
            </span>
            {loadedQuotes.length > 0 && (
              <span
                className={`hidden sm:inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[10px] font-medium shrink-0 ${marketBadge.badgeClass}`}
              >
                {isStaleCache ? (
                  <WifiOff className="w-2.5 h-2.5" />
                ) : (
                  <span className={`w-1.5 h-1.5 rounded-full ${marketBadge.dotClass}`} />
                )}
                <span>{marketBadge.label}</span>
              </span>
            )}
          </div>

          <div
            data-no-drag="true"
            onPointerDown={(e) => e.stopPropagation()}
            className="flex items-center gap-1 shrink-0"
          >
            {/* Range Switcher */}
            <div
              className={`flex items-center rounded-lg p-0.5 border ${
                transparentBg
                  ? isLight
                    ? 'bg-white/30 border-slate-300/50'
                    : 'bg-black/25 border-white/10'
                  : isLight
                    ? 'bg-slate-100 border-slate-200'
                    : 'bg-gray-900/80 border-gray-800'
              }`}
            >
              {RANGE_OPTIONS.map((opt) => {
                const active = opt.id === range;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectRange(opt.id)}
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold transition-colors cursor-pointer ${
                      active
                        ? isLight
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'bg-gray-800 text-white'
                        : isLight
                          ? 'text-slate-500 hover:text-slate-800'
                          : 'text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            {onUpdateConfig && effectiveMode !== 'ticker' && (
              <button
                type="button"
                onClick={() => {
                  setQuickAddOpen((prev) => !prev);
                  setQuickQuery('');
                  setSearchResults([]);
                  setSearchBusy(false);
                }}
                title={quickAddOpen ? 'Close quick edit' : 'Add or remove tickers'}
                className={`p-1 rounded-lg border transition-colors cursor-pointer ${
                  quickAddOpen
                    ? isLight
                      ? 'bg-emerald-600/15 border-emerald-600/30 text-emerald-700'
                      : 'bg-emerald-500/20 border-emerald-500/35 text-emerald-300'
                    : transparentBg
                      ? isLight
                        ? 'border-transparent hover:bg-slate-200/50 text-slate-600'
                        : 'border-transparent hover:bg-white/10 text-gray-300'
                      : isLight
                        ? 'bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900'
                        : 'bg-gray-900/70 border-gray-800 text-gray-400 hover:text-gray-100'
                }`}
              >
                {quickAddOpen ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              </button>
            )}

            <button
              type="button"
              onClick={handleManualRefresh}
              title="Refresh quotes"
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

      {/* Inline Quick-Add Bar */}
      {quickAddOpen && onUpdateConfig && effectiveMode !== 'ticker' && (
        <div
          data-no-drag="true"
          onPointerDown={(e) => e.stopPropagation()}
          className={`mb-2 p-2 rounded-xl border shrink-0 ${
            isLight
              ? 'bg-slate-50 border-slate-200'
              : 'bg-gray-900/80 border-gray-800'
          }`}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (quickQuery.trim()) {
                handleAddSymbol(quickQuery);
              }
            }}
            className="flex items-center gap-1.5"
          >
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={quickQuery}
                onChange={(e) => {
                  const val = e.target.value;
                  setQuickQuery(val);
                  if (val.trim().length === 0) {
                    setSearchResults([]);
                    setSearchBusy(false);
                  } else {
                    setSearchBusy(true);
                  }
                }}
                placeholder="Add ticker (e.g. VTI, AAPL, BTC-USD)..."
                className={`w-full pl-8 pr-2.5 py-1.5 rounded-lg border text-xs focus:outline-none ${
                  isLight
                    ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-emerald-500'
                    : 'bg-gray-950 border-gray-700 text-white placeholder:text-gray-500 focus:border-emerald-500/60'
                }`}
              />
            </div>
            <button
              type="submit"
              disabled={!quickQuery.trim() || watchlist.length >= MAX_FINANCE_SYMBOLS}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
            >
              Add
            </button>
          </form>

          {searchBusy && quickQuery.trim() && (
            <div className="flex items-center gap-1.5 text-[11px] text-gray-400 mt-1.5 px-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>Searching symbols...</span>
            </div>
          )}

          {searchResults.length > 0 && (
            <div className="mt-1.5 max-h-32 overflow-y-auto space-y-1">
              {searchResults.slice(0, 5).map((hit) => {
                const alreadyAdded = watchlist.some((w) => w.symbol === hit.symbol);
                return (
                  <button
                    key={hit.symbol}
                    type="button"
                    disabled={alreadyAdded || watchlist.length >= MAX_FINANCE_SYMBOLS}
                    onClick={() => handleAddSymbol(hit.symbol, hit.name)}
                    className={`w-full flex items-center justify-between gap-2 px-2 py-1 rounded-lg text-left text-xs transition-colors cursor-pointer disabled:opacity-45 ${
                      isLight ? 'hover:bg-slate-200/70' : 'hover:bg-gray-800/80'
                    }`}
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="font-bold shrink-0">{hit.symbol}</span>
                      <span className="text-[11px] text-gray-400 truncate">{hit.name}</span>
                    </div>
                    <span className="text-[10px] text-gray-500 shrink-0">
                      {alreadyAdded ? 'Added' : hit.exchange || '+ Add'}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Body Content */}
      {fetchError && loadedQuotes.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-4 gap-2">
          <WifiOff className={`w-5 h-5 ${isLight ? 'text-slate-400' : 'text-gray-500'}`} />
          <p className={`text-xs font-medium ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
            Market data temporarily unavailable
          </p>
          <button
            type="button"
            data-no-drag="true"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={handleManualRefresh}
            className="px-3 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/35 text-emerald-300 text-xs font-semibold cursor-pointer"
          >
            Try Again
          </button>
        </div>
      ) : effectiveMode === 'ticker' ? (
        /* TICKER RIBBON MODE */
        <div className="flex-1 flex items-center overflow-hidden relative min-h-0">
          {/* Hidden single-pass width probe for seamless loop decision */}
          <div
            ref={tickerMeasureRef}
            aria-hidden="true"
            className="flex items-center gap-3 absolute opacity-0 pointer-events-none whitespace-nowrap"
          >
            {activeQuotes.map(({ item, quote }, idx) => (
              <div key={`${item.symbol}-${idx}`} className="flex items-center gap-2 px-2.5 py-1">
                <span className="text-xs font-bold">{item.symbol}</span>
                <span className="text-xs font-semibold tabular-nums">
                  {quote
                    ? formatQuotePrice(quote.price, quote.currency, quote.symbol, quote.instrumentType)
                    : '—'}
                </span>
                {showSparkline && <div className="w-11 h-5" />}
                <span className="text-[11px] font-semibold">+00.00%</span>
              </div>
            ))}
          </div>

          <div
            className={
              tickerShouldScroll
                ? 'ambiently-ticker-track hover:[animation-play-state:paused]'
                : 'flex items-center gap-2.5 overflow-x-auto no-scrollbar w-full'
            }
            style={
              tickerShouldScroll
                ? ({
                    '--ticker-duration': `${Math.max(18, activeQuotes.length * 6)}s`,
                    animationPlayState: isNightMode ? 'paused' : undefined,
                  } as React.CSSProperties)
                : undefined
            }
          >
            {(tickerShouldScroll ? [0, 1] : [0]).map((pass) => (
              <div key={pass} className="flex items-center gap-2.5 pr-2.5 shrink-0">
                {activeQuotes.map(({ item, quote }, idx) => {
                  const isIndex = isIndexQuote(item.symbol, quote?.instrumentType);
                  const chg = quote
                    ? formatQuoteChange(quote.change, quote.changePercent, false, isIndex)
                    : null;
                  const colors = getColorsForQuote(chg?.isPositive ?? false, chg?.isFlat ?? true);

                  return (
                    <div
                      key={`${pass}-${item.symbol}`}
                      className={`flex items-center gap-2 px-2.5 py-1 rounded-xl border shrink-0 ${
                        transparentBg
                          ? 'border-transparent bg-transparent'
                          : isLight
                            ? 'bg-slate-50/90 border-slate-200/80'
                            : 'bg-gray-900/60 border-gray-800/80'
                      }`}
                    >
                      <span
                        className={`text-xs font-bold tracking-tight ${
                          isLight ? 'text-slate-900' : 'text-gray-100'
                        }`}
                      >
                        {item.symbol}
                      </span>
                      <span
                        className={`text-xs font-semibold tabular-nums ${
                          isLight ? 'text-slate-800' : 'text-gray-200'
                        }`}
                      >
                        {quote
                          ? formatQuotePrice(
                              quote.price,
                              quote.currency,
                              quote.symbol,
                              quote.instrumentType
                            )
                          : '—'}
                      </span>
                      {showSparkline && quote && (
                        <SparklineChart
                          points={quote.sparkline}
                          width={44}
                          height={20}
                          strokeColor={colors.stroke}
                          gradId={`${svgBaseId}-tk-${pass}-${idx}`}
                          className="w-11 h-5 shrink-0"
                          showArea={false}
                        />
                      )}
                      {chg && (
                        <span
                          className={`px-1.5 py-0.5 rounded-md border text-[11px] font-semibold tabular-nums ${colors.pillClass}`}
                        >
                          {chg.pctText}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ) : effectiveMode === 'grid' ? (
        /* MARKET GRID MODE */
        <div className={`flex-1 min-h-0 overflow-y-auto grid ${gridColsClass} gap-2.5 content-start pr-0.5`}>
          {activeQuotes.map(({ item, quote }, idx) => {
            const isIndex = isIndexQuote(item.symbol, quote?.instrumentType);
            const chg = quote
              ? formatQuoteChange(quote.change, quote.changePercent, showAbsoluteChange, isIndex)
              : null;
            const colors = getColorsForQuote(chg?.isPositive ?? false, chg?.isFlat ?? true);
            const displayLabel = item.label || quote?.name || item.symbol;

            return (
              <div
                key={item.symbol}
                className={`rounded-xl p-3 border flex flex-col justify-between gap-2 transition-colors relative group ${
                  transparentBg
                    ? 'border-transparent bg-transparent'
                    : isLight
                      ? 'bg-slate-50/90 border-slate-200/80'
                      : 'bg-gray-900/55 border-gray-800/85'
                }`}
              >
                <div className="flex items-start justify-between gap-1.5">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-sm font-bold tracking-tight ${
                          isLight ? 'text-slate-900' : 'text-white'
                        }`}
                      >
                        {item.symbol}
                      </span>
                      {quote?.exchange && (
                        <span className="text-[10px] text-gray-500 truncate hidden sm:inline">
                          {quote.exchange}
                        </span>
                      )}
                    </div>
                    <p
                      className={`text-[11px] truncate ${
                        isLight ? 'text-slate-500' : 'text-gray-400'
                      }`}
                    >
                      {displayLabel}
                    </p>
                  </div>

                  {quickAddOpen && onUpdateConfig && watchlist.length > 1 ? (
                    <button
                      type="button"
                      data-no-drag="true"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => handleRemoveSymbol(item.symbol)}
                      title={`Remove ${item.symbol}`}
                      className="p-1 rounded-md text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ) : chg ? (
                    <span
                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md border text-[11px] font-semibold tabular-nums shrink-0 ${colors.pillClass}`}
                    >
                      {chg.isFlat ? (
                        <Minus className="w-2.5 h-2.5" />
                      ) : chg.isPositive ? (
                        <TrendingUp className="w-2.5 h-2.5" />
                      ) : (
                        <TrendingDown className="w-2.5 h-2.5" />
                      )}
                      <span>{chg.pctText}</span>
                    </span>
                  ) : null}
                </div>

                {showSparkline && (
                  <div className="h-9 w-full">
                    {quote ? (
                      <SparklineChart
                        points={quote.sparkline}
                        width={160}
                        height={36}
                        strokeColor={colors.stroke}
                        gradId={`${svgBaseId}-gr-${idx}`}
                        className="w-full h-full"
                      />
                    ) : (
                      <div className="w-full h-full rounded-md bg-gray-800/30 animate-pulse" />
                    )}
                  </div>
                )}

                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={`text-base font-bold tabular-nums tracking-tight ${
                      isLight ? 'text-slate-900' : 'text-white'
                    }`}
                  >
                    {quote
                      ? formatQuotePrice(
                          quote.price,
                          quote.currency,
                          quote.symbol,
                          quote.instrumentType
                        )
                      : 'Loading...'}
                  </span>
                  {quote && range === '1d' && quote.dayLow && quote.dayHigh ? (
                    <span className="text-[10px] text-gray-500 tabular-nums truncate">
                      L {formatQuotePrice(quote.dayLow, quote.currency, quote.symbol, quote.instrumentType)} · H{' '}
                      {formatQuotePrice(quote.dayHigh, quote.currency, quote.symbol, quote.instrumentType)}
                    </span>
                  ) : (
                    chg &&
                    showAbsoluteChange && (
                      <span className={`text-[11px] font-medium tabular-nums ${colors.textClass}`}>
                        {chg.deltaText}
                      </span>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* COMPACT WATCHLIST ROWS MODE */
        <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-0.5">
          {activeQuotes.map(({ item, quote }, idx) => {
            const isIndex = isIndexQuote(item.symbol, quote?.instrumentType);
            const chg = quote
              ? formatQuoteChange(quote.change, quote.changePercent, showAbsoluteChange, isIndex)
              : null;
            const colors = getColorsForQuote(chg?.isPositive ?? false, chg?.isFlat ?? true);
            const displayLabel = item.label || quote?.name || '';

            return (
              <div
                key={item.symbol}
                className={`flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-xl border transition-colors ${
                  transparentBg
                    ? 'border-transparent bg-transparent px-1'
                    : isLight
                      ? 'bg-slate-50/85 border-slate-200/75'
                      : 'bg-gray-900/50 border-gray-800/80'
                }`}
              >
                {/* Left: Symbol & Name */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-sm font-bold tracking-tight truncate ${
                        isLight ? 'text-slate-900' : 'text-white'
                      }`}
                    >
                      {item.symbol}
                    </span>
                    {quote?.instrumentType === 'CRYPTOCURRENCY' && (
                      <span
                        className={`text-[9px] uppercase font-semibold px-1 py-0.5 rounded ${
                          isLight
                            ? 'bg-amber-500/12 text-amber-800'
                            : 'bg-amber-500/12 text-amber-300/90'
                        }`}
                      >
                        24/7
                      </span>
                    )}
                  </div>
                  {displayLabel && (
                    <p
                      className={`text-[11px] truncate ${
                        isLight ? 'text-slate-500' : 'text-gray-400'
                      }`}
                    >
                      {displayLabel}
                    </p>
                  )}
                </div>

                {/* Center: Sparkline */}
                {showRowSparkline && (
                  <div className="w-20 h-7 shrink-0">
                    {quote ? (
                      <SparklineChart
                        points={quote.sparkline}
                        width={80}
                        height={28}
                        strokeColor={colors.stroke}
                        gradId={`${svgBaseId}-ls-${idx}`}
                        className="w-full h-full"
                      />
                    ) : (
                      <div className="w-full h-full rounded bg-gray-800/30 animate-pulse" />
                    )}
                  </div>
                )}

                {/* Right: Price & Change Pill */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="text-right">
                    <div
                      className={`text-sm font-bold tabular-nums leading-tight ${
                        isLight ? 'text-slate-900' : 'text-white'
                      }`}
                    >
                      {quote
                        ? formatQuotePrice(
                            quote.price,
                            quote.currency,
                            quote.symbol,
                            quote.instrumentType
                          )
                        : '—'}
                    </div>
                    {chg && (
                      <div
                        className={`mt-0.5 inline-flex items-center justify-end px-1.5 py-0.5 rounded-md border text-[11px] font-semibold tabular-nums leading-none ${colors.pillClass}`}
                      >
                        {chg.combinedText}
                      </div>
                    )}
                  </div>

                  {quickAddOpen && onUpdateConfig && watchlist.length > 1 && (
                    <button
                      type="button"
                      data-no-drag="true"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => handleRemoveSymbol(item.symbol)}
                      title={`Remove ${item.symbol}`}
                      className="p-1 rounded-md text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
