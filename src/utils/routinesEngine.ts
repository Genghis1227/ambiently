import { localDateKey, parseDateKey } from './dateKey';
import {
  MAX_ROUTINES_PER_WIDGET,
  MAX_ROUTINE_COMPLETIONS,
  type RoutineCadenceType,
  type RoutineCompletionStamp,
  type RoutineItem,
} from '../types/phase2Widgets';

export const WEEKDAY_SHORT_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

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
  if (raw === 'am_pm' || raw === 'alternating_week' || raw === 'every_n_days') {
    return raw;
  }
  return 'daily';
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
  valid.sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());
  return valid.slice(0, MAX_ROUTINE_COMPLETIONS);
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
    };

    if (cadence === 'every_n_days') {
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
  const alreadyStamped = existing.some((c) => c.slotKey === slotKey);
  if (alreadyStamped) {
    return {
      ...item,
      completions: existing.filter((c) => c.slotKey !== slotKey),
    };
  }

  const nextStamp: RoutineCompletionStamp = {
    slotKey,
    completedAt: nowIso,
    profileId: profileId || null,
  };
  const nextList = [nextStamp, ...existing].slice(0, MAX_ROUTINE_COMPLETIONS);
  return {
    ...item,
    completions: nextList,
  };
}

export function swapAlternatingWeekParity(anchorDate: string | undefined, now: Date): string {
  const base = parseDateKey(
    anchorDate && /^\d{4}-\d{2}-\d{2}$/.test(anchorDate) ? anchorDate : localDateKey(now)
  );
  base.setDate(base.getDate() - 7);
  return localDateKey(base);
}
