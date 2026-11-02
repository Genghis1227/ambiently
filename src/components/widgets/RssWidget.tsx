import React, { useState, useEffect } from 'react';
import { Rss, ExternalLink, RefreshCw } from 'lucide-react';
import { fetchRssFeed, type RssArticle } from '../../services/feeds';

interface RssWidgetProps {
  feedUrl?: string;
  displayMode?: 'ticker' | 'list';
}

export const RssWidget: React.FC<RssWidgetProps> = ({
  feedUrl = 'https://news.ycombinator.com/rss',
}) => {
  const [feedTitle, setFeedTitle] = useState('News Feed');
  const [articles, setArticles] = useState<RssArticle[]>([]);
  const [loading, setLoading] = useState(false);

  const loadFeed = async () => {
    setLoading(true);
    try {
      const data = await fetchRssFeed(feedUrl);
      if (data.title) setFeedTitle(data.title);
      setArticles(data.items || []);
    } catch (err) {
      console.warn('RSS load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFeed();
  }, [feedUrl]);

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
          className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Articles List / Ticker */}
      <div className="flex-1 overflow-y-auto space-y-2 pr-1">
        {articles.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 text-xs py-8">
            <span>{loading ? 'Fetching headlines...' : 'No articles found'}</span>
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
                <p className="text-[11px] text-gray-500 line-clamp-2 mt-1">
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
