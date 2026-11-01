import React, { useState, useEffect } from 'react';

interface ClockWidgetProps {
  clockFace?: 'digital' | 'flip' | 'analog';
  showSeconds?: boolean;
}

export const ClockWidget: React.FC<ClockWidgetProps> = ({
  clockFace: _clockFace = 'digital',
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

      <div className="my-auto py-2 text-center">
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

        <div className="text-sm md:text-base text-gray-300 font-medium mt-1">
          {dateStr}
        </div>
      </div>

      <div className="text-[10px] text-gray-500 text-center font-mono">
        Local Time
      </div>
    </div>
  );
};
