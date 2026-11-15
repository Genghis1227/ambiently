import React, { useId, useMemo } from 'react';
import { MapPin, Sunrise, Sunset, Sparkles, Sun } from 'lucide-react';
import {
  SOLAR_ARC_HEIGHT,
  SOLAR_ARC_WIDTH,
  SOLAR_END_X,
  SOLAR_HORIZON_Y,
  SOLAR_START_X,
  buildMoonPhaseSvgPath,
  computeLunarSummary,
  computeSolarSummary,
  pointOnSolarArc,
} from '../../utils/astronomy';
import { useSharedClock } from '../../utils/sharedClock';
import { useDashboardStore } from '../../store/dashboardStore';

interface SunMoonWidgetProps {
  locationName?: string;
  latitude?: number;
  longitude?: number;
  timezone?: string;
  showGoldenHour?: boolean;
  showMoonDetails?: boolean;
  isLight?: boolean;
  transparentBg?: boolean;
}

function formatClockTime(
  date: Date | null,
  timeFormat: 'auto' | '12h' | '24h' | undefined,
  timeZone?: string
): string {
  if (!date || Number.isNaN(date.getTime())) return '—';
  const hour12 = timeFormat === '12h' ? true : timeFormat === '24h' ? false : undefined;
  const opts: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    ...(hour12 !== undefined ? { hour12 } : {}),
    ...(timeZone ? { timeZone } : {}),
  };
  try {
    return date.toLocaleTimeString([], opts);
  } catch {
    const fallbackOpts: Intl.DateTimeFormatOptions = {
      hour: 'numeric',
      minute: '2-digit',
      ...(hour12 !== undefined ? { hour12 } : {}),
    };
    return date.toLocaleTimeString([], fallbackOpts);
  }
}

function formatDurationHm(totalSec: number): string {
  const safe = Math.max(0, Math.round(totalSec));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  return `${hrs}h ${mins}m`;
}

function formatDeltaLabel(deltaSec: number): string {
  const sign = deltaSec >= 0 ? '+' : '-';
  const abs = Math.abs(Math.round(deltaSec));
  const mins = Math.floor(abs / 60);
  const secs = abs % 60;
  if (mins === 0) return `${sign}${secs}s`;
  return `${sign}${mins}m ${String(secs).padStart(2, '0')}s`;
}

function buildArcPolylinePath(maxProgress: number): string {
  const steps = 32;
  const clamped = Math.max(0, Math.min(1, maxProgress));
  if (clamped <= 0) return '';
  const points: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const p = (i / steps) * clamped;
    const pt = pointOnSolarArc(p);
    points.push(`${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`);
  }
  return points.join(' ');
}

export const SunMoonWidget: React.FC<SunMoonWidgetProps> = ({
  locationName = 'Austin, TX',
  latitude = 30.2672,
  longitude = -97.7431,
  timezone,
  showGoldenHour = true,
  showMoonDetails = true,
  isLight = false,
  transparentBg = false,
}) => {
  const svgBaseId = useId().replace(/:/g, '');
  const sharedDate = useSharedClock('10s');
  const now = sharedDate.getTime() > 0 ? sharedDate : new Date();
  const timeFormat = useDashboardStore((s) => s.settings.timeFormat);

  const solar = useMemo(
    () => computeSolarSummary(now, latitude, longitude, timezone || undefined),
    [now, latitude, longitude, timezone]
  );
  const lunar = useMemo(() => computeLunarSummary(now), [now]);

  const fullArcPath = useMemo(() => buildArcPolylinePath(1), []);
  const elapsedArcPath = useMemo(
    () => (solar.isDaylight ? buildArcPolylinePath(solar.arcPoint.progress) : ''),
    [solar.isDaylight, solar.arcPoint.progress]
  );
  const moonLitPath = useMemo(() => buildMoonPhaseSvgPath(14, lunar.phaseCycle), [lunar.phaseCycle]);

  const stickerShadow = transparentBg && !isLight ? 'drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]' : '';
  const subCardClass = transparentBg
    ? 'bg-transparent border-transparent'
    : isLight
      ? 'bg-slate-100/90 border-slate-200/90'
      : 'bg-gray-950/45 border-white/5';

  const deltaPositive = solar.daylightDeltaSec >= 0;

  return (
    <div className={`w-full h-full flex flex-col justify-between select-none p-1 ${stickerShadow}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 text-xs">
        <div
          className={`flex items-center gap-1.5 font-medium truncate max-w-[55%] ${
            isLight ? 'text-slate-700' : 'text-gray-300'
          }`}
        >
          <MapPin className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="truncate">{locationName}</span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`text-[10px] font-mono font-semibold ${
              isLight ? 'text-slate-600' : 'text-gray-300'
            }`}
          >
            {formatDurationHm(solar.dayLengthSec)}
          </span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[9px] font-mono font-semibold border ${
              deltaPositive
                ? isLight
                  ? 'bg-emerald-100 border-emerald-300 text-emerald-800'
                  : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                : isLight
                  ? 'bg-amber-100 border-amber-300 text-amber-800'
                  : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
            }`}
            title="Change in daylight compared to yesterday"
          >
            {formatDeltaLabel(solar.daylightDeltaSec)}
          </span>
        </div>
      </div>

      {/* Solar Horizon Arc */}
      <div className="my-auto py-1">
        <svg
          className="w-full h-24 overflow-visible"
          viewBox={`0 0 ${SOLAR_ARC_WIDTH} ${SOLAR_ARC_HEIGHT}`}
          aria-label="Solar horizon arc"
        >
          <defs>
            <linearGradient id={`sun-arc-${svgBaseId}`} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#f97316" />
              <stop offset="50%" stopColor="#facc15" />
              <stop offset="100%" stopColor="#fb7185" />
            </linearGradient>
            <radialGradient id={`sun-glow-${svgBaseId}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fde047" stopOpacity="0.95" />
              <stop offset="60%" stopColor="#f59e0b" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Horizon baseline */}
          <line
            x1={10}
            y1={SOLAR_HORIZON_Y}
            x2={SOLAR_ARC_WIDTH - 10}
            y2={SOLAR_HORIZON_Y}
            stroke={isLight ? 'rgba(100,116,139,0.35)' : 'rgba(148,163,184,0.28)'}
            strokeWidth="1.25"
            strokeDasharray="4 4"
          />

          {/* Full daylight path */}
          <path
            d={fullArcPath}
            fill="none"
            stroke={isLight ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.14)'}
            strokeWidth="2.5"
            strokeLinecap="round"
          />

          {/* Lit elapsed path */}
          {elapsedArcPath && (
            <path
              d={elapsedArcPath}
              fill="none"
              stroke={`url(#sun-arc-${svgBaseId})`}
              strokeWidth="3"
              strokeLinecap="round"
            />
          )}

          {/* Sunrise & Sunset horizon markers */}
          {solar.polarState === 'normal' && (
            <>
              <circle
                cx={SOLAR_START_X}
                cy={SOLAR_HORIZON_Y}
                r="3.2"
                fill="#fb923c"
                stroke={isLight ? '#ffffff' : '#0f172a'}
                strokeWidth="1.2"
              />
              <circle
                cx={SOLAR_END_X}
                cy={SOLAR_HORIZON_Y}
                r="3.2"
                fill="#fb7185"
                stroke={isLight ? '#ffffff' : '#0f172a'}
                strokeWidth="1.2"
              />
            </>
          )}

          {/* Sun orb (daylight) or night horizon marker */}
          {solar.isDaylight ? (
            <g>
              <circle
                cx={solar.arcPoint.x}
                cy={solar.arcPoint.y}
                r="13"
                fill={`url(#sun-glow-${svgBaseId})`}
              />
              <circle
                cx={solar.arcPoint.x}
                cy={solar.arcPoint.y}
                r="5.5"
                fill="#fde047"
                stroke="#f59e0b"
                strokeWidth="1.5"
              />
            </g>
          ) : (
            <circle
              cx={solar.arcPoint.x}
              cy={solar.arcPoint.y}
              r="4.5"
              fill={isLight ? '#6366f1' : '#818cf8'}
              opacity="0.85"
            />
          )}
        </svg>

        {/* Sunrise / Solar Noon / Sunset Row */}
        <div className="grid grid-cols-3 gap-1.5 text-center -mt-1">
          <div>
            <div
              className={`flex items-center justify-center gap-1 text-[10px] font-semibold ${
                isLight ? 'text-slate-500' : 'text-gray-400'
              }`}
            >
              <Sunrise className="w-3 h-3 text-amber-400" />
              <span>Sunrise</span>
            </div>
            <div
              className={`text-xs font-mono font-semibold ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}
            >
              {solar.polarState === 'always_day'
                ? '24h Day'
                : solar.polarState === 'always_night'
                  ? 'Polar Night'
                  : formatClockTime(solar.sunrise, timeFormat, timezone)}
            </div>
          </div>

          <div>
            <div
              className={`flex items-center justify-center gap-1 text-[10px] font-semibold ${
                isLight ? 'text-slate-500' : 'text-gray-400'
              }`}
            >
              <Sun className="w-3 h-3 text-yellow-400" />
              <span>Noon</span>
            </div>
            <div
              className={`text-xs font-mono font-semibold ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}
            >
              {formatClockTime(solar.solarNoon, timeFormat, timezone)}
            </div>
          </div>

          <div>
            <div
              className={`flex items-center justify-center gap-1 text-[10px] font-semibold ${
                isLight ? 'text-slate-500' : 'text-gray-400'
              }`}
            >
              <Sunset className="w-3 h-3 text-rose-400" />
              <span>Sunset</span>
            </div>
            <div
              className={`text-xs font-mono font-semibold ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}
            >
              {solar.polarState === 'always_day'
                ? '24h Day'
                : solar.polarState === 'always_night'
                  ? 'Polar Night'
                  : formatClockTime(solar.sunset, timeFormat, timezone)}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Cards: Golden Hour & Moon Phase */}
      {(showGoldenHour || showMoonDetails) && (
        <div
          className={`grid ${
            showGoldenHour && showMoonDetails ? 'grid-cols-2' : 'grid-cols-1'
          } gap-2 pt-2 border-t ${
            transparentBg
              ? 'border-transparent'
              : isLight
                ? 'border-slate-200'
                : 'border-gray-800/80'
          }`}
        >
          {showGoldenHour && (
            <div className={`rounded-xl border px-2.5 py-1.5 ${subCardClass}`}>
              <div
                className={`flex items-center gap-1 text-[10px] font-semibold ${
                  isLight ? 'text-amber-700' : 'text-amber-300'
                }`}
              >
                <Sparkles className="w-3 h-3 shrink-0" />
                <span>Golden Hour</span>
              </div>
              <div
                className={`text-[11px] font-mono mt-0.5 ${
                  isLight ? 'text-slate-700' : 'text-gray-200'
                }`}
              >
                AM {formatClockTime(solar.morningGoldenHourEnd, timeFormat, timezone)}
              </div>
              <div
                className={`text-[11px] font-mono ${
                  isLight ? 'text-slate-700' : 'text-gray-200'
                }`}
              >
                PM {formatClockTime(solar.eveningGoldenHourStart, timeFormat, timezone)}
              </div>
            </div>
          )}

          {showMoonDetails && (
            <div className={`rounded-xl border px-2.5 py-1.5 flex items-center gap-2 ${subCardClass}`}>
              <svg
                className="w-7 h-7 shrink-0"
                viewBox="0 0 28 28"
                aria-label={lunar.phaseName}
              >
                <circle
                  cx="14"
                  cy="14"
                  r="13.2"
                  fill={isLight ? '#cbd5e1' : '#1e293b'}
                  stroke={isLight ? '#94a3b8' : '#475569'}
                  strokeWidth="1"
                />
                {moonLitPath && <path d={moonLitPath} fill={isLight ? '#f59e0b' : '#fef08a'} />}
              </svg>
              <div className="min-w-0 flex-1">
                <div
                  className={`text-[11px] font-semibold truncate ${
                    isLight ? 'text-slate-900' : 'text-white'
                  }`}
                >
                  {lunar.phaseName}
                </div>
                <div
                  className={`text-[10px] font-mono ${
                    isLight ? 'text-slate-600' : 'text-gray-400'
                  }`}
                >
                  {lunar.illuminationPct}% lit •{' '}
                  {lunar.daysUntilFullMoon === 0
                    ? 'Full today'
                    : `Full ${lunar.daysUntilFullMoon}d`}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
