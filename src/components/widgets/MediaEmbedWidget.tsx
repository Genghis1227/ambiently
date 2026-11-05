import React, { useState, useEffect, useRef } from 'react';
import { Tv, Volume2, VolumeX, RefreshCw } from 'lucide-react';

export type EmbedPresetId = 'lofi' | 'fireplace' | 'nasa' | 'radar' | 'custom';

export interface MediaEmbedWidgetProps {
  preset?: EmbedPresetId;
  customUrl?: string;
  muted?: boolean;
  latitude?: number;
  longitude?: number;
  onUpdateConfig?: (updates: Record<string, any>) => void;
}

export const EMBED_PRESETS: { id: EmbedPresetId; label: string; description: string }[] = [
  { id: 'lofi', label: 'Lofi Radio', description: 'Lofi Girl 24/7 Chill Beats' },
  { id: 'fireplace', label: '4K Fireplace', description: 'Cozy Crackling Hearth' },
  { id: 'nasa', label: 'NASA Earth', description: 'Live ISS Earth View' },
  { id: 'radar', label: 'Live Radar', description: 'Windy.com Weather Radar' },
  { id: 'custom', label: 'Custom URL', description: 'YouTube or Web Dashboard' },
];

export function normalizeEmbedUrl(rawUrl: string, muted: boolean, savedTime = 0): string {
  const trimmed = rawUrl.trim();
  const startParam = savedTime > 10 ? `&start=${savedTime}` : '';

  if (!trimmed) {
    return `https://www.youtube-nocookie.com/embed/rFZHOHl-L8A?autoplay=1&mute=${muted ? 1 : 0}&enablejsapi=1&rel=0`;
  }

  // Convert standard youtube.com/watch?v=ID or youtu.be/ID or youtube.com/live/ID
  const ytMatch =
    trimmed.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/live\/)([a-zA-Z0-9_-]{11})/) ||
    trimmed.match(/youtube(?:-nocookie)?\.com\/embed\/([a-zA-Z0-9_-]{11})/);

  if (ytMatch && ytMatch[1]) {
    const videoId = ytMatch[1];
    return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=${muted ? 1 : 0}${startParam}&enablejsapi=1&rel=0`;
  }

  return trimmed;
}

export const MediaEmbedWidget: React.FC<MediaEmbedWidgetProps> = ({
  preset: initialPreset = 'lofi',
  customUrl = '',
  muted: initialMuted = true,
  latitude = 30.2672,
  longitude = -97.7431,
  onUpdateConfig,
}) => {
  const [preset, setPreset] = useState<EmbedPresetId>(initialPreset);
  const [muted, setMuted] = useState<boolean>(initialMuted);
  const [reloadKey, setReloadKey] = useState<number>(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    setPreset(initialPreset);
  }, [initialPreset]);

  useEffect(() => {
    setMuted(initialMuted);
  }, [initialMuted]);

  const handleSelectPreset = (nextPreset: EmbedPresetId) => {
    setPreset(nextPreset);
    if (onUpdateConfig) {
      onUpdateConfig({ preset: nextPreset });
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !muted;
    setMuted(nextMuted);

    // Send postMessage to YouTube IFrame API to toggle sound without restarting video
    if (iframeRef.current?.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: nextMuted ? 'mute' : 'unMute', args: [] }),
          '*'
        );
      } catch {
        // ignore cross-origin restrictions if non-YouTube embed
      }
    }

    if (onUpdateConfig) {
      onUpdateConfig({ muted: nextMuted });
    }
  };

  // Listen for YouTube player time updates to resume recorded videos across tab switches
  useEffect(() => {
    const handleWindowMessage = (e: MessageEvent) => {
      try {
        if (typeof e.data !== 'string') return;
        const parsed = JSON.parse(e.data);
        if (parsed.event === 'infoDelivery' && parsed.info?.currentTime) {
          const t = Math.floor(parsed.info.currentTime);
          // Only track resume position for recorded/non-live videos
          if (t > 5 && preset !== 'lofi' && preset !== 'nasa') {
            const storageKey = preset === 'custom' ? `ambiently_pos_${customUrl}` : `ambiently_pos_${preset}`;
            sessionStorage.setItem(storageKey, String(t));
          }
        }
      } catch {
        // non-JSON message
      }
    };
    window.addEventListener('message', handleWindowMessage);
    return () => window.removeEventListener('message', handleWindowMessage);
  }, [preset, customUrl]);

  const getSavedVideoTime = (key: string): number => {
    try {
      const saved = sessionStorage.getItem(`ambiently_pos_${key}`);
      return saved ? parseInt(saved, 10) : 0;
    } catch {
      return 0;
    }
  };

  const getActiveIframeUrl = (): string => {
    const m = muted ? 1 : 0;
    switch (preset) {
      case 'lofi':
        // Pure live broadcast: let YouTube stay completely live
        return `https://www.youtube-nocookie.com/embed/rFZHOHl-L8A?autoplay=1&mute=${m}&enablejsapi=1&rel=0`;
      case 'fireplace': {
        const savedTime = getSavedVideoTime('fireplace');
        const startParam = savedTime > 10 ? `&start=${savedTime}` : '';
        return `https://www.youtube-nocookie.com/embed/L_LUpnjgPso?autoplay=1&mute=${m}&loop=1&playlist=L_LUpnjgPso${startParam}&enablejsapi=1&rel=0`;
      }
      case 'nasa':
        // Pure live broadcast: let YouTube stay completely live
        return `https://www.youtube-nocookie.com/embed/ROboUHfPUrU?autoplay=1&mute=${m}&enablejsapi=1&rel=0`;
      case 'radar':
        return `https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=in&metricTemp=%C2%B0F&metricWind=mph&zoom=6&overlay=radar&product=radar&level=surface&lat=${latitude}&lon=${longitude}`;
      case 'custom':
      default: {
        const savedTime = getSavedVideoTime(customUrl);
        return normalizeEmbedUrl(customUrl, muted, savedTime);
      }
    }
  };

  const iframeSrc = getActiveIframeUrl();

  return (
    <div className="w-full h-full flex flex-col justify-between overflow-hidden select-none rounded-xl">
      {/* Header & Quick Preset Switcher */}
      <div className="flex items-center justify-between gap-2 pb-2 mb-1.5 border-b border-gray-800/80 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <Tv className="w-4 h-4 text-pink-400 shrink-0" />
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            {EMBED_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => handleSelectPreset(p.id)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  preset === p.id
                    ? 'bg-pink-600 text-white shadow'
                    : 'bg-gray-800/70 text-gray-400 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0 pr-16">
          {preset !== 'radar' && (
            <button
              type="button"
              onClick={handleToggleMute}
              title={muted ? 'Unmute stream audio' : 'Mute stream audio'}
              className={`p-1 rounded-lg border text-xs transition-all cursor-pointer ${
                !muted
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                  : 'bg-gray-800/70 border-gray-700 text-gray-400 hover:text-white'
              }`}
            >
              {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          )}
          <button
            type="button"
            onClick={() => setReloadKey((k) => k + 1)}
            title="Reload stream"
            className="p-1 rounded-lg bg-gray-800/70 hover:bg-gray-700 text-gray-400 hover:text-white transition-all cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Embedded Frame */}
      <div className="relative flex-1 w-full h-full rounded-xl overflow-hidden bg-black border border-gray-800/80">
        <iframe
          ref={iframeRef}
          key={`${preset}-${reloadKey}-${customUrl}`}
          src={iframeSrc}
          title="Ambient Stream Embed"
          className="w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    </div>
  );
};
