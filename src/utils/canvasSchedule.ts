import type { CanvasScheduleRule } from '../types/dashboard';

export const MAX_CANVAS_SCHEDULES = 12;
export const CANVAS_SCHEDULE_SNOOZE_STORAGE_KEY = 'ambiently_canvas_schedule_snooze';

const TIME_HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

let memoryScheduleSnooze: { ruleId: string; untilMs: number } | null = null;
let scheduleSeq = 0;

export function createCanvasScheduleRuleId(): string {
  scheduleSeq += 1;
  return `sched-${Date.now().toString(36)}-${scheduleSeq}`;
}

export function isValidTimeHHMM(value: string): boolean {
  return TIME_HHMM_RE.test((value || '').trim());
}

function parseMinutesSinceMidnight(hhmm: string): number | null {
  const match = TIME_HHMM_RE.exec((hhmm || '').trim());
  if (!match) return null;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

function normalizeDaysOfWeek(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const set = new Set<number>();
  for (const d of raw) {
    const num = Number(d);
    if (Number.isInteger(num) && num >= 0 && num <= 6) {
      set.add(num);
    }
  }
  if (set.size === 0 || set.size === 7) return undefined;
  return [...set].sort((a, b) => a - b);
}

export function normalizeCanvasSchedules(raw: unknown): CanvasScheduleRule[] {
  if (!Array.isArray(raw)) return [];
  const out: CanvasScheduleRule[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (out.length >= MAX_CANVAS_SCHEDULES) break;
    const item = raw[i] as Partial<CanvasScheduleRule> | null | undefined;
    if (!item || typeof item !== 'object') continue;
    const tabId = typeof item.tabId === 'string' ? item.tabId.trim() : '';
    const startTime = typeof item.startTime === 'string' ? item.startTime.trim() : '';
    const endTime = typeof item.endTime === 'string' ? item.endTime.trim() : '';
    if (!tabId || !isValidTimeHHMM(startTime) || !isValidTimeHHMM(endTime)) continue;

    out.push({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `sched-${i + 1}`,
      tabId,
      label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : undefined,
      startTime,
      endTime,
      daysOfWeek: normalizeDaysOfWeek(item.daysOfWeek),
      enabled: item.enabled !== false,
    });
  }
  return out;
}

export function isTimeInScheduleRule(now: Date, rule: CanvasScheduleRule): boolean {
  if (!rule.enabled) return false;
  const startMin = parseMinutesSinceMidnight(rule.startTime);
  const endMin = parseMinutesSinceMidnight(rule.endTime);
  if (startMin === null || endMin === null || startMin === endMin) {
    return false;
  }

  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayDay = now.getDay();
  const allowedDays =
    Array.isArray(rule.daysOfWeek) && rule.daysOfWeek.length > 0 && rule.daysOfWeek.length < 7
      ? new Set(rule.daysOfWeek)
      : null;

  if (startMin < endMin) {
    if (nowMin < startMin || nowMin >= endMin) return false;
    return !allowedDays || allowedDays.has(todayDay);
  }

  // Overnight window (e.g., 21:00 -> 06:00)
  if (nowMin >= startMin) {
    return !allowedDays || allowedDays.has(todayDay);
  }
  if (nowMin < endMin) {
    const yesterdayDay = (todayDay + 6) % 7;
    return !allowedDays || allowedDays.has(yesterdayDay);
  }
  return false;
}

export function resolveScheduleWindowEndMs(now: Date, rule: CanvasScheduleRule): number {
  const startMin = parseMinutesSinceMidnight(rule.startTime) ?? 0;
  const endMin = parseMinutesSinceMidnight(rule.endTime) ?? 0;
  const endHour = Math.floor(endMin / 60);
  const endMinute = endMin % 60;
  const target = new Date(now.getTime());
  target.setSeconds(0, 0);
  target.setHours(endHour, endMinute, 0, 0);

  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (startMin > endMin && nowMin >= startMin) {
    target.setDate(target.getDate() + 1);
  } else if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 1);
  }
  return target.getTime();
}

export function resolveActiveCanvasSchedule(params: {
  now: Date;
  enabled?: boolean;
  followOnThisDisplay?: boolean;
  rules?: CanvasScheduleRule[];
  visibleTabIds: ReadonlySet<string>;
}): CanvasScheduleRule | null {
  const { now, enabled, followOnThisDisplay = true, rules, visibleTabIds } = params;
  if (!enabled || !followOnThisDisplay || !Array.isArray(rules) || rules.length === 0) {
    return null;
  }

  for (const rule of rules) {
    if (!rule.enabled || !visibleTabIds.has(rule.tabId)) continue;
    if (isTimeInScheduleRule(now, rule)) {
      return rule;
    }
  }
  return null;
}

export function computeScheduleSnoozeUntil(
  nowMs: number,
  snoozeMin: number | undefined,
  rule: CanvasScheduleRule,
  nowDate = new Date(nowMs)
): number {
  const effectiveMin = snoozeMin === undefined ? 15 : snoozeMin;
  if (effectiveMin <= 0) {
    return resolveScheduleWindowEndMs(nowDate, rule);
  }
  return nowMs + effectiveMin * 60 * 1000;
}

export function readCanvasScheduleSnooze(): { ruleId: string; untilMs: number } | null {
  if (typeof sessionStorage === 'undefined') {
    return memoryScheduleSnooze;
  }
  try {
    const raw = sessionStorage.getItem(CANVAS_SCHEDULE_SNOOZE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ruleId?: unknown; untilMs?: unknown };
    if (
      typeof parsed?.ruleId === 'string' &&
      parsed.ruleId &&
      typeof parsed?.untilMs === 'number' &&
      Number.isFinite(parsed.untilMs)
    ) {
      return { ruleId: parsed.ruleId, untilMs: parsed.untilMs };
    }
    return null;
  } catch {
    return null;
  }
}

export function writeCanvasScheduleSnooze(ruleId: string, untilMs: number): void {
  const entry = { ruleId, untilMs };
  memoryScheduleSnooze = entry;
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.setItem(CANVAS_SCHEDULE_SNOOZE_STORAGE_KEY, JSON.stringify(entry));
    } catch {
      // Ignore sandboxed storage failure
    }
  }
}

export function clearCanvasScheduleSnooze(): void {
  memoryScheduleSnooze = null;
  if (typeof sessionStorage !== 'undefined') {
    try {
      sessionStorage.removeItem(CANVAS_SCHEDULE_SNOOZE_STORAGE_KEY);
    } catch {
      // Ignore
    }
  }
}
