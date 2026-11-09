import React, { useState, useEffect } from 'react';
import { useTimePrefs } from '../../utils/timePrefs';
import { Moon } from 'lucide-react';

interface NightModeProps {
  enabled: boolean;
  style: 'dim' | 'oled_clock';
  dimOpacity: number;
  onWake: () => void;
}

export const NightMode: React.FC<NightModeProps> = ({
  enabled,
  style,
  dimOpacity,
  onWake,
}) => {
  const { hour12 } = useTimePrefs();
  const [time, setTime] = useState(new Date());
  // Pixel shift offset to avoid OLED burn-in
  const [pixelShift, setPixelShift] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!enabled || style !== 'oled_clock') return;
    setTime(new Date());
    const clockInterval = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      setTime(new Date());
    }, 10000);
    // Shift pixels every 60 seconds by +/- 15px
    const shiftInterval = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      setPixelShift({
        x: Math.floor(Math.random() * 30) - 15,
        y: Math.floor(Math.random() * 30) - 15,
      });
    }, 60000);

    return () => {
      clearInterval(clockInterval);
      clearInterval(shiftInterval);
    };
  }, [enabled, style]);

  if (!enabled) return null;

  if (style === 'oled_clock') {
    return (
      <div
        onClick={onWake}
        className="fixed inset-0 z-[60] bg-black cursor-pointer flex flex-col items-center justify-center select-none"
      >
        <div
          className="transition-transform duration-1000 ease-out flex flex-col items-center"
          style={{
            transform: `translate(${pixelShift.x}px, ${pixelShift.y}px)`,
          }}
        >
          <div className="text-6xl md:text-8xl font-thin tracking-widest text-red-700/60 font-mono">
            {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hourCycle: hour12 ? 'h12' : 'h23' })}
          </div>
          <div className="text-sm md:text-base font-light text-red-900/60 mt-2 tracking-wide uppercase">
            {time.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
          </div>
          <p className="text-[11px] text-gray-800 mt-8">Tap screen to wake</p>
        </div>
      </div>
    );
  }

  // Dim overlay style (covers canvas and navigation dock at z-[60])
  return (
    <div
      onClick={onWake}
      className="fixed inset-0 z-[60] pointer-events-auto cursor-pointer transition-opacity duration-700 flex items-end justify-end p-6 select-none"
      style={{ backgroundColor: `rgba(0, 0, 0, ${dimOpacity})` }}
    >
      <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-900/80 px-3 py-1.5 rounded-full border border-gray-800 shadow-xl pointer-events-none">
        <Moon className="w-3.5 h-3.5 text-blue-400" />
        <span>Night Mode (Tap to wake)</span>
      </div>
    </div>
  );
};
