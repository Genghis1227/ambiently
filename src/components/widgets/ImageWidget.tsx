import React, { useEffect, useRef, useState } from 'react';
import {
  Image as ImageIcon,
  Sparkles,
  Link as LinkIcon,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import type { ImageWidgetConfig } from '../../types/dashboard';
import { MediaSearchModal, type MediaSelectionMeta } from './MediaSearchModal';
import {
  resolveOptimizedImageMedia,
  resolveOrWarmCachedMedia,
} from '../../utils/mediaOptimization';
import { useVaultMediaUrl } from '../../utils/localMediaVault';
import { useDisplayActivity } from '../../utils/displayActivity';

interface ImageWidgetProps {
  id: string;
  config: ImageWidgetConfig;
  onUpdateConfig?: (config: Partial<ImageWidgetConfig>) => void;
}

interface MediaErrorState {
  key: string;
  hasError: boolean;
  videoFailed: boolean;
  fallbackToRawImg: boolean;
}

interface CachedVideoEntry {
  forUrl: string;
  objectUrl: string;
}

const ImageWidgetInner: React.FC<ImageWidgetProps> = ({
  config,
  onUpdateConfig,
}) => {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isCustomUrlOpen, setIsCustomUrlOpen] = useState(false);
  const [inputUrl, setInputUrl] = useState('');
  const [cachedVideoEntry, setCachedVideoEntry] = useState<CachedVideoEntry | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const rawUrl = config.url?.trim() || '';
  const fit = config.fit || 'contain';
  const transparentBg = config.transparentBg !== false;
  const mediaKey = `${config.url || ''}|${config.mp4Url || ''}|${config.mediaSource || ''}`;

  const [errorState, setErrorState] = useState<MediaErrorState>(() => ({
    key: mediaKey,
    hasError: false,
    videoFailed: false,
    fallbackToRawImg: false,
  }));

  const currentErrors =
    errorState.key === mediaKey
      ? errorState
      : { key: mediaKey, hasError: false, videoFailed: false, fallbackToRawImg: false };

  const {
    resolvedUrl,
    isLoading: isVaultLoading,
    isMissing: isVaultMissing,
  } = useVaultMediaUrl(rawUrl);
  const { shouldPauseAnimations } = useDisplayActivity();

  const media = resolveOptimizedImageMedia({
    url: resolvedUrl,
    mp4Url: config.mp4Url,
    mediaSource: config.mediaSource,
  });

  const activeVideoUrl = !currentErrors.videoFailed ? media.videoUrl : null;

  useEffect(() => {
    if (!activeVideoUrl) {
      return;
    }

    let cancelled = false;
    let createdObjectUrl: string | null = null;

    void resolveOrWarmCachedMedia(activeVideoUrl).then((objectUrl) => {
      if (!objectUrl) return;
      if (cancelled) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      createdObjectUrl = objectUrl;
      setCachedVideoEntry({ forUrl: activeVideoUrl, objectUrl });
    });

    return () => {
      cancelled = true;
      if (createdObjectUrl) {
        URL.revokeObjectURL(createdObjectUrl);
      }
    };
  }, [activeVideoUrl]);

  const cachedVideoObjectUrl =
    activeVideoUrl && cachedVideoEntry?.forUrl === activeVideoUrl
      ? cachedVideoEntry.objectUrl
      : null;
  const videoSrc = cachedVideoObjectUrl || activeVideoUrl;

  useEffect(() => {
    const el = videoRef.current;
    if (!el || !videoSrc) return;
    if (shouldPauseAnimations) {
      el.pause();
    } else {
      el.play().catch(() => {});
    }
  }, [shouldPauseAnimations, videoSrc]);

  const handleSelectMedia = (
    selectedUrl: string,
    selectedTitle?: string,
    meta?: MediaSelectionMeta
  ) => {
    const nextKey = `${selectedUrl}|${meta?.mp4Url || ''}|${meta?.mediaSource || ''}`;
    setErrorState({
      key: nextKey,
      hasError: false,
      videoFailed: false,
      fallbackToRawImg: false,
    });
    onUpdateConfig?.({
      url: selectedUrl,
      mp4Url: meta?.mp4Url,
      mediaSource: meta?.mediaSource,
      title: config.title || selectedTitle || 'Image',
    });
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputUrl.trim()) {
      handleSelectMedia(inputUrl.trim(), undefined, {
        mp4Url: undefined,
        mediaSource: 'custom',
      });
      setIsCustomUrlOpen(false);
    }
  };

  // 1. Empty State (No image configured yet)
  if (!rawUrl) {
    return (
      <div className="w-full h-full p-4 flex flex-col items-center justify-center text-center bg-gray-950/70 border border-gray-800/80 rounded-2xl select-none backdrop-blur-xs">
        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mb-3 text-blue-400 shadow-sm">
          <ImageIcon className="w-6 h-6" />
        </div>
        <h3 className="text-sm font-bold text-white mb-1">Single Image or GIF</h3>
        <p className="text-[11px] text-gray-400 max-w-[240px] mb-4">
          Add an animated GIF from GIPHY, a transparent sticker, or any picture.
        </p>

        {isCustomUrlOpen ? (
          <form onSubmit={handleUrlSubmit} className="w-full max-w-xs space-y-2">
            <input
              type="url"
              autoFocus
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="https://.../image.gif"
              className="w-full px-3 py-1.5 rounded-xl bg-gray-900 border border-gray-700 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={!inputUrl.trim()}
                className="flex-1 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-xs font-bold text-white transition-all cursor-pointer"
              >
                Apply
              </button>
              <button
                type="button"
                onClick={() => setIsCustomUrlOpen(false)}
                className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs text-gray-400 hover:text-white transition-all cursor-pointer"
              >
                Back
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-2 w-full max-w-[220px]">
            <button
              type="button"
              onClick={() => setIsSearchOpen(true)}
              className="w-full py-2 px-3 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm"
            >
              <Sparkles className="w-4 h-4 text-blue-400" />
              <span>Browse GIPHY & Images</span>
            </button>

            <button
              type="button"
              onClick={() => setIsCustomUrlOpen(true)}
              className="w-full py-1.5 px-3 rounded-xl bg-gray-900 hover:bg-gray-800 border border-gray-800 text-gray-300 text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <LinkIcon className="w-3.5 h-3.5 text-gray-400" />
              <span>Enter URL</span>
            </button>
          </div>
        )}

        <MediaSearchModal
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          onSelect={handleSelectMedia}
          initialUrl={rawUrl}
        />
      </div>
    );
  }

  // 2. Device-local upload missing (e.g. opened from cloud sync on another device)
  if (isVaultMissing) {
    return (
      <div className="w-full h-full p-4 flex flex-col items-center justify-center text-center bg-gray-950/80 border border-amber-500/30 rounded-2xl select-none">
        <ImageIcon className="w-8 h-8 text-amber-400 mb-2" />
        <p className="text-xs font-bold text-white mb-0.5">Local Upload Unavailable</p>
        <p className="text-[10px] text-gray-400 mb-3 max-w-[220px]">
          Local uploads stay on the device where they were added — click to choose a new image or GIF.
        </p>
        <button
          type="button"
          onClick={() => setIsSearchOpen(true)}
          className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs text-blue-300 font-semibold transition-colors cursor-pointer"
        >
          Choose Image / GIF
        </button>

        <MediaSearchModal
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          onSelect={handleSelectMedia}
          initialUrl=""
        />
      </div>
    );
  }

  // 3. Error Fallback State
  if (currentErrors.hasError) {
    return (
      <div className="w-full h-full p-4 flex flex-col items-center justify-center text-center bg-gray-950/80 border border-red-500/30 rounded-2xl select-none">
        <AlertCircle className="w-8 h-8 text-red-400 mb-2" />
        <p className="text-xs font-bold text-white mb-0.5">Image Failed to Load</p>
        <p className="text-[10px] text-gray-400 mb-3 max-w-[200px] truncate">{rawUrl}</p>
        <button
          type="button"
          onClick={() => setIsSearchOpen(true)}
          className="px-3 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 text-xs text-blue-300 font-semibold transition-colors cursor-pointer"
        >
          Change Image / GIF
        </button>

        <MediaSearchModal
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          onSelect={handleSelectMedia}
          initialUrl={rawUrl}
        />
      </div>
    );
  }

  const imgSrc = currentErrors.fallbackToRawImg
    ? media.fallbackImgUrl
    : media.optimizedImgUrl || media.fallbackImgUrl;

  // 4. Rendered Video / Animated WebP / Image View
  const content = (
    <div
      className={`relative w-full h-full overflow-hidden select-none group flex items-center justify-center ${
        transparentBg
          ? 'bg-transparent'
          : 'bg-gray-950/60 border border-gray-800/80 rounded-2xl shadow-lg backdrop-blur-xs'
      }`}
    >
      {isVaultLoading ? null : videoSrc ? (
        <video
          ref={videoRef}
          src={videoSrc}
          autoPlay={!shouldPauseAnimations}
          loop
          muted
          playsInline
          disablePictureInPicture
          onError={() => {
            if (media.optimizedImgUrl || media.fallbackImgUrl) {
              setErrorState({ ...currentErrors, videoFailed: true });
            } else {
              setErrorState({ ...currentErrors, hasError: true });
            }
          }}
          className="w-full h-full pointer-events-none"
          style={{
            objectFit: fit,
          }}
        />
      ) : imgSrc ? (
        <img
          src={imgSrc}
          alt={config.title || 'Image'}
          loading="lazy"
          decoding="async"
          onError={() => {
            if (
              !currentErrors.fallbackToRawImg &&
              media.fallbackImgUrl &&
              media.fallbackImgUrl !== imgSrc
            ) {
              setErrorState({ ...currentErrors, fallbackToRawImg: true });
            } else {
              setErrorState({ ...currentErrors, hasError: true });
            }
          }}
          className="w-full h-full pointer-events-none"
          style={{
            objectFit: fit,
          }}
        />
      ) : null}

      {/* Optional Caption */}
      {config.caption && (
        <div className="absolute bottom-0 inset-x-0 p-2 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none">
          <p className="text-xs font-semibold text-white text-center truncate drop-shadow-sm">
            {config.caption}
          </p>
        </div>
      )}

      {/* External Link Indicator */}
      {config.linkUrl && (
        <div className="absolute top-2 right-2 p-1 rounded-md bg-black/60 text-white/80 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <ExternalLink className="w-3 h-3" />
        </div>
      )}
    </div>
  );

  return (
    <>
      {config.linkUrl ? (
        <a
          href={config.linkUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full h-full cursor-pointer"
        >
          {content}
        </a>
      ) : (
        content
      )}

      <MediaSearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        onSelect={handleSelectMedia}
        initialUrl={rawUrl}
      />
    </>
  );
};

export const ImageWidget = React.memo(ImageWidgetInner);
