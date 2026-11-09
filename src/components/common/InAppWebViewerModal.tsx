import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, RotateCw, Globe, BookOpen, Loader2, Calendar, User, Clock, AlertCircle } from 'lucide-react';

export interface InAppWebViewerModalProps {
  isOpen: boolean;
  url: string | null;
  title?: string;
  onClose: () => void;
}

export interface ReaderArticle {
  title: string;
  byline?: string | null;
  siteName?: string | null;
  publishedTime?: string | null;
  leadImageUrl?: string | null;
  excerpt?: string | null;
  contentHtml: string;
  textContent?: string;
  readingTimeMinutes?: number;
  isSummaryOnly?: boolean;
  canEmbedDirectly?: boolean;
  url: string;
}

export const InAppWebViewerModal: React.FC<InAppWebViewerModalProps> = ({
  isOpen,
  url: initialUrl,
  title: initialTitle,
  onClose,
}) => {
  const [currentUrl, setCurrentUrl] = useState<string | null>(initialUrl);
  const [currentTitle, setCurrentTitle] = useState<string | undefined>(initialTitle);
  const [viewMode, setViewMode] = useState<'reader' | 'web'>('reader');

  // Reader Mode state
  const [article, setArticle] = useState<ReaderArticle | null>(null);
  const [isReaderLoading, setIsReaderLoading] = useState(false);
  const [readerError, setReaderError] = useState<string | null>(null);

  // Web View state
  const [isWebLoading, setIsWebLoading] = useState(true);
  const [iframeKey, setIframeKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Synchronize when modal is opened with new props
  useEffect(() => {
    if (isOpen && initialUrl) {
      setCurrentUrl(initialUrl);
      setCurrentTitle(initialTitle);
      setViewMode('reader');
      setArticle(null);
      setReaderError(null);
    }
  }, [isOpen, initialUrl, initialTitle]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Fetch article for Reader Mode
  const loadReaderArticle = useCallback(async (targetUrl: string) => {
    setIsReaderLoading(true);
    setReaderError(null);

    try {
      let res = await fetch(`/api/reader?url=${encodeURIComponent(targetUrl.trim())}`);
      if (res.status === 404) {
        res = await fetch(`/functions/api/reader?url=${encodeURIComponent(targetUrl.trim())}`);
      }

      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        throw new Error('Reader service is unavailable on this host.');
      }

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Reader service answered ${res.status}`);
      }

      setArticle(data);
      if (data.title && !currentTitle) {
        setCurrentTitle(data.title);
      }
    } catch (err) {
      setReaderError(err instanceof Error ? err.message : 'Could not extract article text.');
    } finally {
      setIsReaderLoading(false);
    }
  }, [currentTitle]);

  // Load reader article when url changes or modal opens
  useEffect(() => {
    if (isOpen && currentUrl) {
      loadReaderArticle(currentUrl);
    }
  }, [isOpen, currentUrl, loadReaderArticle]);

  if (!isOpen || !currentUrl) return null;

  let domain = '';
  try {
    const parsed = new URL(currentUrl);
    domain = parsed.hostname.replace(/^www\./, '');
  } catch {
    domain = currentUrl;
  }

  const handleReload = () => {
    if (viewMode === 'reader') {
      loadReaderArticle(currentUrl);
    } else {
      setIsWebLoading(true);
      setIframeKey((prev) => prev + 1);
    }
  };

  // Intercept links inside reader mode to stay within the modal
  const handleReaderContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

    e.preventDefault();
    e.stopPropagation();

    try {
      const absUrl = new URL(href, currentUrl).href;
      setCurrentUrl(absUrl);
      setCurrentTitle(anchor.innerText.trim() || undefined);
    } catch {
      // Ignore malformed href
    }
  };

  // If the destination server does not block iframes (no X-Frame-Options or CSP frame-ancestors),
  // load it directly for 100% native styles and interactivity; otherwise route through /api/web-proxy.
  const webIframeSrc = article?.canEmbedDirectly
    ? currentUrl
    : `/api/web-proxy?url=${encodeURIComponent(currentUrl)}`;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[9980] bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-200 select-none"
    >
      <style>{`
        .ambiently-reader-body p {
          margin-bottom: 1.25rem;
          line-height: 1.8;
          color: #e2e8f0;
        }
        .ambiently-reader-body h1,
        .ambiently-reader-body h2 {
          font-size: 1.5rem;
          font-weight: 700;
          color: #ffffff;
          margin-top: 2rem;
          margin-bottom: 0.75rem;
          line-height: 1.3;
        }
        .ambiently-reader-body h3,
        .ambiently-reader-body h4 {
          font-size: 1.25rem;
          font-weight: 600;
          color: #f1f5f9;
          margin-top: 1.5rem;
          margin-bottom: 0.5rem;
        }
        .ambiently-reader-body img {
          border-radius: 0.875rem;
          max-width: 100%;
          height: auto;
          margin: 1.5rem auto;
          display: block;
          border: 1px solid #1e293b;
        }
        .ambiently-reader-body figure {
          margin: 1.5rem 0;
        }
        .ambiently-reader-body figcaption {
          font-size: 0.75rem;
          color: #94a3b8;
          text-align: center;
          margin-top: 0.5rem;
        }
        .ambiently-reader-body blockquote {
          border-left: 3px solid #3b82f6;
          padding-left: 1rem;
          font-style: italic;
          color: #93c5fd;
          margin: 1.5rem 0;
          background: rgba(59, 130, 246, 0.05);
          padding-top: 0.5rem;
          padding-bottom: 0.5rem;
          border-radius: 0 0.5rem 0.5rem 0;
        }
        .ambiently-reader-body ul {
          list-style-type: disc;
          margin-bottom: 1.25rem;
          padding-left: 1.5rem;
          color: #cbd5e1;
        }
        .ambiently-reader-body ol {
          list-style-type: decimal;
          margin-bottom: 1.25rem;
          padding-left: 1.5rem;
          color: #cbd5e1;
        }
        .ambiently-reader-body li {
          margin-bottom: 0.5rem;
          line-height: 1.7;
        }
        .ambiently-reader-body a {
          color: #60a5fa;
          text-decoration: underline;
          text-underline-offset: 3px;
          cursor: pointer;
        }
        .ambiently-reader-body a:hover {
          color: #93c5fd;
        }
        .ambiently-reader-body table {
          width: 100%;
          border-collapse: collapse;
          margin: 1.5rem 0;
          font-size: 0.9rem;
        }
        .ambiently-reader-body th,
        .ambiently-reader-body td {
          border: 1px solid #1e293b;
          padding: 0.6rem 0.75rem;
          text-align: left;
          color: #cbd5e1;
        }
        .ambiently-reader-body th {
          background: rgba(30, 41, 59, 0.6);
          color: #f8fafc;
          font-weight: 600;
        }
        .ambiently-reader-body pre {
          background: #0f172a;
          border: 1px solid #1e293b;
          border-radius: 0.75rem;
          padding: 1rem;
          overflow-x: auto;
          margin: 1.25rem 0;
          font-size: 0.85rem;
          color: #e2e8f0;
        }
        .ambiently-reader-body code {
          background: rgba(30, 41, 59, 0.7);
          padding: 0.15rem 0.35rem;
          border-radius: 0.35rem;
          font-size: 0.875em;
          color: #93c5fd;
        }
        .ambiently-reader-body pre code {
          background: transparent;
          padding: 0;
          color: inherit;
        }
        .ambiently-reader-body hr {
          border: 0;
          border-top: 1px solid #1e293b;
          margin: 2rem 0;
        }
      `}</style>

      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-6xl h-[92vh] max-h-[920px] rounded-2xl md:rounded-3xl bg-gray-950 border border-gray-800 shadow-2xl flex flex-col overflow-hidden text-white animate-in zoom-in-95 duration-200"
      >
        {/* Pinned Window Chrome Header Bar */}
        <div className="h-14 px-3 sm:px-4 bg-gray-900/95 border-b border-gray-800/80 flex items-center justify-between gap-2 sm:gap-3 shrink-0 z-20">
          {/* Left: Icon & Title / Domain */}
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center justify-center shrink-0">
              {viewMode === 'reader' ? <BookOpen className="w-4 h-4" /> : <Globe className="w-4 h-4" />}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-xs sm:text-sm text-white truncate max-w-[140px] xs:max-w-xs sm:max-w-md">
                {currentTitle || article?.title || domain}
              </span>
              <span className="text-[10px] text-gray-400 font-mono truncate max-w-[130px] xs:max-w-[200px] sm:max-w-[320px]">
                {currentUrl}
              </span>
            </div>
          </div>

          {/* Center: View Mode Toggle (Reader vs Web) */}
          <div className="flex items-center bg-gray-950/80 border border-gray-800 p-0.5 rounded-xl shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('reader')}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'reader'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Reader</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('web');
                setIsWebLoading(true);
              }}
              className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                viewMode === 'web'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Web Preview</span>
            </button>
          </div>

          {/* Right: Actions (Reload, Close) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            <button
              type="button"
              onClick={handleReload}
              title="Reload page (re-fetches article)"
              className="p-2 rounded-xl bg-gray-800/90 hover:bg-gray-700 active:scale-95 text-gray-300 hover:text-white text-xs font-semibold border border-gray-700/60 transition-all cursor-pointer"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isReaderLoading ? 'animate-spin text-blue-400' : ''}`} />
            </button>

            <button
              type="button"
              onClick={onClose}
              title="Close window frame (Esc)"
              className="flex items-center gap-1 px-3 sm:px-3.5 py-1.5 rounded-xl bg-red-600/25 hover:bg-red-600 active:scale-95 text-red-200 hover:text-white border border-red-500/40 text-xs font-bold transition-all cursor-pointer shadow-md"
            >
              <X className="w-4 h-4" />
              <span>Close</span>
            </button>
          </div>
        </div>

        {/* Content Viewport Container */}
        <div className="flex-1 w-full bg-neutral-950 relative overflow-hidden flex flex-col">
          {viewMode === 'reader' ? (
            /* Reader View Body */
            <div className="flex-1 overflow-y-auto px-4 py-6 sm:px-8 sm:py-10 md:px-12 select-text">
              {isReaderLoading && (
                <div className="h-full min-h-[360px] flex flex-col items-center justify-center gap-3 text-gray-400">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  <span className="text-sm font-medium">Extracting clean article view...</span>
                  <span className="text-xs text-gray-500">Stripping ads, scripts, and trackers</span>
                </div>
              )}

              {!isReaderLoading && readerError && (
                <div className="h-full min-h-[360px] flex flex-col items-center justify-center gap-3 text-center max-w-md mx-auto p-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-semibold text-white">Clean reader view unavailable</h3>
                  <p className="text-xs text-gray-400 leading-relaxed">
                    {readerError} Some sites require a full browser layout or have paywalled access.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setViewMode('web');
                      setIsWebLoading(true);
                    }}
                    className="mt-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white flex items-center gap-2 transition-all cursor-pointer shadow-md"
                  >
                    <Globe className="w-4 h-4" />
                    <span>Try Web Preview Instead</span>
                  </button>
                </div>
              )}

              {!isReaderLoading && !readerError && article && (
                <article className="max-w-3xl mx-auto pb-16">
                  {/* Article Metadata Badges */}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400 mb-3">
                    {article.siteName && (
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300 font-semibold">
                        {article.siteName}
                      </span>
                    )}
                    {article.publishedTime && (
                      <span className="flex items-center gap-1 text-[11px] text-gray-400">
                        <Calendar className="w-3 h-3 text-gray-500" />
                        {new Date(article.publishedTime).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    )}
                    {Boolean(article.readingTimeMinutes) && (
                      <span className="flex items-center gap-1 text-[11px] text-gray-400">
                        <Clock className="w-3 h-3 text-gray-500" />
                        {article.readingTimeMinutes} min read
                      </span>
                    )}
                  </div>

                  {/* Article Headline */}
                  <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-white mb-3 leading-snug">
                    {article.title}
                  </h1>

                  {/* Byline / Author */}
                  {article.byline && (
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-6 font-medium">
                      <User className="w-3.5 h-3.5 text-gray-500" />
                      <span>{article.byline}</span>
                    </div>
                  )}

                  {/* Lead Hero Image */}
                  {article.leadImageUrl && (
                    <div className="my-6 rounded-2xl overflow-hidden border border-gray-800 bg-gray-900 shadow-lg">
                      <img
                        src={article.leadImageUrl}
                        alt={article.title}
                        className="w-full max-h-[460px] object-cover"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}

                  {/* Excerpt / Summary Box (shown when article body doesn't already start with it) */}
                  {article.excerpt &&
                    article.excerpt.length > 20 &&
                    (!article.textContent ||
                      !article.textContent
                        .slice(0, 240)
                        .toLowerCase()
                        .includes(article.excerpt.slice(0, 60).toLowerCase())) && (
                      <div className="p-4 rounded-xl bg-blue-500/5 border-l-4 border-blue-500 mb-8 text-sm sm:text-base text-gray-300 italic leading-relaxed">
                        {article.excerpt}
                      </div>
                    )}

                  {/* Main Formatted Article HTML */}
                  {article.contentHtml ? (
                    <div
                      onClick={handleReaderContentClick}
                      className="ambiently-reader-body text-base sm:text-lg"
                      dangerouslySetInnerHTML={{ __html: article.contentHtml }}
                    />
                  ) : null}

                  {/* Summary-only notice when publisher blocks full body scraping */}
                  {article.isSummaryOnly && (
                    <div className="mt-8 p-5 rounded-2xl bg-gray-900/80 border border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="text-xs sm:text-sm text-gray-400">
                        <span className="font-semibold text-gray-200 block mb-0.5">
                          Summary preview only
                        </span>
                        This publisher restricts full-text extraction or serves multimedia content.
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setViewMode('web');
                          setIsWebLoading(true);
                        }}
                        className="shrink-0 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white flex items-center gap-2 transition-all cursor-pointer shadow-md"
                      >
                        <Globe className="w-4 h-4" />
                        <span>Open Web Preview</span>
                      </button>
                    </div>
                  )}
                </article>
              )}
            </div>
          ) : (
            /* Web View (Direct Iframe when permitted, or Proxied Iframe) */
            <div className="flex-1 w-full h-full relative">
              {isWebLoading && (
                <div className="absolute inset-0 z-10 bg-gray-950/80 backdrop-blur-xs flex flex-col items-center justify-center gap-2 text-gray-400">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
                  <span className="text-xs">Loading webpage preview...</span>
                </div>
              )}

              <iframe
                key={`${currentUrl}-${iframeKey}`}
                ref={iframeRef}
                src={webIframeSrc}
                title={currentTitle || 'Web Preview'}
                className="w-full h-full border-0 bg-white"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                onLoad={() => setIsWebLoading(false)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
