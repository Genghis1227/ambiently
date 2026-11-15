import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  AlarmClock,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  Volume2,
  VolumeX,
  X,
  Coffee,
  Sparkles,
} from 'lucide-react';
import type { TimerItem, TimerPreset, TimerWidgetConfig } from '../../types/phase1Widgets';
import { MAX_TIMERS_PER_WIDGET } from '../../types/phase1Widgets';
import {
  DEFAULT_TIMER_PRESETS,
  addSecondsToTimerItem,
  advancePomodoroPhase,
  formatShortDurationLabel,
  formatTimerDuration,
  getTimerLiveState,
  pauseTimerItem,
  playTimerChime,
  resetTimerItem,
  resolveWidgetTimers,
  startTimerItem,
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

export const TimerWidget: React.FC<TimerWidgetProps> = ({
  config,
  isLight = false,
  transparentBg = false,
  onUpdateConfig,
}) => {
  const svgBaseId = useId().replace(/:/g, '');
  const timers = useMemo(() => resolveWidgetTimers(config?.timers), [config?.timers]);
  const chimeEnabled = config?.chimeEnabled !== false;
  const defaultFocusMin = config?.defaultFocusMin ?? 25;
  const defaultBreakMin = config?.defaultBreakMin ?? 5;

  const hasRunning = timers.some((t) => t.status === 'running');
  const nowDate = useSharedClock(hasRunning ? 'second' : '10s');
  const nowMs = nowDate.getTime() > 0 ? nowDate.getTime() : Date.now();

  const { isNightMode } = useDisplayActivity();
  const dashboardSettings = useDashboardStore((s) => s.settings);
  const nightActive = isNightMode || isAmbientlyInNightMode(dashboardSettings);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [customMinutes, setCustomMinutes] = useState('5');
  const [customSeconds, setCustomSeconds] = useState('0');

  // Track already-expired timers on mount so stale alarms do not chime on page load
  const chimedIdsRef = useRef<Set<string> | null>(null);
  if (chimedIdsRef.current === null) {
    const initialSet = new Set<string>();
    const mountNow = Date.now();
    for (const t of timers) {
      const live = getTimerLiveState(t, mountNow);
      if (t.status === 'completed' || live.isExpired) {
        initialSet.add(t.id);
      }
    }
    chimedIdsRef.current = initialSet;
  }

  // Detect running timers crossing 00:00 -> mark completed and chime
  useEffect(() => {
    const newlyExpiredIds: string[] = [];
    let needsPersist = false;

    const nextTimers = timers.map((t) => {
      if (t.status !== 'running') return t;
      const live = getTimerLiveState(t, nowMs);
      if (!live.isExpired) return t;
      needsPersist = true;
      if (!chimedIdsRef.current?.has(t.id)) {
        chimedIdsRef.current?.add(t.id);
        newlyExpiredIds.push(t.id);
      }
      return {
        ...t,
        status: 'completed' as const,
        remainingSec: 0,
        endsAt: null,
        completedAt: new Date(nowMs).toISOString(),
      };
    });

    if (newlyExpiredIds.length > 0 && chimeEnabled && !nightActive) {
      playTimerChime();
    }
    if (needsPersist && onUpdateConfig) {
      onUpdateConfig({ timers: nextTimers });
    }
  }, [timers, nowMs, chimeEnabled, nightActive, onUpdateConfig]);

  const commitTimers = (nextTimers: TimerItem[]) => {
    onUpdateConfig?.({ timers: nextTimers.slice(0, MAX_TIMERS_PER_WIDGET) });
  };

  const handleStartOrPause = (timer: TimerItem) => {
    const actionNow = Date.now();
    const live = getTimerLiveState(timer, actionNow);
    const nextTimers = timers.map((t) => {
      if (t.id !== timer.id) return t;
      if (live.effectiveStatus === 'running') {
        return pauseTimerItem(t, actionNow);
      }
      chimedIdsRef.current?.delete(t.id);
      return startTimerItem(t, actionNow);
    });
    commitTimers(nextTimers);
  };

  const handleReset = (timer: TimerItem) => {
    chimedIdsRef.current?.delete(timer.id);
    commitTimers(timers.map((t) => (t.id === timer.id ? resetTimerItem(t) : t)));
  };

  const handleAddMinute = (timer: TimerItem, deltaSec: number = 60) => {
    const actionNow = Date.now();
    chimedIdsRef.current?.delete(timer.id);
    commitTimers(
      timers.map((t) => (t.id === timer.id ? addSecondsToTimerItem(t, deltaSec, actionNow) : t))
    );
  };

  const handleFlipPomodoro = (timer: TimerItem) => {
    const actionNow = Date.now();
    chimedIdsRef.current?.delete(timer.id);
    commitTimers(
      timers.map((t) =>
        t.id === timer.id ? advancePomodoroPhase(t, defaultFocusMin, defaultBreakMin, actionNow) : t
      )
    );
  };

  const handleRemoveTimer = (timerId: string) => {
    chimedIdsRef.current?.delete(timerId);
    commitTimers(timers.filter((t) => t.id !== timerId));
  };

  const handleStartPreset = (preset: TimerPreset) => {
    if (timers.length >= MAX_TIMERS_PER_WIDGET) return;
    const actionNow = Date.now();
    const durationSec =
      preset.mode === 'pomodoro'
        ? (preset.pomodoroPhase === 'break' ? defaultBreakMin : defaultFocusMin) * 60
        : preset.durationSec;

    const newItem = startTimerItem(
      {
        id: `timer-${actionNow}-${Math.random().toString(36).slice(2, 6)}`,
        label: preset.label,
        durationSec,
        status: 'idle',
        remainingSec: durationSec,
        mode: preset.mode || 'countdown',
        ...(preset.mode === 'pomodoro'
          ? { pomodoroPhase: preset.pomodoroPhase || 'focus' }
          : {}),
      },
      actionNow
    );
    commitTimers([...timers, newItem]);
    setIsAddOpen(false);
  };

  const handleAddCustomTimer = (e: React.FormEvent) => {
    e.preventDefault();
    if (timers.length >= MAX_TIMERS_PER_WIDGET) return;
    const mins = Math.max(0, Math.min(1440, parseInt(customMinutes, 10) || 0));
    const secs = Math.max(0, Math.min(59, parseInt(customSeconds, 10) || 0));
    const totalSec = mins * 60 + secs;
    if (totalSec <= 0) return;

    const actionNow = Date.now();
    const label = customLabel.trim() || `${formatShortDurationLabel(totalSec)} Timer`;
    const newItem = startTimerItem(
      {
        id: `timer-${actionNow}-${Math.random().toString(36).slice(2, 6)}`,
        label,
        durationSec: totalSec,
        status: 'idle',
        remainingSec: totalSec,
        mode: 'countdown',
      },
      actionNow
    );
    commitTimers([...timers, newItem]);
    setCustomLabel('');
    setIsAddOpen(false);
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

  const singleTimer = timers.length === 1 && !isAddOpen ? timers[0] : null;

  return (
    <div className={`w-full h-full flex flex-col justify-between select-none p-1 ${stickerShadow}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-2 shrink-0 mb-1.5">
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
              isLight ? 'text-slate-700' : 'text-gray-300'
            }`}
          >
            {completedCount > 0
              ? `${completedCount} Done!`
              : runningCount > 0
                ? `${runningCount} Running`
                : 'Timers'}
          </span>
          {timers.length > 0 && (
            <span
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${
                isLight ? 'bg-slate-200/80 text-slate-600' : 'bg-gray-800/80 text-gray-400'
              }`}
            >
              {timers.length}/{MAX_TIMERS_PER_WIDGET}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0" onPointerDown={stopDrag}>
          {onUpdateConfig && (
            <>
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

              <button
                type="button"
                onClick={() => setIsAddOpen((prev) => !prev)}
                disabled={!isAddOpen && timers.length >= MAX_TIMERS_PER_WIDGET}
                className={`px-2 py-1 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40 ${
                  isAddOpen
                    ? isLight
                      ? 'bg-slate-200 text-slate-900'
                      : 'bg-gray-800 text-white'
                    : isLight
                      ? 'bg-amber-100 text-amber-900 hover:bg-amber-200/80'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30'
                }`}
                title="Add timer or preset"
              >
                {isAddOpen ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                <span>{isAddOpen ? 'Close' : 'Add'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Quick Timer Drawer OR Empty Preset Launchpad */}
      {(isAddOpen || timers.length === 0) && (
        <div
          className="flex-1 min-h-0 flex flex-col justify-center gap-2.5 overflow-y-auto py-1"
          onPointerDown={stopDrag}
        >
          <div>
            <div
              className={`text-[10px] font-semibold uppercase tracking-wider mb-1.5 ${
                isLight ? 'text-slate-500' : 'text-gray-400'
              }`}
            >
              Quick Start Presets
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {DEFAULT_TIMER_PRESETS.map((preset) => {
                const dur =
                  preset.mode === 'pomodoro'
                    ? (preset.pomodoroPhase === 'break' ? defaultBreakMin : defaultFocusMin) * 60
                    : preset.durationSec;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={!onUpdateConfig || timers.length >= MAX_TIMERS_PER_WIDGET}
                    onClick={() => handleStartPreset(preset)}
                    className={`flex items-center justify-between gap-1.5 px-2.5 py-2 rounded-xl border text-left transition-all cursor-pointer disabled:opacity-40 ${
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
                      {formatShortDurationLabel(dur)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {onUpdateConfig && (
            <form
              onSubmit={handleAddCustomTimer}
              className={`p-2 rounded-xl border space-y-1.5 ${cardBgClass}`}
            >
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  placeholder="Timer name (e.g., Sourdough)"
                  className={`flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border text-xs focus:outline-none ${
                    isLight
                      ? 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'
                      : 'bg-gray-900 border-gray-700 text-white placeholder:text-gray-500'
                  }`}
                />
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-1 flex-1">
                  <input
                    type="number"
                    min={0}
                    max={1440}
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(e.target.value)}
                    aria-label="Minutes"
                    className={`w-14 px-2 py-1 rounded-lg border text-xs font-mono text-center focus:outline-none ${
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
                    value={customSeconds}
                    onChange={(e) => setCustomSeconds(e.target.value)}
                    aria-label="Seconds"
                    className={`w-14 px-2 py-1 rounded-lg border text-xs font-mono text-center focus:outline-none ${
                      isLight
                        ? 'bg-white border-slate-300 text-slate-900'
                        : 'bg-gray-900 border-gray-700 text-white'
                    }`}
                  />
                  <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                    s
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={timers.length >= MAX_TIMERS_PER_WIDGET}
                  className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-xs font-semibold text-white cursor-pointer"
                >
                  Start
                </button>
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
        const isPomodoro = singleTimer.mode === 'pomodoro';
        const ringColor = isDone
          ? '#f43f5e'
          : isPomodoro && singleTimer.pomodoroPhase === 'break'
            ? '#34d399'
            : '#f59e0b';

        return (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-2 py-1">
            <div className="relative flex items-center justify-center">
              <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120" aria-hidden="true">
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

              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-2">
                {isPomodoro && (
                  <span
                    className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full mb-0.5 ${
                      singleTimer.pomodoroPhase === 'break'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-amber-500/20 text-amber-300'
                    }`}
                  >
                    {singleTimer.pomodoroPhase === 'break' ? 'Break' : 'Focus'}
                  </span>
                )}
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
                  className={`text-[11px] font-medium truncate max-w-[92px] ${
                    isLight ? 'text-slate-600' : 'text-gray-300'
                  }`}
                >
                  {isDone ? 'Time is up!' : singleTimer.label}
                </span>
              </div>
            </div>

            {onUpdateConfig && (
              <div className="flex flex-wrap items-center justify-center gap-1.5" onPointerDown={stopDrag}>
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
                  <span>{isRunning ? 'Pause' : isDone ? 'Restart' : 'Start'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleAddMinute(singleTimer, 60)}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                    isLight
                      ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      : 'bg-gray-900/80 border-gray-700 text-gray-200 hover:bg-gray-800'
                  }`}
                >
                  +1m
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

                {isPomodoro && (
                  <button
                    type="button"
                    onClick={() => handleFlipPomodoro(singleTimer)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border inline-flex items-center gap-1 transition-colors cursor-pointer ${
                      isLight
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                        : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25'
                    }`}
                  >
                    {singleTimer.pomodoroPhase === 'break' ? (
                      <Sparkles className="w-3 h-3" />
                    ) : (
                      <Coffee className="w-3 h-3" />
                    )}
                    <span>{singleTimer.pomodoroPhase === 'break' ? 'Focus' : 'Break'}</span>
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
      {!isAddOpen && timers.length > 1 && (
        <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-0.5" onPointerDown={stopDrag}>
          {timers.map((timer) => {
            const live = getTimerLiveState(timer, nowMs);
            const isDone = live.effectiveStatus === 'completed';
            const isRunning = live.effectiveStatus === 'running';
            const isPomodoro = timer.mode === 'pomodoro';
            const pct = Math.round(live.progressRatio * 100);

            return (
              <div
                key={timer.id}
                className={`relative overflow-hidden rounded-xl border px-2.5 py-2 transition-colors ${
                  isDone
                    ? isLight
                      ? 'bg-rose-50 border-rose-300'
                      : 'bg-rose-950/40 border-rose-500/50'
                    : cardBgClass
                }`}
              >
                {/* Progress backdrop bar */}
                <div
                  className={`absolute inset-y-0 left-0 pointer-events-none transition-[width] duration-300 ${
                    isDone
                      ? 'bg-rose-500/15'
                      : isPomodoro && timer.pomodoroPhase === 'break'
                        ? 'bg-emerald-500/15'
                        : 'bg-amber-500/15'
                  }`}
                  style={{ width: `${pct}%` }}
                />

                <div className="relative flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-xs font-semibold truncate ${
                          isLight ? 'text-slate-800' : 'text-gray-100'
                        }`}
                      >
                        {timer.label}
                      </span>
                      {isPomodoro && (
                        <span
                          className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                            timer.pomodoroPhase === 'break'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-amber-500/20 text-amber-300'
                          }`}
                        >
                          {timer.pomodoroPhase === 'break' ? 'Break' : 'Focus'}
                        </span>
                      )}
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
                      {isDone ? 'Done! 00:00' : formatTimerDuration(live.remainingSec)}
                    </div>
                  </div>

                  {onUpdateConfig && (
                    <div className="flex items-center gap-1 shrink-0">
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

                      <button
                        type="button"
                        onClick={() => handleAddMinute(timer, 60)}
                        className={`px-1.5 py-1 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                          isLight
                            ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                            : 'bg-gray-900/90 border-gray-700 text-gray-200 hover:bg-gray-800'
                        }`}
                        title="Add 1 minute"
                      >
                        +1m
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

                      {isPomodoro && (
                        <button
                          type="button"
                          onClick={() => handleFlipPomodoro(timer)}
                          className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                            isLight
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                              : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                          }`}
                          title={
                            timer.pomodoroPhase === 'break'
                              ? 'Switch to Focus'
                              : 'Switch to Break'
                          }
                        >
                          {timer.pomodoroPhase === 'break' ? (
                            <Sparkles className="w-3 h-3" />
                          ) : (
                            <Coffee className="w-3 h-3" />
                          )}
                        </button>
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
        </div>
      )}
    </div>
  );
};
