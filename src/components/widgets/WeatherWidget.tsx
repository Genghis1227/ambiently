import React, { useState, useEffect } from 'react';
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
  Wind,
  Droplets,
  Thermometer,
} from 'lucide-react';
import { fetchWeatherData, type WeatherData } from '../../services/weather';

interface WeatherWidgetProps {
  locationName?: string;
  latitude?: number;
  longitude?: number;
  unit?: 'F' | 'C';
  isLight?: boolean;
}

const renderWeatherIcon = (code: number, isDay: boolean, size = 'w-10 h-10') => {
  if (code === 0 || code === 1) {
    return isDay ? (
      <Sun className={`${size} text-amber-400 drop-shadow`} />
    ) : (
      <Sun className={`${size} text-amber-200 drop-shadow`} />
    );
  }
  if (code === 2) return <CloudSun className={`${size} text-amber-300 drop-shadow`} />;
  if (code === 3) return <Cloud className={`${size} text-slate-300 drop-shadow`} />;
  if (code === 45 || code === 48) return <CloudFog className={`${size} text-slate-400 drop-shadow`} />;
  if (code >= 51 && code <= 55) return <CloudDrizzle className={`${size} text-blue-300 drop-shadow`} />;
  if (code >= 61 && code <= 65) return <CloudRain className={`${size} text-blue-400 drop-shadow`} />;
  if (code >= 71 && code <= 75) return <Snowflake className={`${size} text-cyan-200 drop-shadow`} />;
  if (code >= 95) return <CloudLightning className={`${size} text-purple-400 drop-shadow`} />;
  return <CloudSun className={`${size} text-amber-300 drop-shadow`} />;
};

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({
  locationName = 'Austin, TX',
  latitude = 30.2672,
  longitude = -97.7431,
  unit = 'F',
  isLight = false,
}) => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);

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
    const interval = setInterval(loadWeather, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [latitude, longitude, locationName, unit]);

  return (
    <div className="w-full h-full flex flex-col justify-between select-none p-1">
      {/* Top Header: Location & Refresh */}
      <div className={`flex items-center justify-between text-xs ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>
        <div className={`flex items-center gap-1.5 font-medium truncate max-w-[80%] ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
          <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span className="truncate">{weather?.locationName || locationName}</span>
        </div>
        <button
          onClick={loadWeather}
          disabled={loading}
          className={`p-1 transition-colors ${isLight ? 'hover:text-slate-900 text-slate-500' : 'hover:text-white text-gray-400'}`}
          title="Refresh forecast"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Main Condition & Temp Display */}
      {weather ? (
        <div className="my-auto py-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {renderWeatherIcon(weather.conditionCode, weather.isDay, 'w-12 h-12 md:w-14 md:h-14')}
              <div>
                <div className={`text-4xl md:text-5xl font-extralight tracking-tight font-mono ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {weather.currentTemp}°
                  <span className={`text-lg font-normal ml-0.5 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{weather.unit}</span>
                </div>
                <div className={`text-xs font-medium ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
                  {weather.conditionText}
                </div>
              </div>
            </div>

            {/* Quick Metrics */}
            <div className={`text-right text-[11px] space-y-1 font-mono ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>
              <div className="flex items-center justify-end gap-1">
                <Thermometer className="w-3 h-3 text-amber-400/80" />
                <span>H: {weather.highTemp}° L: {weather.lowTemp}°</span>
              </div>
              <div className="flex items-center justify-end gap-1">
                <Droplets className="w-3 h-3 text-blue-400/80" />
                <span>{weather.humidity}% hum</span>
              </div>
              <div className="flex items-center justify-end gap-1">
                <Wind className="w-3 h-3 text-cyan-400/80" />
                <span>{weather.windSpeed} mph</span>
              </div>
            </div>
          </div>

          {/* 5-Day Daily Forecast Pill Strip */}
          {weather.forecast && weather.forecast.length > 0 && (
            <div className={`grid grid-cols-5 gap-1.5 mt-3 pt-3 border-t ${isLight ? 'border-slate-200' : 'border-gray-800/80'}`}>
              {weather.forecast.slice(0, 5).map((day, idx) => (
                <div
                  key={day.date || idx}
                  className={`flex flex-col items-center rounded-lg p-1.5 text-center border ${
                    isLight
                      ? 'bg-slate-100/90 border-slate-200/90'
                      : 'bg-gray-950/40 border-white/5'
                  }`}
                >
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>
                    {idx === 0 ? 'Today' : day.dayName.slice(0, 3)}
                  </span>
                  <div className="my-1">
                    {renderWeatherIcon(day.conditionCode, true, 'w-5 h-5')}
                  </div>
                  <div className={`text-[11px] font-mono font-medium ${isLight ? 'text-slate-900' : 'text-white'}`}>
                    {day.maxTemp}°
                  </div>
                  <div className={`text-[9px] font-mono ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>
                    {day.minTemp}°
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className={`flex flex-col items-center justify-center my-auto py-6 text-xs ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>
          <RefreshCw className="w-6 h-6 animate-spin text-blue-400 mb-2" />
          <span>Fetching weather forecast...</span>
        </div>
      )}
    </div>
  );
};
