import type { ChoreItem, ChoreDone, ChoresWidgetConfig, ChorePerson, ChoreReward } from '../types/dashboard';
import { localDateKey, startOfWeek } from './timePrefs';

// Chores reset by comparing the period a chore was finished in with the current one, so nothing
// has to be written at midnight: a daily chore finished yesterday simply isn't done today.

export function periodKey(chore: ChoreItem, now: Date, weekStartsOn: 0 | 1): string {
  if (chore.repeat === 'weekly') return `week-${localDateKey(startOfWeek(now, weekStartsOn))}`;
  if (chore.repeat === 'once') return 'once';
  return localDateKey(now);
}

export function isDoneNow(chore: ChoreItem, done: ChoresWidgetConfig['done'], now: Date, weekStartsOn: 0 | 1): boolean {
  const entry = done?.[chore.id];
  return Boolean(entry && entry.period === periodKey(chore, now, weekStartsOn));
}

/** Whether a chore shows on the board today. */
export function isShownToday(chore: ChoreItem, done: ChoresWidgetConfig['done'], now: Date): boolean {
  if (chore.repeat === 'daily' && chore.days && chore.days.length > 0 && !chore.days.includes(now.getDay())) {
    return false;
  }
  if (chore.repeat === 'once') {
    const entry = done?.[chore.id];
    // A one-off chore stays visible on the day it was finished, then goes away
    if (entry && entry.on !== localDateKey(now)) return false;
  }
  return true;
}

/** The config changes for tapping a chore: marks it done by `personId`, or undoes it if it's done. */
export function toggleChore(
  config: ChoresWidgetConfig,
  choreId: string,
  personId: string | undefined,
  now: Date,
  weekStartsOn: 0 | 1
): Pick<ChoresWidgetConfig, 'done' | 'stars'> | null {
  const chore = config.chores?.find((c) => c.id === choreId);
  if (!chore) return null;
  const done = { ...(pruneDone(config) || {}) };
  const stars = { ...(config.stars || {}) };
  const entry = done[choreId];

  if (entry && entry.period === periodKey(chore, now, weekStartsOn)) {
    // Undo: take back the stars it gave
    if (entry.by && entry.stars) stars[entry.by] = Math.max(0, (stars[entry.by] || 0) - entry.stars);
    delete done[choreId];
    return { done, stars };
  }

  const by = chore.personId || personId;
  const earned = by ? Math.max(0, chore.stars || 0) : 0;
  const record: ChoreDone = { period: periodKey(chore, now, weekStartsOn), stars: earned, on: localDateKey(now) };
  if (by) record.by = by;
  done[choreId] = record;
  if (by && earned) stars[by] = (stars[by] || 0) + earned;
  return { done, stars };
}

export function redeemReward(
  config: ChoresWidgetConfig,
  rewardId: string,
  personId: string
): Pick<ChoresWidgetConfig, 'stars'> | null {
  const reward = config.rewards?.find((r) => r.id === rewardId);
  if (!reward) return null;
  const balance = config.stars?.[personId] || 0;
  if (balance < reward.cost) return null;
  return { stars: { ...(config.stars || {}), [personId]: balance - reward.cost } };
}

/** Drops finished records for chores that no longer exist, so the config doesn't keep growing. */
export function pruneDone(config: ChoresWidgetConfig): ChoresWidgetConfig['done'] {
  const ids = new Set((config.chores || []).map((c) => c.id));
  const done: NonNullable<ChoresWidgetConfig['done']> = {};
  for (const [id, entry] of Object.entries(config.done || {})) {
    if (ids.has(id)) done[id] = entry;
  }
  return done;
}

export const PERSON_COLORS = ['#3b82f6', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#84cc16'];

export function starterChores(): Required<Pick<ChoresWidgetConfig, 'people' | 'chores' | 'rewards'>> {
  const people: ChorePerson[] = [
    { id: 'person-1', name: 'Alex', color: PERSON_COLORS[0], emoji: '🦊' },
    { id: 'person-2', name: 'Sam', color: PERSON_COLORS[1], emoji: '🐼' },
  ];
  const chores: ChoreItem[] = [
    { id: 'chore-1', title: 'Make bed', emoji: '🛏️', personId: 'person-1', repeat: 'daily', stars: 1 },
    { id: 'chore-2', title: 'Brush teeth', emoji: '🪥', personId: 'person-1', repeat: 'daily', stars: 1 },
    { id: 'chore-3', title: 'Make bed', emoji: '🛏️', personId: 'person-2', repeat: 'daily', stars: 1 },
    { id: 'chore-4', title: 'Clear the table', emoji: '🍽️', personId: 'person-2', repeat: 'daily', stars: 2 },
    { id: 'chore-5', title: 'Feed the pet', emoji: '🐶', personId: null, repeat: 'daily', stars: 1 },
    { id: 'chore-6', title: 'Put away laundry', emoji: '🧺', personId: null, repeat: 'weekly', stars: 3 },
  ];
  const rewards: ChoreReward[] = [
    { id: 'reward-1', title: 'Ice cream', emoji: '🍦', cost: 10 },
    { id: 'reward-2', title: 'Pick the movie', emoji: '🎬', cost: 20 },
  ];
  return { people, chores, rewards };
}
