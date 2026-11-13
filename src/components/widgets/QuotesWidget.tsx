import React, { useState, useMemo, useEffect } from 'react';
import { Quote, RefreshCw } from 'lucide-react';
import { CURATED_QUOTES, type QuoteItem } from '../../services/quotes';

interface QuotesWidgetProps {
  customQuotes?: QuoteItem[];
  quoteMode?: 'curated' | 'custom' | 'both';
  rotationIntervalSec?: number; // update interval in seconds (0 = manual, 30, 60, 300, 900, 1800, 3600, 14400, 86400)
  isLight?: boolean;
  transparentBg?: boolean;
}

export const QuotesWidget: React.FC<QuotesWidgetProps> = ({
  customQuotes = [],
  quoteMode = 'both',
  rotationIntervalSec = 3600,
  isLight = false,
  transparentBg = false,
}) => {
  const pool = useMemo(() => {
    if (quoteMode === 'custom' && customQuotes.length > 0) {
      return customQuotes;
    }
    if (quoteMode === 'curated') {
      return CURATED_QUOTES;
    }
    return [...customQuotes, ...CURATED_QUOTES];
  }, [customQuotes, quoteMode]);

  const intervalSec = rotationIntervalSec ?? 3600;

  // Compute time block index so synchronized displays show the same quote
  const timeBlock = useMemo(() => {
    if (intervalSec <= 0) return 0;
    return Math.floor(Date.now() / (intervalSec * 1000));
  }, [intervalSec]);

  const [offset, setOffset] = useState(0);
  const [currentBlock, setCurrentBlock] = useState(timeBlock);
  const [isFading, setIsFading] = useState(false);

  // Sync currentBlock if intervalSec or wall-clock block changes
  useEffect(() => {
    setCurrentBlock(timeBlock);
  }, [timeBlock]);

  // Automatic rotation timer
  useEffect(() => {
    if (intervalSec <= 0 || pool.length <= 1) return;

    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      setIsFading(true);
      setTimeout(() => {
        setCurrentBlock((prev) => prev + 1);
        setIsFading(false);
      }, 300);
    }, intervalSec * 1000);

    return () => clearInterval(timer);
  }, [intervalSec, pool.length]);

  const cycleNext = () => {
    if (pool.length <= 1) return;
    setIsFading(true);
    setTimeout(() => {
      setOffset((prev) => prev + 1);
      setIsFading(false);
    }, 200);
  };

  const quoteIndex = pool.length > 0 ? Math.abs((currentBlock + offset) % pool.length) : 0;
  const activeQuote = pool[quoteIndex] || CURATED_QUOTES[0];

  const headerTitle =
    intervalSec >= 86400
      ? 'Thought of the Day'
      : intervalSec === 3600
      ? 'Thought of the Hour'
      : intervalSec <= 0
      ? 'Quote Collection'
      : 'Inspiration & Quotes';

  const formatIntervalLabel = (sec: number) => {
    if (sec <= 0) return 'Manual';
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.round(sec / 60)}m`;
    if (sec < 86400) return `${Math.round(sec / 3600)}h`;
    return 'Daily';
  };

  const stickerShadow = transparentBg && !isLight ? 'drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]' : '';

  return (
    <div className={`w-full h-full flex flex-col justify-between p-1 select-none ${stickerShadow}`}>
      <div className="flex items-center justify-between pr-16">
        <div className={`flex items-center gap-1.5 text-xs tracking-wider uppercase ${
          isLight ? 'text-amber-800 font-bold' : 'text-amber-400/90 font-semibold'
        }`}>
          <Quote className="w-3.5 h-3.5" />
          <span>{headerTitle}</span>
        </div>
        {pool.length > 1 && (
          <button
            type="button"
            onClick={cycleNext}
            title="Cycle to next quote"
            className={`p-1 rounded-lg transition-colors cursor-pointer ${
              isLight
                ? 'text-slate-400 hover:text-slate-800 hover:bg-slate-200'
                : 'text-gray-400 hover:text-amber-300 hover:bg-gray-800/60'
            }`}
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        )}
      </div>

      <div
        className={`my-auto py-2 overflow-y-auto transition-opacity duration-300 ${
          isFading ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <blockquote className={`text-sm md:text-base font-serif italic leading-snug ${
          isLight ? 'text-slate-800 font-normal' : 'text-gray-100'
        }`}>
          "{activeQuote.quote}"
        </blockquote>
        <div className={`text-right mt-2 text-xs font-medium ${
          isLight ? 'text-amber-800 font-bold' : 'text-amber-300/90'
        }`}>
          — {activeQuote.author || 'Family Motto'}
        </div>
      </div>

      <div className={`flex items-center justify-between text-[10px] font-mono ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
        <div className={`h-0.5 w-12 rounded-full ${transparentBg ? 'bg-transparent' : isLight ? 'bg-amber-600/30' : 'bg-amber-500/30'}`} />
        <div className="flex items-center gap-2">
          {intervalSec > 0 && (
            <span className={`px-1.5 py-0.5 rounded border ${
              transparentBg
                ? isLight
                  ? 'bg-transparent text-amber-800 border-transparent'
                  : 'bg-transparent text-amber-300/80 border-transparent'
                : isLight
                ? 'bg-slate-100 text-amber-800 border-amber-300/40'
                : 'bg-gray-800/80 text-amber-400/70 border-amber-500/10'
            }`}>
              ⏱ {formatIntervalLabel(intervalSec)}
            </span>
          )}
          {pool.length > 0 && (
            <span>
              {pool.length} {pool.length === 1 ? 'quote' : 'quotes'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
