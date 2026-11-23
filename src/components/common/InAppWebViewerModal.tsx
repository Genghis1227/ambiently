import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  X,
  RotateCw,
  Globe,
  BookOpen,
  Loader2,
  Calendar,
  User,
  Clock,
  AlertCircle,
  ExternalLink,
  QrCode,
  Copy,
  Check,
  Shield,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useDashboardStore } from '../../store/dashboardStore';
import {
  detectDisplayModeFullscreen,
  resolveExternalBrowserLinkAccess,
} from '../../utils/externalLinksPolicy';
import { createBackdropDismissHandlers } from '../../utils/modalBackdropGuard';
import { sanitizeReaderHtml } from '../../utils/readerSanitize';
import { isSafeExternalEmbedUrl, sanitizeExternalHttpUrl } from '../../utils/urlSecurity';

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
  const safeArticleHtml = useMemo(() => (article?.contentHtml ? sanitizeReaderHtml(article.contentHtml) : ''), [article]);
  const [isReaderLoading, setIsReaderLoading] = useState(false);
  const [readerError, setReaderError] = useState<string | null>(null);

  // Web View state
  const [isWebLoading, setIsWebLoading] = useState(true);
  const [iframeKey, setIframeKey] = useState(0);
  const [reloadNonce, setReloadNonce] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const swRecoveryAttemptedRef = useRef(false);
  const isAnchorTitlePlaceholderRef = useRef(false);

  const [showQrPopover, setShowQrPopover] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isDocumentFullscreen, setIsDocumentFullscreen] = useState<boolean>(() =>
    typeof document !== 'undefined' ? Boolean(document.fullscreenElement) : false
  );

  const externalBrowserLinksPolicy = useDashboardStore(
    (s) => s.settings.externalBrowserLinksPolicy
  );
  const pinLockEnabled = useDashboardStore((s) => s.settings.pinLockEnabled);
  const pinHash = useDashboardStore((s) => s.settings.pinHash);
  const lockFullscreenKiosk = useDashboardStore((s) => s.settings.lockFullscreenKiosk);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleFsChange = () => {
      setIsDocumentFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  // Synchronize when modal is opened with new props
  useEffect(() => {
    if (isOpen && initialUrl) {
      isAnchorTitlePlaceholderRef.current = false;
      setCurrentUrl(initialUrl);
      setCurrentTitle(initialTitle);
      setViewMode('reader');
      setArticle(null);
      setReaderError(null);
      setShowQrPopover(false);
      setCopiedLink(false);
    } else if (!isOpen) {
      setShowQrPopover(false);
      setCopiedLink(false);
    }
  }, [isOpen, initialUrl, initialTitle]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (showQrPopover) {
          setShowQrPopover(false);
          return;
        }
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showQrPopover, onClose]);

  // Fetch article for Reader Mode
  const loadReaderArticle = useCallback(async (targetUrl: string, signal?: AbortSignal) => {
    const safeTarget = sanitizeExternalHttpUrl(targetUrl);
    if (!safeTarget) {
      setIsReaderLoading(false);
      setReaderError('Unsupported link address.');
      return;
    }

    setIsReaderLoading(true);
    setReaderError(null);

    try {
      let res = await fetch(`/api/reader?url=${encodeURIComponent(safeTarget)}`, { signal });
      if (res.status === 404) {
        res = await fetch(`/functions/api/reader?url=${encodeURIComponent(safeTarget)}`, { signal });
      }

      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) {
        throw new Error('Reader service is unavailable on this host.');
      }

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Reader service answered ${res.status}`);
      }

      if (signal?.aborted) return;
      setArticle(data);
      if (data.title) {
        const wasAnchorPlaceholder = isAnchorTitlePlaceholderRef.current;
        isAnchorTitlePlaceholderRef.current = false;
        setCurrentTitle((prev) => (wasAnchorPlaceholder || !prev ? data.title : prev));
      }
    } catch (err) {
      if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
        return;
      }
      setReaderError(err instanceof Error ? err.message : 'Could not extract article text.');
    } finally {
      if (!signal?.aborted) {
        setIsReaderLoading(false);
      }
    }
  }, []);

  // Load reader article when url changes, modal opens, or user clicks reload
  useEffect(() => {
    if (!isOpen || !currentUrl) return;
    const controller = new AbortController();
    void loadReaderArticle(currentUrl, controller.signal);
    return () => controller.abort();
  }, [isOpen, currentUrl, reloadNonce, loadReaderArticle]);

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
      setReloadNonce((prev) => prev + 1);
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
    if (!href || href.startsWith('#')) return;

    e.preventDefault();
    e.stopPropagation();

    try {
      const safeNextUrl = sanitizeExternalHttpUrl(new URL(href, currentUrl).href);
      if (!safeNextUrl) return;
      isAnchorTitlePlaceholderRef.current = true;
      setShowQrPopover(false);
      setCopiedLink(false);
      setCurrentUrl(safeNextUrl);
      setCurrentTitle(anchor.innerText.trim() || undefined);
    } catch {
      // Ignore malformed href
    }
  };

  // If the destination server does not block iframes (no X-Frame-Options or CSP frame-ancestors),
  // load it directly when it is an external HTTPS page; otherwise route through /api/web-proxy.
  const appOrigin = typeof window !== 'undefined' ? window.location.origin : null;
  const safeCurrentUrl = sanitizeExternalHttpUrl(currentUrl);
  const linkAccess = resolveExternalBrowserLinkAccess({
    policy: externalBrowserLinksPolicy,
    isDocumentFullscreen,
    isDisplayModeFullscreen: detectDisplayModeFullscreen(),
    isKioskPinLocked: Boolean(pinLockEnabled && pinHash && lockFullscreenKiosk),
  });

  const handleCopyCurrentLink = () => {
    if (!safeCurrentUrl || typeof navigator === 'undefined' || !navigator.clipboard) return;
    void navigator.clipboard.writeText(safeCurrentUrl).then(() => {
      setCopiedLink(true);
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = setTimeout(() => {
        setCopiedLink(false);
      }, 2000);
    }).catch(() => {});
  };

  const canDirectFrame = Boolean(
    article?.canEmbedDirectly &&
      safeCurrentUrl &&
      isSafeExternalEmbedUrl(safeCurrentUrl, {
        requireHttps: true,
        disallowOrigin: appOrigin,
      })
  );
  const webIframeSrc = !safeCurrentUrl
    ? 'about:blank'
    : canDirectFrame
      ? safeCurrentUrl
      : `/api/web-proxy?url=${encodeURIComponent(safeCurrentUrl)}`;

  return (
    <div
      {...createBackdropDismissHandlers(onClose)}
      className="fixed inset-0 z-[9980] bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-200 select-none"
    >
      <style>{`
        .ambiently-reader-body {
          position: relative;
          overflow-x: hidden;
          user-select: text;
          -webkit-user-select: text;
        }
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
          position: static !important;
          border-radius: 0.875rem;
          max-width: 100%;
          max-height: 520px;
          width: auto;
          height: auto;
          object-fit: contain;
          margin: 1.5rem auto;
          display: block;
          border: 1px solid #1e293b;
        }
        .ambiently-reader-body svg {
          max-width: 1.25rem;
          max-height: 1.25rem;
          display: inline-block;
          vertical-align: middle;
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

          {/* Right: Actions (Copy, Phone QR / Open in Browser, Reload, Close) */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {safeCurrentUrl && (
              <button
                type="button"
                onClick={handleCopyCurrentLink}
                title="Copy link URL"
                className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-gray-800/90 hover:bg-gray-700 active:scale-95 text-gray-300 hover:text-white text-xs font-semibold border border-gray-700/60 transition-all cursor-pointer"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-300">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span className="hidden lg:inline">Copy</span>
                  </>
                )}
              </button>
            )}

            {safeCurrentUrl && (
              <button
                type="button"
                onClick={() => setShowQrPopover((prev) => !prev)}
                aria-pressed={showQrPopover}
                title={
                  linkAccess.canOpenInBrowser
                    ? 'Show QR code to open on phone'
                    : 'Scan QR code to open safely on your phone (Kiosk Protection active)'
                }
                className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  showQrPopover
                    ? 'bg-teal-600/30 border-teal-500 text-teal-200'
                    : !linkAccess.canOpenInBrowser
                    ? 'bg-teal-600/20 hover:bg-teal-600/35 border-teal-500/40 text-teal-200'
                    : 'bg-gray-800/90 hover:bg-gray-700 border-gray-700/60 text-gray-300 hover:text-white'
                }`}
              >
                <QrCode className="w-3.5 h-3.5 shrink-0" />
                {!linkAccess.canOpenInBrowser && (
                  <span className="hidden sm:inline">Open on Phone</span>
                )}
              </button>
            )}

            {safeCurrentUrl && linkAccess.canOpenInBrowser && (
              <a
                href={safeCurrentUrl}
                data-native-link="true"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  if (
                    linkAccess.shouldExitFullscreenBeforeOpen &&
                    typeof document !== 'undefined' &&
                    document.fullscreenElement
                  ) {
                    document.exitFullscreen?.().catch(() => {});
                  }
                }}
                title="Open page in browser tab"
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/35 active:scale-95 text-blue-200 hover:text-white border border-blue-500/40 text-xs font-semibold transition-all cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Open in Browser</span>
              </a>
            )}

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
          {showQrPopover && safeCurrentUrl && (
            <div
              onClick={() => setShowQrPopover(false)}
              className="absolute inset-0 z-30 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150 cursor-pointer"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-2xl bg-gray-900 border border-gray-800 p-5 shadow-2xl space-y-4 text-center cursor-default"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold text-teal-300 uppercase tracking-wider">
                    <QrCode className="w-4 h-4" />
                    <span>Open on Your Phone</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowQrPopover(false)}
                    className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 cursor-pointer"
                    aria-label="Close QR handoff"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="inline-flex p-3.5 rounded-2xl bg-white shadow-inner mx-auto">
                  <QRCodeSVG value={safeCurrentUrl} size={184} level="M" />
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-semibold text-white truncate">{domain}</p>
                  <p className="text-[11px] text-gray-400 leading-relaxed">
                    {linkAccess.canOpenInBrowser
                      ? 'Point your phone camera at the QR code to view this link on mobile.'
                      : 'Browser tabs are hidden to prevent Kiosk Jail. Scan with your phone camera to open safely.'}
                  </p>
                </div>

                {!linkAccess.canOpenInBrowser && (
                  <div className="flex items-center justify-center gap-1.5 text-[10px] text-amber-300/90 bg-amber-500/10 border border-amber-500/25 rounded-lg px-2.5 py-1.5">
                    <Shield className="w-3 h-3 shrink-0" />
                    <span>
                      {linkAccess.kioskReason === 'pin_locked'
                        ? 'Kiosk Fullscreen PIN Lock active on this display'
                        : linkAccess.kioskReason === 'policy_locked'
                        ? 'This display is configured for Kiosk QR Only links'
                        : 'Fullscreen Kiosk mode detected (adjust under Settings → Display)'}
                    </span>
                  </div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyCurrentLink}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs font-semibold text-white transition-colors cursor-pointer"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Link Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowQrPopover(false)}
                    className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-xs font-semibold text-white transition-colors cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}
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
                  <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setViewMode('web');
                        setIsWebLoading(true);
                      }}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white flex items-center gap-2 transition-all cursor-pointer shadow-md"
                    >
                      <Globe className="w-4 h-4" />
                      <span>Try Web Preview Instead</span>
                    </button>

                    {safeCurrentUrl && linkAccess.canOpenInBrowser ? (
                      <a
                        href={safeCurrentUrl}
                        data-native-link="true"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => {
                          if (
                            linkAccess.shouldExitFullscreenBeforeOpen &&
                            typeof document !== 'undefined' &&
                            document.fullscreenElement
                          ) {
                            document.exitFullscreen?.().catch(() => {});
                          }
                        }}
                        className="px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs font-bold text-white flex items-center gap-2 transition-all cursor-pointer shadow-md"
                      >
                        <ExternalLink className="w-4 h-4" />
                        <span>Open in Browser</span>
                      </a>
                    ) : safeCurrentUrl ? (
                      <button
                        type="button"
                        onClick={() => setShowQrPopover(true)}
                        className="px-4 py-2 rounded-xl bg-teal-600/25 hover:bg-teal-600/40 border border-teal-500/40 text-xs font-bold text-teal-200 flex items-center gap-2 transition-all cursor-pointer shadow-md"
                      >
                        <QrCode className="w-4 h-4" />
                        <span>Open on Phone (QR)</span>
                      </button>
                    ) : null}
                  </div>
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
                        referrerPolicy="no-referrer"
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
                      dangerouslySetInnerHTML={{ __html: safeArticleHtml }}
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
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setViewMode('web');
                            setIsWebLoading(true);
                          }}
                          className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white flex items-center gap-2 transition-all cursor-pointer shadow-md"
                        >
                          <Globe className="w-4 h-4" />
                          <span>Open Web Preview</span>
                        </button>
                        {safeCurrentUrl && linkAccess.canOpenInBrowser ? (
                          <a
                            href={safeCurrentUrl}
                            data-native-link="true"
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => {
                              if (
                                linkAccess.shouldExitFullscreenBeforeOpen &&
                                typeof document !== 'undefined' &&
                                document.fullscreenElement
                              ) {
                                document.exitFullscreen?.().catch(() => {});
                              }
                            }}
                            className="px-3.5 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 border border-gray-700 text-xs font-bold text-white flex items-center gap-1.5 transition-all cursor-pointer"
                          >
                            <ExternalLink className="w-4 h-4" />
                            <span>Browser</span>
                          </a>
                        ) : safeCurrentUrl ? (
                          <button
                            type="button"
                            onClick={() => setShowQrPopover(true)}
                            className="px-3.5 py-2 rounded-xl bg-teal-600/25 hover:bg-teal-600/40 border border-teal-500/40 text-xs font-bold text-teal-200 flex items-center gap-1.5 transition-all cursor-pointer"
                          >
                            <QrCode className="w-4 h-4" />
                            <span>Phone QR</span>
                          </button>
                        ) : null}
                      </div>
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
                // A proxied page is served from Ambiently's own address, so it must not get
                // allow-same-origin: with it, the page's scripts would run as Ambiently and could read
                // the board and the saved sign-in. A site loaded directly keeps its own origin.
                sandbox={
                  canDirectFrame
                    ? 'allow-scripts allow-same-origin allow-forms allow-popups'
                    : 'allow-scripts allow-forms allow-popups'
                }
                onLoad={() => {
                  try {
                    const doc = iframeRef.current?.contentDocument;
                    const isAmbientlyShell = Boolean(
                      doc?.querySelector('meta[name="application-name"][content="Ambiently"]')
                    );
                    if (isAmbientlyShell && !swRecoveryAttemptedRef.current && 'serviceWorker' in navigator) {
                      swRecoveryAttemptedRef.current = true;
                      navigator.serviceWorker
                        .getRegistrations()
                        .then((regs) => Promise.all(regs.map((r) => r.unregister())))
                        .finally(() => {
                          setIframeKey((prev) => prev + 1);
                        });
                      return;
                    }
                  } catch {
                    // Cross-origin direct embed; safe to ignore
                  }
                  setIsWebLoading(false);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
