import React, { useState, useEffect, useRef } from 'react';
import { Rss, ExternalLink, RefreshCw } from 'lucide-react';
import { fetchRssFeed, type RssArticle } from '../../services/feeds';
import { CURATED_RSS_FEEDS } from '../../data/curatedFeeds';

interface RssWidgetProps {
  feedUrl?: string;
  displayMode?: 'ticker' | 'list';
  textSize?: 'auto' | 'sm' | 'base' | 'lg' | 'xl';
  showSnippet?: boolean;
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

function formatArticleDate(dateStr?: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const diffHours = (Date.now() - d.getTime()) / (1000 * 60 * 60);
    if (diffHours >= 0 && diffHours < 1) {
      const min = Math.max(1, Math.round(diffHours * 60));
      return `${min}m ago`;
    }
    if (diffHours >= 1 && diffHours < 24) {
      return `${Math.round(diffHours)}h ago`;
    }
    if (diffHours >= 24 && diffHours < 48) {
      return 'Yesterday';
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export const RssWidget: React.FC<RssWidgetProps> = ({
  feedUrl = 'https://tony.trinhism.com/index.xml',
  textSize = 'auto',
  showSnippet = true,
  onUpdateConfig,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({
    width: 0,
    height: 0,
  });

  const [feedTitle, setFeedTitle] = useState("Tony's Tipbits");
  const [articles, setArticles] = useState<RssArticle[]>([]);
  const [loading, setLoading] = useState(false);

  // Measure container dimensions adaptively as tile resizes or enters fullscreen
  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    updateSize();

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          setContainerSize({ width, height });
        }
      });
      ro.observe(containerRef.current);
      return () => ro.disconnect();
    }
  }, []);

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

  // Adaptive size tier based on container dimensions
  const effectiveSize: 'sm' | 'base' | 'lg' | 'xl' = (() => {
    if (textSize && textSize !== 'auto') {
      return textSize;
    }
    const { width, height } = containerSize;
    if (width === 0 && height === 0) return 'base';
    if (width >= 850 || height >= 600) return 'xl';
    if (width >= 540 || height >= 420) return 'lg';
    if (width < 320 || height < 220) return 'sm';
    return 'base';
  })();

  // Multi-column grid layout for wide containers
  const layoutClass = (() => {
    const { width } = containerSize;
    if (width >= 1050) return 'grid grid-cols-1 md:grid-cols-3 gap-3.5';
    if (width >= 580) return 'grid grid-cols-1 md:grid-cols-2 gap-3';
    return 'flex flex-col space-y-2';
  })();

  const sizeStyles = {
    sm: {
      card: 'p-2 rounded-xl',
      title: 'text-xs font-semibold leading-snug line-clamp-2',
      desc: 'text-[11px] text-gray-400 line-clamp-2 mt-1 leading-relaxed',
      header: 'text-xs',
      date: 'text-[9px] text-gray-500',
      icon: 'w-3 h-3',
      headerIcon: 'w-3.5 h-3.5',
    },
    base: {
      card: 'p-2.5 md:p-3 rounded-xl',
      title: 'text-xs md:text-sm font-semibold leading-snug line-clamp-2 md:line-clamp-3',
      desc: 'text-[11px] md:text-xs text-gray-300 line-clamp-2 md:line-clamp-3 mt-1 leading-relaxed',
      header: 'text-xs md:text-sm',
      date: 'text-[10px] md:text-[11px] text-gray-400 font-medium',
      icon: 'w-3.5 h-3.5',
      headerIcon: 'w-4 h-4',
    },
    lg: {
      card: 'p-3.5 md:p-4 rounded-2xl',
      title: 'text-sm md:text-base font-bold leading-snug line-clamp-3',
      desc: 'text-xs md:text-sm text-gray-300 line-clamp-3 md:line-clamp-4 mt-1.5 leading-relaxed',
      header: 'text-sm md:text-base font-bold',
      date: 'text-xs text-orange-400/90 font-medium',
      icon: 'w-4 h-4',
      headerIcon: 'w-4.5 h-4.5',
    },
    xl: {
      card: 'p-4 md:p-5 rounded-2xl',
      title: 'text-base md:text-xl font-extrabold leading-snug line-clamp-3 md:line-clamp-4',
      desc: 'text-sm md:text-base text-gray-200 line-clamp-4 mt-2 leading-relaxed',
      header: 'text-base md:text-lg font-bold',
      date: 'text-xs md:text-sm text-orange-400 font-semibold',
      icon: 'w-5 h-5',
      headerIcon: 'w-5 h-5',
    },
  }[effectiveSize];

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col justify-between overflow-hidden select-none">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-800/80 pb-2 mb-2 pr-28">
        <div className="flex items-center gap-2 min-w-0">
          <Rss className={`${sizeStyles.headerIcon} text-orange-400 shrink-0`} />
          <span className={`${sizeStyles.header} font-bold text-white uppercase tracking-wider truncate`}>
            {feedTitle}
          </span>
        </div>
        <button
          onClick={loadFeed}
          disabled={loading}
          title="Refresh RSS feed"
          className="p-1 rounded text-gray-400 hover:text-white hover:bg-gray-800 shrink-0 transition-colors cursor-pointer"
        >
          <RefreshCw className={`${sizeStyles.headerIcon} ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Articles List / Responsive Grid */}
      <div className="flex-1 overflow-y-auto pr-1">
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
          <div className={layoutClass}>
            {articles.map((item) => (
              <a
                key={item.id}
                href={item.link || '#'}
                target="_blank"
                rel="noopener noreferrer"
                className={`group block ${sizeStyles.card} bg-gray-950/40 border border-gray-800/60 hover:border-orange-500/50 hover:bg-gray-900/40 transition-all shadow-xs`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className={`${sizeStyles.title} text-gray-200 group-hover:text-orange-400 transition-colors`}>
                    {item.title}
                  </span>
                  <ExternalLink className={`${sizeStyles.icon} text-gray-600 group-hover:text-orange-400 shrink-0 mt-0.5 transition-colors`} />
                </div>
                {showSnippet && item.description && (
                  <p className={sizeStyles.desc}>
                    {item.description}
                  </p>
                )}
                {item.pubDate && (
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className={`${sizeStyles.date} font-mono tracking-wide`}>
                      {formatArticleDate(item.pubDate)}
                    </span>
                  </div>
                )}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
