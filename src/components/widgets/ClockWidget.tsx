import React, { useState, useEffect } from 'react';
import { getFormattedTimeForZone } from './WorldClockWidget';

interface ClockWidgetProps {
  title?: string;
  clockFace?: 'digital' | 'minimal' | 'analog' | 'flip';
  showSeconds?: boolean;
  timezone?: string;
  locationName?: string;
  isLight?: boolean;
}

export const ClockWidget: React.FC<ClockWidgetProps> = ({
  title,
  clockFace = 'digital',
  showSeconds = true,
  timezone,
  locationName,
  isLight = false,
}) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const zt = getFormattedTimeForZone(time, timezone);

  return (
    <div className="w-full h-full flex flex-col justify-between select-none p-1">
      <div className="flex items-center justify-between gap-2">
        <div className={`text-xs font-medium uppercase tracking-wider truncate ${isLight ? 'text-slate-600' : 'text-gray-400'}`}>
          {locationName || title || 'Ambient Clock'}
        </div>
        {timezone && (
          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full shrink-0 ${
            isLight
              ? 'bg-blue-50 text-blue-700 border border-blue-200'
              : 'bg-blue-500/15 text-blue-300 border border-blue-500/30'
          }`}>
            {zt.tzShort}
          </span>
        )}
      </div>

      <div className="my-auto py-2 flex flex-col items-center justify-center text-center">
        {clockFace === 'analog' ? (
          <div className={`relative w-32 h-32 md:w-36 md:h-36 rounded-full border-2 flex items-center justify-center my-1 ${
            isLight
              ? 'border-slate-300 bg-slate-100/90 shadow-sm'
              : 'border-gray-700 bg-gray-950/70 shadow-inner'
          }`}>
            {/* Hour tick marks */}
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
              className={`absolute w-1 h-12 origin-bottom rounded-full shadow ${isLight ? 'bg-blue-600' : 'bg-blue-400'}`}
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
            <span className={`text-xs font-semibold uppercase tracking-[0.25em] mt-1 ${isLight ? 'text-blue-600' : 'text-blue-400'}`}>
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
            <span className={`text-sm md:text-base font-medium ml-2 uppercase ${isLight ? 'text-blue-600' : 'text-blue-400'}`}>
              {zt.ampm}
            </span>
          </div>
        )}

        <div className={`text-sm md:text-base font-medium mt-2 ${isLight ? 'text-slate-700' : 'text-gray-300'}`}>
          {zt.dateStr}
        </div>
      </div>

      <div className={`text-[10px] text-center font-mono ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>
        {timezone ? `${timezone} (${zt.diffLabel})` : 'Local Time'}
      </div>
    </div>
  );
};
