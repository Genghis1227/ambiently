/**
 * The date older versions stored in every new countdown (and in the starter board's countdown).
 * It is midnight UTC, so it showed as 24 December in the Americas, and it goes into the past after
 * 25 December 2026. A date saved from the countdown's settings always has milliseconds
 * (`toISOString()`), so this exact text only ever means "no date chosen yet".
 */
export const LEGACY_DEFAULT_COUNTDOWN_TARGET = '2026-12-25T00:00:00Z';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The next 25 December at local midnight. On 25 December itself it stays on that day (so the
 * countdown shows that the day has arrived), and moves to next year from 26 December.
 */
export function nextChristmasLocal(now: Date = new Date()): Date {
  const thisYear = new Date(now.getFullYear(), 11, 25, 0, 0, 0, 0);
  if (now.getTime() < thisYear.getTime() + DAY_MS) return thisYear;
  return new Date(now.getFullYear() + 1, 11, 25, 0, 0, 0, 0);
}

/** The moment a countdown counts down to: its own date, or the next 25 December when it has none. */
export function resolveCountdownTarget(raw: unknown, now: Date = new Date()): Date {
  if (typeof raw === 'string' && raw.trim() && raw.trim() !== LEGACY_DEFAULT_COUNTDOWN_TARGET) {
    const parsed = new Date(raw.trim());
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return nextChristmasLocal(now);
}
