import { localDateKey, parseDateKey } from './dateKey';
import {
  MAX_ROUTINES_PER_WIDGET,
  MAX_ROUTINE_COMPLETIONS,
  type RoutineCadenceType,
  type RoutineCompletionStamp,
  type RoutineItem,
  type RoutineUncheckMark,
} from '../types/phase2Widgets';

export const WEEKDAY_SHORT_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
export const WEEKDAY_SINGLE_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
export const WEEKDAY_FULL_LABELS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const DEFAULT_ROUTINE_ITEMS: RoutineItem[] = [
  {
    id: 'routine-pets',
    label: 'Feed Pets',
    emoji: '🐕',
    cadence: 'am_pm',
    completions: [],
  },
  {
    id: 'routine-vitamins',
    label: 'Morning Vitamins',
    emoji: '💊',
    cadence: 'daily',
    completions: [],
  },
  {
    id: 'routine-curbside',
    label: 'Curbside Bins',
    emoji: '♻️',
    cadence: 'alternating_week',
    pickupDayOfWeek: 4,
    anchorDate: '2026-01-01',
    weekALabel: 'Trash + Recycling',
    weekBLabel: 'Trash Only',
    completions: [],
  },
  {
    id: 'routine-plants',
    label: 'Water Plants',
    emoji: '🪴',
    cadence: 'every_n_days',
    intervalDays: 7,
    completions: [],
  },
];

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function normalizeCadence(raw: unknown): RoutineCadenceType {
  if (
    raw === 'am_pm' ||
    raw === 'weekly' ||
    raw === 'alternating_week' ||
    raw === 'every_n_days'
  ) {
    return raw;
  }
  return 'daily';
}

export function normalizeDaysOfWeek(raw: unknown, fallbackDay: number = 5): number[] {
  const unique = new Set<number>();
  if (Array.isArray(raw)) {
    for (const val of raw) {
      if (typeof val !== 'number' && (typeof val !== 'string' || val.trim() === '')) continue;
      const num = Number(val);
      if (!Number.isFinite(num)) continue;
      const day = Math.round(num);
      if (day >= 0 && day <= 6) {
        unique.add(day);
      }
    }
  }
  if (unique.size === 0) {
    return [clampInt(fallbackDay, 0, 6, 5)];
  }
  return [...unique].sort((a, b) => a - b);
}

export function toggleDayOfWeek(current: number[] | undefined, day: number): number[] {
  const list = normalizeDaysOfWeek(current);
  const safeDay = clampInt(day, 0, 6, 5);
  if (list.includes(safeDay)) {
    return list.length > 1 ? list.filter((d) => d !== safeDay) : list;
  }
  return [...list, safeDay].sort((a, b) => a - b);
}

export function formatWeeklyDaysSummary(daysOfWeek: number[]): string {
  const days = normalizeDaysOfWeek(daysOfWeek);
  if (days.length === 7) return 'Every Day';
  if (days.length === 5 && days.every((d, idx) => d === idx + 1)) {
    return 'Weekdays (Mon–Fri)';
  }
  if (days.length === 2 && days[0] === 0 && days[1] === 6) {
    return 'Weekends (Sat & Sun)';
  }
  if (days.length === 1) {
    return `Every ${WEEKDAY_SHORT_LABELS[days[0]]}`;
  }
  if (days.length === 2) {
    return `${WEEKDAY_SHORT_LABELS[days[0]]} & ${WEEKDAY_SHORT_LABELS[days[1]]}`;
  }
  return days.map((d) => WEEKDAY_SHORT_LABELS[d]).join(', ');
}

function sanitizeCompletions(raw: unknown): RoutineCompletionStamp[] {
  if (!Array.isArray(raw)) return [];
  const valid: RoutineCompletionStamp[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const slotKey = typeof (item as RoutineCompletionStamp).slotKey === 'string'
      ? (item as RoutineCompletionStamp).slotKey.trim()
      : '';
    const completedAt = typeof (item as RoutineCompletionStamp).completedAt === 'string'
      ? (item as RoutineCompletionStamp).completedAt.trim()
      : '';
    if (!slotKey || !completedAt) continue;
    const pid = (item as RoutineCompletionStamp).profileId;
    valid.push({
      slotKey,
      completedAt,
      profileId: typeof pid === 'string' && pid.trim() ? pid.trim() : null,
    });
  }
  valid.sort(newestCompletionFirst);
  return valid.slice(0, MAX_ROUTINE_COMPLETIONS);
}

function isoMs(iso: string | undefined): number {
  return Date.parse(iso || '') || 0;
}

// Newest first, then by slot, so every device orders the same stamps the same way
function newestCompletionFirst(a: RoutineCompletionStamp, b: RoutineCompletionStamp): number {
  return isoMs(b.completedAt) - isoMs(a.completedAt) || a.slotKey.localeCompare(b.slotKey);
}

function newestUncheckFirst(a: RoutineUncheckMark, b: RoutineUncheckMark): number {
  return isoMs(b.uncheckedAt) - isoMs(a.uncheckedAt) || a.slotKey.localeCompare(b.slotKey);
}

// An uncheck must count as newer than the check-in it removes, even when that check-in came from a
// device whose clock runs ahead of this one
function uncheckTimeFor(stamp: RoutineCompletionStamp | undefined, nowIso: string): string {
  const stampMs = isoMs(stamp?.completedAt);
  return stampMs >= isoMs(nowIso) ? new Date(stampMs + 1).toISOString() : nowIso;
}

function sanitizeUnchecks(raw: unknown): RoutineUncheckMark[] {
  if (!Array.isArray(raw)) return [];
  const latestBySlot = new Map<string, RoutineUncheckMark>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Partial<RoutineUncheckMark>;
    const slotKey = typeof candidate.slotKey === 'string' ? candidate.slotKey.trim() : '';
    const uncheckedAt = typeof candidate.uncheckedAt === 'string' ? candidate.uncheckedAt.trim() : '';
    if (!slotKey || !uncheckedAt) continue;
    const existing = latestBySlot.get(slotKey);
    if (!existing || isoMs(uncheckedAt) > isoMs(existing.uncheckedAt)) {
      latestBySlot.set(slotKey, { slotKey, uncheckedAt });
    }
  }
  return [...latestBySlot.values()].sort(newestUncheckFirst).slice(0, MAX_ROUTINE_COMPLETIONS);
}

export function resolveRoutineItems(raw?: unknown): RoutineItem[] {
  if (raw === undefined) {
    return DEFAULT_ROUTINE_ITEMS.map((item) => ({
      ...item,
      completions: [],
    }));
  }
  if (!Array.isArray(raw)) return [];

  const resolved: RoutineItem[] = [];
  for (let i = 0; i < raw.length && resolved.length < MAX_ROUTINES_PER_WIDGET; i++) {
    const entry = raw[i];
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Partial<RoutineItem>;
    const cadence = normalizeCadence(item.cadence);
    const label = typeof item.label === 'string' && item.label.trim()
      ? item.label.trim().slice(0, 60)
      : 'Household Routine';
    const id = typeof item.id === 'string' && item.id.trim()
      ? item.id.trim()
      : `routine-${i + 1}`;
    const emoji = typeof item.emoji === 'string' && item.emoji.trim()
      ? item.emoji.trim().slice(0, 8)
      : undefined;

    const clean: RoutineItem = {
      id,
      label,
      ...(emoji ? { emoji } : {}),
      cadence,
      completions: sanitizeCompletions(item.completions),
      ...(() => {
        const unchecks = sanitizeUnchecks(item.uncheckedSlots);
        return unchecks.length > 0 ? { uncheckedSlots: unchecks } : {};
      })(),
      ...(typeof item.updatedAt === 'string' && item.updatedAt.trim()
        ? { updatedAt: item.updatedAt.trim() }
        : {}),
    };

    if (cadence === 'weekly') {
      clean.daysOfWeek = normalizeDaysOfWeek(item.daysOfWeek, item.pickupDayOfWeek ?? 5);
    } else if (cadence === 'every_n_days') {
      clean.intervalDays = clampInt(item.intervalDays, 1, 365, 7);
    } else if (cadence === 'alternating_week') {
      clean.pickupDayOfWeek = clampInt(item.pickupDayOfWeek, 0, 6, 4);
      clean.anchorDate =
        typeof item.anchorDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.anchorDate.trim())
          ? item.anchorDate.trim()
          : '2026-01-01';
      clean.weekALabel =
        typeof item.weekALabel === 'string' && item.weekALabel.trim()
          ? item.weekALabel.trim().slice(0, 40)
          : 'Trash + Recycling';
      clean.weekBLabel =
        typeof item.weekBLabel === 'string' && item.weekBLabel.trim()
          ? item.weekBLabel.trim().slice(0, 40)
          : 'Trash Only';
    }

    resolved.push(clean);
  }
  return resolved;
}

function utcMidnightMs(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

function calendarDaysBetween(earlier: Date, later: Date): number {
  return Math.round((utcMidnightMs(later) - utcMidnightMs(earlier)) / 86_400_000);
}

export interface DailyRoutineEvaluation {
  cadence: 'daily';
  todaySlotKey: string;
  dayStamp: RoutineCompletionStamp | null;
}

export interface AmPmRoutineEvaluation {
  cadence: 'am_pm';
  amSlotKey: string;
  pmSlotKey: string;
  activeHalf: 'AM' | 'PM';
  amStamp: RoutineCompletionStamp | null;
  pmStamp: RoutineCompletionStamp | null;
}

export interface WeeklyRoutineEvaluation {
  cadence: 'weekly';
  daysOfWeek: number[];
  scheduleLabel: string;
  activeSlotKey: string;
  activeStamp: RoutineCompletionStamp | null;
  isDueToday: boolean;
  daysUntilNext: number;
  nextDayLabel: string;
  prevDayLabel: string;
  settledFromPrevSlot: boolean;
}

export interface AlternatingWeekEvaluation {
  cadence: 'alternating_week';
  cycleSlotKey: string;
  currentLabel: string;
  nextLabel: string;
  isWeekA: boolean;
  daysUntilPickup: number;
  pickupDayLabel: string;
  pickupStamp: RoutineCompletionStamp | null;
}

export interface EveryNDaysEvaluation {
  cadence: 'every_n_days';
  todaySlotKey: string;
  intervalDays: number;
  isDoneToday: boolean;
  daysElapsed: number | null;
  daysRemaining: number;
  daysOverdue: number;
  isDueToday: boolean;
  isOverdue: boolean;
  progressRatio: number;
  lastStamp: RoutineCompletionStamp | null;
}

export type RoutineEvaluation =
  | DailyRoutineEvaluation
  | AmPmRoutineEvaluation
  | WeeklyRoutineEvaluation
  | AlternatingWeekEvaluation
  | EveryNDaysEvaluation;

export function evaluateRoutineStatus(item: RoutineItem, now: Date): RoutineEvaluation {
  const todayKey = localDateKey(now);
  const todayDate = parseDateKey(todayKey);
  const completions = item.completions || [];

  if (item.cadence === 'am_pm') {
    const amSlotKey = `${todayKey}:AM`;
    const pmSlotKey = `${todayKey}:PM`;
    return {
      cadence: 'am_pm',
      amSlotKey,
      pmSlotKey,
      activeHalf: now.getHours() < 12 ? 'AM' : 'PM',
      amStamp: completions.find((c) => c.slotKey === amSlotKey) || null,
      pmStamp: completions.find((c) => c.slotKey === pmSlotKey) || null,
    };
  }

  if (item.cadence === 'weekly') {
    const days = normalizeDaysOfWeek(item.daysOfWeek, item.pickupDayOfWeek ?? 5);
    const todayDow = todayDate.getDay();
    const daysUntilNext = Math.min(...days.map((d) => (d - todayDow + 7) % 7));
    const nextDate = new Date(
      todayDate.getFullYear(),
      todayDate.getMonth(),
      todayDate.getDate() + daysUntilNext
    );
    const nextSlotKey = localDateKey(nextDate);
    const nextDayLabel = WEEKDAY_SHORT_LABELS[nextDate.getDay()];

    const daysSincePrev = Math.min(...days.map((d) => (todayDow - d + 7) % 7 || 7));
    const prevDate = new Date(
      todayDate.getFullYear(),
      todayDate.getMonth(),
      todayDate.getDate() - daysSincePrev
    );
    const prevSlotKey = localDateKey(prevDate);
    const prevDayLabel = WEEKDAY_SHORT_LABELS[prevDate.getDay()];

    const activeSlotKey = daysUntilNext <= 1 ? nextSlotKey : prevSlotKey;
    const activeStamp = completions.find((c) => c.slotKey === activeSlotKey) || null;
    const settledFromPrevSlot = daysUntilNext >= 2 && Boolean(activeStamp);

    return {
      cadence: 'weekly',
      daysOfWeek: days,
      scheduleLabel: formatWeeklyDaysSummary(days),
      activeSlotKey,
      activeStamp,
      isDueToday: daysUntilNext === 0,
      daysUntilNext,
      nextDayLabel,
      prevDayLabel,
      settledFromPrevSlot,
    };
  }

  if (item.cadence === 'alternating_week') {
    const pickupDay = clampInt(item.pickupDayOfWeek, 0, 6, 4);
    const daysUntilPickup = (pickupDay - todayDate.getDay() + 7) % 7;
    const cyclePickupDate = new Date(
      todayDate.getFullYear(),
      todayDate.getMonth(),
      todayDate.getDate() + daysUntilPickup
    );
    const cycleSlotKey = localDateKey(cyclePickupDate);
    const anchor = parseDateKey(item.anchorDate || '2026-01-01');
    const anchorSunday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - anchor.getDay());
    const cycleSunday = new Date(
      cyclePickupDate.getFullYear(),
      cyclePickupDate.getMonth(),
      cyclePickupDate.getDate() - cyclePickupDate.getDay()
    );
    const weekDiff = Math.round(calendarDaysBetween(anchorSunday, cycleSunday) / 7);
    const isWeekA = ((weekDiff % 2) + 2) % 2 === 0;
    const weekALabel = item.weekALabel?.trim() || 'Trash + Recycling';
    const weekBLabel = item.weekBLabel?.trim() || 'Trash Only';

    return {
      cadence: 'alternating_week',
      cycleSlotKey,
      currentLabel: isWeekA ? weekALabel : weekBLabel,
      nextLabel: isWeekA ? weekBLabel : weekALabel,
      isWeekA,
      daysUntilPickup,
      pickupDayLabel: WEEKDAY_SHORT_LABELS[pickupDay],
      pickupStamp: completions.find((c) => c.slotKey === cycleSlotKey) || null,
    };
  }

  if (item.cadence === 'every_n_days') {
    const intervalDays = clampInt(item.intervalDays, 1, 365, 7);
    const sorted = completions
      .slice()
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
    const lastStamp = sorted[0] || null;
    if (!lastStamp) {
      return {
        cadence: 'every_n_days',
        todaySlotKey: todayKey,
        intervalDays,
        isDoneToday: false,
        daysElapsed: null,
        daysRemaining: 0,
        daysOverdue: 0,
        isDueToday: true,
        isOverdue: false,
        progressRatio: 1,
        lastStamp: null,
      };
    }

    const lastDateKey = localDateKey(new Date(lastStamp.completedAt));
    const lastDate = parseDateKey(lastDateKey);
    const daysElapsed = Math.max(0, calendarDaysBetween(lastDate, todayDate));
    const remainingRaw = intervalDays - daysElapsed;

    return {
      cadence: 'every_n_days',
      todaySlotKey: todayKey,
      intervalDays,
      isDoneToday: daysElapsed === 0,
      daysElapsed,
      daysRemaining: Math.max(0, remainingRaw),
      daysOverdue: remainingRaw < 0 ? Math.abs(remainingRaw) : 0,
      isDueToday: remainingRaw === 0,
      isOverdue: remainingRaw < 0,
      progressRatio: Math.min(1, daysElapsed / intervalDays),
      lastStamp,
    };
  }

  return {
    cadence: 'daily',
    todaySlotKey: todayKey,
    dayStamp: completions.find((c) => c.slotKey === todayKey) || null,
  };
}

export function toggleRoutineCheckIn(
  item: RoutineItem,
  slotKey: string,
  profileId: string | null | undefined,
  nowIso: string
): RoutineItem {
  const existing = item.completions || [];
  const otherUnchecks = (item.uncheckedSlots || []).filter((u) => u.slotKey !== slotKey);
  const stamp = existing.find((c) => c.slotKey === slotKey);
  if (stamp) {
    return {
      ...item,
      completions: existing.filter((c) => c.slotKey !== slotKey),
      uncheckedSlots: sanitizeUnchecks([
        { slotKey, uncheckedAt: uncheckTimeFor(stamp, nowIso) },
        ...otherUnchecks,
      ]),
    };
  }

  const nextStamp: RoutineCompletionStamp = {
    slotKey,
    completedAt: nowIso,
    profileId: profileId || null,
  };
  const nextList = [nextStamp, ...existing].slice(0, MAX_ROUTINE_COMPLETIONS);
  const checked: RoutineItem = { ...item, completions: nextList };
  if (otherUnchecks.length > 0) {
    checked.uncheckedSlots = otherUnchecks;
  } else {
    delete checked.uncheckedSlots;
  }
  return checked;
}

/**
 * Records an uncheck for every check-in `previous` had that `next` no longer has (for example after
 * "Clear history"), so the other devices' copies of those check-ins don't come back on sync.
 */
export function recordRemovedCheckIns(
  previous: RoutineItem | undefined,
  next: RoutineItem,
  nowIso: string
): RoutineItem {
  if (!previous) return next;
  const keptSlots = new Set((next.completions || []).map((c) => c.slotKey));
  const removed = (previous.completions || [])
    .filter((c) => !keptSlots.has(c.slotKey))
    .map((c) => ({ slotKey: c.slotKey, uncheckedAt: uncheckTimeFor(c, nowIso) }));
  if (removed.length === 0) return next;
  return {
    ...next,
    uncheckedSlots: sanitizeUnchecks([
      ...removed,
      ...(previous.uncheckedSlots || []),
      ...(next.uncheckedSlots || []),
    ]),
  };
}

/**
 * Combines two devices' check-ins for the same routine: every check-in from either side is kept,
 * unless someone took it back after it was made. When both sides checked the same slot, the earlier
 * check-in is kept, so both devices settle on the same one.
 */
export function mergeRoutineCheckIns(
  a: RoutineItem,
  b: RoutineItem
): { completions: RoutineCompletionStamp[]; uncheckedSlots: RoutineUncheckMark[] } {
  const uncheckedSlots = sanitizeUnchecks([...(a.uncheckedSlots || []), ...(b.uncheckedSlots || [])]);
  const uncheckedAtBySlot = new Map(uncheckedSlots.map((u) => [u.slotKey, isoMs(u.uncheckedAt)]));

  const earliestBySlot = new Map<string, RoutineCompletionStamp>();
  for (const stamp of [...(a.completions || []), ...(b.completions || [])]) {
    const takenBackAt = uncheckedAtBySlot.get(stamp.slotKey);
    if (takenBackAt !== undefined && takenBackAt >= isoMs(stamp.completedAt)) continue;
    const existing = earliestBySlot.get(stamp.slotKey);
    if (
      !existing ||
      isoMs(stamp.completedAt) < isoMs(existing.completedAt) ||
      (isoMs(stamp.completedAt) === isoMs(existing.completedAt) &&
        String(stamp.profileId ?? '') < String(existing.profileId ?? ''))
    ) {
      earliestBySlot.set(stamp.slotKey, stamp);
    }
  }

  return {
    completions: sanitizeCompletions([...earliestBySlot.values()]),
    uncheckedSlots,
  };
}

export function swapAlternatingWeekParity(anchorDate: string | undefined, now: Date): string {
  const base = parseDateKey(
    anchorDate && /^\d{4}-\d{2}-\d{2}$/.test(anchorDate) ? anchorDate : localDateKey(now)
  );
  base.setDate(base.getDate() - 7);
  return localDateKey(base);
}
