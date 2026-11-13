import React, { useState, useEffect } from 'react';
import { useTimePrefs } from '../../utils/timePrefs';
import {
  Sun,
  Cloud,
  CloudRain,
  CloudSun,
  CloudFog,
  CloudDrizzle,
  Snowflake,
  CloudLightning,
  RefreshCw,
  MapPin,
} from 'lucide-react';
import { fetchWeatherData, type WeatherData } from '../../services/weather';
import { getFormattedTimeForZone } from './WorldClockWidget';

interface ClockWeatherWidgetProps {
  locationName?: string;
  latitude?: number;
  longitude?: number;
  unit?: 'F' | 'C';
  clockFace?: 'digital' | 'minimal' | 'flip' | 'analog';
  showSeconds?: boolean;
  timezone?: string;
  clockAlign?: 'center' | 'left';
  isLight?: boolean;
  transparentBg?: boolean;
}

const renderWeatherIcon = (code: number, isDay: boolean) => {
  if (code === 0 || code === 1) {
    return isDay ? <Sun className="w-8 h-8 text-amber-400" /> : <Sun className="w-8 h-8 text-amber-200" />;
  }
  if (code === 2) return <CloudSun className="w-8 h-8 text-amber-300" />;
  if (code === 3) return <Cloud className="w-8 h-8 text-slate-300" />;
  if (code === 45 || code === 48) return <CloudFog className="w-8 h-8 text-slate-400" />;
  if (code >= 51 && code <= 55) return <CloudDrizzle className="w-8 h-8 text-blue-300" />;
  if (code >= 61 && code <= 65) return <CloudRain className="w-8 h-8 text-blue-400" />;
  if (code >= 71 && code <= 75) return <Snowflake className="w-8 h-8 text-cyan-200" />;
  if (code >= 95) return <CloudLightning className="w-8 h-8 text-purple-400" />;
  return <CloudSun className="w-8 h-8 text-amber-300" />;
};

export const ClockWeatherWidget: React.FC<ClockWeatherWidgetProps> = ({
  locationName = 'Austin, TX',
  latitude = 30.2672,
  longitude = -97.7431,
  unit = 'F',
  clockFace = 'digital',
  showSeconds = true,
  timezone,
  clockAlign = 'center',
  isLight = false,
  transparentBg = false,
}) => {
  const { hour12 } = useTimePrefs();
  const [time, setTime] = useState(new Date());
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);

  // Live Clock updater (pauses when display/tab is sleeping)
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;

    const startTimer = () => {
      if (timer) clearInterval(timer);
      setTime(new Date());
      timer = setInterval(() => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        setTime(new Date());
      }, showSeconds ? 1000 : 10000);
    };

    const handleVisibility = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        startTimer();
      }
    };

    startTimer();
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [showSeconds]);

  // Fetch Weather
  const loadWeather = async () => {
    setLoading(true);
    try {
      const data = await fetchWeatherData(latitude, longitude, locationName, unit);
      setWeather(data);
    } catch (err) {
      console.warn('Weather fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWeather();
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      loadWeather();
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [latitude, longitude, locationName, unit]);

  const zt = getFormattedTimeForZone(time, timezone, hour12);
  const stickerShadow = transparentBg && !isLight ? 'drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]' : '';

  return (
    <div className={`w-full h-full flex flex-col justify-between select-none ${stickerShadow}`}>
      {/* Clock Section */}
      <div className={`flex flex-col justify-center ${clockAlign === 'left' ? 'items-start text-left' : 'items-center text-center'}`}>
        {clockFace === 'analog' ? (
          <div className={`relative w-28 h-28 rounded-full border-2 flex items-center justify-center my-2 ${
            isLight
              ? 'border-slate-300 bg-slate-100/90 shadow-sm'
              : 'border-gray-700 bg-gray-950/60 shadow-inner'
          }`}>
            {/* Analog Clock Hands */}
            <div
              className={`absolute w-1 h-8 origin-bottom rounded-full ${isLight ? 'bg-slate-900' : 'bg-white'}`}
              style={{
                transform: `rotate(${(zt.hour24 % 12) * 30 + zt.minuteNum * 0.5}deg)`,
                bottom: '50%',
              }}
            />
            <div
              className={`absolute w-0.5 h-11 origin-bottom rounded-full ${isLight ? 'bg-blue-600' : 'bg-blue-400'}`}
              style={{
                transform: `rotate(${zt.minuteNum * 6}deg)`,
                bottom: '50%',
              }}
            />
            {showSeconds && (
              <div
                className="absolute w-px h-12 bg-red-500 origin-bottom"
                style={{
                  transform: `rotate(${zt.secondNum * 6}deg)`,
                  bottom: '50%',
                }}
              />
            )}
            <div className={`w-2 h-2 rounded-full z-10 ${isLight ? 'bg-slate-900' : 'bg-white'}`} />
          </div>
        ) : clockFace === 'minimal' ? (
          <div className={`flex items-baseline gap-2.5 ${clockAlign === 'left' ? 'justify-start' : 'justify-center'}`}>
            <span className={`text-5xl md:text-6xl font-sans font-bold tracking-tighter ${isLight ? 'text-slate-900' : 'text-white'}`}>
              {zt.hoursMinutes}
            </span>
            <span className={`text-xs font-semibold uppercase tracking-[0.2em] ${isLight ? 'text-blue-600' : 'text-blue-400'}`}>
              {zt.ampm} {showSeconds ? `• ${zt.seconds}s` : ''}
            </span>
          </div>
        ) : (
          <div className={`flex items-baseline gap-2 ${clockAlign === 'left' ? 'justify-start' : 'justify-center'}`}>
            <span className={`text-5xl md:text-6xl font-light tracking-tight font-mono ${isLight ? 'text-slate-900' : 'text-white'}`}>
              {zt.hoursMinutes}
            </span>
            <div className="flex flex-col text-xs font-mono items-start text-left">
              <span className={`font-semibold ${isLight ? 'text-blue-600' : 'text-blue-400'}`}>{zt.ampm}</span>
              {showSeconds && <span className={isLight ? 'text-slate-500' : 'text-gray-500'}>{zt.seconds}s</span>}
            </div>
          </div>
        )}
        <span className={`text-xs md:text-sm font-medium tracking-wide mt-1 ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>
          {zt.dateStr}
        </span>
      </div>

      {/* Divider */}
      <div className={`w-full h-px my-2 ${transparentBg ? 'bg-transparent' : isLight ? 'bg-slate-200' : 'bg-gray-800/80'}`} />

      {/* Weather Section */}
      {weather ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {renderWeatherIcon(weather.conditionCode, weather.isDay)}
              <div>
                <div className="flex items-baseline gap-1">
                  <span className={`text-2xl font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {weather.currentTemp}°{weather.unit}
                  </span>
                  <span className={`text-xs ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                    Feels {weather.apparentTemp}°
                  </span>
                </div>
                <div className={`text-xs font-medium ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
                  {weather.conditionText}
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className={`flex items-center justify-end gap-1 text-[11px] ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>
                <MapPin className="w-3 h-3 text-blue-400" />
                <span className="truncate max-w-[100px]">{weather.locationName}</span>
              </div>
              <div className={`text-[11px] mt-0.5 ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>
                H: {weather.highTemp}° • L: {weather.lowTemp}°
              </div>
            </div>
          </div>

          {/* 3-day micro forecast strip */}
          <div className={`grid grid-cols-3 gap-1.5 pt-1.5 border-t ${
            transparentBg ? 'border-transparent' : isLight ? 'border-slate-200' : 'border-gray-800/40'
          }`}>
            {weather.forecast.slice(1, 4).map((f) => (
              <div
                key={f.date}
                className={`flex flex-col items-center rounded-lg py-1 px-1 text-center ${
                  transparentBg
                    ? 'bg-transparent border-0'
                    : isLight
                    ? 'bg-slate-100/90 border border-slate-200/80 text-slate-800'
                    : 'bg-gray-950/40'
                }`}
              >
                <span className={`text-[10px] ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>{f.dayName}</span>
                <span className={`text-xs font-semibold mt-0.5 ${isLight ? 'text-slate-900' : 'text-gray-200'}`}>{f.maxTemp}°</span>
                <span className={`text-[9px] ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>{f.minTemp}°</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className={`flex items-center justify-center py-4 text-xs gap-2 ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Fetching weather...' : 'No weather data'}</span>
        </div>
      )}
    </div>
  );
};
