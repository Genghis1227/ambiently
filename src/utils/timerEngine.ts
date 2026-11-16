import { MAX_TIMERS_PER_WIDGET, type TimerItem, type TimerPreset, type TimerStatus } from '../types/phase1Widgets';

export const DEFAULT_TIMER_PRESETS: TimerPreset[] = [
  { id: 'preset-tea', label: 'Steep Tea', durationSec: 4 * 60, icon: '🫖' },
  { id: 'preset-eggs', label: 'Soft Eggs', durationSec: 7 * 60, icon: '🥚' },
  { id: 'preset-pasta', label: 'Pasta', durationSec: 9 * 60, icon: '🍝' },
  { id: 'preset-simmer', label: 'Simmer / Rice', durationSec: 15 * 60, icon: '🍚' },
  { id: 'preset-oven', label: 'Oven Bake', durationSec: 20 * 60, icon: '🔥' },
  { id: 'preset-roast', label: 'Roast / Proof', durationSec: 45 * 60, icon: '🍞' },
];

export interface TimerLiveState {
  remainingSec: number;
  totalSec: number;
  progressRatio: number;
  isExpired: boolean;
  effectiveStatus: TimerStatus;
}

export interface StepDurationChip {
  label: string;
  durationSec: number;
}

const VALID_STATUSES = new Set<TimerStatus>(['idle', 'running', 'paused', 'completed']);

export function resolveWidgetTimers(timers?: TimerItem[]): TimerItem[] {
  if (!Array.isArray(timers)) return [];
  const out: TimerItem[] = [];
  for (const item of timers) {
    if (!item || typeof item !== 'object') continue;
    if (out.length >= MAX_TIMERS_PER_WIDGET) break;
    const durationSec = Math.max(1, Math.min(24 * 3600, Math.round(Number(item.durationSec) || 60)));
    const status: TimerStatus = VALID_STATUSES.has(item.status) ? item.status : 'idle';
    const remainingRaw = Number(item.remainingSec);
    const remainingSec = Number.isFinite(remainingRaw)
      ? Math.max(0, Math.min(durationSec, Math.round(remainingRaw)))
      : status === 'completed'
        ? 0
        : durationSec;
    out.push({
      id: typeof item.id === 'string' && item.id.trim() ? item.id : `timer-${out.length + 1}`,
      label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : 'Kitchen Timer',
      durationSec,
      status,
      endsAt: typeof item.endsAt === 'string' && item.endsAt ? item.endsAt : null,
      remainingSec,
      completedAt: typeof item.completedAt === 'string' && item.completedAt ? item.completedAt : null,
    });
  }
  return out;
}

export function getTimerLiveState(timer: TimerItem, nowMs: number): TimerLiveState {
  const totalSec = Math.max(1, Math.round(Number(timer.durationSec) || 1));

  if (timer.status === 'running' && timer.endsAt) {
    const endsAtMs = Date.parse(timer.endsAt);
    if (Number.isFinite(endsAtMs)) {
      const remainingMs = endsAtMs - nowMs;
      if (remainingMs <= 0) {
        return {
          remainingSec: 0,
          totalSec,
          progressRatio: 1,
          isExpired: true,
          effectiveStatus: 'completed',
        };
      }
      const remainingSec = Math.max(1, Math.ceil(remainingMs / 1000));
      const elapsedSec = Math.max(0, totalSec - remainingMs / 1000);
      return {
        remainingSec,
        totalSec,
        progressRatio: Math.max(0, Math.min(1, elapsedSec / totalSec)),
        isExpired: false,
        effectiveStatus: 'running',
      };
    }
  }

  if (timer.status === 'completed') {
    return {
      remainingSec: 0,
      totalSec,
      progressRatio: 1,
      isExpired: true,
      effectiveStatus: 'completed',
    };
  }

  const remainingRaw =
    typeof timer.remainingSec === 'number' && Number.isFinite(timer.remainingSec)
      ? Math.max(0, Math.round(timer.remainingSec))
      : totalSec;

  return {
    remainingSec: remainingRaw,
    totalSec,
    progressRatio: Math.max(0, Math.min(1, (totalSec - remainingRaw) / totalSec)),
    isExpired: false,
    effectiveStatus: timer.status === 'paused' ? 'paused' : 'idle',
  };
}

export function startTimerItem(timer: TimerItem, nowMs: number): TimerItem {
  const live = getTimerLiveState(timer, nowMs);
  const totalSec = Math.max(1, Math.round(timer.durationSec || 60));
  const baseSec =
    timer.status === 'completed' || live.effectiveStatus === 'completed' || live.remainingSec <= 0
      ? totalSec
      : live.remainingSec;

  return {
    ...timer,
    durationSec: totalSec,
    status: 'running',
    remainingSec: baseSec,
    endsAt: new Date(nowMs + baseSec * 1000).toISOString(),
    completedAt: null,
  };
}

export function pauseTimerItem(timer: TimerItem, nowMs: number): TimerItem {
  const live = getTimerLiveState(timer, nowMs);
  if (live.isExpired) {
    return {
      ...timer,
      status: 'completed',
      remainingSec: 0,
      endsAt: null,
      completedAt: timer.completedAt ?? new Date(nowMs).toISOString(),
    };
  }
  return {
    ...timer,
    status: 'paused',
    remainingSec: live.remainingSec,
    endsAt: null,
  };
}

export const MAX_ALARM_RING_MS = 15 * 60 * 1000;
export const ALARM_REPEAT_INTERVAL_MS = 1600;

export function resetTimerItem(timer: TimerItem): TimerItem {
  const totalSec = Math.max(1, Math.round(timer.durationSec || 60));
  return {
    ...timer,
    durationSec: totalSec,
    status: 'idle',
    remainingSec: totalSec,
    endsAt: null,
    completedAt: null,
  };
}

export function dismissTimerItem(timer: TimerItem): TimerItem {
  return resetTimerItem(timer);
}

export function isTimerActivelyRinging(
  timer: TimerItem,
  nowMs: number,
  maxRingMs: number = MAX_ALARM_RING_MS
): boolean {
  const live = getTimerLiveState(timer, nowMs);
  if (live.effectiveStatus !== 'completed') return false;
  const expiredIso = timer.completedAt || timer.endsAt;
  if (!expiredIso) return false;
  const expiredMs = Date.parse(expiredIso);
  if (!Number.isFinite(expiredMs)) return false;
  const ageMs = nowMs - expiredMs;
  return ageMs >= -2000 && ageMs <= maxRingMs;
}

export function addSecondsToTimerItem(timer: TimerItem, deltaSec: number, nowMs: number): TimerItem {
  const delta = Math.round(deltaSec);
  if (!Number.isFinite(delta) || delta === 0) return timer;

  const live = getTimerLiveState(timer, nowMs);

  if (timer.status === 'running' && !live.isExpired) {
    const endsAtMs = timer.endsAt ? Date.parse(timer.endsAt) : nowMs + live.remainingSec * 1000;
    const baseEndMs = Number.isFinite(endsAtMs) ? endsAtMs : nowMs + live.remainingSec * 1000;
    const nextEndMs = Math.max(nowMs + 1000, baseEndMs + delta * 1000);
    const nextRemainingSec = Math.max(1, Math.ceil((nextEndMs - nowMs) / 1000));
    const nextDurationSec = Math.max(timer.durationSec, nextRemainingSec);
    return {
      ...timer,
      durationSec: nextDurationSec,
      status: 'running',
      remainingSec: nextRemainingSec,
      endsAt: new Date(nextEndMs).toISOString(),
      completedAt: null,
    };
  }

  if (live.effectiveStatus === 'completed') {
    if (delta <= 0) return timer;
    const nextDurationSec = Math.max(timer.durationSec, delta);
    return {
      ...timer,
      durationSec: nextDurationSec,
      status: 'running',
      remainingSec: delta,
      endsAt: new Date(nowMs + delta * 1000).toISOString(),
      completedAt: null,
    };
  }

  const baseSec =
    typeof timer.remainingSec === 'number' && Number.isFinite(timer.remainingSec)
      ? timer.remainingSec
      : timer.durationSec;
  const nextRemainingSec = Math.max(1, Math.round(baseSec + delta));
  const nextDurationSec =
    timer.status === 'idle' ? nextRemainingSec : Math.max(timer.durationSec, nextRemainingSec);

  return {
    ...timer,
    durationSec: nextDurationSec,
    remainingSec: nextRemainingSec,
  };
}

export function splitDurationHms(durationSec: number): {
  hours: number;
  minutes: number;
  seconds: number;
} {
  const safe = Math.max(0, Math.min(24 * 3600, Math.round(Number(durationSec) || 0)));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return { hours, minutes, seconds };
}

export function combineDurationHms(hours: number, minutes: number, seconds: number): number {
  const h = Number.isFinite(hours) ? Math.max(0, hours) : 0;
  const m = Number.isFinite(minutes) ? Math.max(0, minutes) : 0;
  const s = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const total = Math.round(h * 3600 + m * 60 + s);
  return Math.max(0, Math.min(24 * 3600, total));
}

export function updateTimerItem(
  timer: TimerItem,
  updates: { label?: string; durationSec?: number }
): TimerItem {
  const nextLabel =
    updates.label !== undefined ? updates.label.trim() || 'Kitchen Timer' : timer.label;
  const nextDurationSec =
    updates.durationSec !== undefined
      ? Math.max(1, Math.min(24 * 3600, Math.round(updates.durationSec)))
      : timer.durationSec;

  if (nextDurationSec === timer.durationSec) {
    return {
      ...timer,
      label: nextLabel,
    };
  }

  return {
    ...timer,
    label: nextLabel,
    durationSec: nextDurationSec,
    status: 'idle',
    remainingSec: nextDurationSec,
    endsAt: null,
    completedAt: null,
  };
}

export function formatTimerDuration(totalSec: number): string {
  const safe = Math.max(0, Math.round(Number(totalSec) || 0));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  if (hours > 0) {
    return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatShortDurationLabel(totalSec: number): string {
  const safe = Math.max(1, Math.round(totalSec));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  if (secs > 0 && hours === 0) parts.push(`${secs}s`);
  return parts.join(' ') || `${safe}s`;
}

function unitMultiplierSec(unit: string): number {
  const u = unit.toLowerCase();
  if (u === 'h' || u === 'hr' || u === 'hrs' || u === 'hour' || u === 'hours') return 3600;
  if (u === 'm' || u === 'min' || u === 'mins' || u === 'minute' || u === 'minutes') return 60;
  return 1;
}

export function extractStepDurations(stepText: string): StepDurationChip[] {
  if (!stepText || typeof stepText !== 'string') return [];

  interface SpanMatch {
    start: number;
    end: number;
    durationSec: number;
  }

  const found: SpanMatch[] = [];
  const overlapsExisting = (start: number, end: number) =>
    found.some((m) => start < m.end && end > m.start);

  const pushDuration = (start: number, end: number, rawSec: number) => {
    const durationSec = Math.round(rawSec);
    if (!Number.isFinite(durationSec) || durationSec < 1 || durationSec > 24 * 3600) return;
    found.push({ start, end, durationSec });
  };

  // 1. Compound hours + minutes (e.g. "1 hr 15 min", "1h 30m", "2 hours and 10 minutes")
  const hrMinRegex =
    /\b(\d+(?:\.\d+)?)\s*(hours?|hrs?|hr|h)\s*(?:,?\s*(?:and\s*)?)(\d+(?:\.\d+)?)\s*(minutes?|mins?|min|m)\b/gi;
  for (const match of stepText.matchAll(hrMinRegex)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (overlapsExisting(start, end)) continue;
    const hrs = Number(match[1]);
    const mins = Number(match[3]);
    pushDuration(start, end, hrs * 3600 + mins * 60);
  }

  // 2. Compound minutes + seconds (e.g. "2 min 30 sec", "1m 45s")
  const minSecRegex =
    /\b(\d+(?:\.\d+)?)\s*(minutes?|mins?|min|m)\s*(?:,?\s*(?:and\s*)?)(\d+(?:\.\d+)?)\s*(seconds?|secs?|sec|s)\b/gi;
  for (const match of stepText.matchAll(minSecRegex)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (overlapsExisting(start, end)) continue;
    const mins = Number(match[1]);
    const secs = Number(match[3]);
    pushDuration(start, end, mins * 60 + secs);
  }

  // 3. Ranges (e.g. "12-15 minutes", "8 to 10 mins", "1-2 hours")
  const rangeRegex =
    /\b(\d+(?:\.\d+)?)\s*(?:-|–|—|\bto\b)\s*(\d+(?:\.\d+)?)\s*(hours?|hrs?|hr|minutes?|mins?|min|seconds?|secs?|sec)\b/gi;
  for (const match of stepText.matchAll(rangeRegex)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (overlapsExisting(start, end)) continue;
    const mult = unitMultiplierSec(match[3]);
    const low = Number(match[1]);
    const high = Number(match[2]);
    if (low > 0 && high > 0) {
      pushDuration(start, end, low * mult);
      pushDuration(start, end, high * mult);
    }
  }

  // 4. Single durations with full unit word OR tight shorthand ("25m", "45s", "1.5h")
  const singleRegex =
    /\b(\d+(?:\.\d+)?)(?:\s+(hours?|hrs?|hr|minutes?|mins?|min|seconds?|secs?|sec)|(hours?|hrs?|hr|h|minutes?|mins?|min|m|seconds?|secs?|s))\b/gi;
  for (const match of stepText.matchAll(singleRegex)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (overlapsExisting(start, end)) continue;
    const val = Number(match[1]);
    const unit = match[2] || match[3];
    if (!unit || !(val > 0)) continue;
    pushDuration(start, end, val * unitMultiplierSec(unit));
  }

  found.sort((a, b) => a.start - b.start);

  const seen = new Set<number>();
  const chips: StepDurationChip[] = [];
  for (const item of found) {
    if (seen.has(item.durationSec)) continue;
    seen.add(item.durationSec);
    chips.push({
      label: formatShortDurationLabel(item.durationSec),
      durationSec: item.durationSec,
    });
    if (chips.length >= 3) break;
  }

  return chips;
}

function getAudioCtxConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ||
    null
  );
}

function playUrgentAlarmBurst(ctx: AudioContext): void {
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }
  const baseTime = ctx.currentTime + 0.015;
  const beepOffsets = [0, 0.135, 0.27, 0.405];

  for (const offset of beepOffsets) {
    const start = baseTime + offset;
    const stopTime = start + 0.095;

    // Piercing primary piezo tone (C7 square)
    const primaryOsc = ctx.createOscillator();
    const primaryGain = ctx.createGain();
    primaryOsc.type = 'square';
    primaryOsc.frequency.setValueAtTime(2093.0, start);

    primaryGain.gain.setValueAtTime(0.0001, start);
    primaryGain.gain.exponentialRampToValueAtTime(0.24, start + 0.008);
    primaryGain.gain.setValueAtTime(0.22, start + 0.072);
    primaryGain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

    primaryOsc.connect(primaryGain);
    primaryGain.connect(ctx.destination);
    primaryOsc.start(start);
    primaryOsc.stop(stopTime + 0.005);

    // Harmonic upper overtone (E7 triangle) for kitchen audibility
    const overtoneOsc = ctx.createOscillator();
    const overtoneGain = ctx.createGain();
    overtoneOsc.type = 'triangle';
    overtoneOsc.frequency.setValueAtTime(2637.02, start);

    overtoneGain.gain.setValueAtTime(0.0001, start);
    overtoneGain.gain.exponentialRampToValueAtTime(0.14, start + 0.008);
    overtoneGain.gain.setValueAtTime(0.12, start + 0.072);
    overtoneGain.gain.exponentialRampToValueAtTime(0.0001, stopTime);

    overtoneOsc.connect(overtoneGain);
    overtoneGain.connect(ctx.destination);
    overtoneOsc.start(start);
    overtoneOsc.stop(stopTime + 0.005);
  }
}

export function playTimerChime(): void {
  const AudioCtx = getAudioCtxConstructor();
  if (!AudioCtx) return;
  try {
    const ctx = new AudioCtx();
    playUrgentAlarmBurst(ctx);
    window.setTimeout(() => {
      void ctx.close().catch(() => {});
    }, 900);
  } catch {
    // Ignore Web Audio errors on restricted kiosk contexts
  }
}

const activeSubscribers = new Set<string>();
let activeAlarmCtx: AudioContext | null = null;
let repeatTimerId: number | null = null;

function stopAlarmEngine(): void {
  if (repeatTimerId !== null && typeof window !== 'undefined') {
    window.clearInterval(repeatTimerId);
    repeatTimerId = null;
  }
  if (activeAlarmCtx) {
    const ctxToClose = activeAlarmCtx;
    activeAlarmCtx = null;
    void ctxToClose.close().catch(() => {});
  }
}

function ensureAlarmEngineRunning(): void {
  const AudioCtx = getAudioCtxConstructor();
  if (!AudioCtx || typeof window === 'undefined') return;

  try {
    if (!activeAlarmCtx || activeAlarmCtx.state === 'closed') {
      activeAlarmCtx = new AudioCtx();
    }
  } catch {
    return;
  }

  if (repeatTimerId !== null) return;

  try {
    playUrgentAlarmBurst(activeAlarmCtx);
  } catch {
    // Ignore transient Web Audio restrictions
  }

  repeatTimerId = window.setInterval(() => {
    if (activeSubscribers.size === 0) {
      stopAlarmEngine();
      return;
    }
    try {
      if (!activeAlarmCtx || activeAlarmCtx.state === 'closed') {
        const Ctor = getAudioCtxConstructor();
        if (!Ctor) return;
        activeAlarmCtx = new Ctor();
      }
      playUrgentAlarmBurst(activeAlarmCtx);
    } catch {
      // Ignore transient Web Audio errors
    }
  }, ALARM_REPEAT_INTERVAL_MS);
}

export function stopAllTimerAlarms(): void {
  activeSubscribers.clear();
  stopAlarmEngine();
}

export function syncTimerAlarmSubscriber(subscriberId: string, shouldRing: boolean): void {
  if (!subscriberId) return;
  if (shouldRing) {
    activeSubscribers.add(subscriberId);
    ensureAlarmEngineRunning();
  } else {
    activeSubscribers.delete(subscriberId);
    if (activeSubscribers.size === 0) {
      stopAlarmEngine();
    }
  }
}
