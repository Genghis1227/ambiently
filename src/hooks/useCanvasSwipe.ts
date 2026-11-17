import { useCallback, useEffect, useRef, useState } from 'react';
import {
  evaluatePointerSwipeProgress,
  evaluateWheelHorizontalSwipe,
  resolveAdjacentCanvasTab,
  shouldCommitPointerSwipeRelease,
  shouldIgnoreCanvasSwipeTarget,
  type CanvasSwipeAxis,
  type CanvasSwipeDirection,
  type CanvasSwipePreviewState,
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
  onSelectTab: (tabId: string) => void;
}

interface ActiveGestureState {
  pointerId: number;
  sessionToken: string;
  startX: number;
  startY: number;
  startedAtMs: number;
  lockedAxis: CanvasSwipeAxis;
}

interface WheelSwipeState {
  accumulatedPx: number;
  lastEventMs: number;
  cooldownUntilMs: number;
}

export function useCanvasSwipe({
  tabs,
  activeTabId,
  enabled,
  mode,
  isCanvasLocked,
  isBlocked,
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
      onSelectTab,
    };
  });

  const gestureRef = useRef<ActiveGestureState | null>(null);
  const cleanupListenersRef = useRef<(() => void) | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
      if (
        shouldIgnoreCanvasSwipeTarget(e.target, {
          mode: cfg.mode,
          isCanvasLocked: cfg.isCanvasLocked,
        })
      ) {
        return;
      }

      cleanupListenersRef.current?.();
      setSwipePreviewState(null);

      gestureRef.current = {
        pointerId: e.pointerId,
        sessionToken: `${cfg.enabled ? '1' : '0'}:${cfg.isBlocked ? '1' : '0'}:${cfg.activeTabId}`,
        startX: e.clientX,
        startY: e.clientY,
        startedAtMs: Date.now(),
        lockedAxis: null,
      };

      const detach = () => {
        if (typeof window !== 'undefined') {
          window.removeEventListener('pointermove', handleWindowPointerMove);
          window.removeEventListener('pointerup', handleWindowPointerUp);
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

        const viewportWidth =
          typeof window !== 'undefined' ? window.innerWidth : 1024;
        const result = evaluatePointerSwipeProgress({
          startX: gesture.startX,
          startY: gesture.startY,
          currentX: ev.clientX,
          currentY: ev.clientY,
          viewportWidth,
          lockedAxis: gesture.lockedAxis,
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

        const viewportWidth =
          typeof window !== 'undefined' ? window.innerWidth : 1024;
        const committed = shouldCommitPointerSwipeRelease({
          startX: gesture.startX,
          startY: gesture.startY,
          endX: ev.clientX,
          endY: ev.clientY,
          elapsedMs: Date.now() - gesture.startedAtMs,
          viewportWidth,
          lockedAxis: gesture.lockedAxis,
        });

        if (committed) {
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
        window.addEventListener('pointerup', handleWindowPointerUp, { passive: true });
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
  };
}
