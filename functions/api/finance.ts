// Cloudflare Pages Function: /functions/api/finance.ts
// Zero-API-key market quote, sparkline, and ticker search proxy

import {
  fetchExternal,
  externalFetchErrorResponse,
  refuseOtherSites,
} from '../_shared/fetchExternal';

interface PagesContext {
  request: Request;
}

export type FinanceRange = '1d' | '5d' | '1mo';
export type FinanceMarketState = 'OPEN' | 'PRE' | 'POST' | 'CLOSED';

export interface FinanceQuote {
  symbol: string;
  name: string;
  exchange?: string;
  instrumentType?: string;
  currency: string;
  price: number;
  previousClose: number;
  change: number;
  changePercent: number;
  dayHigh?: number;
  dayLow?: number;
  marketState: FinanceMarketState;
  sparkline: number[];
  updatedAt: string;
}

export interface FinanceSearchResult {
  symbol: string;
  name: string;
  exchange?: string;
  instrumentType?: string;
}

const ALLOWED_FINANCE_HOSTS = ['query1.finance.yahoo.com', 'query2.finance.yahoo.com'];
const FINANCE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; Ambiently-Display/1.0)',
  Accept: 'application/json',
};

const MAX_FINANCE_SYMBOLS = 15;
const QUOTE_CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 200;

const ALLOWED_SEARCH_QUOTE_TYPES = new Set([
  'EQUITY',
  'ETF',
  'INDEX',
  'CRYPTOCURRENCY',
  'MUTUALFUND',
  'CURRENCY',
  'FUTURE',
]);

const RANGE_TO_INTERVAL: Record<FinanceRange, string> = {
  '1d': '15m',
  '5d': '1h',
  '1mo': '1d',
};

interface CachedQuoteEntry {
  quote: FinanceQuote;
  expiresAt: number;
}

const quoteMemoryCache = new Map<string, CachedQuoteEntry>();

export function normalizeFinanceSymbol(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().toUpperCase();
  if (!/^\^?[A-Z0-9][A-Z0-9.=-]{0,14}$/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

export function downsampleSparkline(
  values: unknown[],
  fallbackPrice: number,
  maxPoints = 32
): number[] {
  const cleaned = Array.isArray(values)
    ? values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0)
    : [];

  if (cleaned.length === 0) {
    return Number.isFinite(fallbackPrice) && fallbackPrice > 0
      ? [fallbackPrice, fallbackPrice]
      : [];
  }

  if (cleaned.length === 1) {
    const second = Number.isFinite(fallbackPrice) && fallbackPrice > 0 ? fallbackPrice : cleaned[0];
    return [cleaned[0], second];
  }

  if (cleaned.length <= maxPoints) {
    return cleaned;
  }

  const sampled: number[] = [];
  const step = (cleaned.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) {
    const idx = i === maxPoints - 1 ? cleaned.length - 1 : Math.round(i * step);
    sampled.push(cleaned[idx]);
  }
  return sampled;
}

export function resolveMarketState(
  meta: Record<string, any>,
  nowSec = Math.floor(Date.now() / 1000)
): FinanceMarketState {
  if (String(meta?.instrumentType || '').toUpperCase() === 'CRYPTOCURRENCY') {
    return 'OPEN';
  }
  const periods = meta?.currentTradingPeriod;
  if (!periods || typeof periods !== 'object') {
    return 'CLOSED';
  }

  const inPeriod = (period: any): boolean =>
    Boolean(
      period &&
        typeof period.start === 'number' &&
        typeof period.end === 'number' &&
        nowSec >= period.start &&
        nowSec < period.end
    );

  if (inPeriod(periods.regular)) return 'OPEN';
  if (inPeriod(periods.pre)) return 'PRE';
  if (inPeriod(periods.post)) return 'POST';
  return 'CLOSED';
}

export function parseYahooChartResponse(
  payload: any,
  requestedSymbol: string,
  range: FinanceRange,
  nowSec = Math.floor(Date.now() / 1000)
): FinanceQuote | null {
  const result = payload?.chart?.result?.[0];
  const meta = result?.meta;
  if (!meta || meta.regularMarketPrice === null || meta.regularMarketPrice === undefined) {
    return null;
  }

  const price = Number(meta.regularMarketPrice);
  if (!Number.isFinite(price)) {
    return null;
  }

  const symbol = normalizeFinanceSymbol(String(meta.symbol || requestedSymbol)) || requestedSymbol;

  const rawPrev =
    range === '1d'
      ? (meta.previousClose ?? meta.chartPreviousClose ?? price)
      : (meta.chartPreviousClose ?? meta.previousClose ?? price);
  const parsedPrev = Number(rawPrev);
  const previousClose = Number.isFinite(parsedPrev) && parsedPrev > 0 ? parsedPrev : price;

  const change = price - previousClose;
  const changePercent = previousClose > 0 ? (change / previousClose) * 100 : 0;

  const dayHighRaw = Number(meta.regularMarketDayHigh);
  const dayLowRaw = Number(meta.regularMarketDayLow);

  const rawCloses = result?.indicators?.quote?.[0]?.close;
  const sparkline = downsampleSparkline(Array.isArray(rawCloses) ? rawCloses : [], price);

  return {
    symbol,
    name: String(meta.shortName || meta.longName || symbol).trim() || symbol,
    exchange: meta.fullExchangeName || meta.exchangeName || undefined,
    instrumentType: meta.instrumentType || undefined,
    currency: typeof meta.currency === 'string' && meta.currency ? meta.currency : 'USD',
    price,
    previousClose,
    change,
    changePercent,
    dayHigh: Number.isFinite(dayHighRaw) && dayHighRaw > 0 ? dayHighRaw : undefined,
    dayLow: Number.isFinite(dayLowRaw) && dayLowRaw > 0 ? dayLowRaw : undefined,
    marketState: resolveMarketState(meta, nowSec),
    sparkline,
    updatedAt: new Date(nowSec * 1000).toISOString(),
  };
}

export function parseYahooSearchResponse(payload: any): FinanceSearchResult[] {
  const quotes = Array.isArray(payload?.quotes) ? payload.quotes : [];
  const results: FinanceSearchResult[] = [];
  const seen = new Set<string>();

  for (const item of quotes) {
    if (!item || typeof item !== 'object') continue;
    const quoteType = String(item.quoteType || '').toUpperCase();
    if (quoteType && !ALLOWED_SEARCH_QUOTE_TYPES.has(quoteType)) continue;

    const normalized = normalizeFinanceSymbol(String(item.symbol || ''));
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);

    results.push({
      symbol: normalized,
      name: String(item.shortname || item.longname || normalized).trim() || normalized,
      exchange: item.exchDisp || item.exchange || undefined,
      instrumentType: quoteType || undefined,
    });

    if (results.length >= 8) break;
  }

  return results;
}

function setCachedQuote(cacheKey: string, quote: FinanceQuote, nowMs: number): void {
  if (quoteMemoryCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = quoteMemoryCache.keys().next().value;
    if (oldestKey) quoteMemoryCache.delete(oldestKey);
  }
  quoteMemoryCache.set(cacheKey, { quote, expiresAt: nowMs + QUOTE_CACHE_TTL_MS });
}

async function fetchYahooJsonWithFallback(urls: string[]): Promise<any | null> {
  let lastError: unknown = null;
  for (const targetUrl of urls) {
    try {
      const res = await fetchExternal(targetUrl, {
        maxBytes: 1024 * 1024,
        timeoutMs: 8000,
        allowedHosts: ALLOWED_FINANCE_HOSTS,
        headers: FINANCE_HEADERS,
      });
      if (!res.ok) continue;
      return JSON.parse(res.text);
    } catch (err) {
      lastError = err;
    }
  }
  if (lastError) throw lastError;
  return null;
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const refused = refuseOtherSites(context.request);
  if (refused) return refused;

  const url = new URL(context.request.url);
  const queryParam = url.searchParams.get('q');
  const symbolsParam = url.searchParams.get('symbols');

  try {
    if (queryParam !== null) {
      const q = queryParam.trim().slice(0, 40);
      if (!q) {
        return new Response(JSON.stringify({ error: 'Search query cannot be empty' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const encoded = encodeURIComponent(q);
      const payload = await fetchYahooJsonWithFallback([
        `https://query2.finance.yahoo.com/v1/finance/search?q=${encoded}&quotesCount=10&newsCount=0`,
        `https://query1.finance.yahoo.com/v1/finance/search?q=${encoded}&quotesCount=10&newsCount=0`,
      ]);
      const results = payload ? parseYahooSearchResponse(payload) : [];

      return new Response(JSON.stringify({ results }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=300',
        },
      });
    }

    if (symbolsParam !== null) {
      const rawRange = url.searchParams.get('range');
      const range: FinanceRange =
        rawRange === '5d' || rawRange === '1mo' ? rawRange : '1d';
      const interval = RANGE_TO_INTERVAL[range];

      const uniqueSymbols: string[] = [];
      const seen = new Set<string>();
      for (const token of symbolsParam.split(',')) {
        const normalized = normalizeFinanceSymbol(token);
        if (normalized && !seen.has(normalized)) {
          seen.add(normalized);
          uniqueSymbols.push(normalized);
          if (uniqueSymbols.length >= MAX_FINANCE_SYMBOLS) break;
        }
      }

      if (uniqueSymbols.length === 0) {
        return new Response(JSON.stringify({ error: 'No valid ticker symbols provided' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const nowMs = Date.now();
      const quotesBySymbol = new Map<string, FinanceQuote>();
      const symbolsToFetch: string[] = [];

      for (const sym of uniqueSymbols) {
        const key = `${sym}:${range}`;
        const cached = quoteMemoryCache.get(key);
        if (cached && cached.expiresAt > nowMs) {
          quotesBySymbol.set(sym, cached.quote);
        } else {
          symbolsToFetch.push(sym);
        }
      }

      if (symbolsToFetch.length > 0) {
        const fetchedResults = await Promise.allSettled(
          symbolsToFetch.map(async (sym) => {
            const encodedSym = encodeURIComponent(sym);
            const suffix = `?range=${range}&interval=${interval}&includePrePost=false`;
            const payload = await fetchYahooJsonWithFallback([
              `https://query1.finance.yahoo.com/v8/finance/chart/${encodedSym}${suffix}`,
              `https://query2.finance.yahoo.com/v8/finance/chart/${encodedSym}${suffix}`,
            ]);
            const parsed = payload ? parseYahooChartResponse(payload, sym, range) : null;
            return { sym, parsed };
          })
        );

        let firstFetchErr: unknown = null;
        for (const entry of fetchedResults) {
          if (entry.status === 'fulfilled') {
            const { sym, parsed } = entry.value;
            if (parsed) {
              quotesBySymbol.set(sym, parsed);
              setCachedQuote(`${sym}:${range}`, parsed, nowMs);
            }
          } else if (!firstFetchErr) {
            firstFetchErr = entry.reason;
          }
        }

        if (quotesBySymbol.size === 0 && firstFetchErr) {
          const mappedErr = externalFetchErrorResponse(firstFetchErr);
          if (mappedErr) return mappedErr;
        }
      }

      const quotes = uniqueSymbols
        .map((sym) => quotesBySymbol.get(sym))
        .filter((q): q is FinanceQuote => Boolean(q));

      return new Response(
        JSON.stringify({
          quotes,
          range,
          fetchedAt: new Date(nowMs).toISOString(),
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=45, stale-while-revalidate=120',
          },
        }
      );
    }

    return new Response(JSON.stringify({ error: 'Missing "symbols" or "q" query parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    const mappedErr = externalFetchErrorResponse(err);
    if (mappedErr) return mappedErr;
    return new Response(JSON.stringify({ error: err?.message || 'Finance lookup failed' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
