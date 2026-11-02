import React, { useState, useEffect } from 'react';

interface ClockWidgetProps {
  clockFace?: 'digital' | 'minimal' | 'analog' | 'flip';
  showSeconds?: boolean;
}

export const ClockWidget: React.FC<ClockWidgetProps> = ({
  clockFace = 'digital',
  showSeconds = true,
}) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hours = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }).split(' ')[0];
  const ampm = time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).slice(-2);
  const seconds = time.getSeconds().toString().padStart(2, '0');
  const dateStr = time.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <div className="w-full h-full flex flex-col justify-between select-none p-1">
      <div className="text-xs text-gray-400 font-medium uppercase tracking-wider">
        Ambient Clock
      </div>

      <div className="my-auto py-2 flex flex-col items-center justify-center text-center">
        {clockFace === 'analog' ? (
          <div className="relative w-32 h-32 md:w-36 md:h-36 rounded-full border-2 border-gray-700 bg-gray-950/70 flex items-center justify-center shadow-inner my-1">
            {/* Hour tick marks */}
            {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
              <div
                key={deg}
                className="absolute inset-1.5 flex justify-center pointer-events-none"
                style={{ transform: `rotate(${deg}deg)` }}
              >
                <div className={`w-0.5 ${deg % 90 === 0 ? 'h-2.5 bg-gray-400' : 'h-1.5 bg-gray-700'} rounded-full`} />
              </div>
            ))}
            {/* Hour Hand */}
            <div
              className="absolute w-1.5 h-9 bg-white origin-bottom rounded-full shadow"
              style={{
                transform: `rotate(${(time.getHours() % 12) * 30 + time.getMinutes() * 0.5}deg)`,
                bottom: '50%',
              }}
            />
            {/* Minute Hand */}
            <div
              className="absolute w-1 h-12 bg-blue-400 origin-bottom rounded-full shadow"
              style={{
                transform: `rotate(${time.getMinutes() * 6}deg)`,
                bottom: '50%',
              }}
            />
            {/* Second Hand */}
            {showSeconds && (
              <div
                className="absolute w-0.5 h-14 bg-red-500 origin-bottom"
                style={{
                  transform: `rotate(${time.getSeconds() * 6}deg)`,
                  bottom: '50%',
                }}
              />
            )}
            <div className="w-2.5 h-2.5 rounded-full bg-white z-10 ring-2 ring-gray-900" />
          </div>
        ) : clockFace === 'minimal' ? (
          <div className="flex flex-col items-center">
            <span className="text-5xl md:text-6xl font-sans font-bold tracking-tighter text-white">
              {hours}
            </span>
            <span className="text-xs font-semibold uppercase tracking-[0.25em] text-blue-400 mt-1">
              {ampm} {showSeconds ? `• ${seconds}s` : ''}
            </span>
          </div>
        ) : (
          <div className="flex items-baseline justify-center font-mono tracking-tight font-extralight text-white">
            <span className="text-5xl md:text-7xl font-extralight">{hours}</span>
            {showSeconds && (
              <span className="text-2xl md:text-3xl text-gray-400 font-light ml-1.5 w-10 text-left">
                :{seconds}
              </span>
            )}
            <span className="text-sm md:text-base font-medium text-blue-400 ml-2 uppercase">
              {ampm}
            </span>
          </div>
        )}

        <div className="text-sm md:text-base text-gray-300 font-medium mt-2">
          {dateStr}
        </div>
      </div>

      <div className="text-[10px] text-gray-500 text-center font-mono">
        Local Time
      </div>
    </div>
  );
};
