import { useEffect, useRef, useSyncExternalStore } from 'react';

interface UseIdleCursorOptions {
  enabled?: boolean;
  timeoutMs?: number;
  nightModeTimeoutMs?: number;
  isNightMode?: boolean;
}

const SUPPRESSED_TITLE_ATTR = 'data-idle-suppressed-title';

let isIdleCursorHidden = false;
const idleCursorListeners = new Set<() => void>();

function subscribeIdleCursorHidden(callback: () => void): () => void {
  idleCursorListeners.add(callback);
  return () => {
    idleCursorListeners.delete(callback);
  };
}

function setIdleCursorHiddenStore(next: boolean): void {
  if (isIdleCursorHidden === next) return;
  isIdleCursorHidden = next;
  for (const listener of idleCursorListeners) {
    listener();
  }
}

/**
 * Reactive boolean reflecting whether the idle-cursor auto-hide layer is currently hiding the pointer.
 */
export function useIsCursorHidden(): boolean {
  return useSyncExternalStore(
    subscribeIdleCursorHidden,
    () => isIdleCursorHidden,
    () => false
  );
}

/**
 * Stashes an element's native `title` attribute into `data-idle-suppressed-title` and removes
 * `title` so Chromium cannot paint or retain a native hover tooltip while the cursor is hidden.
 */
export function suppressElementTooltip(el: Element): void {
  if (!el.hasAttribute('title')) return;
  const val = el.getAttribute('title');
  if (val !== null) {
    el.setAttribute(SUPPRESSED_TITLE_ATTR, val);
    el.removeAttribute('title');
  }
}

export function suppressDocumentTooltips(root: ParentNode): void {
  const targets = root.querySelectorAll('[title]');
  for (const el of targets) {
    suppressElementTooltip(el);
  }
}

export function restoreDocumentTooltips(root: ParentNode): void {
  const targets = root.querySelectorAll(`[${SUPPRESSED_TITLE_ATTR}]`);
  for (const el of targets) {
    const saved = el.getAttribute(SUPPRESSED_TITLE_ATTR);
    if (saved !== null && !el.hasAttribute('title')) {
      el.setAttribute('title', saved);
    }
    el.removeAttribute(SUPPRESSED_TITLE_ATTR);
  }
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
 * - Suppresses native browser `[title]` hover tooltips while hidden so rotating tiles or layout
 *   refreshes underneath a parked invisible pointer never pop up OS tooltips on kiosk screens.
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
      restoreDocumentTooltips(document);
      setIdleCursorHiddenStore(false);
      return;
    }

    const currentTimeout = isNightMode ? nightModeTimeoutMs : timeoutMs;
    let observer: MutationObserver | null = null;

    const attachTooltipObserver = () => {
      if (observer || typeof MutationObserver === 'undefined') return;
      observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === 'attributes' && mutation.attributeName === 'title') {
            const target = mutation.target as Element;
            if (target.nodeType === 1 && target.hasAttribute('title')) {
              suppressElementTooltip(target);
            }
          } else if (mutation.type === 'childList') {
            for (const node of mutation.addedNodes) {
              if (node.nodeType !== 1) continue;
              const el = node as Element;
              suppressElementTooltip(el);
              if (typeof el.querySelectorAll === 'function') {
                suppressDocumentTooltips(el);
              }
            }
          }
        }
      });
      observer.observe(document.documentElement, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['title'],
      });
    };

    const hideCursor = () => {
      document.documentElement.classList.add('idle-cursor-hidden');
      suppressDocumentTooltips(document);
      attachTooltipObserver();
      setIdleCursorHiddenStore(true);
    };

    const showCursor = () => {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
      document.documentElement.classList.remove('idle-cursor-hidden');
      restoreDocumentTooltips(document);
      setIdleCursorHiddenStore(false);
    };

    const resetTimer = () => {
      showCursor();

      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      timerRef.current = setTimeout(() => {
        hideCursor();
      }, currentTimeout);
    };

    // When Night Mode engages, hide cursor immediately without waiting for mouse movement
    if (isNightMode) {
      if (timerRef.current) clearTimeout(timerRef.current);
      hideCursor();
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
      showCursor();
    };
  }, [enabled, timeoutMs, nightModeTimeoutMs, isNightMode]);
}
