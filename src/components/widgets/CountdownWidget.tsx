import React, { useState, useEffect } from 'react';
import { Calendar, Sparkles } from 'lucide-react';

interface CountdownWidgetProps {
  eventName?: string;
  targetDate?: string; // ISO string
}

export const CountdownWidget: React.FC<CountdownWidgetProps> = ({
  eventName = 'Upcoming Milestone',
  targetDate = '2026-12-25T00:00:00Z',
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
    const timer = setInterval(calculate, 1000);
    return () => clearInterval(timer);
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
          <h4 className="text-sm font-bold text-white tracking-wide truncate max-w-[200px]">
            {eventName}
          </h4>
        </div>
        <span className="text-[11px] text-gray-500 font-medium">{targetDateFormatted}</span>
      </div>

      {/* Countdown Grid */}
      <div className="grid grid-cols-4 gap-2 my-auto">
        <div className="flex flex-col items-center bg-gray-950/60 border border-gray-800/80 rounded-xl py-2 px-1 text-center shadow-inner">
          <span className="text-2xl md:text-3xl font-extrabold text-purple-400 font-mono">
            {timeLeft.days}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mt-0.5">
            Days
          </span>
        </div>

        <div className="flex flex-col items-center bg-gray-950/60 border border-gray-800/80 rounded-xl py-2 px-1 text-center shadow-inner">
          <span className="text-2xl md:text-3xl font-extrabold text-blue-400 font-mono">
            {timeLeft.hours.toString().padStart(2, '0')}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mt-0.5">
            Hours
          </span>
        </div>

        <div className="flex flex-col items-center bg-gray-950/60 border border-gray-800/80 rounded-xl py-2 px-1 text-center shadow-inner">
          <span className="text-2xl md:text-3xl font-extrabold text-cyan-400 font-mono">
            {timeLeft.minutes.toString().padStart(2, '0')}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mt-0.5">
            Mins
          </span>
        </div>

        <div className="flex flex-col items-center bg-gray-950/60 border border-gray-800/80 rounded-xl py-2 px-1 text-center shadow-inner">
          <span className="text-2xl md:text-3xl font-extrabold text-emerald-400 font-mono">
            {timeLeft.seconds.toString().padStart(2, '0')}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mt-0.5">
            Secs
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-gray-500 pt-2 border-t border-gray-800/40">
        <span className="flex items-center gap-1 text-purple-300/80">
          <Sparkles className="w-3 h-3" />
          {timeLeft.isPast ? 'Event has arrived!' : 'Countdown in progress'}
        </span>
      </div>
    </div>
  );
};
