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
 *
 * - In Night Mode, the cursor hides immediately and stays hidden even during OLED pixel-shifts
 *   or background widget DOM refreshes.
 * - Filters out synthetic Chromium `mousemove`/`pointermove` events where the pointer coordinates
 *   have not physically moved (preventing clock ticks or layout updates from waking the cursor).
 */
export function useIdleCursor({
  enabled = true,
  timeoutMs = 3000,
  nightModeTimeoutMs = 800,
  isNightMode = false,
}: UseIdleCursorOptions = {}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const active = enabled || isNightMode;
    if (!active) {
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

    // When Night Mode engages, hide cursor immediately without waiting for mouse movement
    if (isNightMode) {
      if (timerRef.current) clearTimeout(timerRef.current);
      document.documentElement.classList.add('idle-cursor-hidden');
    } else {
      resetTimer();
    }

    const handleMove = (e: MouseEvent | PointerEvent) => {
      const prev = lastMousePosRef.current;
      if (prev) {
        const dist = Math.hypot(e.clientX - prev.x, e.clientY - prev.y);
        // Ignore synthetic browser hit-test move events caused by DOM re-renders / pixel shifts
        if (dist < 4) {
          return;
        }
      }
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      resetTimer();
    };

    const handleDiscreteActivity = () => {
      resetTimer();
    };

    window.addEventListener('mousemove', handleMove, { passive: true });
    window.addEventListener('pointermove', handleMove, { passive: true });
    window.addEventListener('mousedown', handleDiscreteActivity, { passive: true });
    window.addEventListener('pointerdown', handleDiscreteActivity, { passive: true });
    window.addEventListener('touchstart', handleDiscreteActivity, { passive: true });
    window.addEventListener('wheel', handleDiscreteActivity, { passive: true });
    window.addEventListener('keydown', handleDiscreteActivity, { passive: true });

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('mousedown', handleDiscreteActivity);
      window.removeEventListener('pointerdown', handleDiscreteActivity);
      window.removeEventListener('touchstart', handleDiscreteActivity);
      window.removeEventListener('wheel', handleDiscreteActivity);
      window.removeEventListener('keydown', handleDiscreteActivity);
      document.documentElement.classList.remove('idle-cursor-hidden');
    };
  }, [enabled, timeoutMs, nightModeTimeoutMs, isNightMode]);
}
