import { useEffect, useRef } from 'react';

interface UseIdleCursorOptions {
  enabled?: boolean;
  timeoutMs?: number;
  nightModeTimeoutMs?: number;
  isNightMode?: boolean;
}

/**
 * useIdleCursor
 *
 * Automatically hides the mouse cursor across the entire viewport after a period
 * of user inactivity, designed specifically for wall-mounted smart displays and ambient kiosks.
 * In Night Mode, the cursor hides much faster (or immediately) to prevent distraction
 * and protect dark OLED screens.
 */
export function useIdleCursor({
  enabled = true,
  timeoutMs = 3500,
  nightModeTimeoutMs = 1200,
  isNightMode = false,
}: UseIdleCursorOptions = {}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled) {
      document.documentElement.classList.remove('idle-cursor-hidden');
      return;
    }

    const currentTimeout = isNightMode ? nightModeTimeoutMs : timeoutMs;

    const resetTimer = () => {
      document.documentElement.classList.remove('idle-cursor-hidden');

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        document.documentElement.classList.add('idle-cursor-hidden');
      }, currentTimeout);
    };

    // If night mode turns on, immediately trigger or shorten timer
    if (isNightMode) {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        document.documentElement.classList.add('idle-cursor-hidden');
      }, nightModeTimeoutMs);
    } else {
      resetTimer();
    }

    const events = [
      'mousemove',
      'mousedown',
      'pointermove',
      'pointerdown',
      'touchstart',
      'wheel',
      'keydown',
    ];

    const handleActivity = () => {
      resetTimer();
    };

    events.forEach((evt) => {
      window.addEventListener(evt, handleActivity, { passive: true });
    });

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      events.forEach((evt) => {
        window.removeEventListener(evt, handleActivity);
      });
      document.documentElement.classList.remove('idle-cursor-hidden');
    };
  }, [enabled, timeoutMs, nightModeTimeoutMs, isNightMode]);
}
