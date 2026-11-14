import { useMemo, useSyncExternalStore } from 'react';

export type ClockGranularity = 'second' | '10s';

export interface SharedClockTickerOptions {
  nowFn?: () => number;
  setTimeoutFn?: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (id: ReturnType<typeof setTimeout>) => void;
  isHiddenFn?: () => boolean;
  onVisibilitySubscribe?: (onVisible: () => void) => () => void;
}

export interface SharedClockTicker {
  subscribe: (granularity: ClockGranularity, listener: () => void) => () => void;
  getSnapshot: () => number;
  getSubscriberCounts: () => { second: number; tenSec: number };
  hasActiveTimer: () => boolean;
}

const defaultVisibilitySubscribe = (onVisible: () => void): (() => void) => {
  if (typeof document === 'undefined') return () => {};
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      onVisible();
    }
  };
  document.addEventListener('visibilitychange', handleVisibility);
  return () => {
    document.removeEventListener('visibilitychange', handleVisibility);
  };
};

/**
 * Shared wall-clock aligned ticker consolidating 1s / 10s widget updates onto a single timer
 * that automatically pauses when no subscribers are mounted or the display tab is hidden.
 */
export function createSharedClockTicker(
  options: SharedClockTickerOptions = {}
): SharedClockTicker {
  const nowFn = options.nowFn ?? (() => Date.now());
  const setTimeoutFn = options.setTimeoutFn ?? ((cb, ms) => globalThis.setTimeout(cb, ms));
  const clearTimeoutFn = options.clearTimeoutFn ?? ((id) => globalThis.clearTimeout(id));
  const isHiddenFn =
    options.isHiddenFn ??
    (() => typeof document !== 'undefined' && document.visibilityState === 'hidden');
  const onVisibilitySubscribe = options.onVisibilitySubscribe ?? defaultVisibilitySubscribe;

  const secondListeners = new Set<() => void>();
  const tenSecListeners = new Set<() => void>();
  let currentNow = nowFn();
  let lastTenSecBucket = Math.floor(currentNow / 10000);
  let activeTimer: ReturnType<typeof setTimeout> | null = null;
  let unsubscribeVisibility: (() => void) | null = null;

  const clearTimer = () => {
    if (activeTimer !== null) {
      clearTimeoutFn(activeTimer);
      activeTimer = null;
    }
  };

  const totalSubscribers = () => secondListeners.size + tenSecListeners.size;

  const notifyAndSchedule = (forceTenSec: boolean) => {
    if (isHiddenFn()) {
      clearTimer();
      return;
    }
    currentNow = nowFn();
    const bucket = Math.floor(currentNow / 10000);
    const shouldNotifyTenSec = forceTenSec || bucket !== lastTenSecBucket;
    if (shouldNotifyTenSec) {
      lastTenSecBucket = bucket;
    }

    secondListeners.forEach((cb) => cb());
    if (shouldNotifyTenSec) {
      tenSecListeners.forEach((cb) => cb());
    }
    scheduleNext();
  };

  const scheduleNext = () => {
    clearTimer();
    if (totalSubscribers() === 0 || isHiddenFn()) {
      return;
    }
    const now = nowFn();
    const intervalMs = secondListeners.size > 0 ? 1000 : 10000;
    const remainder = now % intervalMs;
    const delayMs = Math.max(10, intervalMs - remainder);
    activeTimer = setTimeoutFn(() => {
      activeTimer = null;
      notifyAndSchedule(false);
    }, delayMs);
  };

  const subscribe = (granularity: ClockGranularity, listener: () => void): (() => void) => {
    const wasEmpty = totalSubscribers() === 0;
    const hadSecondListeners = secondListeners.size > 0;

    if (granularity === 'second') {
      secondListeners.add(listener);
    } else {
      tenSecListeners.add(listener);
    }

    if (wasEmpty) {
      currentNow = nowFn();
      lastTenSecBucket = Math.floor(currentNow / 10000);
      unsubscribeVisibility = onVisibilitySubscribe(() => {
        if (totalSubscribers() > 0) {
          notifyAndSchedule(true);
        }
      });
      scheduleNext();
    } else if (granularity === 'second' && !hadSecondListeners) {
      // Upgrade active 10s cadence to 1s immediately when a seconds consumer subscribes
      scheduleNext();
    }

    return () => {
      const hadSecond = secondListeners.size > 0;
      if (granularity === 'second') {
        secondListeners.delete(listener);
      } else {
        tenSecListeners.delete(listener);
      }

      if (totalSubscribers() === 0) {
        clearTimer();
        if (unsubscribeVisibility) {
          unsubscribeVisibility();
          unsubscribeVisibility = null;
        }
      } else if (hadSecond && secondListeners.size === 0) {
        // Downgrade remaining 10s consumers back to 10s interval
        scheduleNext();
      }
    };
  };

  return {
    subscribe,
    getSnapshot: () => currentNow,
    getSubscriberCounts: () => ({
      second: secondListeners.size,
      tenSec: tenSecListeners.size,
    }),
    hasActiveTimer: () => activeTimer !== null,
  };
}

const defaultClockTicker = createSharedClockTicker();

const subscribeSecond = (listener: () => void) => defaultClockTicker.subscribe('second', listener);
const subscribeTenSec = (listener: () => void) => defaultClockTicker.subscribe('10s', listener);
const getClockTimestampSnapshot = () => defaultClockTicker.getSnapshot();
const getServerClockSnapshot = () => 0;

/**
 * React hook subscribing to the shared wall-clock ticker at either 1-second or 10-second cadence.
 */
export function useSharedClock(granularity: ClockGranularity = 'second'): Date {
  const timestamp = useSyncExternalStore(
    granularity === '10s' ? subscribeTenSec : subscribeSecond,
    getClockTimestampSnapshot,
    getServerClockSnapshot
  );
  return useMemo(() => new Date(timestamp), [timestamp]);
}
