import React, { useEffect, useId, useMemo, useState } from 'react';
import {
  AlarmClock,
  BellOff,
  Pause,
  Pencil,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { TimerItem, TimerPreset, TimerWidgetConfig } from '../../types/phase1Widgets';
import { MAX_TIMERS_PER_WIDGET } from '../../types/phase1Widgets';
import {
  DEFAULT_TIMER_PRESETS,
  addSecondsToTimerItem,
  combineDurationHms,
  dismissTimerItem,
  formatShortDurationLabel,
  formatTimerDuration,
  getTimerLiveState,
  isTimerActivelyRinging,
  pauseTimerItem,
  resetTimerItem,
  resolveWidgetTimers,
  splitDurationHms,
  startTimerItem,
  syncTimerAlarmSubscriber,
  updateTimerItem,
} from '../../utils/timerEngine';
import { useSharedClock } from '../../utils/sharedClock';
import { useDisplayActivity } from '../../utils/displayActivity';
import { useDashboardStore } from '../../store/dashboardStore';
import { isAmbientlyInNightMode } from '../../utils/confetti';

interface TimerWidgetProps {
  config?: TimerWidgetConfig;
  isLight?: boolean;
  transparentBg?: boolean;
  onUpdateConfig?: (updates: Partial<TimerWidgetConfig>) => void;
}

type TimerPanelMode = 'closed' | 'add' | 'edit';

const QUICK_DURATION_CHIPS: Array<{ label: string; seconds: number }> = [
  { label: '1m', seconds: 60 },
  { label: '3m', seconds: 180 },
  { label: '5m', seconds: 300 },
  { label: '10m', seconds: 600 },
  { label: '15m', seconds: 900 },
  { label: '20m', seconds: 1200 },
  { label: '30m', seconds: 1800 },
  { label: '45m', seconds: 2700 },
  { label: '1h', seconds: 3600 },
];

export const TimerWidget: React.FC<TimerWidgetProps> = ({
  config,
  isLight = false,
  transparentBg = false,
  onUpdateConfig,
}) => {
  const svgBaseId = useId().replace(/:/g, '');
  const timers = useMemo(() => resolveWidgetTimers(config?.timers), [config?.timers]);
  const chimeEnabled = config?.chimeEnabled !== false;

  const { isNightMode, isCanvasOccluded } = useDisplayActivity();
  const nightModeSetting = useDashboardStore((s) => Boolean(s.settings?.nightModeEnabled));
  const nightActive = isNightMode || nightModeSetting || isAmbientlyInNightMode();

  const hasRunning = timers.some((t) => t.status === 'running');
  const hasCompleted = timers.some((t) => t.status === 'completed');
  const nowDate = useSharedClock(hasRunning || hasCompleted ? 'second' : '10s', !isCanvasOccluded);
  const nowMs = nowDate.getTime() > 0 ? nowDate.getTime() : Date.now();

  const [panelMode, setPanelMode] = useState<TimerPanelMode>('closed');
  const [editingTimerId, setEditingTimerId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftHours, setDraftHours] = useState('0');
  const [draftMinutes, setDraftMinutes] = useState('5');
  const [draftSeconds, setDraftSeconds] = useState('0');

  const editingTimer = useMemo(
    () => (editingTimerId ? timers.find((t) => t.id === editingTimerId) ?? null : null),
    [timers, editingTimerId]
  );

  const effectivePanelMode: TimerPanelMode =
    panelMode === 'edit' && editingTimer
      ? 'edit'
      : panelMode === 'add' || timers.length === 0
        ? 'add'
        : 'closed';

  // Detect running timers crossing 00:00 and persist completed state immediately
  useEffect(() => {
    let needsPersist = false;
    const nextTimers = timers.map((t) => {
      if (t.status !== 'running') return t;
      const live = getTimerLiveState(t, nowMs);
      if (!live.isExpired) return t;
      needsPersist = true;
      return {
        ...t,
        status: 'completed' as const,
        remainingSec: 0,
        endsAt: null,
        completedAt: new Date(nowMs).toISOString(),
      };
    });

    if (needsPersist && onUpdateConfig) {
      onUpdateConfig({ timers: nextTimers });
    }
  }, [timers, nowMs, onUpdateConfig]);

  // Wake once at the earliest running timer deadline when occluded so completion fires on timestamp without 1s ticks
  useEffect(() => {
    if (!isCanvasOccluded || !onUpdateConfig) return;
    let earliestEndMs = Infinity;
    for (const t of timers) {
      if (t.status === 'running' && t.endsAt) {
        const endMs = Date.parse(t.endsAt);
        if (Number.isFinite(endMs) && endMs < earliestEndMs) {
          earliestEndMs = endMs;
        }
      }
    }
    if (!Number.isFinite(earliestEndMs)) return;
    const delayMs = Math.max(0, earliestEndMs - Date.now() + 25);
    const timeoutId = window.setTimeout(() => {
      const fireMs = Date.now();
      let changed = false;
      const nextTimers = timers.map((t) => {
        if (t.status !== 'running' || !getTimerLiveState(t, fireMs).isExpired) return t;
        changed = true;
        return {
          ...t,
          status: 'completed' as const,
          remainingSec: 0,
          endsAt: null,
          completedAt: new Date(fireMs).toISOString(),
        };
      });
      if (changed) {
        onUpdateConfig({ timers: nextTimers });
      }
    }, delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [isCanvasOccluded, timers, onUpdateConfig]);

  // Repeat urgent piezo kitchen alarm continuously while any timer is un-dismissed within MAX_ALARM_RING_MS
  const hasRingingAlarm =
    chimeEnabled &&
    !nightActive &&
    timers.some((t) => isTimerActivelyRinging(t, nowMs));

  useEffect(() => {
    syncTimerAlarmSubscriber(svgBaseId, hasRingingAlarm);
    return () => {
      syncTimerAlarmSubscriber(svgBaseId, false);
    };
  }, [svgBaseId, hasRingingAlarm]);

  const commitTimers = (nextTimers: TimerItem[]) => {
    onUpdateConfig?.({ timers: nextTimers.slice(0, MAX_TIMERS_PER_WIDGET) });
  };

  const setDraftFromSeconds = (totalSec: number) => {
    const { hours, minutes, seconds } = splitDurationHms(totalSec);
    setDraftHours(String(hours));
    setDraftMinutes(String(minutes));
    setDraftSeconds(String(seconds));
  };

  const openAddPanel = () => {
    setEditingTimerId(null);
    setDraftLabel('');
    setDraftHours('0');
    setDraftMinutes('5');
    setDraftSeconds('0');
    setPanelMode('add');
  };

  const openEditPanel = (timer: TimerItem) => {
    if (!onUpdateConfig) return;
    setEditingTimerId(timer.id);
    setDraftLabel(timer.label);
    setDraftFromSeconds(timer.durationSec);
    setPanelMode('edit');
  };

  const closePanel = () => {
    setPanelMode('closed');
    setEditingTimerId(null);
  };

  const handleStartOrPause = (timer: TimerItem) => {
    const actionNow = Date.now();
    const live = getTimerLiveState(timer, actionNow);
    const nextTimers = timers.map((t) => {
      if (t.id !== timer.id) return t;
      if (live.effectiveStatus === 'running') {
        return pauseTimerItem(t, actionNow);
      }
      return startTimerItem(t, actionNow);
    });
    commitTimers(nextTimers);
  };

  const handleReset = (timer: TimerItem) => {
    commitTimers(timers.map((t) => (t.id === timer.id ? resetTimerItem(t) : t)));
  };

  const handleDismiss = (timer: TimerItem) => {
    commitTimers(timers.map((t) => (t.id === timer.id ? dismissTimerItem(t) : t)));
  };

  const handleDismissAll = () => {
    const actionNow = Date.now();
    commitTimers(
      timers.map((t) =>
        getTimerLiveState(t, actionNow).effectiveStatus === 'completed' ? dismissTimerItem(t) : t
      )
    );
  };

  const handleAdjustSeconds = (timer: TimerItem, deltaSec: number) => {
    const actionNow = Date.now();
    commitTimers(
      timers.map((t) => (t.id === timer.id ? addSecondsToTimerItem(t, deltaSec, actionNow) : t))
    );
  };

  const handleRemoveTimer = (timerId: string) => {
    if (editingTimerId === timerId) {
      closePanel();
    }
    commitTimers(timers.filter((t) => t.id !== timerId));
  };

  const handleStartPreset = (preset: TimerPreset) => {
    if (timers.length >= MAX_TIMERS_PER_WIDGET) return;
    const actionNow = Date.now();
    const newItem = startTimerItem(
      {
        id: `timer-${actionNow}-${Math.random().toString(36).slice(2, 6)}`,
        label: preset.label,
        durationSec: preset.durationSec,
        status: 'idle',
        remainingSec: preset.durationSec,
      },
      actionNow
    );
    commitTimers([...timers, newItem]);
    closePanel();
  };

  const parsedDraftTotalSec = combineDurationHms(
    parseInt(draftHours, 10) || 0,
    parseInt(draftMinutes, 10) || 0,
    parseInt(draftSeconds, 10) || 0
  );

  const applyAddSubmit = (andStart: boolean) => {
    if (timers.length >= MAX_TIMERS_PER_WIDGET || parsedDraftTotalSec <= 0) return;
    const actionNow = Date.now();
    const label = draftLabel.trim() || `${formatShortDurationLabel(parsedDraftTotalSec)} Timer`;
    const baseItem: TimerItem = {
      id: `timer-${actionNow}-${Math.random().toString(36).slice(2, 6)}`,
      label,
      durationSec: parsedDraftTotalSec,
      status: 'idle',
      remainingSec: parsedDraftTotalSec,
    };
    const nextItem = andStart ? startTimerItem(baseItem, actionNow) : baseItem;
    commitTimers([...timers, nextItem]);
    setDraftLabel('');
    closePanel();
  };

  const applyEditSubmit = (andStart: boolean) => {
    if (!editingTimer || parsedDraftTotalSec <= 0) return;
    const actionNow = Date.now();
    const nextTimers = timers.map((t) => {
      if (t.id !== editingTimer.id) return t;
      const updated = updateTimerItem(t, {
        label: draftLabel,
        durationSec: parsedDraftTotalSec,
      });
      return andStart ? startTimerItem(updated, actionNow) : updated;
    });
    commitTimers(nextTimers);
    closePanel();
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (effectivePanelMode === 'edit') {
      applyEditSubmit(true);
    } else {
      applyAddSubmit(true);
    }
  };

  const stopDrag = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

  const runningCount = timers.filter(
    (t) => getTimerLiveState(t, nowMs).effectiveStatus === 'running'
  ).length;
  const completedCount = timers.filter(
    (t) => getTimerLiveState(t, nowMs).effectiveStatus === 'completed'
  ).length;

  const stickerShadow = transparentBg && !isLight ? 'drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]' : '';
  const cardBgClass = transparentBg
    ? 'bg-transparent border-transparent'
    : isLight
      ? 'bg-slate-100/90 border-slate-200/90'
      : 'bg-gray-950/60 border-gray-800/80';

  const singleTimer = timers.length === 1 && effectivePanelMode === 'closed' ? timers[0] : null;

  return (
    <div className={`w-full h-full flex flex-col justify-between select-none p-1 ${stickerShadow}`}>
      {/* Header: keep primary controls on the left so Corkboard's top-right hover toolbar never covers them */}
      <div className="flex items-center justify-between gap-2 shrink-0 mb-1.5 pr-20">
        <div className="flex items-center gap-1.5 min-w-0">
          <AlarmClock
            className={`w-4 h-4 shrink-0 ${
              completedCount > 0
                ? 'text-rose-400 animate-pulse'
                : runningCount > 0
                  ? 'text-amber-400'
                  : isLight
                    ? 'text-slate-600'
                    : 'text-gray-400'
            }`}
          />
          <span
            className={`text-xs font-semibold truncate ${
              completedCount > 0
                ? 'text-rose-400 animate-pulse'
                : isLight
                  ? 'text-slate-700'
                  : 'text-gray-300'
            }`}
          >
            {completedCount > 0
              ? `${completedCount} Ringing!`
              : runningCount > 0
                ? `${runningCount} Running`
                : 'Timers'}
          </span>
          {timers.length > 0 && (
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full shrink-0 ${
                isLight ? 'bg-slate-200/80 text-slate-600' : 'bg-gray-800/80 text-gray-400'
              }`}
            >
              {timers.length}/{MAX_TIMERS_PER_WIDGET}
            </span>
          )}

          {onUpdateConfig && (
            <div className="flex items-center gap-1 shrink-0 ml-1" onPointerDown={stopDrag}>
              {completedCount > 0 && (
                <button
                  type="button"
                  onClick={handleDismissAll}
                  className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold inline-flex items-center gap-1 animate-pulse shadow-sm cursor-pointer"
                  title="Dismiss all ringing timers"
                >
                  <BellOff className="w-3 h-3 shrink-0" />
                  <span>{completedCount > 1 ? 'Dismiss All' : 'Dismiss'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => onUpdateConfig({ chimeEnabled: !chimeEnabled })}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  isLight
                    ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-200/70'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800/70'
                }`}
                title={chimeEnabled ? 'Mute timer chime' : 'Enable timer chime'}
                aria-label={chimeEnabled ? 'Mute timer chime' : 'Enable timer chime'}
              >
                {chimeEnabled ? (
                  <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <VolumeX className="w-3.5 h-3.5" />
                )}
              </button>

              {effectivePanelMode === 'closed' ? (
                <button
                  type="button"
                  onClick={openAddPanel}
                  disabled={timers.length >= MAX_TIMERS_PER_WIDGET}
                  className={`px-2 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40 ${
                    isLight
                      ? 'bg-amber-100 text-amber-900 hover:bg-amber-200/80'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30'
                  }`}
                  title="Add new kitchen timer"
                >
                  <Plus className="w-3 h-3" />
                  <span>Add</span>
                </button>
              ) : timers.length > 0 ? (
                <button
                  type="button"
                  onClick={closePanel}
                  className={`px-2 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer ${
                    isLight
                      ? 'bg-slate-200 text-slate-900 hover:bg-slate-300'
                      : 'bg-gray-800 text-white hover:bg-gray-700'
                  }`}
                  title="Cancel and return to timers"
                >
                  <X className="w-3 h-3" />
                  <span>Cancel</span>
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Add OR Edit Timer Drawer */}
      {effectivePanelMode !== 'closed' && (
        <div
          className="flex-1 min-h-0 flex flex-col justify-between gap-2 overflow-y-auto py-0.5"
          onPointerDown={stopDrag}
        >
          <div>
            <div
              className={`text-[10px] font-semibold uppercase tracking-wider mb-1.5 ${
                isLight ? 'text-slate-500' : 'text-gray-400'
              }`}
            >
              {effectivePanelMode === 'edit' ? 'Edit Kitchen Timer' : 'Quick Start Presets'}
            </div>

            {effectivePanelMode === 'edit' ? (
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-1">
                  {QUICK_DURATION_CHIPS.map((chip) => {
                    const isMatch = parsedDraftTotalSec === chip.seconds;
                    return (
                      <button
                        key={chip.label}
                        type="button"
                        onClick={() => setDraftFromSeconds(chip.seconds)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-mono font-semibold border transition-colors cursor-pointer ${
                          isMatch
                            ? 'bg-amber-500/25 border-amber-500 text-amber-300'
                            : isLight
                              ? 'bg-white border-slate-200 text-slate-700 hover:border-amber-400'
                              : 'bg-gray-900/80 border-gray-800 text-gray-300 hover:border-amber-500/50'
                        }`}
                      >
                        {chip.label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-1">
                  {DEFAULT_TIMER_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setDraftLabel(preset.label);
                        setDraftFromSeconds(preset.durationSec);
                      }}
                      className={`px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                        isLight
                          ? 'bg-white border-slate-200 text-slate-700 hover:border-amber-400'
                          : 'bg-gray-900/70 border-gray-800 text-gray-300 hover:border-amber-500/50'
                      }`}
                    >
                      {preset.icon} {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {DEFAULT_TIMER_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={!onUpdateConfig || timers.length >= MAX_TIMERS_PER_WIDGET}
                    onClick={() => handleStartPreset(preset)}
                    className={`flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-40 ${
                      transparentBg
                        ? isLight
                          ? 'bg-white/60 border-slate-300/60 hover:bg-white/80 text-slate-800'
                          : 'bg-black/35 border-white/15 hover:bg-black/50 text-white'
                        : isLight
                          ? 'bg-white border-slate-200 hover:border-amber-400 text-slate-800'
                          : 'bg-gray-900/80 border-gray-800 hover:border-amber-500/50 text-gray-100'
                    }`}
                  >
                    <span className="text-xs font-medium truncate">
                      {preset.icon} {preset.label}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-semibold shrink-0 ${
                        isLight ? 'text-amber-700' : 'text-amber-300'
                      }`}
                    >
                      {formatShortDurationLabel(preset.durationSec)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {onUpdateConfig && (
            <form
              onSubmit={handleFormSubmit}
              className={`p-2 rounded-xl border space-y-1.5 ${cardBgClass}`}
            >
              <input
                type="text"
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                onPointerDown={stopDrag}
                onClick={(e) => e.stopPropagation()}
                placeholder={
                  effectivePanelMode === 'edit' ? 'Timer name' : 'Custom timer (e.g., Sourdough)'
                }
                aria-label="Timer name"
                className={`w-full px-2.5 py-1.5 rounded-lg border text-xs select-text focus:outline-none focus:border-amber-500 ${
                  isLight
                    ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'
                    : 'bg-gray-900 border-gray-700 text-white placeholder:text-gray-500'
                }`}
              />

              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={draftHours}
                    onChange={(e) => setDraftHours(e.target.value)}
                    onPointerDown={stopDrag}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Hours"
                    className={`w-11 px-1.5 py-1 rounded-lg border text-xs font-mono text-center select-text focus:outline-none focus:border-amber-500 ${
                      isLight
                        ? 'bg-white border-slate-300 text-slate-900'
                        : 'bg-gray-900 border-gray-700 text-white'
                    }`}
                  />
                  <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                    h
                  </span>

                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={draftMinutes}
                    onChange={(e) => setDraftMinutes(e.target.value)}
                    onPointerDown={stopDrag}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Minutes"
                    className={`w-12 px-1.5 py-1 rounded-lg border text-xs font-mono text-center select-text focus:outline-none focus:border-amber-500 ${
                      isLight
                        ? 'bg-white border-slate-300 text-slate-900'
                        : 'bg-gray-900 border-gray-700 text-white'
                    }`}
                  />
                  <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                    m
                  </span>

                  <input
                    type="number"
                    min={0}
                    max={59}
                    value={draftSeconds}
                    onChange={(e) => setDraftSeconds(e.target.value)}
                    onPointerDown={stopDrag}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Seconds"
                    className={`w-12 px-1.5 py-1 rounded-lg border text-xs font-mono text-center select-text focus:outline-none focus:border-amber-500 ${
                      isLight
                        ? 'bg-white border-slate-300 text-slate-900'
                        : 'bg-gray-900 border-gray-700 text-white'
                    }`}
                  />
                  <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                    s
                  </span>
                </div>

                <div className="flex items-center gap-1 ml-auto">
                  {effectivePanelMode === 'edit' ? (
                    <>
                      <button
                        type="button"
                        disabled={parsedDraftTotalSec <= 0}
                        onClick={() => applyEditSubmit(false)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer disabled:opacity-40 ${
                          isLight
                            ? 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                            : 'bg-gray-900 border-gray-700 text-gray-200 hover:bg-gray-800'
                        }`}
                      >
                        Save
                      </button>
                      <button
                        type="submit"
                        disabled={parsedDraftTotalSec <= 0}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-xs font-semibold text-white cursor-pointer"
                      >
                        Save & Start
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={timers.length >= MAX_TIMERS_PER_WIDGET || parsedDraftTotalSec <= 0}
                        onClick={() => applyAddSubmit(false)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer disabled:opacity-40 ${
                          isLight
                            ? 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                            : 'bg-gray-900 border-gray-700 text-gray-200 hover:bg-gray-800'
                        }`}
                      >
                        Add
                      </button>
                      <button
                        type="submit"
                        disabled={timers.length >= MAX_TIMERS_PER_WIDGET || parsedDraftTotalSec <= 0}
                        className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-xs font-semibold text-white cursor-pointer"
                      >
                        Start
                      </button>
                    </>
                  )}
                </div>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Single-Timer Hero Ring View */}
      {singleTimer && (() => {
        const live = getTimerLiveState(singleTimer, nowMs);
        const radius = 52;
        const circumference = 2 * Math.PI * radius;
        const strokeOffset = circumference * (1 - live.progressRatio);
        const isDone = live.effectiveStatus === 'completed';
        const isRunning = live.effectiveStatus === 'running';
        const ringColor = isDone ? '#f43f5e' : '#f59e0b';
        const canSubtractMinute = !isDone && live.remainingSec > 60;

        const centerDisplay = (
          <>
            <span
              className={`text-2xl font-bold font-mono tabular-nums tracking-tight ${
                isDone
                  ? 'text-rose-400 animate-pulse'
                  : isLight
                    ? 'text-slate-900'
                    : 'text-white'
              }`}
            >
              {isDone ? '00:00' : formatTimerDuration(live.remainingSec)}
            </span>
            <span
              className={`text-[11px] font-medium truncate max-w-[92px] inline-flex items-center gap-1 ${
                isDone
                  ? 'text-rose-400 font-bold uppercase tracking-wider'
                  : isLight
                    ? 'text-slate-600'
                    : 'text-gray-300'
              }`}
            >
              <span className="truncate">{isDone ? "TIME'S UP!" : singleTimer.label}</span>
              {onUpdateConfig && !isDone && (
                <Pencil className="w-2.5 h-2.5 shrink-0 opacity-50 group-hover/edit:opacity-100 transition-opacity" />
              )}
            </span>
          </>
        );

        return (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-2 py-1">
            <div className="relative flex items-center justify-center">
              <svg
                className={`w-32 h-32 -rotate-90 ${isDone ? 'animate-pulse' : ''}`}
                viewBox="0 0 120 120"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id={`timer-ring-${svgBaseId}`} x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={ringColor} />
                    <stop offset="100%" stopColor={isDone ? '#fb7185' : '#fbbf24'} />
                  </linearGradient>
                </defs>
                <circle
                  cx="60"
                  cy="60"
                  r={radius}
                  fill="none"
                  stroke={isLight ? 'rgba(148,163,184,0.28)' : 'rgba(255,255,255,0.1)'}
                  strokeWidth="8"
                />
                <circle
                  cx="60"
                  cy="60"
                  r={radius}
                  fill="none"
                  stroke={`url(#timer-ring-${svgBaseId})`}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeOffset}
                  className="transition-[stroke-dashoffset] duration-300"
                />
              </svg>

              {onUpdateConfig ? (
                <button
                  type="button"
                  onPointerDown={stopDrag}
                  onClick={() => openEditPanel(singleTimer)}
                  title="Click to edit timer duration or name"
                  className={`group/edit absolute inset-3 rounded-full flex flex-col items-center justify-center text-center px-2 transition-colors cursor-pointer ${
                    isLight ? 'hover:bg-slate-200/50' : 'hover:bg-white/5'
                  }`}
                >
                  {centerDisplay}
                </button>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
                  {centerDisplay}
                </div>
              )}
            </div>

            {onUpdateConfig && (
              <div className="flex flex-wrap items-center justify-center gap-1" onPointerDown={stopDrag}>
                {isDone ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleDismiss(singleTimer)}
                      className="px-3.5 py-1.5 rounded-xl text-xs font-bold inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-950/50 animate-pulse transition-colors cursor-pointer"
                    >
                      <BellOff className="w-3.5 h-3.5" />
                      <span>Dismiss</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleStartOrPause(singleTimer)}
                      className="px-2.5 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
                      title="Restart timer"
                    >
                      <Play className="w-3 h-3" />
                      <span>Restart</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleStartOrPause(singleTimer)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                      isRunning
                        ? 'bg-amber-600 hover:bg-amber-500 text-white'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                    }`}
                  >
                    {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                    <span>{isRunning ? 'Pause' : 'Start'}</span>
                  </button>
                )}

                {!isDone && (
                  <button
                    type="button"
                    disabled={!canSubtractMinute}
                    onClick={() => handleAdjustSeconds(singleTimer, -60)}
                    className={`px-2 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer disabled:opacity-35 ${
                      isLight
                        ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                        : 'bg-gray-900/80 border-gray-700 text-gray-200 hover:bg-gray-800'
                    }`}
                    title="Subtract 1 minute"
                  >
                    -1m
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleAdjustSeconds(singleTimer, 60)}
                  className={`px-2 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                    isLight
                      ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      : 'bg-gray-900/80 border-gray-700 text-gray-200 hover:bg-gray-800'
                  }`}
                  title="Add 1 minute"
                >
                  +1m
                </button>

                <button
                  type="button"
                  onClick={() => openEditPanel(singleTimer)}
                  className={`p-1.5 rounded-xl border transition-colors cursor-pointer ${
                    isLight
                      ? 'bg-white border-slate-200 text-slate-600 hover:text-amber-700 hover:border-amber-300'
                      : 'bg-gray-900/80 border-gray-700 text-gray-300 hover:text-amber-300 hover:border-amber-500/40'
                  }`}
                  title="Edit timer"
                  aria-label="Edit timer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => handleReset(singleTimer)}
                  className={`p-1.5 rounded-xl border transition-colors cursor-pointer ${
                    isLight
                      ? 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
                      : 'bg-gray-900/80 border-gray-700 text-gray-300 hover:text-white'
                  }`}
                  title="Reset timer"
                  aria-label="Reset timer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>

                {timers.length < MAX_TIMERS_PER_WIDGET && (
                  <button
                    type="button"
                    onClick={openAddPanel}
                    className={`p-1.5 rounded-xl border transition-colors cursor-pointer ${
                      isLight
                        ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                        : 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25'
                    }`}
                    title="Add another timer"
                    aria-label="Add another timer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleRemoveTimer(singleTimer.id)}
                  className={`p-1.5 rounded-xl border transition-colors cursor-pointer ${
                    isLight
                      ? 'bg-white border-slate-200 text-slate-400 hover:text-rose-600'
                      : 'bg-gray-900/80 border-gray-700 text-gray-400 hover:text-rose-400'
                  }`}
                  title="Delete timer"
                  aria-label="Delete timer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        );
      })()}

      {/* Multi-Timer List */}
      {effectivePanelMode === 'closed' && timers.length > 1 && (
        <div className="flex-1 min-h-0 flex flex-col gap-1.5 overflow-y-auto pr-0.5" onPointerDown={stopDrag}>
          {timers.map((timer) => {
            const live = getTimerLiveState(timer, nowMs);
            const isDone = live.effectiveStatus === 'completed';
            const isRunning = live.effectiveStatus === 'running';
            const pct = Math.round(live.progressRatio * 100);
            const canSubtractMinute = !isDone && live.remainingSec > 60;

            return (
              <div
                key={timer.id}
                className={`relative overflow-hidden rounded-xl border px-2.5 py-2 transition-colors ${
                  isDone
                    ? isLight
                      ? 'bg-rose-50 border-rose-400 ring-1 ring-rose-400/60'
                      : 'bg-rose-950/50 border-rose-500/70 ring-1 ring-rose-500/50'
                    : cardBgClass
                }`}
              >
                {/* Progress backdrop bar */}
                <div
                  className={`absolute inset-y-0 left-0 pointer-events-none transition-[width] duration-300 ${
                    isDone ? 'bg-rose-500/20' : 'bg-amber-500/15'
                  }`}
                  style={{ width: `${pct}%` }}
                />

                <div className="relative flex items-center justify-between gap-2">
                  {onUpdateConfig ? (
                    <button
                      type="button"
                      onClick={() => openEditPanel(timer)}
                      title={`Edit ${timer.label}`}
                      className="min-w-0 flex-1 text-left cursor-pointer group/row"
                    >
                      <div className="flex items-center gap-1">
                        <span
                          className={`text-xs font-semibold truncate ${
                            isLight ? 'text-slate-800' : 'text-gray-100'
                          }`}
                        >
                          {timer.label}
                        </span>
                        <Pencil className="w-2.5 h-2.5 shrink-0 opacity-0 group-hover/row:opacity-75 text-amber-400 transition-opacity" />
                      </div>
                      <div
                        className={`text-base font-bold font-mono tabular-nums leading-tight mt-0.5 ${
                          isDone
                            ? 'text-rose-400 animate-pulse'
                            : isLight
                              ? 'text-slate-900'
                              : 'text-white'
                        }`}
                      >
                        {isDone ? "TIME'S UP! • 00:00" : formatTimerDuration(live.remainingSec)}
                      </div>
                    </button>
                  ) : (
                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-xs font-semibold truncate ${
                          isLight ? 'text-slate-800' : 'text-gray-100'
                        }`}
                      >
                        {timer.label}
                      </div>
                      <div
                        className={`text-base font-bold font-mono tabular-nums leading-tight mt-0.5 ${
                          isDone
                            ? 'text-rose-400 animate-pulse'
                            : isLight
                              ? 'text-slate-900'
                              : 'text-white'
                        }`}
                      >
                        {isDone ? "TIME'S UP! • 00:00" : formatTimerDuration(live.remainingSec)}
                      </div>
                    </div>
                  )}

                  {onUpdateConfig && (
                    <div className="flex items-center gap-1 shrink-0">
                      {isDone ? (
                        <button
                          type="button"
                          onClick={() => handleDismiss(timer)}
                          className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold inline-flex items-center gap-1 animate-pulse shadow-sm transition-colors cursor-pointer"
                          title={`Dismiss alarm for ${timer.label}`}
                          aria-label={`Dismiss ${timer.label}`}
                        >
                          <BellOff className="w-3 h-3 shrink-0" />
                          <span>Dismiss</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleStartOrPause(timer)}
                          className={`p-1.5 rounded-lg text-white transition-colors cursor-pointer ${
                            isRunning
                              ? 'bg-amber-600 hover:bg-amber-500'
                              : 'bg-emerald-600 hover:bg-emerald-500'
                          }`}
                          title={isRunning ? 'Pause' : 'Start'}
                          aria-label={isRunning ? `Pause ${timer.label}` : `Start ${timer.label}`}
                        >
                          {isRunning ? (
                            <Pause className="w-3.5 h-3.5" />
                          ) : (
                            <Play className="w-3.5 h-3.5" />
                          )}
                        </button>
                      )}

                      {!isDone && (
                        <button
                          type="button"
                          disabled={!canSubtractMinute}
                          onClick={() => handleAdjustSeconds(timer, -60)}
                          className={`px-1.5 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer disabled:opacity-35 ${
                            isLight
                              ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                              : 'bg-gray-900/90 border-gray-700 text-gray-200 hover:bg-gray-800'
                          }`}
                          title="Subtract 1 minute"
                        >
                          -1m
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleAdjustSeconds(timer, 60)}
                        className={`px-1.5 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                          isLight
                            ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                            : 'bg-gray-900/90 border-gray-700 text-gray-200 hover:bg-gray-800'
                        }`}
                        title={isDone ? 'Snooze +1 minute' : 'Add 1 minute'}
                      >
                        +1m
                      </button>

                      {isDone ? (
                        <button
                          type="button"
                          onClick={() => handleStartOrPause(timer)}
                          className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
                          title={`Restart ${timer.label}`}
                          aria-label={`Restart ${timer.label}`}
                        >
                          <Play className="w-3 h-3" />
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => openEditPanel(timer)}
                            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                              isLight
                                ? 'bg-white border-slate-200 text-slate-500 hover:text-amber-700'
                                : 'bg-gray-900/90 border-gray-700 text-gray-400 hover:text-amber-300'
                            }`}
                            title={`Edit ${timer.label}`}
                            aria-label={`Edit ${timer.label}`}
                          >
                            <Pencil className="w-3 h-3" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleReset(timer)}
                            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                              isLight
                                ? 'bg-white border-slate-200 text-slate-500 hover:text-slate-900'
                                : 'bg-gray-900/90 border-gray-700 text-gray-400 hover:text-white'
                            }`}
                            title="Reset"
                            aria-label={`Reset ${timer.label}`}
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        </>
                      )}

                      <button
                        type="button"
                        onClick={() => handleRemoveTimer(timer.id)}
                        className={`p-1 rounded-lg transition-colors cursor-pointer ${
                          isLight
                            ? 'text-slate-400 hover:text-rose-600'
                            : 'text-gray-500 hover:text-rose-400'
                        }`}
                        title="Remove timer"
                        aria-label={`Remove ${timer.label}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {onUpdateConfig && timers.length < MAX_TIMERS_PER_WIDGET && (
            <button
              type="button"
              onClick={openAddPanel}
              className={`w-full py-1.5 rounded-xl border border-dashed text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                isLight
                  ? 'border-slate-300 text-slate-600 hover:border-amber-400 hover:text-amber-800 hover:bg-amber-50/60'
                  : 'border-gray-700 text-gray-400 hover:border-amber-500/50 hover:text-amber-300 hover:bg-amber-500/10'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Another Timer</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
