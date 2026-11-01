import React, { useState } from 'react';
import { ShieldAlert, RotateCcw } from 'lucide-react';

interface PinOverlayProps {
  onUnlock: (pin: string) => boolean;
  onForgotChallenge: () => void;
}

export const PinOverlay: React.FC<PinOverlayProps> = ({ onUnlock, onForgotChallenge }) => {
  const [pin, setPin] = useState('');
  const [holdTimer, setHoldTimer] = useState<number | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);

  const handleDigit = (digit: string) => {
    if (pin.length < 6) {
      const nextPin = pin + digit;
      setPin(nextPin);
      if (nextPin.length >= 4) {
        onUnlock(nextPin);
      }
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
  };

  const handleClear = () => {
    setPin('');
  };

  // 5-second hold for kid-proof parent override
  const startHold = () => {
    const startTime = Date.now();
    const interval = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(100, (elapsed / 4000) * 100);
      setHoldProgress(progress);
      if (elapsed >= 4000) {
        clearInterval(interval);
        setHoldTimer(null);
        setHoldProgress(0);
        onForgotChallenge();
      }
    }, 50);
    setHoldTimer(interval);
  };

  const stopHold = () => {
    if (holdTimer) {
      clearInterval(holdTimer);
      setHoldTimer(null);
      setHoldProgress(0);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
      <div className="w-full max-w-sm rounded-2xl bg-gray-900 border border-gray-800 p-6 shadow-2xl flex flex-col items-center text-center">
        <div className="w-14 h-14 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mb-4 text-blue-400">
          <ShieldAlert className="w-7 h-7" />
        </div>

        <h2 className="text-xl font-bold text-white mb-1">Kiosk Locked</h2>
        <p className="text-sm text-gray-400 mb-6">Enter numeric PIN to access settings & controls</p>

        {/* PIN Dots */}
        <div className="flex gap-3 mb-6">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full border transition-all ${
                idx < pin.length
                  ? 'bg-blue-500 border-blue-400 scale-110 shadow-sm shadow-blue-500/50'
                  : 'bg-gray-800 border-gray-700'
              }`}
            />
          ))}
        </div>

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full mb-6">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              key={num}
              onClick={() => handleDigit(num)}
              className="h-14 rounded-xl bg-gray-800/80 hover:bg-gray-700 active:scale-95 text-xl font-semibold text-white transition-all shadow-inner"
            >
              {num}
            </button>
          ))}
          <button
            onClick={handleClear}
            className="h-14 rounded-xl bg-gray-800/40 hover:bg-gray-800 active:scale-95 text-sm font-medium text-gray-400 transition-all"
          >
            Clear
          </button>
          <button
            onClick={() => handleDigit('0')}
            className="h-14 rounded-xl bg-gray-800/80 hover:bg-gray-700 active:scale-95 text-xl font-semibold text-white transition-all shadow-inner"
          >
            0
          </button>
          <button
            onClick={handleBackspace}
            className="h-14 rounded-xl bg-gray-800/40 hover:bg-gray-800 active:scale-95 text-sm font-medium text-gray-400 transition-all"
          >
            ⌫
          </button>
        </div>

        {/* Parent Override Hold Button */}
        <div className="w-full pt-4 border-t border-gray-800/80 flex flex-col items-center">
          <button
            onMouseDown={startHold}
            onMouseUp={stopHold}
            onMouseLeave={stopHold}
            onTouchStart={startHold}
            onTouchEnd={stopHold}
            className="relative overflow-hidden w-full py-2.5 px-4 rounded-lg bg-gray-800 hover:bg-gray-750 text-xs text-gray-400 font-medium transition-all"
          >
            {holdProgress > 0 && (
              <div
                className="absolute inset-0 bg-blue-600/30 transition-all duration-75"
                style={{ width: `${holdProgress}%` }}
              />
            )}
            <span className="relative z-10 flex items-center justify-center gap-1.5">
              <RotateCcw className="w-3.5 h-3.5" />
              Hold 4s for Parent Override / Reset
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
