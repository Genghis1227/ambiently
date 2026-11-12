import type {
  ActiveChoreInstance,
  ChoreCompletionSplit,
  ChoreEngineSnapshot,
  ChoreTemplate,
  LedgerEntry,
  Profile,
  TrophyItem,
  WishlistReward,
} from '../types/chores';
import { localDateKey } from './dateKey';

/**
 * Calming, desaturated low-arousal profile palette matching Ambiently's design language
 * (Sage Green, Slate Blue, Dusty Rose, Warm Ochre, Muted Lavender, Soft Terracotta, Seafoam, Warm Greige).
 */
export const CHORE_PROFILE_COLORS = [
  '#6b8f71', // Sage Green
  '#648296', // Slate Blue
  '#b5838d', // Dusty Rose
  '#c99b66', // Warm Ochre
  '#8b7fa8', // Muted Lavender
  '#c47d68', // Soft Terracotta
  '#5c8d89', // Seafoam Slate
  '#8c857b', // Warm Greige
] as const;

/**
 * Parses a "YYYY-MM-DD" string into a local midnight Date object.
 */
export function parseLocalDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1, 0, 0, 0, 0);
}

/**
 * Whole calendar days between two "YYYY-MM-DD" date keys (b - a).
 */
export function daysBetweenDateKeys(startKey: string, endKey: string): number {
  const a = parseLocalDateKey(startKey);
  const b = parseLocalDateKey(endKey);
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / (1000 * 60 * 60 * 24));
}

/**
 * Returns the Sunday "YYYY-MM-DD" date key starting the calendar week of `dateKey`.
 */
export function getWeekStartDateKey(dateKey: string): string {
  const date = parseLocalDateKey(dateKey);
  const dayOfWeek = date.getDay(); // 0 (Sun) .. 6 (Sat)
  const sunday = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() - dayOfWeek,
    0,
    0,
    0,
    0
  );
  return localDateKey(sunday);
}

/**
 * Recomputes spendable `balance` and cumulative `lifetimePoints` for every profile
 * strictly from the immutable append-only audit ledger.
 */
export function recalculateProfilesFromLedger(profiles: Profile[], ledger: LedgerEntry[]): Profile[] {
  const entryById = new Map<string, LedgerEntry>();
  for (const entry of ledger) {
    entryById.set(entry.id, entry);
  }

  const balanceMap = new Map<string, number>();
  const lifetimeMap = new Map<string, number>();

  for (const p of profiles) {
    balanceMap.set(p.id, 0);
    lifetimeMap.set(p.id, 0);
  }

  // Process chronologically
  const sorted = [...ledger].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  for (const entry of sorted) {
    const pid = entry.profileId;
    const prevBalance = balanceMap.get(pid) ?? 0;
    const prevLifetime = lifetimeMap.get(pid) ?? 0;

    balanceMap.set(pid, prevBalance + entry.pointsDelta);

    if (entry.type === 'chore_completion') {
      if (entry.pointsDelta > 0) {
        lifetimeMap.set(pid, prevLifetime + entry.pointsDelta);
      }
    } else if (entry.type === 'manual_adjustment') {
      if (entry.pointsDelta > 0) {
        lifetimeMap.set(pid, prevLifetime + entry.pointsDelta);
      }
    } else if (entry.type === 'reversion') {
      // Check what original transaction this reversion offsets
      const original = entryById.get(entry.refId);
      if (original) {
        if (
          (original.type === 'chore_completion' || original.type === 'manual_adjustment') &&
          original.pointsDelta > 0
        ) {
          lifetimeMap.set(pid, Math.max(0, prevLifetime + entry.pointsDelta));
        }
      } else if (entry.pointsDelta < 0) {
        // Same-day chore self-reversion where refId is the instanceId
        lifetimeMap.set(pid, Math.max(0, prevLifetime + entry.pointsDelta));
      }
    }
  }

  return profiles.map((p) => ({
    ...p,
    balance: Math.max(0, Math.round(balanceMap.get(p.id) ?? 0)),
    lifetimePoints: Math.max(0, Math.round(lifetimeMap.get(p.id) ?? 0)),
  }));
}

/**
 * Pure append-only ledger selector deriving `{ balance, lifetimePoints }` for a single `profileId`.
 */
export function selectProfilePointsFromLedger(
  ledger: LedgerEntry[],
  profileId: string
): { balance: number; lifetimePoints: number } {
  const [derived] = recalculateProfilesFromLedger(
    [{ id: profileId, name: profileId, color: '#6b8f71', balance: 0, lifetimePoints: 0 }],
    ledger
  );
  return {
    balance: derived?.balance ?? 0,
    lifetimePoints: derived?.lifetimePoints ?? 0,
  };
}

/**
 * Validates shared chore point splits, enforcing whole-number non-negative awards
 * whose sum strictly equals `expectedTotalPoints`.
 */
export function validateChoreSplits(
  splits: ChoreCompletionSplit[],
  expectedTotalPoints: number
):
  | { valid: true; normalizedSplits: ChoreCompletionSplit[] }
  | { valid: false; error: string } {
  if (!Array.isArray(splits) || splits.length === 0) {
    return { valid: false, error: 'At least one profile split is required.' };
  }

  const normalized: ChoreCompletionSplit[] = [];
  for (const s of splits) {
    if (!s || typeof s.profileId !== 'string' || !s.profileId.trim()) {
      return { valid: false, error: 'Every split entry must reference a valid profileId.' };
    }
    if (
      typeof s.pointsAwarded !== 'number' ||
      !Number.isFinite(s.pointsAwarded) ||
      !Number.isInteger(s.pointsAwarded) ||
      s.pointsAwarded < 0
    ) {
      return {
        valid: false,
        error: 'Point splits must be non-negative whole numbers.',
      };
    }
    normalized.push({
      profileId: s.profileId.trim(),
      pointsAwarded: s.pointsAwarded,
    });
  }

  const filtered =
    expectedTotalPoints === 0
      ? [normalized[0]]
      : normalized.filter((c) => c.pointsAwarded > 0);

  if (filtered.length === 0) {
    return {
      valid: false,
      error: `Point split (0) must equal ${expectedTotalPoints} pts`,
    };
  }

  const sumSplits = filtered.reduce((acc, s) => acc + s.pointsAwarded, 0);
  if (sumSplits !== expectedTotalPoints) {
    return {
      valid: false,
      error: `Point split (${sumSplits}) must equal ${expectedTotalPoints} pts`,
    };
  }

  return { valid: true, normalizedSplits: filtered };
}

/**
 * Synchronizes WishlistReward statuses with each profile's current spendable balance:
 * - 'active_goal' -> 'unlocked' when profile.balance >= reward.pointsCost
 * - 'unlocked' -> 'active_goal' if profile.balance drops below reward.pointsCost before claiming
 */
export function syncRewardUnlockStates(
  rewards: WishlistReward[],
  profiles: Profile[]
): WishlistReward[] {
  const balanceByProfile = new Map(profiles.map((p) => [p.id, p.balance]));

  return rewards.map((reward) => {
    if (reward.status !== 'active_goal' && reward.status !== 'unlocked') {
      return reward;
    }
    const balance = balanceByProfile.get(reward.profileId) ?? 0;
    const isUnlocked = reward.pointsCost > 0 && balance >= reward.pointsCost;
    const nextStatus = isUnlocked ? 'unlocked' : 'active_goal';
    if (reward.status === nextStatus) return reward;
    return { ...reward, status: nextStatus };
  });
}

/**
 * Calculates the effective points a chore awards based on whether it is overdue
 * and the template's configured OverduePolicy ('full' | 'half' | 'zero' | 'custom').
 */
export function calculateEffectiveChorePoints(
  template: ChoreTemplate,
  isOverdue: boolean
): number {
  const basePoints = Math.max(0, Math.round(template.points));
  if (!isOverdue) return basePoints;

  switch (template.overduePolicy) {
    case 'full':
      return basePoints;
    case 'half':
      return Math.floor(basePoints * 0.5);
    case 'zero':
      return 0;
    case 'custom': {
      const pct = Math.min(100, Math.max(0, template.overdueCustomPct ?? 100));
      return Math.floor(basePoints * (pct / 100));
    }
    default:
      return basePoints;
  }
}

/**
 * Checks whether a given `dateKey` ("YYYY-MM-DD") is a valid scheduled day for `template`'s cadence.
 * Used to automatically expire orphaned pending instances when a template's schedule is edited
 * (e.g., when a chore created on Monday is changed to Weekly • Saturday).
 */
export function isDateMatchingTemplateCadence(
  template: ChoreTemplate,
  dateKey: string
): boolean {
  const date = parseLocalDateKey(dateKey);
  const dayOfWeek = date.getDay(); // 0 (Sun) .. 6 (Sat)

  switch (template.cadence) {
    case 'daily':
      return true;
    case 'weekdays':
      return dayOfWeek >= 1 && dayOfWeek <= 5;
    case 'weekends':
      return dayOfWeek === 0 || dayOfWeek === 6;
    case 'weekly': {
      if (template.weeklyAnyDay) return true;
      const days =
        template.daysOfWeek && template.daysOfWeek.length > 0 ? template.daysOfWeek : [0];
      return days.includes(dayOfWeek);
    }
    case 'interval': {
      const interval = Math.max(1, Math.round(template.intervalDays || 2));
      const anchor = template.intervalAnchorDate || dateKey;
      const diff = daysBetweenDateKeys(anchor, dateKey);
      return diff >= 0 && diff % interval === 0;
    }
    case 'bounty':
      return true;
    default:
      return false;
  }
}

/**
 * Determines whether a ChoreTemplate should schedule an ActiveChoreInstance on `dateKey`.
 */
export function isTemplateDueOnDate(
  template: ChoreTemplate,
  dateKey: string,
  existingInstances: ActiveChoreInstance[]
): boolean {
  const date = parseLocalDateKey(dateKey);
  const dayOfWeek = date.getDay(); // 0 (Sun) .. 6 (Sat)

  switch (template.cadence) {
    case 'daily':
      return true;
    case 'weekdays':
      return dayOfWeek >= 1 && dayOfWeek <= 5;
    case 'weekends':
      return dayOfWeek === 0 || dayOfWeek === 6;
    case 'weekly': {
      if (template.weeklyAnyDay) {
        const weekStartKey = getWeekStartDateKey(dateKey);
        const alreadyHandledThisWeek = existingInstances.some(
          (inst) =>
            inst.choreId === template.id &&
            inst.dateScheduled >= weekStartKey &&
            inst.dateScheduled <= dateKey &&
            (inst.status === 'pending' ||
              inst.status === 'awaiting_approval' ||
              inst.status === 'completed' ||
              inst.status === 'expired')
        );
        return !alreadyHandledThisWeek;
      }
      const days =
        template.daysOfWeek && template.daysOfWeek.length > 0 ? template.daysOfWeek : [0];
      return days.includes(dayOfWeek);
    }
    case 'interval': {
      const interval = Math.max(1, Math.round(template.intervalDays || 2));
      const anchor = template.intervalAnchorDate || dateKey;
      const diff = daysBetweenDateKeys(anchor, dateKey);
      return diff >= 0 && diff % interval === 0;
    }
    case 'bounty': {
      // Bounty chores are one-off claimable tasks: only spawn if no active/completed instance exists
      const hasExisting = existingInstances.some(
        (inst) =>
          inst.choreId === template.id &&
          (inst.status === 'pending' ||
            inst.status === 'awaiting_approval' ||
            inst.status === 'completed')
      );
      return !hasExisting;
    }
    default:
      return false;
  }
}

/**
 * Checks if an instance can be self-reverted by a child on the kiosk.
 * Kids can only check and uncheck a chore freely if `dateScheduled === todayLocalYYYYMMDD`
 * (and within the same calendar day). Past-day instances lock permanently at midnight.
 */
export function canSelfRevertInstance(instance: ActiveChoreInstance, now: Date): boolean {
  if (instance.status !== 'completed' && instance.status !== 'awaiting_approval') {
    return false;
  }
  const todayKey = localDateKey(now);
  if (instance.dateScheduled !== todayKey) {
    return false;
  }
  if (instance.completedAt) {
    const completedDateKey = localDateKey(new Date(instance.completedAt));
    return completedDateKey === todayKey;
  }
  return true;
}

/**
 * Prunes heavy metadata (`imageUrl`, `sourceUrl`) from TrophyItems belonging to prior calendar years,
 * condensing them into lightweight permanent honors records.
 */
export function prunePriorYearTrophies(
  trophies: TrophyItem[],
  currentYear: number
): { trophies: TrophyItem[]; pruned: boolean } {
  let pruned = false;
  const next = trophies.map((t) => {
    if (t.year < currentYear && (t.imageUrl !== undefined || t.sourceUrl !== undefined)) {
      pruned = true;
      const { imageUrl: _img, sourceUrl: _src, ...lightweightRecord } = t;
      return lightweightRecord;
    }
    return t;
  });
  return { trophies: next, pruned };
}

/**
 * Midnight Rollover & Daily Generation Engine (`00:00:00` local time).
 * - Evaluates day boundaries without requiring a page refresh.
 * - Freezes generation & expiration when `vacationMode` is active.
 * - Transitions past-day uncompleted instances to `expired` (`rolloverUntilDone === false`)
 *   or carries them forward with `isOverdue: true` (`rolloverUntilDone === true`).
 * - Generates today's scheduled instances.
 * - Runs annual Trophy Case pruning on year rollover.
 */
export function evaluateChoreRollover(
  snapshot: ChoreEngineSnapshot,
  now: Date = new Date()
): { snapshot: ChoreEngineSnapshot; changed: boolean } {
  const todayKey = localDateKey(now);
  const currentYear = now.getFullYear();
  let changed = false;

  // 1. Annual Trophy Pruning (runs even if vacation mode is on)
  const { trophies: nextTrophies, pruned } = prunePriorYearTrophies(
    snapshot.trophies,
    currentYear
  );
  if (pruned || snapshot.householdSettings.lastPrunedYear !== currentYear) {
    changed = changed || pruned;
  }

  // 2. If Vacation Mode is active, freeze daily generation and midnight expirations
  if (snapshot.householdSettings.vacationMode) {
    if (!changed) return { snapshot, changed: false };
    return {
      snapshot: {
        ...snapshot,
        trophies: nextTrophies,
        householdSettings: {
          ...snapshot.householdSettings,
          lastPrunedYear: currentYear,
        },
        updated_at: now.toISOString(),
      },
      changed: true,
    };
  }

  const templateMap = new Map(snapshot.templates.map((t) => [t.id, t]));
  const profileRoleMap = new Map(snapshot.profiles.map((p) => [p.id, p.role]));
  let nextInstances = [...snapshot.instances];
  let nextLedger = [...snapshot.ledger];

  // 2b. Auto-settle any awaiting_approval instances completed solely by parent profile(s)
  nextInstances = nextInstances.map((inst) => {
    if (inst.status === 'awaiting_approval') {
      const tpl = templateMap.get(inst.choreId);
      const completers =
        inst.completedBy && inst.completedBy.length > 0
          ? inst.completedBy
          : tpl && tpl.assignedTo !== 'shared'
            ? [
                {
                  profileId: tpl.assignedTo,
                  pointsAwarded: calculateEffectiveChorePoints(tpl, inst.isOverdue),
                },
              ]
            : [];
      const isOnlyParents =
        completers.length > 0 &&
        completers.every((c) => profileRoleMap.get(c.profileId) === 'parent');
      if (isOnlyParents) {
        changed = true;
        const completedIso = inst.completedAt || now.toISOString();
        for (const split of completers) {
          if (split.pointsAwarded > 0) {
            nextLedger.push({
              id: `ledger-auto-${inst.instanceId}-${split.profileId}`,
              timestamp: completedIso,
              type: 'chore_completion',
              refId: inst.instanceId,
              profileId: split.profileId,
              pointsDelta: split.pointsAwarded,
              note: `${tpl?.title || 'Chore'}${inst.isOverdue ? ' (Overdue)' : ''}`,
              approvedBy: 'auto',
              canRevert: true,
            });
          }
        }
        return {
          ...inst,
          status: 'completed' as const,
          completedBy: completers,
          completedAt: completedIso,
        };
      }
    }
    return inst;
  });

  // 3. Process past-day pending instances
  // Track overdue instances per choreId so at most one active overdue carry-over exists per template
  const overdueByChoreId = new Map<string, ActiveChoreInstance>();
  const currentWeekStartKey = getWeekStartDateKey(todayKey);

  nextInstances = nextInstances.map((inst) => {
    if (inst.status === 'pending') {
      const tpl = templateMap.get(inst.choreId);

      // If the template was deleted or edited so that `inst.dateScheduled` no longer matches
      // its configured day-of-week/cadence (e.g. a Saturday chore with an old Monday instance),
      // immediately dismiss/expire it so it never appears as active or overdue on the wrong day.
      if (!tpl || !isDateMatchingTemplateCadence(tpl, inst.dateScheduled)) {
        changed = true;
        return { ...inst, status: 'expired' as const, isOverdue: false };
      }

      if (inst.dateScheduled < todayKey) {
        // For "Weekly — Any Day (1x / Week)" chores, keep the pending instance active
        // throughout the current calendar week (Sun–Sat) without marking it overdue mid-week
        if (
          tpl.cadence === 'weekly' &&
          tpl.weeklyAnyDay &&
          !inst.isOverdue &&
          inst.dateScheduled >= currentWeekStartKey
        ) {
          changed = true;
          return {
            ...inst,
            instanceId: `${inst.choreId}_${todayKey}`,
            dateScheduled: todayKey,
            isOverdue: false,
          };
        }

        const daysLate = daysBetweenDateKeys(inst.dateScheduled, todayKey);
        // Auto-dismiss overdue tasks after 24 whole hours (daysLate > 1) or if rolloverUntilDone is disabled
        if (!tpl.rolloverUntilDone || daysLate > 1) {
          changed = true;
          return { ...inst, status: 'expired' as const, isOverdue: false };
        }
        if (!inst.isOverdue) {
          changed = true;
          return { ...inst, isOverdue: true };
        }
      }
    }
    return inst;
  });

  // Deduplicate multiple pending overdue carry-overs for the same template (keep the most recent one)
  for (const inst of nextInstances) {
    if (inst.status === 'pending' && inst.isOverdue) {
      const prev = overdueByChoreId.get(inst.choreId);
      if (!prev || inst.dateScheduled > prev.dateScheduled) {
        overdueByChoreId.set(inst.choreId, inst);
      }
    }
  }

  nextInstances = nextInstances.map((inst) => {
    if (inst.status === 'pending' && inst.isOverdue) {
      const winner = overdueByChoreId.get(inst.choreId);
      if (winner && winner.instanceId !== inst.instanceId) {
        changed = true;
        return { ...inst, status: 'expired' as const, isOverdue: false };
      }
    }
    return inst;
  });

  // 4. Spawn today's scheduled instances
  const existingInstanceIds = new Set(nextInstances.map((i) => i.instanceId));
  for (const tpl of snapshot.templates) {
    const instanceId = `${tpl.id}_${todayKey}`;
    if (existingInstanceIds.has(instanceId)) continue;

    // For bounty or interval templates that already have an active overdue carry-over, don't spawn a duplicate
    if (
      (tpl.cadence === 'bounty' || tpl.cadence === 'interval') &&
      overdueByChoreId.has(tpl.id)
    ) {
      continue;
    }

    if (isTemplateDueOnDate(tpl, todayKey, nextInstances)) {
      nextInstances.push({
        instanceId,
        choreId: tpl.id,
        dateScheduled: todayKey,
        status: 'pending',
        isOverdue: false,
      });
      existingInstanceIds.add(instanceId);
      changed = true;
    }
  }

  // 5. Prune expired/completed instances older than 45 days so the snapshot stays compact
  const cutoffDate = new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000);
  const cutoffKey = localDateKey(cutoffDate);
  const beforePruneCount = nextInstances.length;
  nextInstances = nextInstances.filter((inst) => {
    if (inst.status === 'pending' || inst.status === 'awaiting_approval') return true;
    return inst.dateScheduled >= cutoffKey;
  });
  if (nextInstances.length !== beforePruneCount) {
    changed = true;
  }

  // 6. Recompute balances & reward unlock states
  const nextProfiles = recalculateProfilesFromLedger(snapshot.profiles, nextLedger);
  const nextRewards = syncRewardUnlockStates(snapshot.rewards, nextProfiles);

  const rolloverDateChanged = snapshot.householdSettings.lastRolloverDate !== todayKey;
  if (!changed && !rolloverDateChanged) {
    return { snapshot, changed: false };
  }

  return {
    snapshot: {
      ...snapshot,
      profiles: nextProfiles,
      instances: nextInstances,
      rewards: nextRewards,
      trophies: nextTrophies,
      ledger: nextLedger,
      householdSettings: {
        ...snapshot.householdSettings,
        lastRolloverDate: todayKey,
        lastPrunedYear: currentYear,
      },
      updated_at: now.toISOString(),
    },
    changed: true,
  };
}

/**
 * Conflict Resolution (Parent Authoritative Override):
 * In any sync conflict between offline kiosk actions and remote updates,
 * parent actions via Supabase strictly override local state.
 */
export function mergeChoreSnapshotsAuthoritative(
  local: ChoreEngineSnapshot,
  remote: ChoreEngineSnapshot
): ChoreEngineSnapshot {
  const localParentTime = Date.parse(local.lastParentActionAt || '') || 0;
  const remoteParentTime = Date.parse(remote.lastParentActionAt || '') || 0;
  const localUpdatedTime = Date.parse(local.updated_at || '') || 0;
  const remoteUpdatedTime = Date.parse(remote.updated_at || '') || 0;

  // If remote has a newer parent action, or remote is newer overall, remote parent decisions win strictly
  const remoteIsParentAuthoritative =
    remoteParentTime > localParentTime || remoteUpdatedTime >= localUpdatedTime;

  // 1. Merge Ledger (append-only union by id, where remote PIN-approved entries override conflicting local auto entries)
  const mergedLedgerMap = new Map<string, LedgerEntry>();
  const primaryLedger = remoteIsParentAuthoritative ? remote.ledger : local.ledger;
  const secondaryLedger = remoteIsParentAuthoritative ? local.ledger : remote.ledger;

  // Track refIds that have been explicitly acted on by a parent ('pin') in remote
  const parentActedRefIds = new Set(
    remote.ledger.filter((e) => e.approvedBy === 'pin').map((e) => e.refId)
  );

  for (const entry of secondaryLedger) {
    // If remote parent acted on this refId, drop conflicting local auto-entries not present in remote
    if (
      remoteIsParentAuthoritative &&
      entry.approvedBy !== 'pin' &&
      parentActedRefIds.has(entry.refId) &&
      !remote.ledger.some((re) => re.id === entry.id)
    ) {
      continue;
    }
    mergedLedgerMap.set(entry.id, entry);
  }
  for (const entry of primaryLedger) {
    mergedLedgerMap.set(entry.id, entry);
  }

  const mergedLedger = Array.from(mergedLedgerMap.values()).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // 2. Profiles & Templates & Household Settings: parent-authoritative source wins
  const baseSource = remoteIsParentAuthoritative ? remote : local;
  const otherSource = remoteIsParentAuthoritative ? local : remote;

  const deletedRewardIds = Array.from(
    new Set([...(local.deletedRewardIds || []), ...(remote.deletedRewardIds || [])])
  );
  const deletedRewardSet = new Set(deletedRewardIds);

  const deletedTemplateIds = Array.from(
    new Set([...(local.deletedTemplateIds || []), ...(remote.deletedTemplateIds || [])])
  );
  const deletedTemplateSet = new Set(deletedTemplateIds);

  // 3. Merge Instances: remote wins on conflict when remoteIsParentAuthoritative
  const instanceMap = new Map<string, ActiveChoreInstance>();
  for (const inst of remoteIsParentAuthoritative ? local.instances : remote.instances) {
    if (!deletedTemplateSet.has(inst.choreId)) {
      instanceMap.set(inst.instanceId, inst);
    }
  }
  for (const inst of remoteIsParentAuthoritative ? remote.instances : local.instances) {
    if (!deletedTemplateSet.has(inst.choreId)) {
      instanceMap.set(inst.instanceId, inst);
    }
  }

  // 4. Merge Rewards & Trophies: parent-authoritative source is the source of truth for rewards
  //    (so deleted rewards never resurrect from an older snapshot or DEFAULT_CHORE_SNAPSHOT),
  //    while preserving genuinely new kid proposals created after the authoritative snapshot's timestamp.
  const baseAuthTime = Math.max(
    Date.parse(baseSource.lastParentActionAt || '') || 0,
    Date.parse(baseSource.updated_at || '') || 0
  );
  const rewardMap = new Map<string, WishlistReward>();
  for (const r of baseSource.rewards) {
    if (!deletedRewardSet.has(r.id)) {
      rewardMap.set(r.id, r);
    }
  }
  for (const r of otherSource.rewards) {
    if (deletedRewardSet.has(r.id) || rewardMap.has(r.id)) continue;
    const createdTime = Date.parse(r.createdAt || '') || 0;
    if (r.status === 'needs_pricing' && createdTime > baseAuthTime) {
      rewardMap.set(r.id, r);
    }
  }

  const trophyMap = new Map<string, TrophyItem>();
  for (const t of baseSource.trophies) {
    trophyMap.set(t.id, t);
  }
  for (const t of otherSource.trophies) {
    if (trophyMap.has(t.id)) continue;
    const fulfilledTime = Date.parse(t.dateFulfilled || '') || 0;
    if (fulfilledTime > baseAuthTime) {
      trophyMap.set(t.id, t);
    }
  }

  const mergedTemplates = baseSource.templates.filter((t) => !deletedTemplateSet.has(t.id));
  const mergedProfiles = recalculateProfilesFromLedger(baseSource.profiles, mergedLedger);
  const mergedRewards = syncRewardUnlockStates(Array.from(rewardMap.values()), mergedProfiles);

  const latestParentAt =
    remoteParentTime >= localParentTime ? remote.lastParentActionAt : local.lastParentActionAt;
  const latestUpdatedAt =
    remoteUpdatedTime >= localUpdatedTime ? remote.updated_at : local.updated_at;

  return {
    id: 'household_chores',
    profiles: mergedProfiles,
    templates: mergedTemplates,
    instances: Array.from(instanceMap.values()),
    rewards: mergedRewards,
    trophies: Array.from(trophyMap.values()),
    ledger: mergedLedger,
    householdSettings: baseSource.householdSettings,
    deletedRewardIds,
    deletedTemplateIds,
    lastParentActionAt: latestParentAt,
    updated_at: latestUpdatedAt,
  };
}
