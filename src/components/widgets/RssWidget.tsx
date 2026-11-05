import React, { useState, useEffect } from 'react';
import { Rss, ExternalLink, RefreshCw } from 'lucide-react';
import { fetchRssFeed, type RssArticle } from '../../services/feeds';
import { CURATED_RSS_FEEDS } from '../../data/curatedFeeds';

interface RssWidgetProps {
  feedUrl?: string;
  displayMode?: 'ticker' | 'list';
  onUpdateConfig?: (updates: Record<string, any>) => void;
}

function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&copy;/g, '©')
    .replace(/&reg;/g, '®')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&bull;/g, '•')
    .trim();
}

export const RssWidget: React.FC<RssWidgetProps> = ({
  feedUrl = 'https://tony.trinhism.com/index.xml',
  onUpdateConfig,
}) => {
  const [feedTitle, setFeedTitle] = useState("Tony's Tipbits");
  const [articles, setArticles] = useState<RssArticle[]>([]);
  const [loading, setLoading] = useState(false);

  const loadFeed = async () => {
    setLoading(true);
    try {
      const data = await fetchRssFeed(feedUrl);
      if (data.title) setFeedTitle(decodeHtmlEntities(data.title));
      setArticles(
        (data.items || []).map((item) => ({
          ...item,
          title: decodeHtmlEntities(item.title),
          description: decodeHtmlEntities(item.description),
        }))
      );
    } catch (err) {
      console.warn('RSS load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeed();
    const interval = setInterval(loadFeed, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [feedUrl]);

  const handleSelectSuggestedFeed = (url: string) => {
    if (onUpdateConfig) {
      onUpdateConfig({ feedUrl: url });
    }
  };

  return (
    <div className="w-full h-full flex flex-col justify-between overflow-hidden select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800/80 pb-2 mb-2 pr-28">
        <div className="flex items-center gap-2 min-w-0">
          <Rss className="w-4 h-4 text-orange-400 shrink-0" />
          <span className="text-xs font-bold text-white uppercase tracking-wider truncate">
            {feedTitle}
          </span>
        </div>
        <button
          onClick={loadFeed}
          disabled={loading}
          title="Refresh RSS feed"
          className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800 shrink-0 transition-colors cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Articles List / Ticker */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {articles.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 text-xs py-8 text-center space-y-3">
            <span>{loading ? 'Fetching headlines...' : 'No articles found for this feed'}</span>
            {!loading && (
              <div className="flex flex-col items-center gap-1.5 pt-1">
                <span className="text-[11px] text-gray-400">Try one of these recommended feeds:</span>
                <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-xs">
                  {CURATED_RSS_FEEDS.slice(0, 4).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => handleSelectSuggestedFeed(f.url)}
                      className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-gray-900 hover:bg-gray-800 text-orange-300 border border-gray-700/80 transition-all cursor-pointer shadow-xs"
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          articles.map((item) => (
            <a
              key={item.id}
              href={item.link || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="group block p-2 rounded-xl bg-gray-950/40 border border-gray-800/60 hover:border-orange-500/50 hover:bg-gray-900/40 transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-xs font-semibold text-gray-200 group-hover:text-orange-400 line-clamp-2 transition-colors">
                  {item.title}
                </span>
                <ExternalLink className="w-3 h-3 text-gray-600 group-hover:text-orange-400 shrink-0 mt-0.5" />
              </div>
              {item.description && (
                <p className="text-[11px] text-gray-400 line-clamp-2 mt-1 leading-relaxed">
                  {item.description}
                </p>
              )}
            </a>
          ))
        )}
      </div>
    </div>
  );
};
