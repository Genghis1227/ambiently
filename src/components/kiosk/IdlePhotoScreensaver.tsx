import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Moon,
  Sun,
} from 'lucide-react';
import { PhotoFrameWidget } from '../widgets/PhotoFrameWidget';
import {
  fetchWeatherAlerts,
  fetchWeatherData,
  getAlertBadgeColors,
  type WeatherAlert,
  type WeatherData,
} from '../../services/weather';
import type {
  IdleScreensaverMode,
  IdleScreensaverPhotoStyle,
  IdleScreensaverPolaroidSizeMode,
} from '../../types/dashboard';
import type { ScreensaverWeatherLocation } from '../../utils/idleScreensaver';
import { formatTime, useTimePrefs } from '../../utils/timePrefs';

interface IdlePhotoScreensaverProps {
  onWake: () => void;
  mode: IdleScreensaverMode;
  photoStyle: IdleScreensaverPhotoStyle;
  mosaicKenBurns: boolean;
  polaroidCount: number;
  polaroidSizeMode: IdleScreensaverPolaroidSizeMode;
  rotationIntervalSec: number;
  photoOrder: 'random' | 'sequential';
  showCaptions: boolean;
  showDateTaken?: boolean;
  showClock: boolean;
  showWeather: boolean;
  weatherLocation: ScreensaverWeatherLocation | null;
}

const BURN_IN_SHIFTS = [
  { x: 0, y: 0 },
  { x: 8, y: 4 },
  { x: -6, y: 6 },
  { x: 6, y: -6 },
  { x: -8, y: -4 },
] as const;

function renderPillWeatherIcon(code: number, isDay: boolean) {
  const cls = 'w-5 h-5 shrink-0';
  switch (code) {
    case 0:
    case 1:
      return isDay ? (
        <Sun className={`${cls} text-amber-300`} />
      ) : (
        <Moon className={`${cls} text-indigo-200`} />
      );
    case 2:
      return <CloudSun className={`${cls} text-amber-200`} />;
    case 3:
      return <Cloud className={`${cls} text-slate-300`} />;
    case 45:
    case 48:
      return <CloudFog className={`${cls} text-slate-300`} />;
    case 51:
    case 53:
    case 55:
      return <CloudDrizzle className={`${cls} text-sky-300`} />;
    case 61:
    case 63:
    case 65:
    case 80:
    case 81:
    case 82:
      return <CloudRain className={`${cls} text-sky-300`} />;
    case 71:
    case 73:
    case 75:
    case 85:
    case 86:
      return <CloudSnow className={`${cls} text-cyan-200`} />;
    case 95:
    case 96:
    case 99:
      return <CloudLightning className={`${cls} text-yellow-300`} />;
    default:
      return <Sun className={`${cls} text-amber-300`} />;
  }
}

export const IdlePhotoScreensaver: React.FC<IdlePhotoScreensaverProps> = ({
  onWake,
  mode,
  photoStyle,
  mosaicKenBurns,
  polaroidCount,
  polaroidSizeMode,
  rotationIntervalSec,
  photoOrder,
  showCaptions,
  showDateTaken,
  showClock,
  showWeather,
  weatherLocation,
}) => {
  const { hour12 } = useTimePrefs();
  const [now, setNow] = useState(() => new Date());
  const [shiftIndex, setShiftIndex] = useState(0);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [isWaking, setIsWaking] = useState(false);
  const wakeTriggeredRef = useRef(false);
  const wakeTimerRef = useRef<number | null>(null);

  const weatherLat = weatherLocation?.latitude ?? null;
  const weatherLon = weatherLocation?.longitude ?? null;
  const weatherName = weatherLocation?.locationName ?? '';
  const weatherUnit = weatherLocation?.unit ?? 'F';

  const triggerWake = useCallback(
    (immediate = false) => {
      if (wakeTriggeredRef.current) return;
      wakeTriggeredRef.current = true;
      setIsWaking(true);

      if (wakeTimerRef.current !== null) {
        window.clearTimeout(wakeTimerRef.current);
        wakeTimerRef.current = null;
      }

      if (immediate) {
        onWake();
        return;
      }

      // Briefly keep this fullscreen surface mounted so trailing pointerup/click
      // events land here instead of clicking through to underlying dashboard controls.
      wakeTimerRef.current = window.setTimeout(() => {
        wakeTimerRef.current = null;
        onWake();
      }, 90);
    },
    [onWake]
  );

  useEffect(() => {
    return () => {
      if (wakeTimerRef.current !== null) {
        window.clearTimeout(wakeTimerRef.current);
      }
    };
  }, []);

  // Clock + subtle pixel-shift loop to avoid display burn-in
  useEffect(() => {
    const clockInterval = window.setInterval(() => {
      setNow(new Date());
    }, 10000);
    const shiftInterval = window.setInterval(() => {
      setShiftIndex((prev) => (prev + 1) % BURN_IN_SHIFTS.length);
    }, 60000);

    return () => {
      window.clearInterval(clockInterval);
      window.clearInterval(shiftInterval);
    };
  }, []);

  // Fetch local weather summary for the floating ambient corner pill
  useEffect(() => {
    if (!showWeather || weatherLat === null || weatherLon === null) return;
    let cancelled = false;

    const loadWeather = async () => {
      try {
        const [data, fetchedAlerts] = await Promise.all([
          fetchWeatherData(weatherLat, weatherLon, weatherName, weatherUnit),
          fetchWeatherAlerts(weatherLat, weatherLon),
        ]);
        if (!cancelled) {
          setWeather(data);
          setAlerts(fetchedAlerts);
        }
      } catch {
        // Silently omit weather pill on transient fetch failures
      }
    };

    loadWeather();
    const interval = window.setInterval(loadWeather, 15 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [showWeather, weatherLat, weatherLon, weatherName, weatherUnit]);

  // Wake cleanly on any keyboard interaction without forwarding the key to shortcuts underneath
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      triggerWake(true);
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [triggerWake]);

  const shift = BURN_IN_SHIFTS[shiftIndex];
  const activeWeather =
    showWeather && weatherLat !== null && weatherLon !== null ? weather : null;
  const topAlert = activeWeather && alerts.length > 0 ? alerts[0] : null;
  const showFloatingPill = showClock || Boolean(activeWeather);

  return (
    <div
      role="presentation"
      data-testid="idle-photo-screensaver"
      className={`fixed inset-0 z-[68] ${
        mode === 'canvas' ? 'bg-transparent' : 'bg-black'
      } select-none overflow-hidden transition-opacity duration-150 ${
        isWaking ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Full-viewport wake surface (kept inside fixed wrapper so click-through is absorbed safely) */}
      <div
        aria-hidden="true"
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          triggerWake(false);
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          triggerWake(false);
        }}
        className="absolute inset-0 z-10 cursor-pointer"
      />

      {/* Standalone Photo Slideshow (non-interactive so taps wake cleanly without triggering inner chevrons) */}
      {mode === 'photos' && (
        <div className="absolute inset-0 pointer-events-none">
          <PhotoFrameWidget
            key={`${photoStyle}-${photoOrder}-${rotationIntervalSec}`}
            widgetId={`__idle_screensaver_photo__:${photoStyle}`}
            useCommonSource={true}
            initialStyle={photoStyle}
            mosaicKenBurns={mosaicKenBurns}
            initialPolaroidCount={polaroidCount}
            initialPolaroidSizeMode={polaroidSizeMode}
            rotationIntervalSec={rotationIntervalSec}
            photoOrder={photoOrder}
            showCaptions={showCaptions}
            showDateTaken={showDateTaken}
            transparentBg={false}
            ignoreCanvasOcclusion={true}
          />
        </div>
      )}

      {/* Subtle bottom readability vignette (omitted in clean Canvas mode without overlay pills) */}
      {(mode === 'photos' || showFloatingPill) && (
        <div
          className="absolute inset-x-0 bottom-0 z-[15] h-44 bg-gradient-to-t from-black/65 via-black/20 to-transparent pointer-events-none"
          aria-hidden="true"
        />
      )}

      {/* Floating ambient clock & weather corner pill */}
      {showFloatingPill && (
        <div
          className="absolute bottom-6 left-6 sm:bottom-8 sm:left-8 z-20 pointer-events-none transition-transform duration-1000 ease-out"
          style={{ transform: `translate3d(${shift.x}px, ${shift.y}px, 0)` }}
        >
          <div className="flex flex-wrap items-center gap-4 px-5 py-3.5 rounded-2xl bg-black/45 backdrop-blur-md border border-white/15 shadow-2xl text-white">
            {showClock && (
              <div className="flex flex-col">
                <span className="text-3xl sm:text-4xl font-semibold tracking-tight leading-none tabular-nums">
                  {formatTime(now, { hour12 })}
                </span>
                <span className="text-xs text-white/75 font-medium mt-1">
                  {now.toLocaleDateString([], {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                  })}
                </span>
              </div>
            )}

            {showClock && activeWeather && (
              <div className="w-px h-9 bg-white/15 hidden sm:block" aria-hidden="true" />
            )}

            {activeWeather && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  {renderPillWeatherIcon(activeWeather.conditionCode, activeWeather.isDay)}
                  <span className="text-2xl sm:text-3xl font-semibold tabular-nums leading-none">
                    {activeWeather.currentTemp}°{activeWeather.unit}
                  </span>
                  <span className="text-xs text-white/80 font-medium hidden sm:inline">
                    {activeWeather.conditionText}
                  </span>
                </div>
                <span className="text-[11px] text-white/65 truncate max-w-[200px]">
                  {activeWeather.locationName}
                </span>
              </div>
            )}

            {topAlert && (
              <div
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${
                  getAlertBadgeColors(topAlert.severity, false).container
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate max-w-[180px]">{topAlert.event}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Quiet wake hint */}
      <div className="absolute bottom-6 right-6 sm:bottom-8 sm:right-8 z-20 pointer-events-none hidden sm:block">
        <span className="text-[11px] font-medium tracking-wide text-white/45 bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-full border border-white/10">
          Tap or press any key to wake
        </span>
      </div>
    </div>
  );
};
