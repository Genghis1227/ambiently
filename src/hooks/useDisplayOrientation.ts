import { useEffect, useMemo, useState } from 'react';
import {
  resolveViewportLayoutMode,
  type ViewportLayoutMode,
} from '../utils/displayOrientation';

function readViewportSize(): { width: number; height: number } {
  if (typeof window === 'undefined') {
    return { width: 1280, height: 800 };
  }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
}

/**
 * Subscribes cleanly to viewport size & orientation changes without triggering synchronous
 * state updates inside effects.
 */
export function useDisplayOrientation(forceDesktopMode = false): ViewportLayoutMode {
  const [size, setSize] = useState<{ width: number; height: number }>(readViewportSize);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleResize = () => {
      const next = readViewportSize();
      setSize((prev) =>
        prev.width === next.width && prev.height === next.height ? prev : next
      );
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    };
  }, []);

  return useMemo(
    () => resolveViewportLayoutMode(size.width, size.height, forceDesktopMode),
    [size.width, size.height, forceDesktopMode]
  );
}
