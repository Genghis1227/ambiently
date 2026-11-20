import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  CloudRain,
  Flame,
  Moon,
  Pause,
  Play,
  Timer,
  Volume2,
  VolumeX,
  Waves,
  Wind,
} from 'lucide-react';
import type {
  SoundscapeChannelId,
  SoundscapeChannelLevels,
  SoundscapeSleepTimerMin,
  SoundscapeWidgetConfig,
} from '../../types/phase4Widgets';
import {
  SOUNDSCAPE_CHANNELS,
  SOUNDSCAPE_PRESETS,
  SOUNDSCAPE_SLEEP_OPTIONS,
  SoundscapeAudioController,
  detectMatchingSoundscapePreset,
  formatSleepTimerRemaining,
  hasAudibleSoundscapeChannel,
  resolveMasterVolume,
  resolveSoundscapeChannels,
  shouldAutoFadeOutForNightMode,
} from '../../utils/soundscapeEngine';
import { useDisplayActivity } from '../../utils/displayActivity';
import { useIsCursorHidden } from '../../hooks/useIdleCursor';

interface SoundscapeWidgetProps {
  title?: string;
  config?: SoundscapeWidgetConfig;
  isLight?: boolean;
  transparentBg?: boolean;
  onUpdateConfig?: (updates: Record<string, any>) => void;
}

const CHANNEL_ICONS: Record<SoundscapeChannelId, React.ComponentType<{ className?: string }>> = {
  rain: CloudRain,
  fireplace: Flame,
  brown_noise: AudioLines,
  ocean: Waves,
  forest_wind: Wind,
};

export const SoundscapeWidget: React.FC<SoundscapeWidgetProps> = ({
  title,
  config,
  isLight = false,
  transparentBg = false,
  onUpdateConfig,
}) => {
  const isCursorHidden = useIsCursorHidden();
  const { isNightMode } = useDisplayActivity();

  const [prevConfigChannels, setPrevConfigChannels] = useState(config?.channels);
  const [channels, setChannels] = useState<SoundscapeChannelLevels>(() =>
    resolveSoundscapeChannels(config?.channels)
  );
  if (config?.channels !== prevConfigChannels) {
    setPrevConfigChannels(config?.channels);
    setChannels(resolveSoundscapeChannels(config?.channels));
  }

  const [prevConfigMaster, setPrevConfigMaster] = useState(config?.masterVolume);
  const [masterVolume, setMasterVolume] = useState<number>(() =>
    resolveMasterVolume(config?.masterVolume)
  );
  if (config?.masterVolume !== prevConfigMaster) {
    setPrevConfigMaster(config?.masterVolume);
    setMasterVolume(resolveMasterVolume(config?.masterVolume));
  }

  const defaultSleepMin: SoundscapeSleepTimerMin =
    config?.defaultSleepTimerMin === 15 ||
    config?.defaultSleepTimerMin === 30 ||
    config?.defaultSleepTimerMin === 60 ||
    config?.defaultSleepTimerMin === 90
      ? config.defaultSleepTimerMin
      : 0;

  const [isPlaying, setIsPlaying] = useState(false);
  const [sleepMin, setSleepMin] = useState<SoundscapeSleepTimerMin>(defaultSleepMin);
  const [sleepRemainingSec, setSleepRemainingSec] = useState<number | null>(null);
  const [nightFadeNotice, setNightFadeNotice] = useState(false);

  const fadeOutOnNightMode = config?.fadeOutOnNightMode !== false;
  const controllerRef = useRef<SoundscapeAudioController | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const wasNightModeRef = useRef<boolean>(isNightMode);

  const activePreset = useMemo(() => detectMatchingSoundscapePreset(channels), [channels]);
  const isAudible = useMemo(
    () => hasAudibleSoundscapeChannel(channels, masterVolume),
    [channels, masterVolume]
  );

  // Sync live slider changes to Web Audio controller immediately
  useEffect(() => {
    if (!isPlaying) return;
    controllerRef.current?.updateMix(channels, masterVolume);
  }, [isPlaying, channels, masterVolume]);

  // Smooth fade-out when Scheduled Night Mode engages
  useEffect(() => {
    const triggerFade = shouldAutoFadeOutForNightMode({
      wasNightMode: wasNightModeRef.current,
      isNightMode,
      isPlaying,
      fadeOutOnNightMode,
    });
    wasNightModeRef.current = isNightMode;
    if (!triggerFade) return;

    controllerRef.current?.fadeOutAndStop(2.4, () => {
      setIsPlaying(false);
      setSleepRemainingSec(null);
      setNightFadeNotice(true);
    });
  }, [isNightMode, isPlaying, fadeOutOnNightMode]);

  // Auto-fade when optional Sleep Timer expires
  useEffect(() => {
    if (!isPlaying || sleepMin === 0 || typeof window === 'undefined') return;
    const timer = window.setInterval(() => {
      setSleepRemainingSec((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          controllerRef.current?.fadeOutAndStop(2.0, () => {
            setIsPlaying(false);
            setSleepRemainingSec(null);
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isPlaying, sleepMin]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current !== null && typeof window !== 'undefined') {
        window.clearTimeout(persistTimerRef.current);
      }
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, []);

  const schedulePersistMix = (
    nextChannels: SoundscapeChannelLevels,
    nextMaster: number
  ) => {
    if (!onUpdateConfig) return;
    if (persistTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(persistTimerRef.current);
    }
    if (typeof window === 'undefined') return;
    persistTimerRef.current = window.setTimeout(() => {
      persistTimerRef.current = null;
      onUpdateConfig({
        channels: nextChannels,
        masterVolume: nextMaster,
        activePreset: detectMatchingSoundscapePreset(nextChannels),
      });
    }, 350);
  };

  const ensureController = (): SoundscapeAudioController => {
    if (!controllerRef.current) {
      controllerRef.current = new SoundscapeAudioController();
    }
    return controllerRef.current;
  };

  const handleTogglePlay = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isPlaying) {
      controllerRef.current?.stopImmediate();
      setIsPlaying(false);
      setSleepRemainingSec(null);
      return;
    }

    const effectiveChannels = hasAudibleSoundscapeChannel(channels, masterVolume)
      ? channels
      : SOUNDSCAPE_PRESETS.cozy_hearth.channels;
    const effectiveMaster = masterVolume > 0 ? masterVolume : 70;

    if (effectiveChannels !== channels) {
      setChannels(effectiveChannels);
    }
    if (effectiveMaster !== masterVolume) {
      setMasterVolume(effectiveMaster);
    }

    const started = ensureController().start(effectiveChannels, effectiveMaster);
    if (started) {
      setNightFadeNotice(false);
      setIsPlaying(true);
      setSleepRemainingSec(sleepMin > 0 ? sleepMin * 60 : null);
    }
  };

  const handleApplyPreset = (presetId: Exclude<keyof typeof SOUNDSCAPE_PRESETS, never>) => {
    const nextChannels = { ...SOUNDSCAPE_PRESETS[presetId].channels };
    setChannels(nextChannels);
    setNightFadeNotice(false);
    if (isPlaying) {
      ensureController().updateMix(nextChannels, masterVolume);
    }
    schedulePersistMix(nextChannels, masterVolume);
  };

  const handleChannelChange = (id: SoundscapeChannelId, value: number) => {
    const clamped = Math.max(0, Math.min(100, Math.round(value)));
    const nextChannels: SoundscapeChannelLevels = { ...channels, [id]: clamped };
    setChannels(nextChannels);
    setNightFadeNotice(false);
    if (isPlaying) {
      ensureController().updateMix(nextChannels, masterVolume);
    }
    schedulePersistMix(nextChannels, masterVolume);
  };

  const handleCycleSleepTimer = (e: React.MouseEvent) => {
    e.stopPropagation();
    const idx = SOUNDSCAPE_SLEEP_OPTIONS.indexOf(sleepMin);
    const nextMin = SOUNDSCAPE_SLEEP_OPTIONS[(idx + 1) % SOUNDSCAPE_SLEEP_OPTIONS.length];
    setSleepMin(nextMin);
    if (isPlaying) {
      setSleepRemainingSec(nextMin > 0 ? nextMin * 60 : null);
    }
    onUpdateConfig?.({ defaultSleepTimerMin: nextMin });
  };

  const remainingSleepSec = isPlaying ? sleepRemainingSec : null;

  const rootToneClass = transparentBg
    ? `bg-transparent ${isLight ? 'text-slate-900' : 'text-white'}`
    : isLight
      ? 'bg-white/95 text-slate-900 border border-slate-200/80 shadow-sm'
      : 'bg-gray-900/90 text-white border border-gray-800/90';

  const cardSurfaceClass = isLight
    ? transparentBg
      ? 'bg-slate-900/5 border border-slate-900/10'
      : 'bg-slate-100/85 border border-slate-200/80'
    : transparentBg
      ? 'bg-white/8 border border-white/12'
      : 'bg-gray-950/60 border border-gray-800/80';

  return (
    <div
      className={`w-full h-full flex flex-col justify-between gap-2.5 p-3.5 overflow-y-auto rounded-[inherit] ${rootToneClass}`}
    >
      {/* Header & Master Transport */}
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold tracking-tight truncate">
              {title || 'Ambient Soundscape'}
            </span>
            {isPlaying && (
              <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Playing
              </span>
            )}
          </div>
          {nightFadeNotice ? (
            <p className="text-[10px] text-amber-400 flex items-center gap-1 mt-0.5">
              <Moon className="w-3 h-3 shrink-0" />
              <span>Faded out for Scheduled Night Mode</span>
            </p>
          ) : (
            <p className={`text-[10px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
              100% offline procedural Web Audio
            </p>
          )}
        </div>

        <div
          data-no-drag="true"
          data-no-canvas-swipe="true"
          onPointerDown={(e) => e.stopPropagation()}
          className="flex items-center gap-1.5 shrink-0"
        >
          <button
            type="button"
            onClick={handleCycleSleepTimer}
            title={isCursorHidden ? undefined : 'Cycle auto-fade sleep timer'}
            className={`px-2 py-1.5 rounded-xl text-[10px] font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
              sleepMin > 0
                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/35'
                : isLight
                  ? 'bg-slate-200/80 text-slate-600 hover:bg-slate-300/80'
                  : 'bg-gray-800/80 text-gray-300 hover:bg-gray-700'
            }`}
          >
            <Timer className="w-3 h-3" />
            <span>
              {remainingSleepSec !== null
                ? formatSleepTimerRemaining(remainingSleepSec)
                : sleepMin > 0
                  ? `${sleepMin}m`
                  : 'Sleep'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleTogglePlay}
            title={isCursorHidden ? undefined : isPlaying ? 'Pause soundscape' : 'Play soundscape'}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm ${
              isPlaying
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                : 'bg-cyan-600 hover:bg-cyan-500 text-white'
            }`}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            <span>{isPlaying ? 'Pause' : 'Play'}</span>
          </button>
        </div>
      </div>

      {/* 1-Tap Scene Presets */}
      <div
        data-no-drag="true"
        data-no-canvas-swipe="true"
        onPointerDown={(e) => e.stopPropagation()}
        className="flex flex-wrap gap-1.5 shrink-0"
      >
        {Object.values(SOUNDSCAPE_PRESETS).map((preset) => {
          const isActive = activePreset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleApplyPreset(preset.id);
              }}
              className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition-colors cursor-pointer ${
                isActive
                  ? 'bg-cyan-500/25 text-cyan-300 border border-cyan-500/40'
                  : isLight
                    ? 'bg-slate-200/70 text-slate-700 hover:bg-slate-300/70 border border-transparent'
                    : 'bg-gray-800/70 text-gray-300 hover:bg-gray-700/80 border border-transparent'
              }`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      {/* 5 Per-Channel Volume Sliders */}
      <div
        data-no-drag="true"
        data-no-canvas-swipe="true"
        onPointerDown={(e) => e.stopPropagation()}
        className="space-y-1.5 flex-1 min-h-0 overflow-y-auto pr-0.5"
      >
        {SOUNDSCAPE_CHANNELS.map((ch) => {
          const level = channels[ch.id];
          const Icon = CHANNEL_ICONS[ch.id];
          const channelActive = level > 0;
          return (
            <div
              key={ch.id}
              className={`px-2.5 py-1.5 rounded-xl flex items-center gap-2.5 ${cardSurfaceClass}`}
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleChannelChange(ch.id, channelActive ? 0 : 50);
                }}
                title={isCursorHidden ? undefined : channelActive ? `Mute ${ch.label}` : `Enable ${ch.label}`}
                className={`p-1 rounded-lg transition-colors cursor-pointer shrink-0 ${
                  channelActive
                    ? 'bg-cyan-500/20 text-cyan-400'
                    : isLight
                      ? 'text-slate-400 hover:text-slate-600'
                      : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>

              <span className="text-[11px] font-medium w-20 truncate shrink-0">{ch.shortLabel}</span>

              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={level}
                aria-label={`${ch.label} volume`}
                onChange={(e) => handleChannelChange(ch.id, Number(e.target.value))}
                className="flex-1 accent-cyan-500 h-1.5 cursor-pointer"
              />

              <span
                className={`text-[10px] font-mono w-8 text-right shrink-0 ${
                  channelActive
                    ? isLight
                      ? 'text-slate-700 font-semibold'
                      : 'text-cyan-300 font-semibold'
                    : isLight
                      ? 'text-slate-400'
                      : 'text-gray-500'
                }`}
              >
                {level}%
              </span>
            </div>
          );
        })}
      </div>

      {/* Master Volume Bar */}
      <div
        data-no-drag="true"
        data-no-canvas-swipe="true"
        onPointerDown={(e) => e.stopPropagation()}
        className={`px-2.5 py-1.5 rounded-xl flex items-center gap-2 shrink-0 ${cardSurfaceClass}`}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const nextMaster = masterVolume > 0 ? 0 : 70;
            setMasterVolume(nextMaster);
            if (isPlaying) ensureController().updateMix(channels, nextMaster);
            schedulePersistMix(channels, nextMaster);
          }}
          title={isCursorHidden ? undefined : masterVolume > 0 ? 'Mute master output' : 'Unmute master output'}
          className="p-1 rounded-lg text-cyan-400 hover:bg-cyan-500/15 cursor-pointer shrink-0"
        >
          {masterVolume > 0 && isAudible ? (
            <Volume2 className="w-3.5 h-3.5" />
          ) : (
            <VolumeX className="w-3.5 h-3.5 text-gray-500" />
          )}
        </button>

        <span className="text-[10px] font-semibold uppercase tracking-wider opacity-75 shrink-0">
          Master
        </span>

        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={masterVolume}
          aria-label="Master volume"
          onChange={(e) => {
            const nextMaster = Math.max(0, Math.min(100, Number(e.target.value)));
            setMasterVolume(nextMaster);
            if (isPlaying) ensureController().updateMix(channels, nextMaster);
            schedulePersistMix(channels, nextMaster);
          }}
          className="flex-1 accent-emerald-500 h-1.5 cursor-pointer"
        />

        <span className="text-[10px] font-mono w-8 text-right opacity-80 shrink-0">
          {masterVolume}%
        </span>
      </div>
    </div>
  );
};
