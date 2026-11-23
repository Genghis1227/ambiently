import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { DEFAULT_SETTINGS } from '../src/services/db.ts';
import {
  CARD_DRAG_HOLD_CANCEL_PX,
  CARD_DRAG_HOLD_MS,
  classifyCanvasSwipeStartTarget,
  computeLongSwipeCommitThresholdPx,
  computeLongSwipeFastFlickMinPx,
  computeSwipeCommitThresholdPx,
  evaluatePointerSwipeProgress,
  evaluateWheelHorizontalSwipe,
  isCanvasSwipeEnabled,
  isPointInCanvasEdgeSwipeZone,
  requestCancelActiveCanvasSwipe,
  requestCancelActiveCardDrag,
  resolveAdjacentCanvasTab,
  shouldCommitPointerSwipeRelease,
  shouldIgnoreCanvasSwipeTarget,
  subscribeCancelActiveCanvasSwipe,
  subscribeCancelActiveCardDrag,
} from '../src/utils/canvasSwipe.ts';

interface MockElementNode {
  tagName: string;
  attributes: Record<string, string>;
  scrollWidth: number;
  clientWidth: number;
  overflowX: string;
  parentElement: MockElementNode | null;
  closest: (selector: string) => MockElementNode | null;
  getAttribute: (name: string) => string | null;
}

function matchesSelectorToken(el: MockElementNode, token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    const inner = trimmed.slice(1, -1);
    const eqIdx = inner.indexOf('=');
    if (eqIdx === -1) {
      return Object.prototype.hasOwnProperty.call(el.attributes, inner);
    }
    const attrName = inner.slice(0, eqIdx).trim();
    const rawVal = inner.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    return el.attributes[attrName] === rawVal;
  }
  return el.tagName.toLowerCase() === trimmed.toLowerCase();
}

function makeMockElement(
  tagName: string,
  options?: {
    attributes?: Record<string, string>;
    scrollWidth?: number;
    clientWidth?: number;
    overflowX?: string;
    parentElement?: MockElementNode | null;
  }
): MockElementNode {
  const node: MockElementNode = {
    tagName,
    attributes: options?.attributes ?? {},
    scrollWidth: options?.scrollWidth ?? 100,
    clientWidth: options?.clientWidth ?? 100,
    overflowX: options?.overflowX ?? 'visible',
    parentElement: options?.parentElement ?? null,
    getAttribute: (name: string) => node.attributes[name] ?? null,
    closest: (selector: string) => {
      const tokens = selector.split(',');
      let cur: MockElementNode | null = node;
      while (cur) {
        if (tokens.some((tok) => matchesSelectorToken(cur!, tok))) {
          return cur;
        }
        cur = cur.parentElement;
      }
      return null;
    },
  };
  return node;
}

describe('canvasSwipe settings default and wrap-around resolution', () => {
  it('enables canvasSwipeEnabled by default and treats undefined as enabled', () => {
    assert.equal(DEFAULT_SETTINGS.canvasSwipeEnabled, true);
    assert.equal(isCanvasSwipeEnabled(undefined), true);
    assert.equal(isCanvasSwipeEnabled({}), true);
    assert.equal(isCanvasSwipeEnabled({ canvasSwipeEnabled: true }), true);
    assert.equal(isCanvasSwipeEnabled({ canvasSwipeEnabled: false }), false);
  });

  it('wraps continuously across tabs and returns null with fewer than 2 tabs', () => {
    assert.equal(resolveAdjacentCanvasTab([], 't1', 'next'), null);
    assert.equal(resolveAdjacentCanvasTab([{ id: 't1', name: 'Home' }], 't1', 'next'), null);

    const tabs = [
      { id: 't1', name: 'Home' },
      { id: 't2', name: 'Kitchen' },
      { id: 't3', name: 'Kids' },
    ];

    assert.equal(resolveAdjacentCanvasTab(tabs, 't1', 'next')?.id, 't2');
    assert.equal(resolveAdjacentCanvasTab(tabs, 't3', 'next')?.id, 't1');
    assert.equal(resolveAdjacentCanvasTab(tabs, 't1', 'prev')?.id, 't3');
    assert.equal(resolveAdjacentCanvasTab(tabs, 't2', 'prev')?.id, 't1');
  });
});

describe('evaluatePointerSwipeProgress and shouldCommitPointerSwipeRelease', () => {
  it('locks vertical gestures and never activates horizontal swipe', () => {
    const res = evaluatePointerSwipeProgress({
      startX: 200,
      startY: 200,
      currentX: 205,
      currentY: 220,
      viewportWidth: 390,
      lockedAxis: null,
    });
    assert.equal(res.axis, 'y');
    assert.equal(res.active, false);
    assert.equal(res.direction, null);

    const laterHorizontal = evaluatePointerSwipeProgress({
      startX: 200,
      startY: 200,
      currentX: 50,
      currentY: 220,
      viewportWidth: 390,
      lockedAxis: res.axis,
    });
    assert.equal(laterHorizontal.axis, 'y');
    assert.equal(laterHorizontal.active, false);

    assert.equal(
      shouldCommitPointerSwipeRelease({
        startX: 200,
        startY: 200,
        endX: 50,
        endY: 220,
        elapsedMs: 180,
        viewportWidth: 390,
        lockedAxis: 'y',
      }),
      null
    );
  });

  it('evaluates left/right swipe progress, threshold arming, and fast flicks cleanly', () => {
    assert.equal(computeSwipeCommitThresholdPx(390), 56);
    assert.equal(computeSwipeCommitThresholdPx(1920), 110);

    // Drag left -> next canvas
    const midNext = evaluatePointerSwipeProgress({
      startX: 500,
      startY: 300,
      currentX: 465,
      currentY: 304,
      viewportWidth: 1000,
      lockedAxis: null,
    });
    assert.equal(midNext.axis, 'x');
    assert.equal(midNext.active, true);
    assert.equal(midNext.direction, 'next');
    assert.equal(midNext.armed, false);
    assert.ok(midNext.progress > 0 && midNext.progress < 1);

    // Drag past threshold -> armed
    const armedPrev = evaluatePointerSwipeProgress({
      startX: 500,
      startY: 300,
      currentX: 620,
      currentY: 305,
      viewportWidth: 1000,
      lockedAxis: 'x',
    });
    assert.equal(armedPrev.direction, 'prev');
    assert.equal(armedPrev.armed, true);
    assert.equal(armedPrev.progress, 1);

    // Commits past threshold
    assert.equal(
      shouldCommitPointerSwipeRelease({
        startX: 500,
        startY: 300,
        endX: 620,
        endY: 305,
        elapsedMs: 700,
        viewportWidth: 1000,
        lockedAxis: 'x',
      }),
      'prev'
    );

    // Commits on fast short flick (>= 42px, >= 0.45 px/ms)
    assert.equal(
      shouldCommitPointerSwipeRelease({
        startX: 500,
        startY: 300,
        endX: 450,
        endY: 302,
        elapsedMs: 90,
        viewportWidth: 1000,
        lockedAxis: 'x',
      }),
      'next'
    );

    // Ignores short slow drag
    assert.equal(
      shouldCommitPointerSwipeRelease({
        startX: 500,
        startY: 300,
        endX: 460,
        endY: 302,
        elapsedMs: 600,
        viewportWidth: 1000,
        lockedAxis: 'x',
      }),
      null
    );
  });
});

describe('evaluateWheelHorizontalSwipe', () => {
  it('triggers next/prev after horizontal wheel accumulation and enforces cooldown without extending it', () => {
    const step1 = evaluateWheelHorizontalSwipe({
      deltaX: 50,
      deltaY: 4,
      accumulatedPx: 0,
      nowMs: 1000,
      lastEventMs: 0,
      cooldownUntilMs: 0,
    });
    assert.equal(step1.triggeredDirection, null);
    assert.equal(step1.nextAccumulatedPx, 50);

    const step2 = evaluateWheelHorizontalSwipe({
      deltaX: 45,
      deltaY: 2,
      accumulatedPx: step1.nextAccumulatedPx,
      nowMs: 1030,
      lastEventMs: 1000,
      cooldownUntilMs: step1.nextCooldownUntilMs,
    });
    assert.equal(step2.triggeredDirection, 'next');
    assert.equal(step2.nextAccumulatedPx, 0);
    assert.equal(step2.nextCooldownUntilMs, 1550);

    // Inertial tail events during cooldown must be ignored and never extend cooldownUntilMs
    const tail = evaluateWheelHorizontalSwipe({
      deltaX: 120,
      deltaY: 0,
      accumulatedPx: 0,
      nowMs: 1300,
      lastEventMs: 1030,
      cooldownUntilMs: step2.nextCooldownUntilMs,
    });
    assert.equal(tail.triggeredDirection, null);
    assert.equal(tail.nextAccumulatedPx, 0);
    assert.equal(tail.nextCooldownUntilMs, 1550);

    // Reverse trackpad swipe after cooldown triggers prev
    const prevSwipe = evaluateWheelHorizontalSwipe({
      deltaX: -95,
      deltaY: 5,
      accumulatedPx: 0,
      nowMs: 1700,
      lastEventMs: 1300,
      cooldownUntilMs: tail.nextCooldownUntilMs,
    });
    assert.equal(prevSwipe.triggeredDirection, 'prev');

    // Pinch-zoom ctrlKey and vertical scrolling are ignored
    const pinch = evaluateWheelHorizontalSwipe({
      deltaX: 120,
      deltaY: 0,
      ctrlKey: true,
      accumulatedPx: 0,
      nowMs: 2500,
      lastEventMs: 1700,
      cooldownUntilMs: 0,
    });
    assert.equal(pinch.triggeredDirection, null);

    const vertical = evaluateWheelHorizontalSwipe({
      deltaX: 10,
      deltaY: 90,
      accumulatedPx: 40,
      nowMs: 2600,
      lastEventMs: 2550,
      cooldownUntilMs: 0,
    });
    assert.equal(vertical.triggeredDirection, null);
    assert.equal(vertical.nextAccumulatedPx, 0);
  });
});

describe('shouldIgnoreCanvasSwipeTarget', () => {
  it('protects interactive controls, unlocked canvas cards, kanban cards, and horizontal scroll containers', () => {
    const emptyCanvas = makeMockElement('DIV');
    const unlockedCardChild = makeMockElement('DIV', {
      parentElement: makeMockElement('DIV', {
        attributes: { 'data-canvas-card': 'true' },
        parentElement: emptyCanvas,
      }),
    });
    const buttonInsideLockedCard = makeMockElement('BUTTON', {
      parentElement: unlockedCardChild,
    });
    const inputInsideLockedCard = makeMockElement('INPUT', {
      parentElement: unlockedCardChild,
    });
    const kanbanCard = makeMockElement('DIV', {
      attributes: { 'data-kanban-card-id': 'card-1' },
    });
    const dialogChild = makeMockElement('DIV', {
      parentElement: makeMockElement('DIV', { attributes: { role: 'dialog' } }),
    });
    const navChild = makeMockElement('SPAN', {
      parentElement: makeMockElement('NAV'),
    });
    const noSwipeChild = makeMockElement('SPAN', {
      parentElement: makeMockElement('DIV', { attributes: { 'data-no-canvas-swipe': 'true' } }),
    });

    const explicitDraggableItem = makeMockElement('DIV', {
      attributes: { draggable: 'true' },
      parentElement: unlockedCardChild,
    });
    const linkInsideCard = makeMockElement('A', {
      parentElement: unlockedCardChild,
    });
    const imgInsideCard = makeMockElement('IMG', {
      parentElement: unlockedCardChild,
    });

    assert.equal(
      shouldIgnoreCanvasSwipeTarget(emptyCanvas as unknown as EventTarget, {
        mode: 'desktop',
        isCanvasLocked: false,
      }),
      false
    );
    // Unlocked cards use press-and-hold (230ms) for drag, so immediate horizontal swipes work anywhere
    assert.equal(
      shouldIgnoreCanvasSwipeTarget(unlockedCardChild as unknown as EventTarget, {
        mode: 'desktop',
        isCanvasLocked: false,
      }),
      false
    );
    assert.equal(
      shouldIgnoreCanvasSwipeTarget(unlockedCardChild as unknown as EventTarget, {
        mode: 'desktop',
        isCanvasLocked: true,
      }),
      false
    );
    // Non-input links, images, and tappable buttons remain swipeable; inputs and explicit [draggable] stay blocked
    assert.equal(
      shouldIgnoreCanvasSwipeTarget(linkInsideCard as unknown as EventTarget, {
        mode: 'desktop',
        isCanvasLocked: false,
      }),
      false
    );
    assert.equal(
      shouldIgnoreCanvasSwipeTarget(imgInsideCard as unknown as EventTarget, {
        mode: 'desktop',
        isCanvasLocked: false,
      }),
      false
    );
    assert.equal(
      shouldIgnoreCanvasSwipeTarget(explicitDraggableItem as unknown as EventTarget, {
        mode: 'desktop',
        isCanvasLocked: false,
      }),
      true
    );
    assert.equal(
      shouldIgnoreCanvasSwipeTarget(buttonInsideLockedCard as unknown as EventTarget, {
        mode: 'desktop',
        isCanvasLocked: true,
      }),
      false
    );
    assert.equal(
      shouldIgnoreCanvasSwipeTarget(inputInsideLockedCard as unknown as EventTarget, {
        mode: 'desktop',
        isCanvasLocked: true,
      }),
      true
    );
    assert.equal(
      shouldIgnoreCanvasSwipeTarget(kanbanCard as unknown as EventTarget, {
        mode: 'mobile',
        isCanvasLocked: false,
      }),
      true
    );
    assert.equal(
      shouldIgnoreCanvasSwipeTarget(dialogChild as unknown as EventTarget, {
        mode: 'mobile',
        isCanvasLocked: true,
      }),
      true
    );
    assert.equal(
      shouldIgnoreCanvasSwipeTarget(navChild as unknown as EventTarget, {
        mode: 'desktop',
        isCanvasLocked: true,
      }),
      true
    );
    assert.equal(
      shouldIgnoreCanvasSwipeTarget(noSwipeChild as unknown as EventTarget, {
        mode: 'mobile',
        isCanvasLocked: false,
      }),
      true
    );

    const prevWindow = (globalThis as { window?: unknown }).window;
    try {
      (globalThis as { window?: unknown }).window = {
        getComputedStyle: (el: MockElementNode) => ({ overflowX: el.overflowX }),
      };
      const horizChild = makeMockElement('DIV', {
        parentElement: makeMockElement('DIV', {
          scrollWidth: 400,
          clientWidth: 160,
          overflowX: 'auto',
        }),
      });
      assert.equal(
        shouldIgnoreCanvasSwipeTarget(horizChild as unknown as EventTarget, {
          mode: 'mobile',
          isCanvasLocked: false,
        }),
        true
      );
    } finally {
      (globalThis as { window?: unknown }).window = prevWindow;
    }
  });
});

describe('dock-aware edge zones, fullscreen classification, and long-swipe override', () => {
  it('detects 36px left/right edge swipe zones accounting for visible side docks', () => {
    // Bottom dock: edges at [0..36] and [1244..1280]
    assert.equal(
      isPointInCanvasEdgeSwipeZone({
        clientX: 20,
        viewportWidth: 1280,
        dockPosition: 'bottom',
        isDockHidden: false,
      }),
      true
    );
    assert.equal(
      isPointInCanvasEdgeSwipeZone({
        clientX: 1250,
        viewportWidth: 1280,
        dockPosition: 'bottom',
        isDockHidden: false,
      }),
      true
    );
    assert.equal(
      isPointInCanvasEdgeSwipeZone({
        clientX: 120,
        viewportWidth: 1280,
        dockPosition: 'bottom',
        isDockHidden: false,
      }),
      false
    );

    // Visible left dock (80px wide): left canvas edge starts at 80..116
    assert.equal(
      isPointInCanvasEdgeSwipeZone({
        clientX: 98,
        viewportWidth: 1280,
        dockPosition: 'left',
        isDockHidden: false,
      }),
      true
    );
    assert.equal(
      isPointInCanvasEdgeSwipeZone({
        clientX: 50,
        viewportWidth: 1280,
        dockPosition: 'left',
        isDockHidden: false,
      }),
      false
    );

    // Hidden left dock: reverts to 0..36
    assert.equal(
      isPointInCanvasEdgeSwipeZone({
        clientX: 20,
        viewportWidth: 1280,
        dockPosition: 'left',
        isDockHidden: true,
      }),
      true
    );

    // Visible right dock (80px wide): right canvas edge spans 1164..1200
    assert.equal(
      isPointInCanvasEdgeSwipeZone({
        clientX: 1180,
        viewportWidth: 1280,
        dockPosition: 'right',
        isDockHidden: false,
      }),
      true
    );
    assert.equal(
      isPointInCanvasEdgeSwipeZone({
        clientX: 1240,
        viewportWidth: 1280,
        dockPosition: 'right',
        isDockHidden: false,
      }),
      false
    );
  });

  it('classifies fullscreen tiles, edge zones, and press-and-hold cards as standard while blocking handles', () => {
    assert.equal(CARD_DRAG_HOLD_MS, 230);
    assert.equal(CARD_DRAG_HOLD_CANCEL_PX, 12);

    const fullscreenButtonChild = makeMockElement('BUTTON', {
      parentElement: makeMockElement('DIV', {
        attributes: { 'data-canvas-card': 'true', 'data-canvas-fullscreen': 'true' },
      }),
    });
    const unlockedCardButtonChild = makeMockElement('BUTTON', {
      parentElement: makeMockElement('DIV', {
        attributes: { 'data-canvas-card': 'true' },
      }),
    });
    const resizeHandleChild = makeMockElement('SVG', {
      parentElement: makeMockElement('DIV', {
        attributes: { 'data-no-drag': 'true', 'data-no-canvas-swipe': 'true' },
        parentElement: unlockedCardButtonChild,
      }),
    });

    assert.equal(
      classifyCanvasSwipeStartTarget(fullscreenButtonChild as unknown as EventTarget, {
        mode: 'desktop',
        isCanvasLocked: false,
        clientX: 600,
        viewportWidth: 1280,
      }),
      'standard'
    );

    assert.equal(
      classifyCanvasSwipeStartTarget(unlockedCardButtonChild as unknown as EventTarget, {
        mode: 'desktop',
        isCanvasLocked: false,
        clientX: 600,
        viewportWidth: 1280,
      }),
      'standard'
    );

    // Same unlocked card inside the 36px screen edge stays standard
    assert.equal(
      classifyCanvasSwipeStartTarget(unlockedCardButtonChild as unknown as EventTarget, {
        mode: 'desktop',
        isCanvasLocked: false,
        clientX: 102,
        viewportWidth: 1280,
        dockPosition: 'left',
        isDockHidden: false,
      }),
      'standard'
    );

    // Full-screen-wide slow horizontal swipe with pause at release still commits under standard tier
    assert.equal(
      shouldCommitPointerSwipeRelease({
        startX: 1100,
        startY: 400,
        endX: 150,
        endY: 420,
        elapsedMs: 1200,
        viewportWidth: 1920,
        lockedAxis: 'x',
        tier: 'standard',
        recentVelocityPxPerMs: 0,
      }),
      'next'
    );

    // Resize/rotate handles stay ignored everywhere
    assert.equal(
      classifyCanvasSwipeStartTarget(resizeHandleChild as unknown as EventTarget, {
        mode: 'desktop',
        isCanvasLocked: false,
        clientX: 20,
        viewportWidth: 1280,
        dockPosition: 'bottom',
        isDockHidden: false,
      }),
      'ignore'
    );
  });

  it('computes long-swipe thresholds and rejects slow, diagonal, or paused widget drags', () => {
    assert.equal(computeLongSwipeCommitThresholdPx(800), 256);
    assert.equal(computeLongSwipeCommitThresholdPx(1280), 410);
    assert.equal(computeLongSwipeCommitThresholdPx(1920), 420);
    assert.equal(computeLongSwipeFastFlickMinPx(1280), 282);

    // Active progress past 55% of longThreshold shows preview and arms at >= 410px
    const midLong = evaluatePointerSwipeProgress({
      startX: 700,
      startY: 300,
      currentX: 430,
      currentY: 304,
      viewportWidth: 1280,
      lockedAxis: 'x',
      tier: 'long_card',
      elapsedMs: 220,
      recentVelocityPxPerMs: 0.9,
    });
    assert.equal(midLong.active, true);
    assert.equal(midLong.armed, false);
    assert.equal(midLong.direction, 'next');

    const armedLong = evaluatePointerSwipeProgress({
      startX: 700,
      startY: 300,
      currentX: 260,
      currentY: 310,
      viewportWidth: 1280,
      lockedAxis: 'x',
      tier: 'long_card',
      elapsedMs: 360,
      recentVelocityPxPerMs: 1.0,
    });
    assert.equal(armedLong.active, true);
    assert.equal(armedLong.armed, true);

    // Commits on full long swipe with active momentum
    assert.equal(
      shouldCommitPointerSwipeRelease({
        startX: 700,
        startY: 300,
        endX: 260,
        endY: 312,
        elapsedMs: 380,
        viewportWidth: 1280,
        lockedAxis: 'x',
        tier: 'long_card',
        recentVelocityPxPerMs: 0.7,
      }),
      'next'
    );

    // Commits on fast wide flick (>= 22% width, <= 380ms, >= 0.65 px/ms)
    assert.equal(
      shouldCommitPointerSwipeRelease({
        startX: 300,
        startY: 300,
        endX: 610,
        endY: 305,
        elapsedMs: 290,
        viewportWidth: 1280,
        lockedAxis: 'x',
        tier: 'long_card',
        recentVelocityPxPerMs: 0.85,
      }),
      'prev'
    );

    // Rejects drag-then-pause widget placement (low trailing release velocity)
    assert.equal(
      shouldCommitPointerSwipeRelease({
        startX: 700,
        startY: 300,
        endX: 220,
        endY: 305,
        elapsedMs: 420,
        viewportWidth: 1280,
        lockedAxis: 'x',
        tier: 'long_card',
        recentVelocityPxPerMs: 0.05,
      }),
      null
    );

    // Rejects slow widget drag (> 650ms)
    assert.equal(
      shouldCommitPointerSwipeRelease({
        startX: 700,
        startY: 300,
        endX: 220,
        endY: 305,
        elapsedMs: 850,
        viewportWidth: 1280,
        lockedAxis: 'x',
        tier: 'long_card',
        recentVelocityPxPerMs: 0.8,
      }),
      null
    );

    // Rejects diagonal widget move (|dy| > 56px)
    assert.equal(
      shouldCommitPointerSwipeRelease({
        startX: 700,
        startY: 300,
        endX: 220,
        endY: 380,
        elapsedMs: 320,
        viewportWidth: 1280,
        lockedAxis: 'x',
        tier: 'long_card',
        recentVelocityPxPerMs: 0.9,
      }),
      null
    );
  });

  it('notifies and unsubscribes drag and swipe cancellation listeners synchronously', () => {
    let dragCalls = 0;
    const unsubscribeDrag = subscribeCancelActiveCardDrag(() => {
      dragCalls += 1;
    });
    requestCancelActiveCardDrag();
    assert.equal(dragCalls, 1);
    unsubscribeDrag();
    requestCancelActiveCardDrag();
    assert.equal(dragCalls, 1);

    let swipeCalls = 0;
    const unsubscribeSwipe = subscribeCancelActiveCanvasSwipe(() => {
      swipeCalls += 1;
    });
    requestCancelActiveCanvasSwipe();
    assert.equal(swipeCalls, 1);
    unsubscribeSwipe();
    requestCancelActiveCanvasSwipe();
    assert.equal(swipeCalls, 1);
  });

  it('keeps full-screen Chores and Kanban overlays swipeable across touch CSS, scroll columns, and mobile capture', () => {
    const g = globalThis as Record<string, unknown>;
    const prevWindow = g.window;
    g.window = {
      getComputedStyle: (el: MockElementNode) => ({ overflowX: el.overflowX }),
    };

    try {
      const verticalHiddenColChild = makeMockElement('DIV', {
        parentElement: makeMockElement('DIV', {
          scrollWidth: 420,
          clientWidth: 320,
          overflowX: 'hidden',
        }),
      });
      assert.equal(
        classifyCanvasSwipeStartTarget(verticalHiddenColChild as unknown as EventTarget, {
          mode: 'desktop',
          isCanvasLocked: false,
          clientX: 400,
          viewportWidth: 1280,
        }),
        'standard'
      );

      const trueHorizontalScrollerChild = makeMockElement('DIV', {
        parentElement: makeMockElement('DIV', {
          scrollWidth: 420,
          clientWidth: 320,
          overflowX: 'auto',
        }),
      });
      assert.equal(
        classifyCanvasSwipeStartTarget(trueHorizontalScrollerChild as unknown as EventTarget, {
          mode: 'desktop',
          isCanvasLocked: false,
          clientX: 400,
          viewportWidth: 1280,
        }),
        'ignore'
      );
    } finally {
      if (prevWindow === undefined) {
        delete g.window;
      } else {
        g.window = prevWindow;
      }
    }

    const indexCss = fs.readFileSync(
      path.resolve(process.cwd(), 'src/index.css'),
      'utf8'
    );
    assert.equal(indexCss.includes('[data-fullscreen-widget-overlay="true"],'), true);
    assert.equal(indexCss.includes('[data-fullscreen-widget-overlay="true"] *,'), true);
    assert.equal(indexCss.includes('touch-action: pan-y pinch-zoom;'), true);
    assert.equal(indexCss.includes('overscroll-behavior-x: none;'), true);

    const choreViewSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/chores/ChoreDashboardView.tsx'),
      'utf8'
    );
    assert.equal(
      choreViewSource.includes('lg:col-span-3 min-w-0 flex flex-col gap-4 overflow-y-auto overflow-x-hidden pr-1'),
      true
    );
    assert.equal(
      choreViewSource.includes('lg:col-span-5 min-w-0 flex flex-col overflow-hidden'),
      true
    );
    assert.equal(
      choreViewSource.includes('flex-1 overflow-y-auto overflow-x-hidden pr-1 space-y-3'),
      true
    );
    assert.equal(
      choreViewSource.includes('lg:col-span-4 min-w-0 flex flex-col overflow-hidden'),
      true
    );

    const rewardStoreSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/chores/RewardStorePanel.tsx'),
      'utf8'
    );
    assert.equal(
      rewardStoreSource.includes('flex-1 overflow-y-auto overflow-x-hidden pr-1 space-y-3'),
      true
    );

    const kanbanViewSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/kanban/KanbanBoardView.tsx'),
      'utf8'
    );
    assert.equal(
      kanbanViewSource.includes('overflow-y-auto overflow-x-hidden md:overflow-hidden grid'),
      true
    );
    assert.equal(
      kanbanViewSource.includes('flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 py-2 space-y-2'),
      true
    );

    const appSource = fs.readFileSync(
      path.resolve(process.cwd(), 'src/App.tsx'),
      'utf8'
    );
    assert.equal(
      appSource.includes('<div className="contents" onPointerDownCapture={handleCanvasSwipePointerDown}>\n            {activeChoreOverlay &&') ||
        appSource.includes('<div className="contents" onPointerDownCapture={handleCanvasSwipePointerDown}>\r\n            {activeChoreOverlay &&'),
      true
    );
  });
});
