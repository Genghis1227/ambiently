import React, { useState, useEffect } from 'react';
import { Globe, Sun, Moon, GripVertical } from 'lucide-react';

export interface WorldClockCity {
  id: string;
  cityName: string;
  country?: string;
  timezone: string; // IANA timezone e.g. 'Asia/Tokyo', 'Europe/London'
}

export const DEFAULT_WORLD_CITIES: WorldClockCity[] = [
  {
    id: 'wc-tokyo',
    cityName: 'Tokyo',
    country: 'Japan',
    timezone: 'Asia/Tokyo',
  },
];

export function getZoneOffsetMinutes(now: Date, timezone?: string): number {
  if (!timezone) return 0;
  try {
    const partsFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const parts = partsFormatter.formatToParts(now);
    const getPart = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || '0', 10);
    const y = getPart('year');
    const m = getPart('month') - 1;
    const d = getPart('day');
    const h = getPart('hour') % 24;
    const min = getPart('minute');
    const s = getPart('second');
    const targetUtc = Date.UTC(y, m, d, h, min, s);
    const actualUtc = now.getTime();
    return Math.round((targetUtc - actualUtc) / 60000);
  } catch {
    return 0;
  }
}

export interface FormattedZoneTime {
  hoursMinutes: string;
  ampm: string;
  seconds: string;
  hour24: number;
  minuteNum: number;
  secondNum: number;
  dateStr: string;
  tzShort: string;
  diffLabel: string;
  isDaytime: boolean;
}

export function getFormattedTimeForZone(
  now: Date,
  timezone?: string
): FormattedZoneTime {
  const safeZone = (() => {
    if (!timezone) return undefined;
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
      return timezone;
    } catch {
      return undefined;
    }
  })();

  const partsFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: safeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });

  const parts = partsFormatter.formatToParts(now);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || '';

  const rawHour24 = parseInt(getPart('hour'), 10);
  const hour24 = Number.isNaN(rawHour24) ? now.getHours() : rawHour24 % 24;
  const minuteNum = parseInt(getPart('minute'), 10) || 0;
  const secondNum = parseInt(getPart('second'), 10) || 0;
  const tzShort = getPart('timeZoneName') || 'Local';

  const hour12Num = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const hoursMinutes = `${String(hour12Num).padStart(2, '0')}:${String(minuteNum).padStart(2, '0')}`;
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  const seconds = String(secondNum).padStart(2, '0');

  const dateStr = new Intl.DateTimeFormat('en-US', {
    timeZone: safeZone,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(now);

  // Compute hour difference relative to device local time
  let diffLabel = 'Local Time';
  if (safeZone) {
    try {
      const targetYear = parseInt(getPart('year'), 10);
      const targetMonth = parseInt(getPart('month'), 10) - 1;
      const targetDay = parseInt(getPart('day'), 10);
      const targetAsUtc = Date.UTC(targetYear, targetMonth, targetDay, hour24, minuteNum);
      const localAsUtc = Date.UTC(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        now.getHours(),
        now.getMinutes()
      );
      const diffHours = Math.round((targetAsUtc - localAsUtc) / (1000 * 60 * 60) * 2) / 2;
      if (diffHours === 0) {
        diffLabel = 'Same as local';
      } else if (diffHours > 0) {
        diffLabel = `+${diffHours}h ahead`;
      } else {
        diffLabel = `${diffHours}h behind`;
      }
    } catch {
      diffLabel = safeZone;
    }
  }

  const isDaytime = hour24 >= 6 && hour24 < 18;

  return {
    hoursMinutes,
    ampm,
    seconds,
    hour24,
    minuteNum,
    secondNum,
    dateStr,
    tzShort,
    diffLabel,
    isDaytime,
  };
}

interface WorldClockWidgetProps {
  title?: string;
  cities?: WorldClockCity[];
  clockFace?: 'digital' | 'minimal' | 'analog';
  showSeconds?: boolean;
  isLight?: boolean;
  onUpdateCities?: (cities: WorldClockCity[]) => void;
  onUpdateConfig?: (updates: Record<string, any>) => void;
}

export const WorldClockWidget: React.FC<WorldClockWidgetProps> = ({
  title,
  cities,
  clockFace = 'digital',
  showSeconds = true,
  isLight = false,
  onUpdateCities,
  onUpdateConfig,
}) => {
  const [now, setNow] = useState(new Date());
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const activeCities =
    Array.isArray(cities) && cities.length > 0 ? cities : DEFAULT_WORLD_CITIES;

  const handleReorder = (fromIdx: number, toIdx: number) => {
    if (
      fromIdx === toIdx ||
      fromIdx < 0 ||
      toIdx < 0 ||
      fromIdx >= activeCities.length ||
      toIdx >= activeCities.length
    )
      return;
    const reordered = [...activeCities];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    if (onUpdateCities) {
      onUpdateCities(reordered);
    } else if (onUpdateConfig) {
      onUpdateConfig({ cities: reordered });
    }
  };

  const handleSortByTime = () => {
    const sorted = [...activeCities].sort((a, b) => {
      const offA = getZoneOffsetMinutes(now, a.timezone);
      const offB = getZoneOffsetMinutes(now, b.timezone);
      return offA - offB;
    });
    if (onUpdateCities) onUpdateCities(sorted);
    else if (onUpdateConfig) onUpdateConfig({ cities: sorted });
  };

  const handleSortByName = () => {
    const sorted = [...activeCities].sort((a, b) => a.cityName.localeCompare(b.cityName));
    if (onUpdateCities) onUpdateCities(sorted);
    else if (onUpdateConfig) onUpdateConfig({ cities: sorted });
  };

  // Single-City Focus Mode
  if (activeCities.length === 1) {
    const city = activeCities[0];
    const zt = getFormattedTimeForZone(now, city.timezone);

    return (
      <div className="w-full h-full flex flex-col justify-between select-none p-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Globe className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
            <span className={`text-xs font-bold truncate ${isLight ? 'text-slate-800' : 'text-white'}`}>
              {city.cityName}
              {city.country ? `, ${city.country}` : ''}
            </span>
          </div>
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0 ${
            isLight
              ? 'bg-cyan-50 text-cyan-800 border border-cyan-200'
              : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30'
          }`}>
            {zt.tzShort} • {zt.diffLabel}
          </span>
        </div>

        <div className="my-auto py-2 flex flex-col items-center justify-center text-center">
          {clockFace === 'analog' ? (
            <div className={`relative w-32 h-32 md:w-36 md:h-36 rounded-full border-2 flex items-center justify-center my-1 ${
              isLight
                ? 'border-slate-300 bg-slate-100/90 shadow-sm'
                : 'border-gray-700 bg-gray-950/70 shadow-inner'
            }`}>
              {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
                <div
                  key={deg}
                  className="absolute inset-1.5 flex justify-center pointer-events-none"
                  style={{ transform: `rotate(${deg}deg)` }}
                >
                  <div
                    className={`w-0.5 ${
                      deg % 90 === 0
                        ? isLight ? 'h-2.5 bg-slate-700' : 'h-2.5 bg-gray-400'
                        : isLight ? 'h-1.5 bg-slate-400' : 'h-1.5 bg-gray-700'
                    } rounded-full`}
                  />
                </div>
              ))}
              {/* Hour Hand */}
              <div
                className={`absolute w-1.5 h-9 origin-bottom rounded-full shadow ${isLight ? 'bg-slate-900' : 'bg-white'}`}
                style={{
                  transform: `rotate(${(zt.hour24 % 12) * 30 + zt.minuteNum * 0.5}deg)`,
                  bottom: '50%',
                }}
              />
              {/* Minute Hand */}
              <div
                className={`absolute w-1 h-12 origin-bottom rounded-full shadow ${isLight ? 'bg-cyan-600' : 'bg-cyan-400'}`}
                style={{
                  transform: `rotate(${zt.minuteNum * 6}deg)`,
                  bottom: '50%',
                }}
              />
              {/* Second Hand */}
              {showSeconds && (
                <div
                  className="absolute w-0.5 h-14 bg-red-500 origin-bottom"
                  style={{
                    transform: `rotate(${zt.secondNum * 6}deg)`,
                    bottom: '50%',
                  }}
                />
              )}
              <div className={`w-2.5 h-2.5 rounded-full z-10 ${isLight ? 'bg-slate-900 ring-2 ring-slate-100' : 'bg-white ring-2 ring-gray-900'}`} />
            </div>
          ) : clockFace === 'minimal' ? (
            <div className="flex flex-col items-center">
              <span className={`text-5xl md:text-6xl font-sans font-bold tracking-tighter ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {zt.hoursMinutes}
              </span>
              <span className={`text-xs font-semibold uppercase tracking-[0.25em] mt-1 ${isLight ? 'text-cyan-600' : 'text-cyan-400'}`}>
                {zt.ampm} {showSeconds ? `• ${zt.seconds}s` : ''}
              </span>
            </div>
          ) : (
            <div className={`flex items-baseline justify-center font-mono tracking-tight font-extralight ${isLight ? 'text-slate-900' : 'text-white'}`}>
              <span className="text-5xl md:text-7xl font-extralight">{zt.hoursMinutes}</span>
              {showSeconds && (
                <span className={`text-2xl md:text-3xl font-light ml-1.5 w-10 text-left ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                  :{zt.seconds}
                </span>
              )}
              <span className={`text-sm md:text-base font-medium ml-2 uppercase ${isLight ? 'text-cyan-600' : 'text-cyan-400'}`}>
                {zt.ampm}
              </span>
            </div>
          )}

          <div className={`text-sm font-medium mt-2 flex items-center gap-1.5 ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
            {zt.isDaytime ? (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-indigo-400" />
            )}
            <span>{zt.dateStr}</span>
          </div>
        </div>

        <div className={`text-[10px] text-center font-mono truncate ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>
          {city.timezone}
        </div>
      </div>
    );
  }

  // Multi-City World Timezone List Mode
  const canReorder = Boolean(onUpdateCities || onUpdateConfig) && activeCities.length > 1;

  return (
    <div className="w-full h-full flex flex-col justify-between select-none p-1 overflow-hidden">
      <div className={`flex items-center justify-between border-b pb-2 mb-2 shrink-0 ${isLight ? 'border-slate-200' : 'border-gray-800/80'}`}>
        <div className="flex items-center gap-1.5 min-w-0">
          <Globe className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
          <span className={`text-xs font-bold uppercase tracking-wider truncate ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
            {title || 'World Timezones'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {canReorder && (
            <div className="flex items-center gap-1" data-no-drag="true">
              <button
                type="button"
                onClick={handleSortByTime}
                title="Sort cities by timezone offset (West to East)"
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer flex items-center gap-0.5 ${
                  isLight
                    ? 'hover:bg-slate-200 text-slate-600 hover:text-slate-900 bg-slate-100'
                    : 'hover:bg-gray-800 text-gray-400 hover:text-white bg-gray-900'
                }`}
              >
                <span>Time</span>
                <span className="text-[9px]">⇥</span>
              </button>
              <button
                type="button"
                onClick={handleSortByName}
                title="Sort cities alphabetically (A to Z)"
                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                  isLight
                    ? 'hover:bg-slate-200 text-slate-600 hover:text-slate-900 bg-slate-100'
                    : 'hover:bg-gray-800 text-gray-400 hover:text-white bg-gray-900'
                }`}
              >
                A-Z
              </button>
            </div>
          )}
          <span className={`text-[10px] font-mono ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>
            {activeCities.length} {activeCities.length === 1 ? 'City' : 'Cities'}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-2 pr-0.5 min-h-0">
        {activeCities.map((city, idx) => {
          const zt = getFormattedTimeForZone(now, city.timezone);
          const isDraggingThis = draggedIndex === idx;
          const isDragOverThis = dragOverIndex === idx && draggedIndex !== idx;

          return (
            <div
              key={city.id}
              data-no-drag="true"
              draggable={canReorder}
              onDragStart={(e) => {
                if (!canReorder) return;
                e.dataTransfer.setData('text/plain', String(idx));
                e.dataTransfer.effectAllowed = 'move';
                setDraggedIndex(idx);
              }}
              onDragOver={(e) => {
                if (!canReorder) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverIndex !== idx) setDragOverIndex(idx);
              }}
              onDragLeave={() => {
                if (dragOverIndex === idx) setDragOverIndex(null);
              }}
              onDrop={(e) => {
                if (!canReorder) return;
                e.preventDefault();
                if (draggedIndex !== null) {
                  handleReorder(draggedIndex, idx);
                }
                setDraggedIndex(null);
                setDragOverIndex(null);
              }}
              onDragEnd={() => {
                setDraggedIndex(null);
                setDragOverIndex(null);
              }}
              className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                isDraggingThis ? 'opacity-35 scale-[0.98]' : ''
              } ${
                isDragOverThis
                  ? isLight
                    ? 'border-cyan-500 ring-2 ring-cyan-400/50 bg-cyan-50/80'
                    : 'border-cyan-400 ring-2 ring-cyan-500/50 bg-cyan-950/50'
                  : isLight
                  ? 'bg-slate-100/90 border-slate-200/90 hover:border-slate-300'
                  : 'bg-gray-950/60 border-gray-800/80 hover:border-gray-700'
              }`}
            >
              <div className="min-w-0 flex-1 pr-2 flex items-center gap-1.5">
                {canReorder && (
                  <div
                    className={`cursor-grab active:cursor-grabbing p-0.5 rounded touch-none shrink-0 ${
                      isLight
                        ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-200'
                        : 'text-gray-500 hover:text-gray-200 hover:bg-gray-800'
                    }`}
                    title="Grab and drag to sort city position"
                  >
                    <GripVertical className="w-3.5 h-3.5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {zt.isDaytime ? (
                      <Sun className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    ) : (
                      <Moon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    )}
                    <span className={`text-xs md:text-sm font-bold truncate ${isLight ? 'text-slate-900' : 'text-white'}`}>
                      {city.cityName}
                    </span>
                    <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded shrink-0 ${
                      isLight
                        ? 'text-cyan-800 bg-cyan-100'
                        : 'text-cyan-400 bg-cyan-500/10'
                    }`}>
                      {zt.tzShort}
                    </span>
                  </div>
                  <div className={`text-[10px] mt-0.5 truncate ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>
                    {zt.dateStr} • <span className={isLight ? 'text-slate-500' : 'text-gray-500'}>{zt.diffLabel}</span>
                  </div>
                </div>
              </div>

              <div className={`flex items-baseline font-mono shrink-0 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                <span className="text-xl md:text-2xl font-light">{zt.hoursMinutes}</span>
                {showSeconds && (
                  <span className={`text-xs ml-0.5 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>:{zt.seconds}</span>
                )}
                <span className={`text-[10px] font-bold ml-1 ${isLight ? 'text-cyan-700' : 'text-cyan-400'}`}>{zt.ampm}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
