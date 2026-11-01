import React, { useState, useEffect } from 'react';
import { Quote } from 'lucide-react';
import { getQuoteForToday, type QuoteItem } from '../../services/quotes';

export const QuotesWidget: React.FC = () => {
  const [quote, setQuote] = useState<QuoteItem | null>(null);

  useEffect(() => {
    setQuote(getQuoteForToday());
  }, []);

  if (!quote) return null;

  return (
    <div className="w-full h-full flex flex-col justify-between p-1 select-none">
      <div className="flex items-center gap-1.5 text-xs text-amber-400/80 font-semibold tracking-wider uppercase">
        <Quote className="w-3.5 h-3.5" />
        Thought of the Day
      </div>

      <div className="my-auto py-2">
        <blockquote className="text-sm md:text-base font-serif italic text-gray-200 leading-snug">
          "{quote.quote}"
        </blockquote>
        <div className="text-right mt-2 text-xs font-medium text-amber-300/80">
          — {quote.author}
        </div>
      </div>

      <div className="h-0.5 w-12 bg-amber-500/30 rounded-full" />
    </div>
  );
};
