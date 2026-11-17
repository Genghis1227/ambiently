import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppSettings } from '../types/dashboard';
import {
  classifyCanvasSwipeStartTarget,
  evaluatePointerSwipeProgress,
  evaluateWheelHorizontalSwipe,
  requestCancelActiveCardDrag,
  resolveAdjacentCanvasTab,
  shouldCommitPointerSwipeRelease,
  shouldIgnoreCanvasSwipeTarget,
  type CanvasSwipeAxis,
  type CanvasSwipeDirection,
  type CanvasSwipePreviewState,
  type CanvasSwipeTriggerTier,
} from '../utils/canvasSwipe';

interface SwipeTabSummary {
  id: string;
  name: string;
}

export interface UseCanvasSwipeOptions {
  tabs: readonly SwipeTabSummary[];
  activeTabId: string;
  enabled: boolean;
  mode: 'desktop' | 'mobile';
  isCanvasLocked: boolean;
  isBlocked: boolean;
  dockPosition?: AppSettings['dockPosition'];
  isDockHidden?: boolean;
  onSelectTab: (tabId: string) => void;
}

interface PointerSample {
  x: number;
  t: number;
}

interface ActiveGestureState {
  pointerId: number;
  sessionToken: string;
  tier: CanvasSwipeTriggerTier;
  startX: number;
  startY: number;
  startedAtMs: number;
  lockedAxis: CanvasSwipeAxis;
  samples: PointerSample[];
}

interface WheelSwipeState {
  accumulatedPx: number;
  lastEventMs: number;
  cooldownUntilMs: number;
}

function computeRecentHorizontalVelocity(
  samples: readonly PointerSample[],
  currentX: number,
  nowMs: number
): number {
  if (samples.length === 0) return 0;
  const latest = samples[samples.length - 1];
  if (nowMs - latest.t > 110) {
    return 0;
  }
  let anchor = samples[0];
  for (let i = samples.length - 1; i >= 0; i -= 1) {
    const age = nowMs - samples[i].t;
    anchor = samples[i];
    if (age >= 45) break;
  }
  const dt = nowMs - anchor.t;
  if (dt <= 0) return 0;
  return Math.abs(currentX - anchor.x) / dt;
}

export function useCanvasSwipe({
  tabs,
  activeTabId,
  enabled,
  mode,
  isCanvasLocked,
  isBlocked,
  dockPosition,
  isDockHidden,
  onSelectTab,
}: UseCanvasSwipeOptions) {
  const currentSwipeToken = `${enabled ? '1' : '0'}:${isBlocked ? '1' : '0'}:${activeTabId}`;
  const [swipePreviewState, setSwipePreviewState] = useState<{
    token: string;
    preview: CanvasSwipePreviewState;
  } | null>(null);
  const [transitionDirection, setTransitionDirection] =
    useState<CanvasSwipeDirection | null>(null);

  const configRef = useRef<UseCanvasSwipeOptions>({
    tabs,
    activeTabId,
    enabled,
    mode,
    isCanvasLocked,
    isBlocked,
    dockPosition,
    isDockHidden,
    onSelectTab,
  });

  useEffect(() => {
    configRef.current = {
      tabs,
      activeTabId,
      enabled,
      mode,
      isCanvasLocked,
      isBlocked,
      dockPosition,
      isDockHidden,
      onSelectTab,
    };
  });

  const gestureRef = useRef<ActiveGestureState | null>(null);
  const cleanupListenersRef = useRef<(() => void) | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickUntilMsRef = useRef<number>(0);
  const wheelStateRef = useRef<WheelSwipeState>({
    accumulatedPx: 0,
    lastEventMs: 0,
    cooldownUntilMs: 0,
  });

  const triggerCanvasSwitch = useCallback((direction: CanvasSwipeDirection) => {
    const cfg = configRef.current;
    const targetTab = resolveAdjacentCanvasTab(cfg.tabs, cfg.activeTabId, direction);
    if (!targetTab || targetTab.id === cfg.activeTabId) return;

    if (transitionTimerRef.current) {
      clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }

    setTransitionDirection(direction);
    transitionTimerRef.current = setTimeout(() => {
      transitionTimerRef.current = null;
      setTransitionDirection(null);
    }, 210);

    cfg.onSelectTab(targetTab.id);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleClickCapture = (ev: MouseEvent) => {
      if (suppressClickUntilMsRef.current > Date.now()) {
        suppressClickUntilMsRef.current = 0;
        ev.preventDefault();
        ev.stopPropagation();
      }
    };
    window.addEventListener('click', handleClickCapture, true);
    return () => {
      window.removeEventListener('click', handleClickCapture, true);
    };
  }, []);

  useEffect(() => {
    return () => {
      cleanupListenersRef.current?.();
      cleanupListenersRef.current = null;
      gestureRef.current = null;
      if (transitionTimerRef.current) {
        clearTimeout(transitionTimerRef.current);
        transitionTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (isBlocked || !enabled) {
      cleanupListenersRef.current?.();
      cleanupListenersRef.current = null;
      gestureRef.current = null;
    }
  }, [enabled, isBlocked]);

  const onPointerDown: React.PointerEventHandler<HTMLDivElement> = useCallback(
    (e) => {
      if (e.isPrimary) {
        suppressClickUntilMsRef.current = 0;
      }
      const cfg = configRef.current;
      if (!cfg.enabled || cfg.isBlocked || cfg.tabs.length < 2) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (!e.isPrimary) return;
      if (
        typeof document !== 'undefined' &&
        document.querySelector('[role="dialog"], [aria-modal="true"]')
      ) {
        return;
      }

      const viewportWidth =
        typeof window !== 'undefined' ? window.innerWidth : 1024;
      const tier = classifyCanvasSwipeStartTarget(e.target, {
        mode: cfg.mode,
        isCanvasLocked: cfg.isCanvasLocked,
        clientX: e.clientX,
        viewportWidth,
        dockPosition: cfg.dockPosition,
        isDockHidden: cfg.isDockHidden,
      });
      if (tier === 'ignore') {
        return;
      }

      cleanupListenersRef.current?.();
      setSwipePreviewState(null);

      const startedAtMs = Date.now();
      gestureRef.current = {
        pointerId: e.pointerId,
        sessionToken: `${cfg.enabled ? '1' : '0'}:${cfg.isBlocked ? '1' : '0'}:${cfg.activeTabId}`,
        tier,
        startX: e.clientX,
        startY: e.clientY,
        startedAtMs,
        lockedAxis: null,
        samples: [{ x: e.clientX, t: startedAtMs }],
      };

      const detach = () => {
        if (typeof window !== 'undefined') {
          window.removeEventListener('pointermove', handleWindowPointerMove);
          window.removeEventListener('pointerup', handleWindowPointerUp, true);
          window.removeEventListener('pointercancel', handleWindowPointerCancel);
        }
        cleanupListenersRef.current = null;
      };

      const handleWindowPointerMove = (ev: PointerEvent) => {
        const gesture = gestureRef.current;
        if (!gesture || ev.pointerId !== gesture.pointerId) return;

        const latestCfg = configRef.current;
        if (!latestCfg.enabled || latestCfg.isBlocked || latestCfg.tabs.length < 2) {
          gestureRef.current = null;
          detach();
          setSwipePreviewState(null);
          return;
        }

        const nowMs = Date.now();
        gesture.samples.push({ x: ev.clientX, t: nowMs });
        while (gesture.samples.length > 2 && nowMs - gesture.samples[0].t > 140) {
          gesture.samples.shift();
        }
        const recentVelocityPxPerMs = computeRecentHorizontalVelocity(
          gesture.samples,
          ev.clientX,
          nowMs
        );

        const moveViewportWidth =
          typeof window !== 'undefined' ? window.innerWidth : 1024;
        const result = evaluatePointerSwipeProgress({
          startX: gesture.startX,
          startY: gesture.startY,
          currentX: ev.clientX,
          currentY: ev.clientY,
          viewportWidth: moveViewportWidth,
          lockedAxis: gesture.lockedAxis,
          tier: gesture.tier,
          elapsedMs: nowMs - gesture.startedAtMs,
          recentVelocityPxPerMs,
        });

        gesture.lockedAxis = result.axis;

        if (result.axis === 'y') {
          gestureRef.current = null;
          detach();
          setSwipePreviewState(null);
          return;
        }

        if (result.active && result.direction) {
          const targetTab = resolveAdjacentCanvasTab(
            latestCfg.tabs,
            latestCfg.activeTabId,
            result.direction
          );
          if (targetTab) {
            setSwipePreviewState({
              token: gesture.sessionToken,
              preview: {
                direction: result.direction,
                targetTabId: targetTab.id,
                targetTabName: targetTab.name,
                progress: result.progress,
                armed: result.armed,
              },
            });
            return;
          }
        }

        setSwipePreviewState(null);
      };

      const handleWindowPointerUp = (ev: PointerEvent) => {
        const gesture = gestureRef.current;
        if (!gesture || ev.pointerId !== gesture.pointerId) return;

        gestureRef.current = null;
        detach();
        setSwipePreviewState(null);

        const latestCfg = configRef.current;
        if (!latestCfg.enabled || latestCfg.isBlocked || latestCfg.tabs.length < 2) {
          return;
        }

        const nowMs = Date.now();
        const recentVelocityPxPerMs = computeRecentHorizontalVelocity(
          gesture.samples,
          ev.clientX,
          nowMs
        );
        const upViewportWidth =
          typeof window !== 'undefined' ? window.innerWidth : 1024;
        const committed = shouldCommitPointerSwipeRelease({
          startX: gesture.startX,
          startY: gesture.startY,
          endX: ev.clientX,
          endY: ev.clientY,
          elapsedMs: nowMs - gesture.startedAtMs,
          viewportWidth: upViewportWidth,
          lockedAxis: gesture.lockedAxis,
          tier: gesture.tier,
          recentVelocityPxPerMs,
        });

        if (committed) {
          if (gesture.tier === 'long_card') {
            requestCancelActiveCardDrag();
          }
          suppressClickUntilMsRef.current = nowMs + 350;
          triggerCanvasSwitch(committed);
        }
      };

      const handleWindowPointerCancel = (ev: PointerEvent) => {
        const gesture = gestureRef.current;
        if (!gesture || ev.pointerId !== gesture.pointerId) return;

        gestureRef.current = null;
        detach();
        setSwipePreviewState(null);
      };

      cleanupListenersRef.current = detach;

      if (typeof window !== 'undefined') {
        window.addEventListener('pointermove', handleWindowPointerMove, { passive: true });
        window.addEventListener('pointerup', handleWindowPointerUp, {
          capture: true,
          passive: true,
        });
        window.addEventListener('pointercancel', handleWindowPointerCancel, { passive: true });
      }
    },
    [triggerCanvasSwitch]
  );

  useEffect(() => {
    if (!enabled || isBlocked || mode !== 'desktop' || tabs.length < 2) {
      wheelStateRef.current = {
        accumulatedPx: 0,
        lastEventMs: 0,
        cooldownUntilMs: wheelStateRef.current.cooldownUntilMs,
      };
      return;
    }

    const handleWheel = (e: WheelEvent) => {
      if (
        typeof document !== 'undefined' &&
        document.querySelector('[role="dialog"], [aria-modal="true"]')
      ) {
        return;
      }
      if (shouldIgnoreCanvasSwipeTarget(e.target, { mode: 'wheel', isCanvasLocked: true })) {
        return;
      }

      const nowMs = Date.now();
      const prev = wheelStateRef.current;
      const evaluated = evaluateWheelHorizontalSwipe({
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        deltaMode: e.deltaMode,
        ctrlKey: e.ctrlKey,
        accumulatedPx: prev.accumulatedPx,
        nowMs,
        lastEventMs: prev.lastEventMs,
        cooldownUntilMs: prev.cooldownUntilMs,
      });

      wheelStateRef.current = {
        accumulatedPx: evaluated.nextAccumulatedPx,
        lastEventMs: nowMs,
        cooldownUntilMs: evaluated.nextCooldownUntilMs,
      };

      if (evaluated.triggeredDirection) {
        triggerCanvasSwitch(evaluated.triggeredDirection);
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: true });
    return () => window.removeEventListener('wheel', handleWheel);
  }, [enabled, isBlocked, mode, tabs.length, triggerCanvasSwitch]);

  const swipePreview =
    enabled && !isBlocked && swipePreviewState?.token === currentSwipeToken
      ? swipePreviewState.preview
      : null;

  const transitionClass =
    transitionDirection === 'next'
      ? 'ambiently-canvas-enter-next'
      : transitionDirection === 'prev'
        ? 'ambiently-canvas-enter-prev'
        : '';

  return {
    swipePreview,
    transitionClass,
    onPointerDown,
    onPointerDownCapture: onPointerDown,
  };
}
