import React, { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlarmClock, ArrowRight, BellOff, Play } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useDashboardStore } from '../../store/dashboardStore';
import type { DashboardTab, DashboardWidget } from '../../types/dashboard';
import type { TimerItem, TimerWidgetConfig } from '../../types/phase1Widgets';
import { useSharedClock } from '../../utils/sharedClock';
import { useDisplayActivity } from '../../utils/displayActivity';
import {
  addSecondsToTimerItem,
  dismissTimerItem,
  formatShortDurationLabel,
  getTimerLiveState,
  isTimerActivelyRinging,
  resolveCrossTabAlarmSwitch,
  resolveWidgetTimers,
  startTimerItem,
  syncTimerAlarmSubscriber,
  type CrossTabTimerCandidate,
} from '../../utils/timerEngine';

export interface GlobalTimerAlarmOverlayProps {
  visibleTabs: DashboardTab[];
  activeTabId: string;
  isAnyModalOpen?: boolean;
  onSelectTab: (tabId: string) => void;
}

interface GlobalTimerEntry {
  widget: DashboardWidget;
  tabName: string;
  timer: TimerItem;
  key: string;
}

function isModalOrEditorActiveInDom(): boolean {
  if (typeof document === 'undefined') return false;
  if (
    document.querySelector(
      '[role="dialog"]:not([data-timer-alarm-overlay="true"]), [aria-modal="true"]:not([data-timer-alarm-overlay="true"])'
    )
  ) {
    return true;
  }
  const activeEl = document.activeElement as HTMLElement | null;
  if (!activeEl) return false;
  const tag = activeEl.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    Boolean(activeEl.isContentEditable)
  );
}

export const GlobalTimerAlarmOverlay: React.FC<GlobalTimerAlarmOverlayProps> = React.memo(({
  visibleTabs,
  activeTabId,
  isAnyModalOpen = false,
  onSelectTab,
}) => {
  const timerWidgetsRaw = useDashboardStore(
    useShallow((s) => s.widgets.filter((w) => !w.deleted_at && w.type === 'timer'))
  );
  const nightModeEnabled = useDashboardStore((s) => Boolean(s.settings.nightModeEnabled));
  const carouselEnabled = useDashboardStore((s) => Boolean(s.settings.carouselEnabled));
  const updateWidgetConfig = useDashboardStore((s) => s.updateWidgetConfig);
  const pauseCarouselTemporarily = useDashboardStore((s) => s.pauseCarouselTemporarily);

  const { isNightMode } = useDisplayActivity();
  const nightActive = isNightMode || nightModeEnabled;

  const tabNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const tab of visibleTabs) {
      map.set(tab.id, tab.name);
    }
    return map;
  }, [visibleTabs]);

  const timerWidgets = useMemo(
    () => timerWidgetsRaw.filter((w) => tabNameById.has(w.tabId)),
    [timerWidgetsRaw, tabNameById]
  );

  const allTabTimerEntries = useMemo<GlobalTimerEntry[]>(() => {
    const list: GlobalTimerEntry[] = [];
    for (const widget of timerWidgets) {
      const tabName = tabNameById.get(widget.tabId) || 'Canvas';
      const resolved = resolveWidgetTimers(
        (widget.config as TimerWidgetConfig | undefined)?.timers
      );
      for (const timer of resolved) {
        const marker = timer.completedAt || timer.endsAt || String(timer.durationSec);
        list.push({
          widget,
          tabName,
          timer,
          key: `${widget.id}:${timer.id}:${marker}`,
        });
      }
    }
    return list;
  }, [timerWidgets, tabNameById]);

  const hasActiveOrDoneAcrossTabs = allTabTimerEntries.some(
    ({ timer }) => timer.status === 'running' || timer.status === 'completed'
  );
  const nowDate = useSharedClock('second', hasActiveOrDoneAcrossTabs);
  const nowMs = nowDate.getTime();

  // Persist running -> completed timers across ALL visible tabs even when their tab is hidden
  useEffect(() => {
    for (const widget of timerWidgets) {
      const resolved = resolveWidgetTimers(
        (widget.config as TimerWidgetConfig | undefined)?.timers
      );
      let changed = false;
      const nextTimers = resolved.map((t) => {
        if (t.status !== 'running') return t;
        const live = getTimerLiveState(t, nowMs);
        if (!live.isExpired) return t;
        changed = true;
        return {
          ...t,
          status: 'completed' as const,
          remainingSec: 0,
          endsAt: null,
          completedAt: new Date(nowMs).toISOString(),
        };
      });
      if (changed) {
        void updateWidgetConfig(widget.id, { timers: nextTimers });
      }
    }
  }, [timerWidgets, nowMs, updateWidgetConfig]);

  // Repeat urgent piezo alarm globally while any tab has an un-dismissed ringing timer
  const shouldRingGlobal =
    !nightActive &&
    allTabTimerEntries.some(
      ({ widget, timer }) =>
        (widget.config as TimerWidgetConfig | undefined)?.chimeEnabled !== false &&
        isTimerActivelyRinging(timer, nowMs)
    );

  useEffect(() => {
    syncTimerAlarmSubscriber('global-timer-alarm', shouldRingGlobal);
    return () => {
      syncTimerAlarmSubscriber('global-timer-alarm', false);
    };
  }, [shouldRingGlobal]);

  // Track which alarm events we've already evaluated for tab auto-switching
  const handledAlarmKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const activeCompletedKeys = new Set<string>();
    const candidates: CrossTabTimerCandidate[] = [];

    for (const entry of allTabTimerEntries) {
      const live = getTimerLiveState(entry.timer, nowMs);
      if (live.effectiveStatus === 'completed') {
        activeCompletedKeys.add(entry.key);
        candidates.push({
          tabId: entry.widget.tabId,
          timer: entry.timer,
          key: entry.key,
        });
      }
    }

    // Prune keys once a timer is dismissed/restarted so future runs can auto-switch again
    for (const existingKey of Array.from(handledAlarmKeysRef.current)) {
      if (!activeCompletedKeys.has(existingKey)) {
        handledAlarmKeysRef.current.delete(existingKey);
      }
    }

    const isBlocked = Boolean(isAnyModalOpen) || isModalOrEditorActiveInDom();
    const { targetTabId, newlyHandledKeys } = resolveCrossTabAlarmSwitch(
      candidates,
      activeTabId,
      nowMs,
      isBlocked,
      handledAlarmKeysRef.current
    );

    if (newlyHandledKeys.length > 0) {
      for (const k of newlyHandledKeys) {
        handledAlarmKeysRef.current.add(k);
      }
      if (carouselEnabled) {
        pauseCarouselTemporarily(30000);
      }
    }

    if (targetTabId) {
      onSelectTab(targetTabId);
    }
  }, [
    allTabTimerEntries,
    activeTabId,
    nowMs,
    isAnyModalOpen,
    carouselEnabled,
    pauseCarouselTemporarily,
    onSelectTab,
  ]);

  const completedEntries = useMemo(
    () =>
      allTabTimerEntries.filter(
        ({ timer }) => getTimerLiveState(timer, nowMs).effectiveStatus === 'completed'
      ),
    [allTabTimerEntries, nowMs]
  );

  if (completedEntries.length === 0 || typeof document === 'undefined') {
    return null;
  }

  const updateSingleTimer = async (
    widget: DashboardWidget,
    timerId: string,
    transform: (t: TimerItem) => TimerItem
  ) => {
    const resolved = resolveWidgetTimers(
      (widget.config as TimerWidgetConfig | undefined)?.timers
    );
    const nextTimers = resolved.map((t) => (t.id === timerId ? transform(t) : t));
    await updateWidgetConfig(widget.id, { timers: nextTimers });
  };

  const handleDismissAll = async () => {
    const actionNow = Date.now();
    for (const widget of timerWidgets) {
      const resolved = resolveWidgetTimers(
        (widget.config as TimerWidgetConfig | undefined)?.timers
      );
      const hasAnyDone = resolved.some(
        (t) => getTimerLiveState(t, actionNow).effectiveStatus === 'completed'
      );
      if (!hasAnyDone) continue;
      const nextTimers = resolved.map((t) =>
        getTimerLiveState(t, actionNow).effectiveStatus === 'completed'
          ? dismissTimerItem(t)
          : t
      );
      await updateWidgetConfig(widget.id, { timers: nextTimers });
    }
  };

  return createPortal(
    <div
      role="dialog"
      aria-live="assertive"
      aria-label="Kitchen Timer Alarm"
      data-carousel-lock="true"
      data-timer-alarm-overlay="true"
      className="fixed inset-x-0 top-4 sm:top-6 z-[9000] pointer-events-none flex justify-center px-4 select-none"
    >
      <div className="pointer-events-auto w-full max-w-xl rounded-3xl bg-gray-950/95 border-2 border-rose-500 shadow-[0_0_50px_rgba(244,63,94,0.45)] backdrop-blur-xl p-4 sm:p-5 text-white space-y-3">
        {/* Overlay Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-rose-600/25 border border-rose-400/50 text-rose-300 flex items-center justify-center shrink-0 animate-pulse">
              <AlarmClock className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
                Kitchen Timer — Time&apos;s Up!
              </h2>
              <p className="text-xs text-rose-200/80">
                {completedEntries.length === 1
                  ? '1 timer finished ringing'
                  : `${completedEntries.length} timers finished ringing`}
              </p>
            </div>
          </div>

          {completedEntries.length > 1 && (
            <button
              type="button"
              onClick={() => void handleDismissAll()}
              className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 shadow-lg shadow-rose-950/60 cursor-pointer shrink-0 transition-colors"
            >
              <BellOff className="w-4 h-4 shrink-0" />
              <span>Dismiss All ({completedEntries.length})</span>
            </button>
          )}
        </div>

        {/* Ringing Timers List */}
        <div className="space-y-2 max-h-[55vh] overflow-y-auto pr-0.5">
          {completedEntries.map(({ widget, tabName, timer, key }) => {
            const isOnDifferentTab = widget.tabId !== activeTabId;
            return (
              <div
                key={key}
                className="rounded-2xl bg-rose-950/45 border border-rose-500/45 px-3.5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base sm:text-lg font-bold text-white truncate">
                      {timer.label}
                    </span>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-200 border border-rose-400/30">
                      00:00 / {formatShortDurationLabel(timer.durationSec)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-300">Board: {tabName}</span>
                    {isOnDifferentTab && (
                      <button
                        type="button"
                        onClick={() => onSelectTab(widget.tabId)}
                        className="text-xs font-semibold text-amber-300 hover:text-amber-200 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <span>Go to {tabName}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      void updateSingleTimer(widget, timer.id, (t) =>
                        addSecondsToTimerItem(t, 60, Date.now())
                      )
                    }
                    className="px-3 py-2 rounded-xl bg-gray-900 hover:bg-gray-800 border border-gray-700 text-xs sm:text-sm font-bold text-gray-100 cursor-pointer transition-colors"
                    title="Snooze for 1 minute"
                  >
                    +1m
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void updateSingleTimer(widget, timer.id, (t) =>
                        startTimerItem(t, Date.now())
                      )
                    }
                    className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs sm:text-sm font-semibold text-white inline-flex items-center gap-1 cursor-pointer transition-colors"
                    title="Restart timer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Restart</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      void updateSingleTimer(widget, timer.id, (t) => dismissTimerItem(t))
                    }
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 shadow-lg shadow-rose-950/60 animate-pulse cursor-pointer transition-colors"
                  >
                    <BellOff className="w-4 h-4 shrink-0" />
                    <span>Dismiss</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
});
