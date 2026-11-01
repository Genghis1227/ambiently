import React, { useState, useEffect } from 'react';
import { Sun, Cloud, CloudRain, CloudSun, CloudFog, CloudDrizzle, Snowflake, CloudLightning, RefreshCw, MapPin } from 'lucide-react';
import { fetchWeatherData, type WeatherData } from '../../services/weather';

interface ClockWeatherWidgetProps {
  locationName?: string;
  latitude?: number;
  longitude?: number;
  unit?: 'F' | 'C';
  clockFace?: 'digital' | 'flip' | 'analog';
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
}) => {
  const [time, setTime] = useState(new Date());
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);

  // Live Clock updater
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

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
    // Refresh weather every 15 minutes
    const interval = setInterval(loadWeather, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [latitude, longitude, locationName, unit]);

  const hours = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).split(' ')[0];
  const ampm = time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).slice(-2);
  const seconds = time.getSeconds().toString().padStart(2, '0');
  const dateStr = time.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div className="w-full h-full flex flex-col justify-between select-none">
      {/* Clock Section */}
      <div className="flex flex-col items-start justify-center">
        {clockFace === 'analog' ? (
          <div className="relative w-28 h-28 rounded-full border-2 border-gray-700 bg-gray-950/60 flex items-center justify-center my-2 shadow-inner">
            {/* Analog Clock Hands */}
            <div
              className="absolute w-1 h-8 bg-white origin-bottom rounded-full"
              style={{
                transform: `rotate(${(time.getHours() % 12) * 30 + time.getMinutes() * 0.5}deg)`,
                bottom: '50%',
              }}
            />
            <div
              className="absolute w-0.5 h-11 bg-blue-400 origin-bottom rounded-full"
              style={{
                transform: `rotate(${time.getMinutes() * 6}deg)`,
                bottom: '50%',
              }}
            />
            <div
              className="absolute w-px h-12 bg-red-500 origin-bottom"
              style={{
                transform: `rotate(${time.getSeconds() * 6}deg)`,
                bottom: '50%',
              }}
            />
            <div className="w-2 h-2 rounded-full bg-white z-10" />
          </div>
        ) : (
          <div className="flex items-baseline gap-2">
            <span className="text-5xl md:text-6xl font-light tracking-tight text-white font-mono">
              {hours}
            </span>
            <div className="flex flex-col text-xs text-gray-400 font-mono">
              <span className="font-semibold text-blue-400">{ampm}</span>
              <span className="text-gray-500">{seconds}s</span>
            </div>
          </div>
        )}
        <span className="text-xs md:text-sm text-gray-400 font-medium tracking-wide mt-1">
          {dateStr}
        </span>
      </div>

      {/* Divider */}
      <div className="w-full h-px bg-gray-800/80 my-2" />

      {/* Weather Section */}
      {weather ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              {renderWeatherIcon(weather.conditionCode, weather.isDay)}
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold text-white">
                    {weather.currentTemp}°{weather.unit}
                  </span>
                  <span className="text-xs text-gray-400">
                    Feels {weather.apparentTemp}°
                  </span>
                </div>
                <div className="text-xs text-gray-300 font-medium">
                  {weather.conditionText}
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="flex items-center justify-end gap-1 text-[11px] text-gray-400">
                <MapPin className="w-3 h-3 text-blue-400" />
                <span className="truncate max-w-[100px]">{weather.locationName}</span>
              </div>
              <div className="text-[11px] text-gray-500 mt-0.5">
                H: {weather.highTemp}° • L: {weather.lowTemp}°
              </div>
            </div>
          </div>

          {/* 3-day micro forecast strip */}
          <div className="grid grid-cols-3 gap-1.5 pt-1.5 border-t border-gray-800/40">
            {weather.forecast.slice(1, 4).map((f) => (
              <div key={f.date} className="flex flex-col items-center bg-gray-950/40 rounded-lg py-1 px-1 text-center">
                <span className="text-[10px] text-gray-400">{f.dayName}</span>
                <span className="text-xs font-semibold text-gray-200 mt-0.5">{f.maxTemp}°</span>
                <span className="text-[9px] text-gray-500">{f.minTemp}°</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center py-4 text-xs text-gray-500 gap-2">
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Fetching weather...' : 'No weather data'}</span>
        </div>
      )}
    </div>
  );
};
