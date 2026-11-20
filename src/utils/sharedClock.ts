import { useMemo, useSyncExternalStore } from 'react';

export type ClockGranularity = 'second' | '10s' | 'minute';

export interface SharedClockTickerOptions {
  nowFn?: () => number;
  setTimeoutFn?: (cb: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimeoutFn?: (id: ReturnType<typeof setTimeout>) => void;
  isHiddenFn?: () => boolean;
  onVisibilitySubscribe?: (onVisible: () => void) => () => void;
}

export interface SharedClockTicker {
  subscribe: (granularity: ClockGranularity, listener: () => void) => () => void;
  getSnapshot: (granularity?: ClockGranularity) => number;
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
  const minuteListeners = new Set<() => void>();
  let currentNow = nowFn();
  let currentTenSecNow = currentNow;
  let currentMinuteNow = currentNow;
  let lastTenSecBucket = Math.floor(currentNow / 10000);
  let lastMinuteBucket = Math.floor(currentNow / 60000);
  let activeTimer: ReturnType<typeof setTimeout> | null = null;
  let unsubscribeVisibility: (() => void) | null = null;

  const clearTimer = () => {
    if (activeTimer !== null) {
      clearTimeoutFn(activeTimer);
      activeTimer = null;
    }
  };

  const totalSubscribers = () =>
    secondListeners.size + tenSecListeners.size + minuteListeners.size;

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
      currentTenSecNow = currentNow;
    }
    const minBucket = Math.floor(currentNow / 60000);
    const shouldNotifyMinute = forceTenSec || minBucket !== lastMinuteBucket;
    if (shouldNotifyMinute) {
      lastMinuteBucket = minBucket;
      currentMinuteNow = currentNow;
    }

    secondListeners.forEach((cb) => cb());
    if (shouldNotifyTenSec) {
      tenSecListeners.forEach((cb) => cb());
    }
    if (shouldNotifyMinute) {
      minuteListeners.forEach((cb) => cb());
    }
    scheduleNext();
  };

  const scheduleNext = () => {
    clearTimer();
    if (totalSubscribers() === 0 || isHiddenFn()) {
      return;
    }
    const now = nowFn();
    const intervalMs =
      secondListeners.size > 0
        ? 1000
        : tenSecListeners.size > 0
          ? 10000
          : 60000;
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
    const hadTenSecListeners = tenSecListeners.size > 0;

    if (granularity === 'second') {
      secondListeners.add(listener);
    } else if (granularity === '10s') {
      tenSecListeners.add(listener);
    } else {
      minuteListeners.add(listener);
    }

    if (wasEmpty) {
      currentNow = nowFn();
      currentTenSecNow = currentNow;
      currentMinuteNow = currentNow;
      lastTenSecBucket = Math.floor(currentNow / 10000);
      lastMinuteBucket = Math.floor(currentNow / 60000);
      unsubscribeVisibility = onVisibilitySubscribe(() => {
        if (totalSubscribers() > 0) {
          notifyAndSchedule(true);
        }
      });
      scheduleNext();
    } else if (
      (granularity === 'second' && !hadSecondListeners) ||
      (granularity === '10s' && !hadSecondListeners && !hadTenSecListeners)
    ) {
      // Upgrade cadence immediately when a faster consumer subscribes
      scheduleNext();
    }

    return () => {
      const hadSecond = secondListeners.size > 0;
      const hadTenSec = tenSecListeners.size > 0;
      if (granularity === 'second') {
        secondListeners.delete(listener);
      } else if (granularity === '10s') {
        tenSecListeners.delete(listener);
      } else {
        minuteListeners.delete(listener);
      }

      if (totalSubscribers() === 0) {
        clearTimer();
        if (unsubscribeVisibility) {
          unsubscribeVisibility();
          unsubscribeVisibility = null;
        }
      } else if (
        (hadSecond && secondListeners.size === 0) ||
        (!hadSecond && hadTenSec && tenSecListeners.size === 0)
      ) {
        // Downgrade remaining slower consumers
        scheduleNext();
      }
    };
  };

  return {
    subscribe,
    getSnapshot: (granularity: ClockGranularity = 'second') =>
      granularity === 'minute'
        ? currentMinuteNow
        : granularity === '10s'
          ? currentTenSecNow
          : currentNow,
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
const subscribeMinute = (listener: () => void) => defaultClockTicker.subscribe('minute', listener);
const noopSubscribe = () => () => {};
const getClockTimestampSnapshot = () => defaultClockTicker.getSnapshot('second');
const getTenSecTimestampSnapshot = () => defaultClockTicker.getSnapshot('10s');
const getMinuteTimestampSnapshot = () => defaultClockTicker.getSnapshot('minute');
const getServerClockSnapshot = () => 0;

/**
 * React hook subscribing to the shared wall-clock ticker at 1-second, 10-second, or 1-minute cadence.
 * Pass `enabled = false` to pause visual clock re-renders (e.g. under opaque OLED Night Clock).
 */
export function useSharedClock(
  granularity: ClockGranularity = 'second',
  enabled: boolean = true
): Date {
  const subscribe = !enabled
    ? noopSubscribe
    : granularity === 'minute'
      ? subscribeMinute
      : granularity === '10s'
        ? subscribeTenSec
        : subscribeSecond;
  const getSnapshot =
    granularity === 'minute'
      ? getMinuteTimestampSnapshot
      : granularity === '10s'
        ? getTenSecTimestampSnapshot
        : getClockTimestampSnapshot;
  const timestamp = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerClockSnapshot
  );
  return useMemo(() => new Date(timestamp), [timestamp]);
}
