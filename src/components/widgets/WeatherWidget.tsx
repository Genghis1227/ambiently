import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDisplayActivity } from '../../utils/displayActivity';
import { AlertTriangle } from 'lucide-react';
import { useTimePrefs } from '../../utils/timePrefs';
import {
  fetchWeatherAlerts,
  fetchWeatherData,
  formatHourlyPointTime,
  getAlertBadgeColors,
  type WeatherAlert,
  type WeatherData,
} from '../../services/weather';
import { WeatherAlertModal } from '../weather/WeatherAlertModal';
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

interface WeatherWidgetProps {
  locationName?: string;
  latitude?: number;
  longitude?: number;
  unit?: 'F' | 'C';
  isLight?: boolean;
  transparentBg?: boolean;
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
  if ((code >= 61 && code <= 65) || (code >= 80 && code <= 82)) {
    return <CloudRain className={`${size} text-blue-400 drop-shadow`} />;
  }
  if ((code >= 71 && code <= 75) || code === 85 || code === 86) {
    return <Snowflake className={`${size} text-cyan-200 drop-shadow`} />;
  }
  if (code >= 95) return <CloudLightning className={`${size} text-purple-400 drop-shadow`} />;
  return <CloudSun className={`${size} text-amber-300 drop-shadow`} />;
};

export const WeatherWidget: React.FC<WeatherWidgetProps> = ({
  locationName = 'Austin, TX',
  latitude = 30.2672,
  longitude = -97.7431,
  unit = 'F',
  isLight = false,
  transparentBg = false,
}) => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [nwsAlerts, setNwsAlerts] = useState<WeatherAlert[]>([]);
  const alertReqIdRef = useRef(0);
  const { hour12 } = useTimePrefs();
  const [forecastMode, setForecastMode] = useState<'daily' | 'hourly'>('daily');
  const [isAlertModalOpen, setIsAlertModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { shouldPauseAnimations } = useDisplayActivity();
  const shouldPauseRef = useRef(shouldPauseAnimations);
  useEffect(() => {
    shouldPauseRef.current = shouldPauseAnimations;
  }, [shouldPauseAnimations]);
  const wasPausedRef = useRef(false);
  const lastFetchAtRef = useRef(0);

  const loadWeather = useCallback(
    async (forceRefresh = false) => {
      lastFetchAtRef.current = Date.now();
      setLoading(true);
      const reqId = ++alertReqIdRef.current;
      void fetchWeatherAlerts(latitude, longitude, forceRefresh)
        .then((nextAlerts) => {
          if (alertReqIdRef.current === reqId) {
            setNwsAlerts(nextAlerts);
          }
        })
        .catch(() => {});
      try {
        const data = await fetchWeatherData(latitude, longitude, locationName, unit, forceRefresh);
        setWeather(data);
      } catch (err) {
        console.warn('Weather fetch error:', err);
      } finally {
        setLoading(false);
      }
    },
    [latitude, longitude, locationName, unit]
  );

  useEffect(() => {
    void loadWeather();
    const interval = setInterval(() => {
      if ((typeof document !== 'undefined' && document.visibilityState === 'hidden') || shouldPauseRef.current) return;
      void loadWeather();
    }, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadWeather]);

  useEffect(() => {
    if (
      wasPausedRef.current &&
      !shouldPauseAnimations &&
      Date.now() - lastFetchAtRef.current >= 15 * 60 * 1000
    ) {
      void loadWeather();
    }
    wasPausedRef.current = shouldPauseAnimations;
  }, [shouldPauseAnimations, loadWeather]);

  const stickerShadow = transparentBg && !isLight ? 'drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]' : '';

  const alerts = nwsAlerts.length > 0 ? nwsAlerts : (weather?.alerts ?? []);
  const topAlert = alerts[0] ?? null;
  const hourlyPoints = weather?.hourly ?? [];
  const hasHourly = hourlyPoints.length > 0;
  const showHourlyStrip = forecastMode === 'hourly' && hasHourly;

  return (
    <div className={`w-full h-full flex flex-col justify-between select-none p-1 ${stickerShadow}`}>
      {/* Top Header: Location & Refresh */}
      <div className={`flex items-center justify-between text-xs ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>
        <div className={`flex items-center gap-1.5 font-medium truncate max-w-[80%] ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
          <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span className="truncate">{weather?.locationName || locationName}</span>
        </div>
        <button
          onClick={() => void loadWeather(true)}
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
          {topAlert && (
            <button
              type="button"
              onClick={() => setIsAlertModalOpen(true)}
              className={`w-full mb-2 px-2.5 py-1.5 rounded-lg border flex items-center justify-between gap-2 text-left text-[11px] font-semibold transition-colors cursor-pointer ${
                getAlertBadgeColors(topAlert.severity, isLight).container
              }`}
              title="View active NOAA/NWS weather alert details"
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{topAlert.event}</span>
              </span>
              <span className="text-[10px] opacity-85 shrink-0">
                {alerts.length > 1 ? `+${alerts.length - 1} more` : topAlert.severity}
              </span>
            </button>
          )}

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
                <span>{weather.windSpeed} {weather.unit === 'C' ? 'km/h' : 'mph'}</span>
              </div>
            </div>
          </div>

          {/* 5-Day Daily / Hourly Forecast Pill Strip */}
          {((weather.forecast && weather.forecast.length > 0) || hasHourly) && (
            <div
              className={`mt-3 pt-2.5 border-t ${
                transparentBg ? 'border-transparent' : isLight ? 'border-slate-200' : 'border-gray-800/80'
              }`}
            >
              {hasHourly && (
                <div className="flex items-center justify-between mb-1.5 px-0.5">
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wider ${
                      isLight ? 'text-slate-500' : 'text-gray-400'
                    }`}
                  >
                    {showHourlyStrip ? 'Next Hours' : '5-Day Outlook'}
                  </span>
                  <div
                    className={`inline-flex items-center rounded-lg p-0.5 border ${
                      isLight
                        ? 'bg-slate-100 border-slate-200'
                        : 'bg-gray-950/60 border-white/10'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setForecastMode('daily')}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors cursor-pointer ${
                        !showHourlyStrip
                          ? isLight
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'bg-white/15 text-white'
                          : isLight
                          ? 'text-slate-500 hover:text-slate-800'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      5-Day
                    </button>
                    <button
                      type="button"
                      onClick={() => setForecastMode('hourly')}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors cursor-pointer ${
                        showHourlyStrip
                          ? isLight
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'bg-white/15 text-white'
                          : isLight
                          ? 'text-slate-500 hover:text-slate-800'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      Hourly
                    </button>
                  </div>
                </div>
              )}

              {showHourlyStrip ? (
                <div className="flex items-stretch gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                  {hourlyPoints.slice(0, 12).map((pt, idx) => (
                    <div
                      key={pt.time || idx}
                      className={`flex-none min-w-[50px] flex flex-col items-center rounded-lg p-1.5 text-center border ${
                        transparentBg
                          ? 'bg-transparent border-transparent'
                          : isLight
                          ? 'bg-slate-100/90 border-slate-200/90'
                          : 'bg-gray-950/40 border-white/5'
                      }`}
                    >
                      <span
                        className={`text-[10px] font-semibold tracking-tight ${
                          isLight ? 'text-slate-600' : 'text-gray-400'
                        }`}
                      >
                        {idx === 0 ? 'Now' : formatHourlyPointTime(pt.time, hour12)}
                      </span>
                      <div className="my-1">
                        {renderWeatherIcon(pt.weatherCode, pt.isDay, 'w-4 h-4')}
                      </div>
                      <div
                        className={`text-[11px] font-mono font-medium ${
                          isLight ? 'text-slate-900' : 'text-white'
                        }`}
                      >
                        {pt.temp}°
                      </div>
                      <div
                        className={`flex items-center gap-0.5 text-[9px] font-mono ${
                          pt.precipProb >= 20
                            ? 'text-sky-400 font-semibold'
                            : isLight
                            ? 'text-slate-400'
                            : 'text-gray-500'
                        }`}
                      >
                        <Droplets className="w-2.5 h-2.5 shrink-0" />
                        <span>{pt.precipProb}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-5 gap-1.5">
                  {weather.forecast.slice(0, 5).map((day, idx) => (
                    <div
                      key={day.date || idx}
                      className={`flex flex-col items-center rounded-lg p-1.5 text-center border ${
                        transparentBg
                          ? 'bg-transparent border-transparent'
                          : isLight
                          ? 'bg-slate-100/90 border-slate-200/90'
                          : 'bg-gray-950/40 border-white/5'
                      }`}
                    >
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wider ${
                          isLight ? 'text-slate-600' : 'text-gray-400'
                        }`}
                      >
                        {idx === 0 ? 'Today' : day.dayName.slice(0, 3)}
                      </span>
                      <div className="my-1">
                        {renderWeatherIcon(day.conditionCode, true, 'w-5 h-5')}
                      </div>
                      <div
                        className={`text-[11px] font-mono font-medium ${
                          isLight ? 'text-slate-900' : 'text-white'
                        }`}
                      >
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
          )}

          <WeatherAlertModal
            isOpen={isAlertModalOpen}
            onClose={() => setIsAlertModalOpen(false)}
            alerts={alerts}
            locationName={weather.locationName}
          />
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
