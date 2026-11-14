import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { KanbanCard, KanbanColumnId } from '../../types/kanban';
import { resolveKanbanTagHex, resolveKanbanTagLabel } from '../../types/kanban';

export type KanbanEdgeDirection = 'left' | 'right';

export interface EdgeSwitchConfig {
  enabled: boolean;
  containerRef: React.RefObject<HTMLElement | null>;
  canStepLeft: boolean;
  canStepRight: boolean;
  onStepDirection: (direction: KanbanEdgeDirection) => void;
  dwellMs?: number;
}

export interface UseKanbanPointerDnDOptions {
  rootRef: React.RefObject<HTMLElement | null>;
  activeColumnFallback?: KanbanColumnId;
  onDropCard: (cardId: string, targetColumnId: KanbanColumnId, targetIndex: number) => void;
  edgeSwitch?: EdgeSwitchConfig;
  isLight?: boolean;
  isNightMode?: boolean;
}

export interface ActiveKanbanDragState {
  card: KanbanCard;
  clientX: number;
  clientY: number;
  width: number;
  offsetX: number;
  offsetY: number;
  hoverColumnId: KanbanColumnId;
  dropIndex: number;
}

interface PendingPress {
  card: KanbanCard;
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  cardRect: DOMRect;
  fromHandle: boolean;
  activated: boolean;
  touchHoldTimer: ReturnType<typeof setTimeout> | null;
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('button, input, textarea, select, a, label'));
}

export function useKanbanPointerDnD({
  rootRef,
  activeColumnFallback = 'in_progress',
  onDropCard,
  edgeSwitch,
  isLight = false,
  isNightMode = false,
}: UseKanbanPointerDnDOptions) {
  const [dragState, setDragState] = useState<ActiveKanbanDragState | null>(null);
  const [activeEdge, setActiveEdge] = useState<KanbanEdgeDirection | null>(null);

  const pendingRef = useRef<PendingPress | null>(null);
  const dragStateRef = useRef<ActiveKanbanDragState | null>(null);
  const justDraggedRef = useRef(false);

  const onDropCardRef = useRef(onDropCard);
  const edgeSwitchRef = useRef(edgeSwitch);
  const fallbackColumnRef = useRef(activeColumnFallback);

  const edgeDwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentEdgeRef = useRef<KanbanEdgeDirection | null>(null);
  const edgeCooldownUntilRef = useRef<number>(0);

  useEffect(() => {
    onDropCardRef.current = onDropCard;
    edgeSwitchRef.current = edgeSwitch;
    fallbackColumnRef.current = activeColumnFallback;
  });

  const clearEdgeTimer = useCallback(() => {
    if (edgeDwellTimerRef.current) {
      clearTimeout(edgeDwellTimerRef.current);
      edgeDwellTimerRef.current = null;
    }
    if (currentEdgeRef.current !== null) {
      currentEdgeRef.current = null;
      setActiveEdge(null);
    }
  }, []);

  const computeDropTarget = useCallback(
    (clientX: number, clientY: number, draggedCardId: string): {
      columnId: KanbanColumnId;
      dropIndex: number;
    } => {
      const root = rootRef.current;
      let chosenCol: KanbanColumnId = fallbackColumnRef.current;

      if (root) {
        const columns = Array.from(
          root.querySelectorAll<HTMLElement>('[data-kanban-column]')
        );
        if (columns.length === 1) {
          const singleId = columns[0].dataset.kanbanColumn as KanbanColumnId | undefined;
          if (singleId) chosenCol = singleId;
        } else if (columns.length > 1) {
          let bestColEl: HTMLElement | null = null;
          let minHorizDist = Infinity;

          for (const colEl of columns) {
            const r = colEl.getBoundingClientRect();
            const insideHoriz = clientX >= r.left && clientX <= r.right;
            const insideVert = clientY >= r.top && clientY <= r.bottom;
            if (insideHoriz && insideVert) {
              bestColEl = colEl;
              break;
            }
            const dist = insideHoriz
              ? 0
              : clientX < r.left
              ? r.left - clientX
              : clientX - r.right;
            if (dist < minHorizDist) {
              minHorizDist = dist;
              bestColEl = colEl;
            }
          }

          const resolved = bestColEl?.dataset.kanbanColumn as KanbanColumnId | undefined;
          if (resolved) chosenCol = resolved;
        }

        const targetColEl = root.querySelector<HTMLElement>(
          `[data-kanban-column="${chosenCol}"]`
        );
        if (targetColEl) {
          const cardEls = Array.from(
            targetColEl.querySelectorAll<HTMLElement>('[data-kanban-card-id]')
          ).filter((el) => el.dataset.kanbanCardId !== draggedCardId);

          let idx = 0;
          for (const cardEl of cardEls) {
            const rect = cardEl.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (clientY >= midY) {
              idx += 1;
            } else {
              break;
            }
          }
          return { columnId: chosenCol, dropIndex: idx };
        }
      }

      return { columnId: chosenCol, dropIndex: 0 };
    },
    [rootRef]
  );

  const evaluateEdgeSwitch = useCallback(
    (clientX: number, clientY: number) => {
      const cfg = edgeSwitchRef.current;
      if (!cfg || !cfg.enabled || !cfg.containerRef.current) {
        clearEdgeTimer();
        return;
      }

      if (Date.now() < edgeCooldownUntilRef.current) {
        return;
      }

      const rect = cfg.containerRef.current.getBoundingClientRect();
      const edgeZoneWidth = Math.min(52, Math.max(32, rect.width * 0.14));
      const withinVerticalBounds =
        clientY >= rect.top - 24 && clientY <= rect.bottom + 24;

      let candidate: KanbanEdgeDirection | null = null;
      if (withinVerticalBounds) {
        if (
          cfg.canStepLeft &&
          clientX <= rect.left + edgeZoneWidth &&
          clientX >= rect.left - 32
        ) {
          candidate = 'left';
        } else if (
          cfg.canStepRight &&
          clientX >= rect.right - edgeZoneWidth &&
          clientX <= rect.right + 32
        ) {
          candidate = 'right';
        }
      }

      if (candidate === currentEdgeRef.current) {
        return;
      }

      clearEdgeTimer();
      if (!candidate) {
        return;
      }

      currentEdgeRef.current = candidate;
      setActiveEdge(candidate);
      const dwellMs = cfg.dwellMs ?? 350;

      edgeDwellTimerRef.current = setTimeout(() => {
        edgeDwellTimerRef.current = null;
        const latestDrag = dragStateRef.current;
        const latestCfg = edgeSwitchRef.current;
        if (!latestDrag || !latestCfg) return;

        const dir = candidate;
        const stillAllowed = dir === 'left' ? latestCfg.canStepLeft : latestCfg.canStepRight;
        if (!stillAllowed) {
          clearEdgeTimer();
          return;
        }

        edgeCooldownUntilRef.current = Date.now() + 450;
        clearEdgeTimer();
        latestCfg.onStepDirection(dir);

        // Recompute drop target on next frame after column swaps
        requestAnimationFrame(() => {
          const cur = dragStateRef.current;
          if (!cur) return;
          const nextTarget = computeDropTarget(cur.clientX, cur.clientY, cur.card.id);
          const updated: ActiveKanbanDragState = {
            ...cur,
            hoverColumnId: nextTarget.columnId,
            dropIndex: nextTarget.dropIndex,
          };
          dragStateRef.current = updated;
          setDragState(updated);
        });
      }, dwellMs);
    },
    [clearEdgeTimer, computeDropTarget]
  );

  const activateDrag = useCallback(
    (press: PendingPress, clientX: number, clientY: number) => {
      press.activated = true;
      if (press.touchHoldTimer) {
        clearTimeout(press.touchHoldTimer);
        press.touchHoldTimer = null;
      }

      const { columnId, dropIndex } = computeDropTarget(
        clientX,
        clientY,
        press.card.id
      );

      const initial: ActiveKanbanDragState = {
        card: press.card,
        clientX,
        clientY,
        width: Math.max(180, Math.min(340, press.cardRect.width)),
        offsetX: Math.min(
          press.cardRect.width - 16,
          Math.max(16, press.startX - press.cardRect.left)
        ),
        offsetY: Math.min(
          press.cardRect.height - 12,
          Math.max(12, press.startY - press.cardRect.top)
        ),
        hoverColumnId: columnId,
        dropIndex,
      };
      dragStateRef.current = initial;
      setDragState(initial);
    },
    [computeDropTarget]
  );

  const cancelAllDragState = useCallback(() => {
    const press = pendingRef.current;
    if (press?.touchHoldTimer) {
      clearTimeout(press.touchHoldTimer);
    }
    pendingRef.current = null;
    dragStateRef.current = null;
    setDragState(null);
    clearEdgeTimer();
  }, [clearEdgeTimer]);

  useEffect(() => {
    const handleWindowPointerMove = (e: PointerEvent) => {
      const press = pendingRef.current;
      if (!press || e.pointerId !== press.pointerId) return;

      press.lastX = e.clientX;
      press.lastY = e.clientY;

      if (!press.activated) {
        const dist = Math.hypot(e.clientX - press.startX, e.clientY - press.startY);
        if (press.fromHandle || press.pointerType === 'mouse') {
          if (dist >= 5) {
            activateDrag(press, e.clientX, e.clientY);
          }
        } else if (dist > 8) {
          // Finger moved before hold elapsed -> user is scrolling vertically
          cancelAllDragState();
        }
        return;
      }

      if (e.cancelable) {
        e.preventDefault();
      }

      const cur = dragStateRef.current;
      if (!cur) return;

      const { columnId, dropIndex } = computeDropTarget(
        e.clientX,
        e.clientY,
        cur.card.id
      );
      const nextState: ActiveKanbanDragState = {
        ...cur,
        clientX: e.clientX,
        clientY: e.clientY,
        hoverColumnId: columnId,
        dropIndex,
      };
      dragStateRef.current = nextState;
      setDragState(nextState);
      evaluateEdgeSwitch(e.clientX, e.clientY);
    };

    const handleWindowPointerUp = (e: PointerEvent) => {
      const press = pendingRef.current;
      if (!press || e.pointerId !== press.pointerId) return;

      const active = dragStateRef.current;
      const wasActivated = press.activated && Boolean(active);

      if (wasActivated && active) {
        justDraggedRef.current = true;
        setTimeout(() => {
          justDraggedRef.current = false;
        }, 90);
        onDropCardRef.current(active.card.id, active.hoverColumnId, active.dropIndex);
      }

      cancelAllDragState();
    };

    window.addEventListener('pointermove', handleWindowPointerMove, { passive: false });
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);

    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
    };
  }, [activateDrag, cancelAllDragState, computeDropTarget, evaluateEdgeSwitch]);

  useEffect(() => {
    return () => {
      if (pendingRef.current?.touchHoldTimer) {
        clearTimeout(pendingRef.current.touchHoldTimer);
      }
      if (edgeDwellTimerRef.current) {
        clearTimeout(edgeDwellTimerRef.current);
      }
    };
  }, []);

  const beginPress = useCallback(
    (e: React.PointerEvent, card: KanbanCard, fromHandle: boolean) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      if (!fromHandle && isInteractiveTarget(e.target)) return;

      e.stopPropagation();

      const cardEl = (e.currentTarget as HTMLElement).closest(
        '[data-kanban-card-id]'
      ) as HTMLElement | null;
      const rect = cardEl
        ? cardEl.getBoundingClientRect()
        : (e.currentTarget as HTMLElement).getBoundingClientRect();

      if (pendingRef.current?.touchHoldTimer) {
        clearTimeout(pendingRef.current.touchHoldTimer);
      }

      const press: PendingPress = {
        card,
        pointerId: e.pointerId,
        pointerType: e.pointerType || 'mouse',
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        cardRect: rect,
        fromHandle,
        activated: false,
        touchHoldTimer: null,
      };

      if (fromHandle && press.pointerType !== 'mouse') {
        // Immediate drag start on dedicated grip handle
        pendingRef.current = press;
        activateDrag(press, e.clientX, e.clientY);
        return;
      }

      if (!fromHandle && press.pointerType !== 'mouse') {
        press.touchHoldTimer = setTimeout(() => {
          if (pendingRef.current === press && !press.activated) {
            activateDrag(press, press.lastX, press.lastY);
          }
        }, 160);
      }

      pendingRef.current = press;
    },
    [activateDrag]
  );

  const getCardDragProps = useCallback(
    (card: KanbanCard) => ({
      onPointerDown: (e: React.PointerEvent) => beginPress(e, card, false),
    }),
    [beginPress]
  );

  const getHandleDragProps = useCallback(
    (card: KanbanCard) => ({
      onPointerDown: (e: React.PointerEvent) => beginPress(e, card, true),
    }),
    [beginPress]
  );

  const shouldSuppressClick = useCallback(() => justDraggedRef.current, []);

  const DragGhostPortal = (() => {
    if (!dragState || typeof document === 'undefined') return null;
    const tagHex = resolveKanbanTagHex(dragState.card.tagColor);
    const tagLabel = resolveKanbanTagLabel(dragState.card);

    const ghostClass = `fixed pointer-events-none z-[120] rounded-xl px-3 py-2.5 border transition-none ${
      isLight
        ? 'bg-white/95 border-slate-300 text-slate-800 shadow-lg'
        : isNightMode
        ? 'bg-[#121720]/95 border-slate-700/60 text-slate-200 shadow-none'
        : 'bg-gray-900/95 border-slate-600/70 text-slate-100 shadow-2xl'
    }`;

    const tagNode = tagHex
      ? React.createElement(
          'div',
          { className: 'mb-1 flex items-center gap-1.5' },
          React.createElement(
            'span',
            {
              className:
                'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border',
              style: {
                backgroundColor: `${tagHex}22`,
                borderColor: `${tagHex}55`,
                color: isLight ? '#334155' : '#e2e8f0',
              },
            },
            tagLabel
          )
        )
      : null;

    const titleNode = React.createElement(
      'p',
      { className: 'text-xs font-medium leading-snug line-clamp-2' },
      dragState.card.title
    );

    const ghostElement = React.createElement(
      'div',
      {
        className: ghostClass,
        style: {
          left: dragState.clientX - dragState.offsetX,
          top: dragState.clientY - dragState.offsetY,
          width: dragState.width,
          transform: isNightMode ? 'scale(1.01)' : 'scale(1.03) rotate(0.6deg)',
          opacity: isNightMode ? 0.9 : 0.96,
        },
      },
      tagNode,
      titleNode
    );

    return createPortal(ghostElement, document.body);
  })();

  return {
    dragState,
    activeEdge,
    getCardDragProps,
    getHandleDragProps,
    shouldSuppressClick,
    DragGhostPortal,
  };
}
