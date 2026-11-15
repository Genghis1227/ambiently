import React, { useCallback, useEffect, useState } from 'react';
import { MapPin, RefreshCw, Sun, Wind, Leaf, WifiOff } from 'lucide-react';
import {
  classifyPollenLevel,
  classifyUsAqi,
  classifyUvIndex,
  fetchAirQualityData,
  type AirQualityBadgeTone,
  type AirQualityData,
} from '../../services/airQuality';
import { useDisplayActivity } from '../../utils/displayActivity';
import { useDashboardStore } from '../../store/dashboardStore';
import { isAmbientlyInNightMode } from '../../utils/confetti';

interface AirQualityWidgetProps {
  locationName?: string;
  latitude?: number;
  longitude?: number;
  showPollen?: boolean;
  showUvStrip?: boolean;
  refreshIntervalMin?: 15 | 30 | 60;
  isLight?: boolean;
  transparentBg?: boolean;
}

function getToneClasses(tone: AirQualityBadgeTone, isLight: boolean): string {
  switch (tone) {
    case 'emerald':
      return isLight
        ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
        : 'bg-emerald-500/20 border-emerald-500/35 text-emerald-300';
    case 'amber':
      return isLight
        ? 'bg-amber-100 border-amber-300 text-amber-800'
        : 'bg-amber-500/20 border-amber-500/35 text-amber-300';
    case 'orange':
      return isLight
        ? 'bg-orange-100 border-orange-300 text-orange-800'
        : 'bg-orange-500/20 border-orange-500/35 text-orange-300';
    case 'rose':
      return isLight
        ? 'bg-rose-100 border-rose-300 text-rose-800'
        : 'bg-rose-500/20 border-rose-500/35 text-rose-300';
    case 'purple':
      return isLight
        ? 'bg-purple-100 border-purple-300 text-purple-800'
        : 'bg-purple-500/20 border-purple-500/35 text-purple-300';
  }
}

function getPollenBadgeClasses(
  level: 'none' | 'low' | 'moderate' | 'high' | 'unavailable',
  isLight: boolean
): string {
  switch (level) {
    case 'none':
    case 'low':
      return isLight ? 'text-emerald-700' : 'text-emerald-300';
    case 'moderate':
      return isLight ? 'text-amber-700' : 'text-amber-300';
    case 'high':
      return isLight ? 'text-rose-700' : 'text-rose-300';
    default:
      return isLight ? 'text-slate-500' : 'text-gray-400';
  }
}

export const AirQualityWidget: React.FC<AirQualityWidgetProps> = ({
  locationName = 'Austin, TX',
  latitude = 30.2672,
  longitude = -97.7431,
  showPollen = true,
  showUvStrip = true,
  refreshIntervalMin = 30,
  isLight = false,
  transparentBg = false,
}) => {
  const [data, setData] = useState<AirQualityData | null>(null);
  const [isStaleCache, setIsStaleCache] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { isTabHidden, isNightMode } = useDisplayActivity();
  const dashboardSettings = useDashboardStore((s) => s.settings);
  const nightActive = isNightMode || isAmbientlyInNightMode(dashboardSettings);

  const loadAirQuality = useCallback(
    async (forceRefresh: boolean = false) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetchAirQualityData(latitude, longitude, locationName, forceRefresh);
        setData(res.data);
        setIsStaleCache(res.isStaleCache);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to fetch air quality');
      } finally {
        setLoading(false);
      }
    },
    [latitude, longitude, locationName]
  );

  useEffect(() => {
    void loadAirQuality(false);
    const intervalMs = Math.max(15, refreshIntervalMin) * 60 * 1000;
    const id = window.setInterval(() => {
      if (isTabHidden || nightActive) return;
      void loadAirQuality(false);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [loadAirQuality, refreshIntervalMin, isTabHidden, nightActive]);

  const stickerShadow = transparentBg && !isLight ? 'drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]' : '';
  const pillBoxClass = transparentBg
    ? 'bg-transparent border-transparent'
    : isLight
      ? 'bg-slate-100/90 border-slate-200/90'
      : 'bg-gray-950/45 border-white/5';

  const aqiMeta = data ? classifyUsAqi(data.usAqi) : null;
  const uvMeta = data ? classifyUvIndex(data.uvIndex) : null;
  const aqiMarkerPct = data ? Math.max(2, Math.min(98, (data.usAqi / 250) * 100)) : 5;

  return (
    <div className={`w-full h-full flex flex-col justify-between select-none p-1 ${stickerShadow}`}>
      {/* Header */}
      <div className={`flex items-center justify-between text-xs ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>
        <div className={`flex items-center gap-1.5 font-medium truncate max-w-[78%] ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
          <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="truncate">{data?.locationName || locationName}</span>
          {isStaleCache && (
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${
                isLight
                  ? 'bg-amber-100 border-amber-300 text-amber-800'
                  : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
              }`}
              title="Showing cached data while offline"
            >
              <WifiOff className="w-2.5 h-2.5" />
              <span>Cached</span>
            </span>
          )}
        </div>

        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => void loadAirQuality(true)}
          disabled={loading}
          className={`p-1 rounded-md transition-colors cursor-pointer ${
            isLight ? 'hover:text-slate-900 text-slate-500' : 'hover:text-white text-gray-400'
          }`}
          title="Refresh air quality"
          aria-label="Refresh air quality"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Main Content */}
      {data && aqiMeta && uvMeta ? (
        <div className="my-auto flex flex-col gap-2.5 py-1">
          {/* Hero AQI & UV */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-4xl font-extralight tracking-tight font-mono tabular-nums ${
                    isLight ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  {data.usAqi}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getToneClasses(
                    aqiMeta.badgeTone,
                    isLight
                  )}`}
                >
                  {aqiMeta.label}
                </span>
              </div>
              <div
                className={`text-[11px] font-medium mt-0.5 truncate ${
                  isLight ? 'text-slate-600' : 'text-gray-300'
                }`}
              >
                {aqiMeta.guidance}
              </div>
            </div>

            <div className="text-right shrink-0 space-y-1">
              <div
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[10px] font-semibold ${getToneClasses(
                  uvMeta.badgeTone,
                  isLight
                )}`}
              >
                <Sun className="w-3 h-3" />
                <span>UV {data.uvIndex}</span>
              </div>
              <div
                className={`text-[10px] font-mono ${isLight ? 'text-slate-500' : 'text-gray-400'}`}
              >
                PM2.5: {data.pm25} µg/m³
              </div>
            </div>
          </div>

          {/* AQI Spectrum Bar */}
          <div className="relative py-1">
            <div className="h-1.5 w-full rounded-full overflow-hidden flex opacity-85">
              <div className="h-full flex-1 bg-emerald-400" />
              <div className="h-full flex-1 bg-amber-400" />
              <div className="h-full flex-1 bg-orange-400" />
              <div className="h-full flex-1 bg-rose-400" />
              <div className="h-full flex-1 bg-purple-400" />
            </div>
            <div
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border-2 shadow ${
                isLight ? 'bg-slate-900 border-white' : 'bg-white border-gray-900'
              }`}
              style={{ left: `${aqiMarkerPct}%` }}
            />
          </div>

          {/* Allergy Pollen OR Particulate Air Breakdown */}
          {showPollen && (
            <div className="grid grid-cols-3 gap-1.5">
              {data.hasPollenData ? (
                (
                  [
                    { label: 'Tree', val: data.treePollen, kind: 'tree' },
                    { label: 'Grass', val: data.grassPollen, kind: 'grass' },
                    { label: 'Weed', val: data.weedPollen, kind: 'weed' },
                  ] as const
                ).map((item) => {
                  const status = classifyPollenLevel(item.val, item.kind);
                  return (
                    <div
                      key={item.label}
                      className={`rounded-xl border px-2 py-1.5 text-center ${pillBoxClass}`}
                    >
                      <div
                        className={`text-[10px] font-semibold flex items-center justify-center gap-1 ${
                          isLight ? 'text-slate-500' : 'text-gray-400'
                        }`}
                      >
                        <Leaf className="w-2.5 h-2.5 text-emerald-400/80" />
                        <span>{item.label}</span>
                      </div>
                      <div
                        className={`text-xs font-bold mt-0.5 ${getPollenBadgeClasses(
                          status.level,
                          isLight
                        )}`}
                      >
                        {status.label}
                      </div>
                      {status.value !== null && (
                        <div
                          className={`text-[9px] font-mono ${
                            isLight ? 'text-slate-500' : 'text-gray-500'
                          }`}
                        >
                          {status.value} g/m³
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <>
                  <div className={`rounded-xl border px-2 py-1.5 text-center ${pillBoxClass}`}>
                    <div className={`text-[10px] font-semibold ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                      PM2.5
                    </div>
                    <div className={`text-xs font-bold font-mono mt-0.5 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      {data.pm25}
                    </div>
                    <div className={`text-[9px] ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>µg/m³</div>
                  </div>
                  <div className={`rounded-xl border px-2 py-1.5 text-center ${pillBoxClass}`}>
                    <div className={`text-[10px] font-semibold ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                      PM10
                    </div>
                    <div className={`text-xs font-bold font-mono mt-0.5 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      {data.pm10}
                    </div>
                    <div className={`text-[9px] ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>µg/m³</div>
                  </div>
                  <div className={`rounded-xl border px-2 py-1.5 text-center ${pillBoxClass}`}>
                    <div className={`text-[10px] font-semibold ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                      Ozone O₃
                    </div>
                    <div className={`text-xs font-bold font-mono mt-0.5 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      {data.ozone}
                    </div>
                    <div className={`text-[9px] ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>µg/m³</div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Daytime UV Strip */}
          {showUvStrip && data.hourlyUvSlots.length > 0 && (
            <div
              className={`pt-2 border-t ${
                transparentBg
                  ? 'border-transparent'
                  : isLight
                    ? 'border-slate-200'
                    : 'border-gray-800/80'
              }`}
            >
              <div className="flex items-center justify-between text-[10px] mb-1">
                <span className={`font-semibold uppercase tracking-wider ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                  Daytime UV
                </span>
                <span className={`font-mono ${isLight ? 'text-slate-600' : 'text-gray-300'}`}>
                  Peak {data.peakUv} • {classifyUvIndex(data.peakUv).label}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {data.hourlyUvSlots.map((slot) => {
                  const slotMeta = classifyUvIndex(slot.uvIndex);
                  return (
                    <div
                      key={slot.hour24}
                      className={`rounded-lg border py-1 px-1.5 text-center ${pillBoxClass}`}
                    >
                      <div className={`text-[9px] font-semibold ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                        {slot.label}
                      </div>
                      <div
                        className={`text-xs font-mono font-bold mt-0.5 ${
                          slotMeta.badgeTone === 'emerald'
                            ? isLight
                              ? 'text-emerald-700'
                              : 'text-emerald-300'
                            : slotMeta.badgeTone === 'amber'
                              ? isLight
                                ? 'text-amber-700'
                                : 'text-amber-300'
                              : slotMeta.badgeTone === 'orange'
                                ? isLight
                                  ? 'text-orange-700'
                                  : 'text-orange-300'
                                : isLight
                                  ? 'text-rose-700'
                                  : 'text-rose-300'
                        }`}
                      >
                        {slot.uvIndex}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : error ? (
        <div
          className={`flex flex-col items-center justify-center my-auto py-4 text-center text-xs ${
            isLight ? 'text-slate-600' : 'text-gray-400'
          }`}
        >
          <Wind className="w-6 h-6 text-gray-500 mb-1.5" />
          <span className="font-medium">Air quality unavailable offline</span>
          <span className="text-[10px] opacity-75 mt-0.5 max-w-[200px] truncate">{error}</span>
        </div>
      ) : (
        <div
          className={`flex flex-col items-center justify-center my-auto py-6 text-xs ${
            isLight ? 'text-slate-500' : 'text-gray-500'
          }`}
        >
          <RefreshCw className="w-6 h-6 animate-spin text-emerald-400 mb-2" />
          <span>Checking air quality & UV...</span>
        </div>
      )}
    </div>
  );
};
