import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_SETTINGS } from '../src/services/db.ts';
import {
  computeSwipeCommitThresholdPx,
  evaluatePointerSwipeProgress,
  evaluateWheelHorizontalSwipe,
  isCanvasSwipeEnabled,
  resolveAdjacentCanvasTab,
  shouldCommitPointerSwipeRelease,
  shouldIgnoreCanvasSwipeTarget,
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

    assert.equal(
      shouldIgnoreCanvasSwipeTarget(emptyCanvas as unknown as EventTarget, {
        mode: 'desktop',
        isCanvasLocked: false,
      }),
      false
    );
    assert.equal(
      shouldIgnoreCanvasSwipeTarget(unlockedCardChild as unknown as EventTarget, {
        mode: 'desktop',
        isCanvasLocked: false,
      }),
      true
    );
    assert.equal(
      shouldIgnoreCanvasSwipeTarget(unlockedCardChild as unknown as EventTarget, {
        mode: 'desktop',
        isCanvasLocked: true,
      }),
      false
    );
    assert.equal(
      shouldIgnoreCanvasSwipeTarget(buttonInsideLockedCard as unknown as EventTarget, {
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
