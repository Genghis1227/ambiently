import type {
  FinanceQuote,
  FinanceRange,
  FinanceSearchResult,
  FinanceWatchlistItem,
} from '../types/finance';
import { DEFAULT_FINANCE_WATCHLIST, MAX_FINANCE_SYMBOLS } from '../types/finance';

const QUOTE_CACHE_STORAGE_KEY = 'ambiently_finance_quote_cache_v1';
const MAX_CLIENT_CACHE_ENTRIES = 80;
const STALE_CLIENT_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface StoredQuoteEntry {
  quote: FinanceQuote;
  savedAtMs: number;
}

const memoryQuoteCache = new Map<string, StoredQuoteEntry>();
let hydratedFromStorage = false;

function hydrateCacheFromStorage(): void {
  if (hydratedFromStorage) return;
  hydratedFromStorage = true;
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(QUOTE_CACHE_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, StoredQuoteEntry>;
    if (!parsed || typeof parsed !== 'object') return;
    const cutoff = Date.now() - STALE_CLIENT_CACHE_MAX_AGE_MS;
    for (const [k, entry] of Object.entries(parsed)) {
      if (entry && entry.quote && typeof entry.savedAtMs === 'number' && entry.savedAtMs >= cutoff) {
        memoryQuoteCache.set(k, entry);
      }
    }
  } catch {
    // Ignore storage corruption
  }
}

function persistCacheToStorage(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const serialized: Record<string, StoredQuoteEntry> = {};
    for (const [k, entry] of memoryQuoteCache.entries()) {
      serialized[k] = entry;
    }
    localStorage.setItem(QUOTE_CACHE_STORAGE_KEY, JSON.stringify(serialized));
  } catch {
    // Ignore quota errors
  }
}

function setCachedQuote(symbol: string, range: FinanceRange, quote: FinanceQuote): void {
  hydrateCacheFromStorage();
  const key = `${symbol}:${range}`;
  if (memoryQuoteCache.has(key)) {
    memoryQuoteCache.delete(key);
  } else if (memoryQuoteCache.size >= MAX_CLIENT_CACHE_ENTRIES) {
    const oldest = memoryQuoteCache.keys().next().value;
    if (oldest) memoryQuoteCache.delete(oldest);
  }
  memoryQuoteCache.set(key, { quote, savedAtMs: Date.now() });
}

export function normalizeTickerSymbol(raw: string): string {
  return String(raw || '').trim().toUpperCase();
}

export function resolveWatchlistItems(watchlist?: FinanceWatchlistItem[]): FinanceWatchlistItem[] {
  const source =
    Array.isArray(watchlist) && watchlist.length > 0 ? watchlist : DEFAULT_FINANCE_WATCHLIST;
  const deduped: FinanceWatchlistItem[] = [];
  const seen = new Set<string>();
  for (const item of source) {
    const symbol = normalizeTickerSymbol(item?.symbol || '');
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    deduped.push({
      symbol,
      label: typeof item?.label === 'string' && item.label.trim() ? item.label.trim() : undefined,
    });
    if (deduped.length >= MAX_FINANCE_SYMBOLS) break;
  }
  return deduped;
}

export function getCachedFinanceQuotes(
  symbols: string[],
  range: FinanceRange
): FinanceQuote[] {
  hydrateCacheFromStorage();
  const out: FinanceQuote[] = [];
  for (const rawSym of symbols) {
    const sym = normalizeTickerSymbol(rawSym);
    if (!sym) continue;
    const hit = memoryQuoteCache.get(`${sym}:${range}`);
    if (hit?.quote) {
      out.push(hit.quote);
    }
  }
  return out;
}

export async function fetchFinanceQuotes(
  symbols: string[],
  range: FinanceRange,
  signal?: AbortSignal
): Promise<{ quotes: FinanceQuote[]; isStaleCache: boolean }> {
  const normalized = Array.from(
    new Set(symbols.map(normalizeTickerSymbol).filter(Boolean))
  ).slice(0, MAX_FINANCE_SYMBOLS);

  if (normalized.length === 0) {
    return { quotes: [], isStaleCache: false };
  }

  const endpoint = `/api/finance?symbols=${encodeURIComponent(normalized.join(','))}&range=${encodeURIComponent(range)}`;
  try {
    const res = await fetch(endpoint, { signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = (await res.json()) as { quotes?: FinanceQuote[] };
    const quotes = Array.isArray(data?.quotes) ? data.quotes : [];
    for (const q of quotes) {
      if (q?.symbol) {
        setCachedQuote(normalizeTickerSymbol(q.symbol), range, q);
      }
    }
    if (quotes.length > 0) {
      persistCacheToStorage();
    }
    return { quotes, isStaleCache: false };
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw err;
    }
    const cached = getCachedFinanceQuotes(normalized, range);
    if (cached.length > 0) {
      return { quotes: cached, isStaleCache: true };
    }
    throw err;
  }
}

export async function searchFinanceSymbols(
  query: string,
  signal?: AbortSignal
): Promise<FinanceSearchResult[]> {
  const trimmed = query.trim().slice(0, 40);
  if (!trimmed) return [];
  const res = await fetch(`/api/finance?q=${encodeURIComponent(trimmed)}`, { signal });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const data = (await res.json()) as { results?: FinanceSearchResult[] };
  return Array.isArray(data?.results) ? data.results : [];
}

export function isIndexQuote(symbol: string, instrumentType?: string): boolean {
  return symbol.startsWith('^') || String(instrumentType || '').toUpperCase() === 'INDEX';
}

export function formatQuotePrice(
  price: number,
  currency = 'USD',
  symbol = '',
  instrumentType?: string
): string {
  if (!Number.isFinite(price)) return '—';
  const abs = Math.abs(price);
  const fractionDigits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;

  if (isIndexQuote(symbol, instrumentType)) {
    return price.toLocaleString('en-US', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
  }

  const normalizedCurrency = String(currency || 'USD').toUpperCase();
  if (normalizedCurrency === 'USD') {
    const formatted = price.toLocaleString('en-US', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    return price < 0 ? `-$${formatted.replace('-', '')}` : `$${formatted}`;
  }

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: normalizedCurrency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(price);
  } catch {
    const formatted = price.toLocaleString('en-US', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    return `${normalizedCurrency} ${formatted}`;
  }
}

export function formatQuoteChange(
  change: number,
  changePercent: number,
  showAbsolute = true,
  isIndex = false
): {
  deltaText: string;
  pctText: string;
  combinedText: string;
  isPositive: boolean;
  isFlat: boolean;
} {
  const safeChange = Number.isFinite(change) ? change : 0;
  const safePct = Number.isFinite(changePercent) ? changePercent : 0;
  const isFlat = Math.abs(safePct) < 0.005 && Math.abs(safeChange) < 0.0005;
  const isPositive = !isFlat && safeChange > 0;
  const sign = isFlat ? '' : isPositive ? '+' : '-';

  const absChange = Math.abs(safeChange);
  const decimals = absChange >= 1 || absChange === 0 ? 2 : absChange >= 0.01 ? 3 : 4;
  const numText = absChange.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  });

  const deltaText = isIndex ? `${sign}${numText}` : `${sign}$${numText}`;
  const pctText = `${sign}${Math.abs(safePct).toFixed(2)}%`;
  const combinedText = showAbsolute ? `${deltaText} (${pctText})` : pctText;

  return { deltaText, pctText, combinedText, isPositive, isFlat };
}

export function buildSparklineSvgPaths(
  points: number[],
  width: number,
  height: number,
  paddingY = 3
): { linePath: string; areaPath: string } {
  if (width <= 0 || height <= 0 || !Array.isArray(points)) {
    return { linePath: '', areaPath: '' };
  }
  const clean = points.filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (clean.length === 0) {
    return { linePath: '', areaPath: '' };
  }

  const series = clean.length === 1 ? [clean[0], clean[0]] : clean;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min;
  const safePadding = Math.min(paddingY, Math.floor(height / 3));
  const innerHeight = Math.max(1, height - safePadding * 2);

  const coords = series.map((val, idx) => {
    const x = Number(((idx / (series.length - 1)) * width).toFixed(2));
    const y =
      span <= 1e-12
        ? Number((height / 2).toFixed(2))
        : Number((safePadding + innerHeight - ((val - min) / span) * innerHeight).toFixed(2));
    return { x, y };
  });

  const linePath = coords
    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`)
    .join(' ');
  const areaPath = `${linePath} L ${Number(width.toFixed(2))} ${Number(height.toFixed(2))} L 0 ${Number(height.toFixed(2))} Z`;

  return { linePath, areaPath };
}
