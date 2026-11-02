import React, { useState, useMemo } from 'react';
import { Quote, RefreshCw } from 'lucide-react';
import { CURATED_QUOTES, type QuoteItem } from '../../services/quotes';

interface QuotesWidgetProps {
  customQuotes?: QuoteItem[];
  quoteMode?: 'curated' | 'custom' | 'both';
}

export const QuotesWidget: React.FC<QuotesWidgetProps> = ({
  customQuotes = [],
  quoteMode = 'both',
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

  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 1000 / 60 / 60 / 24
  );

  const [offset, setOffset] = useState(0);
  const activeQuote = pool[(dayOfYear + offset) % pool.length] || CURATED_QUOTES[0];

  return (
    <div className="w-full h-full flex flex-col justify-between p-1 select-none">
      <div className="flex items-center justify-between pr-16">
        <div className="flex items-center gap-1.5 text-xs text-amber-400/80 font-semibold tracking-wider uppercase">
          <Quote className="w-3.5 h-3.5" />
          <span>Thought of the Day</span>
        </div>
        {pool.length > 1 && (
          <button
            type="button"
            onClick={() => setOffset((prev) => prev + 1)}
            title="Cycle to next quote"
            className="p-1 rounded-lg text-gray-500 hover:text-amber-300 hover:bg-gray-800/60 transition-colors cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="my-auto py-2 overflow-y-auto">
        <blockquote className="text-sm md:text-base font-serif italic text-gray-200 leading-snug">
          "{activeQuote.quote}"
        </blockquote>
        <div className="text-right mt-2 text-xs font-medium text-amber-300/80">
          — {activeQuote.author || 'Family Motto'}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="h-0.5 w-12 bg-amber-500/30 rounded-full" />
        {customQuotes.length > 0 && (
          <span className="text-[10px] text-gray-500 font-mono">
            {pool.length} quotes in rotation
          </span>
        )}
      </div>
    </div>
  );
};
