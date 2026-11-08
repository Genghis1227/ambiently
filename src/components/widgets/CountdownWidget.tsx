import React, { useState, useEffect } from 'react';
import { Calendar, Sparkles } from 'lucide-react';

interface CountdownWidgetProps {
  eventName?: string;
  targetDate?: string; // ISO string
  isLight?: boolean;
}

export const CountdownWidget: React.FC<CountdownWidgetProps> = ({
  eventName = 'Upcoming Milestone',
  targetDate = '2026-12-25T00:00:00Z',
  isLight = false,
}) => {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isPast: boolean;
  }>({ days: 0, hours: 0, minutes: 0, seconds: 0, isPast: false });

  useEffect(() => {
    const calculate = () => {
      const target = new Date(targetDate).getTime();
      const now = Date.now();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({ days, hours, minutes, seconds, isPast: false });
    };

    calculate();
    const tick = () => {
      if (document.visibilityState === 'hidden') return;
      calculate();
    };
    const timer = setInterval(tick, 1000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') calculate();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [targetDate]);

  const targetDateFormatted = new Date(targetDate).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="w-full h-full flex flex-col justify-between select-none">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-purple-400" />
          <h4 className={`text-sm font-bold tracking-wide truncate max-w-[200px] ${isLight ? 'text-slate-900' : 'text-white'}`}>
            {eventName}
          </h4>
        </div>
        <span className={`text-[11px] font-medium ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>{targetDateFormatted}</span>
      </div>

      {/* Countdown Grid */}
      <div className="grid grid-cols-4 gap-2 my-auto">
        <div className={`flex flex-col items-center rounded-xl py-2 px-1 text-center border ${
          isLight
            ? 'bg-slate-100/90 border-slate-200 shadow-xs'
            : 'bg-gray-950/60 border-gray-800/80 shadow-inner'
        }`}>
          <span className={`text-2xl md:text-3xl font-extrabold font-mono ${isLight ? 'text-purple-600' : 'text-purple-400'}`}>
            {timeLeft.days}
          </span>
          <span className={`text-[10px] uppercase tracking-wider font-semibold mt-0.5 ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>
            Days
          </span>
        </div>

        <div className={`flex flex-col items-center rounded-xl py-2 px-1 text-center border ${
          isLight
            ? 'bg-slate-100/90 border-slate-200 shadow-xs'
            : 'bg-gray-950/60 border-gray-800/80 shadow-inner'
        }`}>
          <span className={`text-2xl md:text-3xl font-extrabold font-mono ${isLight ? 'text-blue-600' : 'text-blue-400'}`}>
            {timeLeft.hours.toString().padStart(2, '0')}
          </span>
          <span className={`text-[10px] uppercase tracking-wider font-semibold mt-0.5 ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>
            Hours
          </span>
        </div>

        <div className={`flex flex-col items-center rounded-xl py-2 px-1 text-center border ${
          isLight
            ? 'bg-slate-100/90 border-slate-200 shadow-xs'
            : 'bg-gray-950/60 border-gray-800/80 shadow-inner'
        }`}>
          <span className={`text-2xl md:text-3xl font-extrabold font-mono ${isLight ? 'text-cyan-600' : 'text-cyan-400'}`}>
            {timeLeft.minutes.toString().padStart(2, '0')}
          </span>
          <span className={`text-[10px] uppercase tracking-wider font-semibold mt-0.5 ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>
            Mins
          </span>
        </div>

        <div className={`flex flex-col items-center rounded-xl py-2 px-1 text-center border ${
          isLight
            ? 'bg-slate-100/90 border-slate-200 shadow-xs'
            : 'bg-gray-950/60 border-gray-800/80 shadow-inner'
        }`}>
          <span className={`text-2xl md:text-3xl font-extrabold font-mono ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>
            {timeLeft.seconds.toString().padStart(2, '0')}
          </span>
          <span className={`text-[10px] uppercase tracking-wider font-semibold mt-0.5 ${isLight ? 'text-slate-500' : 'text-gray-500'}`}>
            Secs
          </span>
        </div>
      </div>

      <div className={`flex items-center justify-between text-[11px] pt-2 border-t ${
        isLight ? 'border-slate-200 text-slate-500' : 'border-gray-800/40 text-gray-500'
      }`}>
        <span className={`flex items-center gap-1 ${isLight ? 'text-purple-700 font-semibold' : 'text-purple-300/80'}`}>
          <Sparkles className="w-3 h-3" />
          {timeLeft.isPast ? 'Event has arrived!' : 'Countdown in progress'}
        </span>
      </div>
    </div>
  );
};
