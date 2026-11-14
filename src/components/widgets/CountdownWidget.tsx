import React, { useMemo } from 'react';
import { Calendar, Sparkles } from 'lucide-react';
import { useSharedClock } from '../../utils/sharedClock';

interface CountdownWidgetProps {
  eventName?: string;
  targetDate?: string; // ISO string
  isLight?: boolean;
  transparentBg?: boolean;
}

export const CountdownWidget: React.FC<CountdownWidgetProps> = ({
  eventName = 'Upcoming Milestone',
  targetDate = '2026-12-25T00:00:00Z',
  isLight = false,
  transparentBg = false,
}) => {
  const nowDate = useSharedClock('second');
  const nowMs = nowDate.getTime();

  const timeLeft = useMemo(() => {
    const target = new Date(targetDate).getTime();
    const diff = target - nowMs;

    if (diff <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, isPast: true };
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return { days, hours, minutes, seconds, isPast: false };
  }, [targetDate, nowMs]);

  const targetDateFormatted = new Date(targetDate).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const stickerShadow = transparentBg && !isLight ? 'drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]' : '';
  const unitBoxClass = transparentBg
    ? 'bg-transparent border-transparent shadow-none'
    : isLight
    ? 'bg-slate-100/90 border-slate-200 shadow-xs'
    : 'bg-gray-950/60 border-gray-800/80 shadow-inner';

  return (
    <div className={`w-full h-full flex flex-col justify-between select-none ${stickerShadow}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-purple-400" />
          <h4 className={`text-sm font-bold tracking-wide truncate max-w-[200px] ${isLight ? 'text-slate-900' : 'text-white'}`}>
            {eventName}
          </h4>
        </div>
        <span className={`text-[11px] font-medium ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>{targetDateFormatted}</span>
      </div>

      {/* Countdown Grid */}
      <div className="grid grid-cols-4 gap-2 my-auto">
        <div className={`flex flex-col items-center rounded-xl py-2 px-1 text-center border ${unitBoxClass}`}>
          <span className={`text-2xl md:text-3xl font-extrabold font-mono ${isLight ? 'text-purple-600' : 'text-purple-400'}`}>
            {timeLeft.days}
          </span>
          <span className={`text-[10px] uppercase tracking-wider font-semibold mt-0.5 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
            Days
          </span>
        </div>

        <div className={`flex flex-col items-center rounded-xl py-2 px-1 text-center border ${unitBoxClass}`}>
          <span className={`text-2xl md:text-3xl font-extrabold font-mono ${isLight ? 'text-blue-600' : 'text-blue-400'}`}>
            {timeLeft.hours.toString().padStart(2, '0')}
          </span>
          <span className={`text-[10px] uppercase tracking-wider font-semibold mt-0.5 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
            Hours
          </span>
        </div>

        <div className={`flex flex-col items-center rounded-xl py-2 px-1 text-center border ${unitBoxClass}`}>
          <span className={`text-2xl md:text-3xl font-extrabold font-mono ${isLight ? 'text-cyan-600' : 'text-cyan-400'}`}>
            {timeLeft.minutes.toString().padStart(2, '0')}
          </span>
          <span className={`text-[10px] uppercase tracking-wider font-semibold mt-0.5 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
            Mins
          </span>
        </div>

        <div className={`flex flex-col items-center rounded-xl py-2 px-1 text-center border ${unitBoxClass}`}>
          <span className={`text-2xl md:text-3xl font-extrabold font-mono ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}>
            {timeLeft.seconds.toString().padStart(2, '0')}
          </span>
          <span className={`text-[10px] uppercase tracking-wider font-semibold mt-0.5 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
            Secs
          </span>
        </div>
      </div>

      <div className={`flex items-center justify-between text-[11px] pt-2 border-t ${
        transparentBg
          ? 'border-transparent text-gray-400'
          : isLight
          ? 'border-slate-200 text-slate-500'
          : 'border-gray-800/40 text-gray-500'
      }`}>
        <span className={`flex items-center gap-1 ${isLight ? 'text-purple-700 font-semibold' : 'text-purple-300/80'}`}>
          <Sparkles className="w-3 h-3" />
          {timeLeft.isPast ? 'Event has arrived!' : 'Countdown in progress'}
        </span>
      </div>
    </div>
  );
};
