import type { AppSettings } from '../types/dashboard';

export type CanvasSwipeDirection = 'next' | 'prev';
export type CanvasSwipeAxis = 'x' | 'y' | null;
export type CanvasSwipeTriggerTier = 'standard' | 'long_card';
export type CanvasSwipeStartClassification = CanvasSwipeTriggerTier | 'ignore';

export const EDGE_SWIPE_ZONE_PX = 36;
export const DESKTOP_SIDE_DOCK_WIDTH_PX = 80;

export interface CanvasSwipePreviewState {
  direction: CanvasSwipeDirection;
  targetTabId: string;
  targetTabName: string;
  progress: number; // 0..1
  armed: boolean;
}

const INTERACTIVE_SWIPE_BLOCKER_SELECTOR =
  '[role="dialog"], [aria-modal="true"], nav, [data-no-canvas-swipe="true"], input, textarea, select, option, [contenteditable="true"], [role="slider"], [data-kanban-card-id]';

export function isCanvasSwipeEnabled(
  settings?: Pick<AppSettings, 'canvasSwipeEnabled'> | null
): boolean {
  return settings?.canvasSwipeEnabled !== false;
}

export function isPointInCanvasEdgeSwipeZone(params: {
  clientX: number;
  viewportWidth: number;
  dockPosition?: AppSettings['dockPosition'];
  isDockHidden?: boolean;
  edgePx?: number;
}): boolean {
  const safeWidth =
    Number.isFinite(params.viewportWidth) && params.viewportWidth > 0
      ? params.viewportWidth
      : 1024;
  const edgePx = params.edgePx ?? EDGE_SWIPE_ZONE_PX;
  if (!Number.isFinite(params.clientX) || edgePx <= 0 || safeWidth <= edgePx * 2) {
    return false;
  }
  const leftEdge =
    !params.isDockHidden && params.dockPosition === 'left'
      ? DESKTOP_SIDE_DOCK_WIDTH_PX
      : 0;
  const rightEdge =
    safeWidth -
    (!params.isDockHidden && params.dockPosition === 'right'
      ? DESKTOP_SIDE_DOCK_WIDTH_PX
      : 0);

  return (
    (params.clientX >= leftEdge && params.clientX <= leftEdge + edgePx) ||
    (params.clientX >= rightEdge - edgePx && params.clientX <= rightEdge)
  );
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

export function computeLongSwipeCommitThresholdPx(viewportWidth: number): number {
  const safeWidth =
    Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 1024;
  return Math.max(220, Math.min(420, Math.round(safeWidth * 0.32)));
}

export function computeLongSwipeFastFlickMinPx(viewportWidth: number): number {
  const safeWidth =
    Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 1024;
  return Math.max(170, Math.min(290, Math.round(safeWidth * 0.22)));
}

export function evaluatePointerSwipeProgress(params: {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  viewportWidth: number;
  lockedAxis: CanvasSwipeAxis;
  tier?: CanvasSwipeTriggerTier;
  elapsedMs?: number;
  recentVelocityPxPerMs?: number;
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

  if (params.tier === 'long_card') {
    if (absDx < 14 && absDy < 14) {
      return { axis: null, active: false, direction: null, progress: 0, armed: false, dx };
    }
    if (
      absDy > 56 ||
      (absDx >= 24 && absDy > absDx * 0.45) ||
      (params.lockedAxis === null && absDy > absDx * 0.65)
    ) {
      return { axis: 'y', active: false, direction: null, progress: 0, armed: false, dx };
    }

    const axis: CanvasSwipeAxis = 'x';
    const direction: CanvasSwipeDirection = dx < 0 ? 'next' : 'prev';
    const longThreshold = computeLongSwipeCommitThresholdPx(params.viewportWidth);
    const flickMin = computeLongSwipeFastFlickMinPx(params.viewportWidth);
    const elapsed = params.elapsedMs ?? 0;
    const recentVel = params.recentVelocityPxPerMs ?? 0;

    if (elapsed > 650 || (absDx >= flickMin && recentVel < 0.18)) {
      return { axis, active: false, direction, progress: 0, armed: false, dx };
    }

    const previewStart = Math.round(longThreshold * 0.55);
    const active = absDx >= previewStart && recentVel >= 0.18;
    const progress = active
      ? Math.min(
          1,
          Math.max(
            0,
            (absDx - (previewStart - 24)) / Math.max(1, longThreshold - (previewStart - 24))
          )
        )
      : 0;
    const fastFlickArmed =
      absDx >= flickMin && elapsed > 0 && elapsed <= 380 && recentVel >= 0.65;
    const armed = active && (absDx >= longThreshold || fastFlickArmed);

    return { axis, active, direction, progress, armed, dx };
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
  tier?: CanvasSwipeTriggerTier;
  recentVelocityPxPerMs?: number;
}): CanvasSwipeDirection | null {
  if (params.lockedAxis !== 'x') return null;

  const dx = params.endX - params.startX;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(params.endY - params.startY);

  if (params.tier === 'long_card') {
    if (absDy > 56 || absDx < absDy * 2.2) return null;
    if (params.elapsedMs <= 0 || params.elapsedMs > 650) return null;
    if ((params.recentVelocityPxPerMs ?? 0) < 0.25) return null;

    const longThreshold = computeLongSwipeCommitThresholdPx(params.viewportWidth);
    const flickMin = computeLongSwipeFastFlickMinPx(params.viewportWidth);
    const overallVelocity = absDx / params.elapsedMs;
    const fastWideFlick =
      absDx >= flickMin && params.elapsedMs <= 380 && overallVelocity >= 0.65;

    if (absDx >= longThreshold || fastWideFlick) {
      return dx < 0 ? 'next' : 'prev';
    }
    return null;
  }

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

export function classifyCanvasSwipeStartTarget(
  target: EventTarget | null,
  options: {
    mode: 'desktop' | 'mobile' | 'wheel';
    isCanvasLocked: boolean;
    clientX?: number;
    viewportWidth?: number;
    dockPosition?: AppSettings['dockPosition'];
    isDockHidden?: boolean;
  }
): CanvasSwipeStartClassification {
  if (!target || typeof (target as Element).closest !== 'function') {
    return 'standard';
  }
  const el = target as Element;

  if (el.closest(INTERACTIVE_SWIPE_BLOCKER_SELECTOR)) {
    return 'ignore';
  }

  let cur: Element | null = el;
  while (cur && cur.tagName !== 'BODY' && cur.tagName !== 'HTML') {
    if (cur.getAttribute?.('data-no-canvas-swipe') === 'true') {
      return 'ignore';
    }
    if (cur.scrollWidth > cur.clientWidth + 4) {
      const ox =
        typeof window !== 'undefined' && typeof window.getComputedStyle === 'function'
          ? window.getComputedStyle(cur).overflowX
          : '';
      if (ox === 'auto' || ox === 'scroll' || ox === 'overlay') {
        return 'ignore';
      }
    }
    cur = cur.parentElement;
  }

  if (options.mode !== 'desktop' || options.isCanvasLocked) {
    return 'standard';
  }

  if (
    typeof options.clientX === 'number' &&
    isPointInCanvasEdgeSwipeZone({
      clientX: options.clientX,
      viewportWidth: options.viewportWidth ?? 1024,
      dockPosition: options.dockPosition,
      isDockHidden: options.isDockHidden,
    })
  ) {
    return 'standard';
  }

  if (el.closest('[data-canvas-fullscreen="true"]')) {
    return 'standard';
  }

  if (el.closest('[data-canvas-card="true"]')) {
    return 'long_card';
  }

  return 'standard';
}

export function shouldIgnoreCanvasSwipeTarget(
  target: EventTarget | null,
  options: {
    mode: 'desktop' | 'mobile' | 'wheel';
    isCanvasLocked: boolean;
    clientX?: number;
    viewportWidth?: number;
    dockPosition?: AppSettings['dockPosition'];
    isDockHidden?: boolean;
  }
): boolean {
  const classification = classifyCanvasSwipeStartTarget(target, options);
  return classification === 'ignore' || classification === 'long_card';
}

const cancelCardDragListeners = new Set<() => void>();

export function subscribeCancelActiveCardDrag(listener: () => void): () => void {
  cancelCardDragListeners.add(listener);
  return () => {
    cancelCardDragListeners.delete(listener);
  };
}

export function requestCancelActiveCardDrag(): void {
  cancelCardDragListeners.forEach((listener) => {
    listener();
  });
}
