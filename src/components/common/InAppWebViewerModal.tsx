import React, { useState, useEffect, useRef } from 'react';
import { X, ExternalLink, RotateCw, Globe, Loader2 } from 'lucide-react';
import { openPopoutWindow } from '../../utils/linkHandler';

export interface InAppWebViewerModalProps {
  isOpen: boolean;
  url: string | null;
  title?: string;
  onClose: () => void;
}

export const InAppWebViewerModal: React.FC<InAppWebViewerModalProps> = ({
  isOpen,
  url,
  title,
  onClose,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [iframeKey, setIframeKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

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

  if (!isOpen || !url) return null;

  let domain = '';
  try {
    const parsed = new URL(url);
    domain = parsed.hostname.replace(/^www\./, '');
  } catch {
    domain = url;
  }

  const handleReload = () => {
    setIsLoading(true);
    setIframeKey((prev) => prev + 1);
  };

  const handlePopout = () => {
    openPopoutWindow(url);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[9980] bg-black/85 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 md:p-6 animate-in fade-in duration-200 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-6xl h-[92vh] max-h-[920px] rounded-2xl md:rounded-3xl bg-gray-950 border border-gray-800 shadow-2xl flex flex-col overflow-hidden text-white animate-in zoom-in-95 duration-200"
      >
        {/* Window Chrome Header Bar */}
        <div className="h-14 px-4 bg-gray-900/95 border-b border-gray-800/80 flex items-center justify-between gap-3 shrink-0">
          {/* Left: Icon & Title / Domain */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-400 flex items-center justify-center shrink-0">
              <Globe className="w-4 h-4" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="font-semibold text-xs md:text-sm text-white truncate max-w-xs sm:max-w-md">
                {title || domain}
              </span>
              <span className="text-[10px] text-gray-400 font-mono truncate max-w-[240px] sm:max-w-[360px]">
                {url}
              </span>
            </div>
          </div>

          {/* Right: Actions (Pop-out, Reload, Close) */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handlePopout}
              title="Open in a floating pop-up window"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gray-800/90 hover:bg-gray-700 active:scale-95 text-gray-300 hover:text-white text-xs font-semibold border border-gray-700/60 transition-all cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 text-blue-400" />
              <span className="hidden sm:inline">Pop-out Window</span>
            </button>

            <button
              type="button"
              onClick={handleReload}
              title="Reload page"
              className="p-2 rounded-xl bg-gray-800/90 hover:bg-gray-700 active:scale-95 text-gray-300 hover:text-white text-xs font-semibold border border-gray-700/60 transition-all cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={onClose}
              title="Close window frame (Esc)"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-red-600/25 hover:bg-red-600 active:scale-95 text-red-200 hover:text-white border border-red-500/40 text-xs font-bold transition-all cursor-pointer shadow-md"
            >
              <X className="w-4 h-4" />
              <span>Close</span>
            </button>
          </div>
        </div>

        {/* Content Viewport Frame */}
        <div className="flex-1 w-full bg-neutral-900 relative overflow-hidden">
          {isLoading && (
            <div className="absolute inset-0 z-10 bg-gray-950/70 backdrop-blur-xs flex flex-col items-center justify-center gap-2 text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              <span className="text-xs">Loading page preview...</span>
            </div>
          )}

          <iframe
            key={`${url}-${iframeKey}`}
            ref={iframeRef}
            src={url}
            title={title || 'Web Frame'}
            className="w-full h-full border-0 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
            onLoad={() => setIsLoading(false)}
          />
        </div>

        {/* Bottom Helper Footer */}
        <div className="py-2 px-4 bg-gray-900/95 border-t border-gray-800/80 flex items-center justify-between text-[11px] text-gray-400 shrink-0">
          <span className="truncate">
            If this website restricts embedded viewing, use <strong>Pop-out Window</strong>.
          </span>
          <button
            type="button"
            onClick={handlePopout}
            className="text-blue-400 hover:text-blue-300 font-semibold underline ml-2 shrink-0 cursor-pointer"
          >
            Open in Window ↗
          </button>
        </div>
      </div>
    </div>
  );
};
