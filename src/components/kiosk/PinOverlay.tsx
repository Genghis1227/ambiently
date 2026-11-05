import React, { useState, useEffect, useCallback } from 'react';
import { ShieldAlert, RotateCcw, X } from 'lucide-react';

interface PinOverlayProps {
  onUnlock: (pin: string) => boolean | Promise<boolean>;
  onForgotChallenge: () => void;
  title?: string;
  subtitle?: string;
  onCancel?: () => void;
}

export const PinOverlay: React.FC<PinOverlayProps> = ({
  onUnlock,
  onForgotChallenge,
  title = 'Kiosk Locked',
  subtitle = 'Enter parent PIN to proceed',
  onCancel,
}) => {
  const [pin, setPin] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [holdTimer, setHoldTimer] = useState<number | null>(null);
  const [holdProgress, setHoldProgress] = useState(0);

  const checkPin = useCallback(async (currentPin: string) => {
    setIsVerifying(true);
    setErrorMsg('');
    try {
      const success = await onUnlock(currentPin);
      if (!success) {
        setErrorMsg('Incorrect PIN. Try again.');
        setPin('');
      }
    } catch {
      setErrorMsg('Verification error');
      setPin('');
    } finally {
      setIsVerifying(false);
    }
  }, [onUnlock]);

  const handleDigit = useCallback((digit: string) => {
    if (isVerifying) return;
    setErrorMsg('');
    setPin((prev) => {
      if (prev.length >= 6) return prev;
      const next = prev + digit;
      if (next.length >= 4) {
        checkPin(next);
      }
      return next;
    });
  }, [isVerifying, checkPin]);

  const handleBackspace = useCallback(() => {
    if (isVerifying) return;
    setErrorMsg('');
    setPin((prev) => prev.slice(0, -1));
  }, [isVerifying]);

  const handleClear = useCallback(() => {
    if (isVerifying) return;
    setErrorMsg('');
    setPin('');
  }, [isVerifying]);

  // Keyboard number listener for desktop / connected keyboards
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape' && onCancel) {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleDigit, handleBackspace, onCancel]);

  // 4-second hold for parent emergency override / reset
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
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && onCancel) {
          onCancel();
        }
      }}
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-gray-900 border border-gray-800 p-6 shadow-2xl flex flex-col items-center text-center relative animate-in fade-in zoom-in-95 duration-150"
      >
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            title="Cancel and return to dashboard"
            className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="w-14 h-14 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mb-4 text-blue-400 shadow-sm">
          <ShieldAlert className="w-7 h-7" />
        </div>

        <h2 className="text-xl font-bold text-white mb-1">{title}</h2>
        <p className="text-sm text-gray-400 mb-5">{subtitle}</p>

        {/* PIN Indicator Dots */}
        <div className="flex gap-3 mb-3">
          {[0, 1, 2, 3].map((idx) => (
            <div
              key={idx}
              className={`w-4 h-4 rounded-full border transition-all ${
                errorMsg
                  ? 'bg-red-500/40 border-red-500 animate-pulse'
                  : idx < pin.length
                  ? 'bg-blue-500 border-blue-400 scale-110 shadow-sm shadow-blue-500/50'
                  : 'bg-gray-800 border-gray-700'
              }`}
            />
          ))}
        </div>

        {/* Error message */}
        <div className="h-5 mb-3 flex items-center justify-center">
          {errorMsg ? (
            <span className="text-xs text-red-400 font-medium">{errorMsg}</span>
          ) : isVerifying ? (
            <span className="text-xs text-blue-400 font-medium animate-pulse">Verifying PIN...</span>
          ) : null}
        </div>

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full mb-5">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
            <button
              key={num}
              type="button"
              disabled={isVerifying}
              onClick={() => handleDigit(num)}
              className="h-14 rounded-xl bg-gray-800/80 hover:bg-gray-700 active:scale-95 text-xl font-semibold text-white transition-all shadow-inner disabled:opacity-50 cursor-pointer"
            >
              {num}
            </button>
          ))}
          <button
            type="button"
            disabled={isVerifying}
            onClick={handleClear}
            className="h-14 rounded-xl bg-gray-800/40 hover:bg-gray-800 active:scale-95 text-sm font-medium text-gray-400 hover:text-white transition-all disabled:opacity-50 cursor-pointer"
          >
            Clear
          </button>
          <button
            type="button"
            disabled={isVerifying}
            onClick={() => handleDigit('0')}
            className="h-14 rounded-xl bg-gray-800/80 hover:bg-gray-700 active:scale-95 text-xl font-semibold text-white transition-all shadow-inner disabled:opacity-50 cursor-pointer"
          >
            0
          </button>
          <button
            type="button"
            disabled={isVerifying}
            onClick={handleBackspace}
            className="h-14 rounded-xl bg-gray-800/40 hover:bg-gray-800 active:scale-95 text-sm font-medium text-gray-400 hover:text-white transition-all disabled:opacity-50 cursor-pointer"
          >
            ⌫
          </button>
        </div>

        {/* Parent Override Hold Button */}
        <div className="w-full pt-4 border-t border-gray-800/80 flex flex-col items-center gap-2">
          <button
            type="button"
            onMouseDown={startHold}
            onMouseUp={stopHold}
            onMouseLeave={stopHold}
            onTouchStart={startHold}
            onTouchEnd={stopHold}
            className="relative overflow-hidden w-full py-2.5 px-4 rounded-xl bg-gray-800/90 hover:bg-gray-750 text-xs text-gray-400 hover:text-gray-300 font-medium transition-all cursor-pointer"
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
