export type FinanceRange = '1d' | '5d' | '1mo';

export type FinanceDisplayMode = 'auto' | 'list' | 'grid' | 'ticker';

export type FinanceMarketState = 'OPEN' | 'PRE' | 'POST' | 'CLOSED';

export interface FinanceWatchlistItem {
  symbol: string;
  label?: string;
}

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

export interface FinanceWidgetConfig {
  watchlist?: FinanceWatchlistItem[];
  range?: FinanceRange;
  displayMode?: FinanceDisplayMode;
  showSparkline?: boolean;
  showAbsoluteChange?: boolean;
  refreshIntervalMin?: 1 | 5 | 15;
  transparentBg?: boolean;
}

export const MAX_FINANCE_SYMBOLS = 15;

export const DEFAULT_FINANCE_WATCHLIST: FinanceWatchlistItem[] = [
  { symbol: 'SPY', label: 'S&P 500 ETF' },
  { symbol: 'QQQ', label: 'Nasdaq 100' },
  { symbol: 'AAPL', label: 'Apple' },
  { symbol: 'NVDA', label: 'NVIDIA' },
  { symbol: 'BTC-USD', label: 'Bitcoin' },
];

export const FINANCE_PRESET_BUNDLES: Array<{
  id: string;
  label: string;
  items: FinanceWatchlistItem[];
}> = [
  {
    id: 'default',
    label: 'Default Mix',
    items: DEFAULT_FINANCE_WATCHLIST,
  },
  {
    id: 'indices',
    label: 'US Indices',
    items: [
      { symbol: '^GSPC', label: 'S&P 500' },
      { symbol: '^DJI', label: 'Dow 30' },
      { symbol: '^IXIC', label: 'Nasdaq' },
      { symbol: '^RUT', label: 'Russell 2000' },
    ],
  },
  {
    id: 'tech',
    label: 'Big Tech',
    items: [
      { symbol: 'AAPL', label: 'Apple' },
      { symbol: 'MSFT', label: 'Microsoft' },
      { symbol: 'NVDA', label: 'NVIDIA' },
      { symbol: 'GOOGL', label: 'Alphabet' },
      { symbol: 'AMZN', label: 'Amazon' },
      { symbol: 'META', label: 'Meta' },
    ],
  },
  {
    id: 'etfs',
    label: 'Popular ETFs',
    items: [
      { symbol: 'SPY', label: 'S&P 500 ETF' },
      { symbol: 'QQQ', label: 'Nasdaq 100' },
      { symbol: 'VTI', label: 'Total Stock' },
      { symbol: 'SCHD', label: 'US Dividend' },
      { symbol: 'GLD', label: 'Gold Trust' },
    ],
  },
  {
    id: 'crypto',
    label: 'Crypto',
    items: [
      { symbol: 'BTC-USD', label: 'Bitcoin' },
      { symbol: 'ETH-USD', label: 'Ethereum' },
      { symbol: 'SOL-USD', label: 'Solana' },
    ],
  },
];
