import type { AppSettings } from '../types/dashboard';

export type CanvasSwipeDirection = 'next' | 'prev';
export type CanvasSwipeAxis = 'x' | 'y' | null;

export interface CanvasSwipePreviewState {
  direction: CanvasSwipeDirection;
  targetTabId: string;
  targetTabName: string;
  progress: number; // 0..1
  armed: boolean;
}

const INTERACTIVE_SWIPE_BLOCKER_SELECTOR =
  '[role="dialog"], [aria-modal="true"], nav, [data-no-canvas-swipe="true"], input, textarea, select, button, a, label, [contenteditable="true"], [data-kanban-card-id]';

const UNLOCKED_DESKTOP_CARD_SELECTOR = '[data-canvas-card="true"], [data-no-drag="true"]';

export function isCanvasSwipeEnabled(
  settings?: Pick<AppSettings, 'canvasSwipeEnabled'> | null
): boolean {
  return settings?.canvasSwipeEnabled !== false;
}

export function resolveAdjacentCanvasTab<T extends { id: string; name: string }>(
  tabs: readonly T[],
  activeTabId: string,
  direction: CanvasSwipeDirection
): T | null {
  if (!tabs || tabs.length < 2) return null;
  const currentIdx = tabs.findIndex((t) => t.id === activeTabId);
  const safeIdx = currentIdx >= 0 ? currentIdx : 0;
  const nextIdx =
    direction === 'next'
      ? (safeIdx + 1) % tabs.length
      : (safeIdx - 1 + tabs.length) % tabs.length;
  return tabs[nextIdx] || null;
}

export function computeSwipeCommitThresholdPx(viewportWidth: number): number {
  const safeWidth =
    Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 1024;
  return Math.max(56, Math.min(110, Math.round(safeWidth * 0.14)));
}

export function evaluatePointerSwipeProgress(params: {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  viewportWidth: number;
  lockedAxis: CanvasSwipeAxis;
}): {
  axis: CanvasSwipeAxis;
  active: boolean;
  direction: CanvasSwipeDirection | null;
  progress: number;
  armed: boolean;
  dx: number;
} {
  const dx = params.currentX - params.startX;
  const dy = params.currentY - params.startY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  if (params.lockedAxis === 'y') {
    return { axis: 'y', active: false, direction: null, progress: 0, armed: false, dx };
  }

  let axis: CanvasSwipeAxis;
  if (params.lockedAxis === 'x') {
    axis = 'x';
  } else if (absDx < 14 && absDy < 14) {
    return { axis: null, active: false, direction: null, progress: 0, armed: false, dx };
  } else if (absDy > absDx * 0.8) {
    return { axis: 'y', active: false, direction: null, progress: 0, armed: false, dx };
  } else {
    axis = 'x';
  }

  const direction: CanvasSwipeDirection = dx < 0 ? 'next' : 'prev';
  const threshold = computeSwipeCommitThresholdPx(params.viewportWidth);
  const active = absDx >= 22;
  const progress = Math.min(1, Math.max(0, (absDx - 14) / Math.max(1, threshold - 14)));
  const armed = absDx >= threshold;

  return { axis, active, direction, progress, armed, dx };
}

export function shouldCommitPointerSwipeRelease(params: {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  elapsedMs: number;
  viewportWidth: number;
  lockedAxis: CanvasSwipeAxis;
}): CanvasSwipeDirection | null {
  if (params.lockedAxis !== 'x') return null;

  const dx = params.endX - params.startX;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(params.endY - params.startY);

  if (absDx < 22 || absDy > absDx * 0.85) return null;

  const threshold = computeSwipeCommitThresholdPx(params.viewportWidth);
  const velocity = params.elapsedMs > 0 ? absDx / params.elapsedMs : 0;
  const fastFlick = absDx >= 42 && params.elapsedMs > 0 && params.elapsedMs <= 450 && velocity >= 0.45;

  if (absDx >= threshold || fastFlick) {
    return dx < 0 ? 'next' : 'prev';
  }
  return null;
}

export function evaluateWheelHorizontalSwipe(params: {
  deltaX: number;
  deltaY: number;
  deltaMode?: number;
  ctrlKey?: boolean;
  accumulatedPx: number;
  nowMs: number;
  lastEventMs: number;
  cooldownUntilMs: number;
}): {
  nextAccumulatedPx: number;
  nextCooldownUntilMs: number;
  triggeredDirection: CanvasSwipeDirection | null;
} {
  if (params.ctrlKey) {
    return {
      nextAccumulatedPx: 0,
      nextCooldownUntilMs: params.cooldownUntilMs,
      triggeredDirection: null,
    };
  }

  const scale = params.deltaMode === 1 ? 16 : params.deltaMode === 2 ? 100 : 1;
  const pxX = params.deltaX * scale;
  const pxY = params.deltaY * scale;

  if (params.nowMs < params.cooldownUntilMs) {
    return {
      nextAccumulatedPx: 0,
      nextCooldownUntilMs: params.cooldownUntilMs,
      triggeredDirection: null,
    };
  }

  const baseAccum = params.nowMs - params.lastEventMs > 220 ? 0 : params.accumulatedPx;

  if (Math.abs(pxY) > Math.abs(pxX)) {
    return {
      nextAccumulatedPx: 0,
      nextCooldownUntilMs: params.cooldownUntilMs,
      triggeredDirection: null,
    };
  }

  if (Math.abs(pxX) < 3 || Math.abs(pxX) <= Math.abs(pxY) * 1.35) {
    return {
      nextAccumulatedPx: baseAccum,
      nextCooldownUntilMs: params.cooldownUntilMs,
      triggeredDirection: null,
    };
  }

  const nextAccum =
    baseAccum !== 0 && Math.sign(baseAccum) !== Math.sign(pxX)
      ? pxX
      : baseAccum + pxX;

  if (Math.abs(nextAccum) >= 85) {
    const direction: CanvasSwipeDirection = nextAccum > 0 ? 'next' : 'prev';
    return {
      nextAccumulatedPx: 0,
      nextCooldownUntilMs: params.nowMs + 520,
      triggeredDirection: direction,
    };
  }

  return {
    nextAccumulatedPx: nextAccum,
    nextCooldownUntilMs: params.cooldownUntilMs,
    triggeredDirection: null,
  };
}

export function shouldIgnoreCanvasSwipeTarget(
  target: EventTarget | null,
  options: { mode: 'desktop' | 'mobile' | 'wheel'; isCanvasLocked: boolean }
): boolean {
  if (!target || typeof (target as Element).closest !== 'function') return false;
  const el = target as Element;

  if (el.closest(INTERACTIVE_SWIPE_BLOCKER_SELECTOR)) {
    return true;
  }

  if (options.mode === 'desktop' && !options.isCanvasLocked) {
    if (el.closest(UNLOCKED_DESKTOP_CARD_SELECTOR)) {
      return true;
    }
  }

  let cur: Element | null = el;
  while (cur && cur.tagName !== 'BODY' && cur.tagName !== 'HTML') {
    if (cur.getAttribute?.('data-no-canvas-swipe') === 'true') {
      return true;
    }
    if (cur.scrollWidth > cur.clientWidth + 4) {
      const ox =
        typeof window !== 'undefined' && typeof window.getComputedStyle === 'function'
          ? window.getComputedStyle(cur).overflowX
          : '';
      if (ox === 'auto' || ox === 'scroll' || ox === 'overlay') {
        return true;
      }
    }
    cur = cur.parentElement;
  }

  return false;
}
