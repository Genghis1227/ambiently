import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeFinanceSymbol,
  downsampleSparkline,
  resolveMarketState,
  parseYahooChartResponse,
  parseYahooSearchResponse,
  onRequestGet,
} from '../functions/api/finance.ts';
import {
  formatQuotePrice,
  formatQuoteChange,
  buildSparklineSvgPaths,
  isIndexQuote,
} from '../src/services/finance.ts';

describe('/api/finance parser and validation helpers', () => {
  it('normalizes valid symbols and rejects malformed tickers', () => {
    assert.equal(normalizeFinanceSymbol(' aapl '), 'AAPL');
    assert.equal(normalizeFinanceSymbol('^gspc'), '^GSPC');
    assert.equal(normalizeFinanceSymbol('brk-b'), 'BRK-B');
    assert.equal(normalizeFinanceSymbol('btc-usd'), 'BTC-USD');
    assert.equal(normalizeFinanceSymbol('eurusd=x'), 'EURUSD=X');

    assert.equal(normalizeFinanceSymbol(''), null);
    assert.equal(normalizeFinanceSymbol('../etc/passwd'), null);
    assert.equal(normalizeFinanceSymbol('AAPL;DROP'), null);
    assert.equal(normalizeFinanceSymbol('VERYLONGTICKERSYMBOL123'), null);
  });

  it('downsamples sparklines preserving first and last values and handles sparse points', () => {
    assert.deepEqual(downsampleSparkline([], 125.5), [125.5, 125.5]);
    assert.deepEqual(downsampleSparkline([null, undefined, -1, 100], 102), [100, 102]);

    const raw = Array.from({ length: 64 }, (_, i) => 100 + i);
    const sampled = downsampleSparkline(raw, 163, 16);
    assert.equal(sampled.length, 16);
    assert.equal(sampled[0], 100);
    assert.equal(sampled[sampled.length - 1], 163);
  });

  it('resolves market state for crypto and equity trading periods', () => {
    assert.equal(resolveMarketState({ instrumentType: 'CRYPTOCURRENCY' }, 1000), 'OPEN');

    const periods = {
      pre: { start: 100, end: 200 },
      regular: { start: 200, end: 500 },
      post: { start: 500, end: 700 },
    };
    assert.equal(resolveMarketState({ instrumentType: 'EQUITY', currentTradingPeriod: periods }, 150), 'PRE');
    assert.equal(resolveMarketState({ instrumentType: 'EQUITY', currentTradingPeriod: periods }, 300), 'OPEN');
    assert.equal(resolveMarketState({ instrumentType: 'EQUITY', currentTradingPeriod: periods }, 600), 'POST');
    assert.equal(resolveMarketState({ instrumentType: 'EQUITY', currentTradingPeriod: periods }, 800), 'CLOSED');
  });

  it('computes 1d previousClose vs 5d/1mo chartPreviousClose delta math and index quotes', () => {
    const samplePayload = {
      chart: {
        result: [
          {
            meta: {
              symbol: '^GSPC',
              shortName: 'S&P 500',
              fullExchangeName: 'SNP',
              instrumentType: 'INDEX',
              currency: 'USD',
              regularMarketPrice: 7561.67,
              previousClose: 7592.4,
              chartPreviousClose: 7400.0,
              regularMarketDayHigh: 7600.1,
              regularMarketDayLow: 7520.2,
              currentTradingPeriod: {
                pre: { start: 100, end: 200 },
                regular: { start: 200, end: 500 },
                post: { start: 500, end: 700 },
              },
            },
            indicators: {
              quote: [{ close: [7540, null, 7555, 7561.67] }],
            },
          },
        ],
      },
    };

    const q1d = parseYahooChartResponse(samplePayload, '^GSPC', '1d', 300);
    assert.ok(q1d);
    assert.equal(q1d.symbol, '^GSPC');
    assert.equal(q1d.marketState, 'OPEN');
    assert.equal(q1d.previousClose, 7592.4);
    assert.ok(Math.abs(q1d.change - (7561.67 - 7592.4)) < 1e-6);

    const q5d = parseYahooChartResponse(samplePayload, '^GSPC', '5d', 800);
    assert.ok(q5d);
    assert.equal(q5d.marketState, 'CLOSED');
    assert.equal(q5d.previousClose, 7400.0);
    assert.ok(Math.abs(q5d.change - 161.67) < 1e-6);
    assert.deepEqual(q5d.sparkline, [7540, 7555, 7561.67]);
  });

  it('parses and filters search suggestions safely', () => {
    const parsed = parseYahooSearchResponse({
      quotes: [
        { symbol: 'NVDA', shortname: 'NVIDIA Corporation', quoteType: 'EQUITY', exchDisp: 'NASDAQ' },
        { symbol: 'NVDA', shortname: 'Duplicate', quoteType: 'EQUITY' },
        { symbol: 'BAD OPTION', quoteType: 'OPTION' },
        { symbol: 'BTC-USD', shortname: 'Bitcoin USD', quoteType: 'CRYPTOCURRENCY', exchDisp: 'CCC' },
      ],
    });
    assert.deepEqual(parsed, [
      { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', instrumentType: 'EQUITY' },
      { symbol: 'BTC-USD', name: 'Bitcoin USD', exchange: 'CCC', instrumentType: 'CRYPTOCURRENCY' },
    ]);
  });

  it('enforces cross-site blocking and parameter validation in onRequestGet', async () => {
    const crossSiteRes = await onRequestGet({
      request: new Request('https://example.com/api/finance?symbols=SPY', {
        headers: { 'Sec-Fetch-Site': 'cross-site' },
      }),
    });
    assert.equal(crossSiteRes.status, 403);

    const missingParamRes = await onRequestGet({
      request: new Request('https://example.com/api/finance'),
    });
    assert.equal(missingParamRes.status, 400);

    const badSymbolsRes = await onRequestGet({
      request: new Request('https://example.com/api/finance?symbols=@@@,!!!'),
    });
    assert.equal(badSymbolsRes.status, 400);

    const emptySearchRes = await onRequestGet({
      request: new Request('https://example.com/api/finance?q=%20%20'),
    });
    assert.equal(emptySearchRes.status, 400);
  });
});

describe('finance client formatting and SVG sparkline paths', () => {
  it('formats index, USD equity, and sub-dollar prices properly', () => {
    assert.equal(isIndexQuote('^GSPC', 'INDEX'), true);
    assert.equal(isIndexQuote('SPY', 'ETF'), false);

    assert.equal(formatQuotePrice(7561.67, 'USD', '^GSPC', 'INDEX'), '7,561.67');
    assert.equal(formatQuotePrice(356.27, 'USD', 'AAPL', 'EQUITY'), '$356.27');
    assert.equal(formatQuotePrice(0.1842, 'USD', 'DOGE-USD', 'CRYPTOCURRENCY'), '$0.1842');
    assert.equal(formatQuotePrice(123.45, 'EUR', 'SAP.DE', 'EQUITY'), '€123.45');
  });

  it('formats positive, negative, and flat price changes cleanly', () => {
    const pos = formatQuoteChange(4.25, 1.85, true, false);
    assert.equal(pos.isPositive, true);
    assert.equal(pos.isFlat, false);
    assert.equal(pos.deltaText, '+$4.25');
    assert.equal(pos.pctText, '+1.85%');
    assert.equal(pos.combinedText, '+$4.25 (+1.85%)');

    const negIndex = formatQuoteChange(-30.73, -0.4, false, true);
    assert.equal(negIndex.isPositive, false);
    assert.equal(negIndex.deltaText, '-30.73');
    assert.equal(negIndex.pctText, '-0.40%');
    assert.equal(negIndex.combinedText, '-0.40%');

    const flat = formatQuoteChange(0.0001, 0.001, true, false);
    assert.equal(flat.isFlat, true);
    assert.equal(flat.pctText, '0.00%');
  });

  it('builds valid SVG paths for rising, falling, flat, and single-point sparklines', () => {
    const gain = buildSparklineSvgPaths([100, 105, 110], 80, 28, 3);
    assert.ok(gain.linePath.startsWith('M 0 '));
    assert.ok(gain.areaPath.endsWith('L 80 28 L 0 28 Z'));
    assert.equal(gain.linePath.includes('NaN'), false);

    const flat = buildSparklineSvgPaths([50, 50, 50], 80, 28, 3);
    assert.equal(flat.linePath, 'M 0 14 L 40 14 L 80 14');

    const single = buildSparklineSvgPaths([42], 80, 28, 3);
    assert.equal(single.linePath, 'M 0 14 L 80 14');

    const empty = buildSparklineSvgPaths([], 80, 28, 3);
    assert.equal(empty.linePath, '');
    assert.equal(empty.areaPath, '');
  });
});
