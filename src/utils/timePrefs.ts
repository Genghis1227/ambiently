import { useMemo } from 'react';
import { useDashboardStore } from '../store/dashboardStore';
import type { AppSettings } from '../types/dashboard';

// The board's clock format (12 or 24 hour) and first day of the week, from Settings. Every clock,
// calendar and planner tile reads them here so they all agree.

export interface TimePrefs {
  hour12: boolean;
  weekStartsOn: 0 | 1; // 0 = Sunday, 1 = Monday
}

export function resolveHour12(pref?: AppSettings['timeFormat']): boolean {
  if (pref === '12h') return true;
  if (pref === '24h') return false;
  try {
    return new Intl.DateTimeFormat([], { hour: 'numeric' }).resolvedOptions().hour12 ?? true;
  } catch {
    return true;
  }
}

export function toTimePrefs(settings: Pick<AppSettings, 'timeFormat' | 'weekStartsOn'>): TimePrefs {
  return {
    hour12: resolveHour12(settings.timeFormat),
    weekStartsOn: settings.weekStartsOn === 'monday' ? 1 : 0,
  };
}

export function useTimePrefs(): TimePrefs {
  const timeFormat = useDashboardStore((s) => s.settings.timeFormat);
  const weekStartsOn = useDashboardStore((s) => s.settings.weekStartsOn);
  return useMemo(() => toTimePrefs({ timeFormat, weekStartsOn }), [timeFormat, weekStartsOn]);
}

/** "3:05 PM" or "15:05" */
export function formatTime(date: Date, prefs: Pick<TimePrefs, 'hour12'>, timeZone?: string): string {
  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hourCycle: prefs.hour12 ? 'h12' : 'h23',
    ...(timeZone ? { timeZone } : {}),
  });
}

/** Hour labels for a day timeline: "9 AM" or "09:00" */
export function formatHourLabel(hour: number, prefs: Pick<TimePrefs, 'hour12'>): string {
  if (!prefs.hour12) return `${String(hour).padStart(2, '0')}:00`;
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

/** Midnight at the start of the week that contains `date`. */
export function startOfWeek(date: Date, weekStartsOn: 0 | 1): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const back = (d.getDay() - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - back);
  return d;
}

/** Weekday names in display order, e.g. ['Mon', 'Tue', ...] when the week starts on Monday. */
export function weekdayLabels(weekStartsOn: 0 | 1, style: 'short' | 'narrow' | 'long' = 'short'): string[] {
  const fmt = new Intl.DateTimeFormat([], { weekday: style });
  // 2023-01-01 was a Sunday
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2023, 0, 1 + ((i + weekStartsOn) % 7))));
}

/** The device's local date as YYYY-MM-DD. */
export function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
