import { create } from 'zustand';
import { db, DEFAULT_CHORE_SNAPSHOT } from '../services/db';
import type {
  ChoreEngineSnapshot,
  ChoreHouseholdSettings,
  ChoreTemplate,
  LedgerEntry,
  Profile,
  TrophyItem,
  WishlistReward,
} from '../types/chores';
import {
  calculateEffectiveChorePoints,
  canSelfRevertInstance,
  evaluateChoreRollover,
  mergeChoreSnapshotsAuthoritative,
  recalculateProfilesFromLedger,
  syncRewardUnlockStates,
} from '../utils/choreEngine';
import { localDateKey } from '../utils/timePrefs';
import { useProfileStore, registerProfileSyncListener } from '../stores/useProfileStore';
import type { HouseholdProfile } from '../types/profiles';

function mapHouseholdToChoreProfiles(
  householdProfiles: HouseholdProfile[],
  ledger: LedgerEntry[]
): Profile[] {
  const kidProfiles: Profile[] = householdProfiles
    .filter((hp) => hp.role === 'kid' && !hp.deletedAt)
    .map((hp) => ({
      id: hp.id,
      name: hp.name,
      role: hp.role,
      color: hp.color,
      avatarDataUrl: hp.avatarDataUrl,
      avatarUrl: hp.avatarDataUrl,
      emoji: hp.emoji,
      balance: 0,
      lifetimePoints: 0,
    }));
  return recalculateProfilesFromLedger(kidProfiles, ledger);
}

function reconcileTemplateAndRewardProfileIds(
  templates: ChoreTemplate[],
  rewards: WishlistReward[],
  householdProfiles: HouseholdProfile[]
): { templates: ChoreTemplate[]; rewards: WishlistReward[] } {
  const activeKids = householdProfiles.filter((hp) => hp.role === 'kid' && !hp.deletedAt);
  const validProfileIds = new Set(
    householdProfiles.filter((hp) => !hp.deletedAt).map((hp) => hp.id)
  );
  const firstKidId = activeKids[0]?.id || 'shared';
  const secondKidId = activeKids[1]?.id || firstKidId;

  const resolveAssignedTo = (assignedTo: string): string => {
    if (!assignedTo || assignedTo === 'shared') return 'shared';
    if (validProfileIds.has(assignedTo)) return assignedTo;
    if (assignedTo === 'p_kid_1' || assignedTo === 'p_olivia') return firstKidId;
    if (assignedTo === 'p_kid_2' || assignedTo === 'p_alyssa') return secondKidId;
    return firstKidId;
  };

  const resolveRewardProfileId = (profileId: string): string => {
    if (validProfileIds.has(profileId)) return profileId;
    if (profileId === 'p_kid_2' || profileId === 'p_alyssa') {
      return activeKids[1]?.id || activeKids[0]?.id || profileId;
    }
    return activeKids[0]?.id || profileId;
  };

  const LEGACY_CHORE_MAP: Record<string, string> = {
    c_bed_olivia: 'c_bed_kid_1',
    c_bed_alyssa: 'c_bed_kid_2',
  };

  return {
    templates: (templates || []).map((t) => ({
      ...t,
      id: LEGACY_CHORE_MAP[t.id] || t.id,
      assignedTo: resolveAssignedTo(t.assignedTo),
    })),
    rewards: (rewards || []).map((r) => ({
      ...r,
      profileId: resolveRewardProfileId(r.profileId),
    })),
  };
}

let rolloverIntervalId: ReturnType<typeof setInterval> | null = null;
let midnightTimeoutId: ReturnType<typeof setTimeout> | null = null;
let visibilityListenerAttached = false;
let cloudSyncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let externalPersistListener: (() => void) | null = null;

export function registerChorePersistListener(listener: () => void): void {
  externalPersistListener = listener;
}

function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

async function persistSnapshot(snapshot: ChoreEngineSnapshot): Promise<void> {
  try {
    await db.chores.put(snapshot);
  } catch (err) {
    console.warn('Failed to persist chore snapshot to IndexedDB:', err);
  }

  // Schedule non-blocking cloud & file sync via registered listener
  if (cloudSyncDebounceTimer) {
    clearTimeout(cloudSyncDebounceTimer);
  }
  cloudSyncDebounceTimer = setTimeout(() => {
    try {
      externalPersistListener?.();
    } catch {
      // Ignore if offline or unauthenticated
    }
  }, 1500);
}

function scheduleNextMidnightTimeout(onMidnight: () => void): void {
  if (midnightTimeoutId) {
    clearTimeout(midnightTimeoutId);
  }
  const now = new Date();
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    250 // 250ms past 00:00:00 local time
  );
  const msUntilMidnight = Math.max(1000, nextMidnight.getTime() - now.getTime());
  midnightTimeoutId = setTimeout(() => {
    onMidnight();
    scheduleNextMidnightTimeout(onMidnight);
  }, msUntilMidnight);
}

export interface ChoreStoreState {
  isInitialized: boolean;
  snapshot: ChoreEngineSnapshot;
  isFullScreenOpen: boolean;
  isParentDrawerOpen: boolean;
  activeParentTab: 'approvals' | 'pricing' | 'fulfillment' | 'ledger' | 'templates';

  // UI Navigation Actions
  setFullScreenOpen: (open: boolean) => void;
  setParentDrawerOpen: (
    open: boolean,
    initialTab?: 'approvals' | 'pricing' | 'fulfillment' | 'ledger' | 'templates'
  ) => void;

  // Core Lifecycle & Rollover
  initChoreStore: () => Promise<void>;
  evaluateRollover: (now?: Date) => Promise<void>;
  applyRemoteSnapshot: (remote: ChoreEngineSnapshot) => Promise<void>;

  // Child / Self-Service Actions
  completeChore: (
    instanceId: string,
    completions?: { profileId: string; pointsAwarded: number }[],
    now?: Date
  ) => Promise<{ success: boolean; awardedPoints: number; requiresApproval: boolean; error?: string }>;
  revertChoreSameDay: (
    instanceId: string,
    now?: Date
  ) => Promise<{ success: boolean; error?: string }>;
  proposeWishlistReward: (proposal: {
    profileId: string;
    title: string;
    sourceUrl?: string;
    imageUrl?: string;
    rawPrice?: number;
  }) => Promise<WishlistReward>;
  claimUnlockedReward: (rewardId: string) => Promise<{ success: boolean; error?: string }>;

  // PIN-Authenticated Parent Actions
  approveChoreInstance: (
    instanceId: string,
    overrideSplits?: { profileId: string; pointsAwarded: number }[]
  ) => Promise<void>;
  approveAllPendingChores: () => Promise<number>;
  rejectChoreInstance: (instanceId: string) => Promise<void>;
  priceWishlistReward: (
    rewardId: string,
    updates: {
      pointsCost: number;
      rawPrice?: number;
      title?: string;
      imageUrl?: string;
      sourceUrl?: string;
    }
  ) => Promise<void>;
  deleteWishlistReward: (rewardId: string) => Promise<void>;
  fulfillRewardRedemption: (rewardId: string) => Promise<{ success: boolean; error?: string }>;
  cancelRewardRedemption: (rewardId: string) => Promise<void>;
  addManualAdjustment: (profileId: string, pointsDelta: number, note: string) => Promise<void>;
  revertLedgerEntry: (ledgerEntryId: string) => Promise<{ success: boolean; error?: string }>;
  upsertProfile: (
    profile: Omit<Profile, 'balance' | 'lifetimePoints'> & { id?: string }
  ) => Promise<void>;
  deleteProfile: (profileId: string) => Promise<void>;
  upsertChoreTemplate: (
    template: Omit<ChoreTemplate, 'id'> & { id?: string }
  ) => Promise<void>;
  deleteChoreTemplate: (templateId: string) => Promise<void>;
  updateHouseholdSettings: (partial: Partial<ChoreHouseholdSettings>) => Promise<void>;
}

export const useChoreStore = create<ChoreStoreState>((set, get) => ({
  isInitialized: false,
  snapshot: DEFAULT_CHORE_SNAPSHOT,
  isFullScreenOpen: false,
  isParentDrawerOpen: false,
  activeParentTab: 'approvals',

  setFullScreenOpen: (open) => set({ isFullScreenOpen: open }),
  setParentDrawerOpen: (open, initialTab) =>
    set((state) => ({
      isParentDrawerOpen: open,
      activeParentTab: initialTab ?? state.activeParentTab,
    })),

  initChoreStore: async () => {
    try {
      await useProfileStore.getState().initProfileStore();
      const householdProfiles = useProfileStore.getState().profiles;
      const stored = await db.chores.get('household_chores');
      const base = stored || DEFAULT_CHORE_SNAPSHOT;
      const { templates: migratedTemplates, rewards: migratedRewards } =
        reconcileTemplateAndRewardProfileIds(base.templates, base.rewards, householdProfiles);
      const syncedProfiles = mapHouseholdToChoreProfiles(householdProfiles, base.ledger);
      const initial: ChoreEngineSnapshot = {
        ...base,
        templates: migratedTemplates,
        rewards: migratedRewards,
        profiles: syncedProfiles.length > 0 ? syncedProfiles : base.profiles,
      };
      const { snapshot: rolled, changed } = evaluateChoreRollover(initial, new Date());

      if (!stored || changed) {
        await db.chores.put(rolled);
      }

      set({ snapshot: rolled, isInitialized: true });
    } catch (err) {
      console.error('Failed to initialize chore store:', err);
      const { snapshot: fallback } = evaluateChoreRollover(DEFAULT_CHORE_SNAPSHOT, new Date());
      set({ snapshot: fallback, isInitialized: true });
    }

    // Start internal midnight rollover & day-boundary watchers
    if (typeof window !== 'undefined') {
      const triggerRolloverCheck = () => {
        get().evaluateRollover(new Date());
      };

      if (!rolloverIntervalId) {
        rolloverIntervalId = setInterval(triggerRolloverCheck, 15_000);
      }

      scheduleNextMidnightTimeout(triggerRolloverCheck);

      if (!visibilityListenerAttached) {
        visibilityListenerAttached = true;
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            triggerRolloverCheck();
          }
        });
        window.addEventListener('focus', triggerRolloverCheck);
      }
    }
  },

  evaluateRollover: async (now = new Date()) => {
    const current = get().snapshot;
    const { snapshot: next, changed } = evaluateChoreRollover(current, now);
    if (changed) {
      set({ snapshot: next });
      await persistSnapshot(next);
    }
  },

  applyRemoteSnapshot: async (remote) => {
    const householdProfiles = useProfileStore.getState().profiles;
    const { templates: rTemplates, rewards: rRewards } = reconcileTemplateAndRewardProfileIds(
      remote.templates || [],
      remote.rewards || [],
      householdProfiles
    );
    const sanitizedRemote: ChoreEngineSnapshot = {
      ...remote,
      templates: rTemplates,
      rewards: rRewards,
    };
    const local = get().snapshot;
    const merged = mergeChoreSnapshotsAuthoritative(local, sanitizedRemote);
    const { templates: finalTemplates, rewards: finalRewards } =
      reconcileTemplateAndRewardProfileIds(merged.templates, merged.rewards, householdProfiles);
    const syncedProfiles = mapHouseholdToChoreProfiles(householdProfiles, merged.ledger);
    const withProfiles: ChoreEngineSnapshot = {
      ...merged,
      templates: finalTemplates,
      rewards: finalRewards,
      profiles: syncedProfiles.length > 0 ? syncedProfiles : merged.profiles,
    };
    const { snapshot: rolled } = evaluateChoreRollover(withProfiles, new Date());
    set({ snapshot: rolled });
    await db.chores.put(rolled);
  },

  completeChore: async (instanceId, completions, now = new Date()) => {
    const current = get().snapshot;
    const instance = current.instances.find((i) => i.instanceId === instanceId);
    if (!instance) {
      return { success: false, awardedPoints: 0, requiresApproval: false, error: 'Chore not found' };
    }
    if (instance.status !== 'pending') {
      return {
        success: false,
        awardedPoints: 0,
        requiresApproval: false,
        error: 'Chore is no longer pending',
      };
    }

    const template = current.templates.find((t) => t.id === instance.choreId);
    if (!template) {
      return {
        success: false,
        awardedPoints: 0,
        requiresApproval: false,
        error: 'Chore template not found',
      };
    }

    const effectivePoints = calculateEffectiveChorePoints(template, instance.isOverdue);
    let normalizedSplits: { profileId: string; pointsAwarded: number }[] = [];

    if (completions && completions.length > 0) {
      normalizedSplits = completions
        .map((c) => ({
          profileId: c.profileId,
          pointsAwarded: Math.max(0, Math.round(c.pointsAwarded)),
        }))
        .filter((c) => c.pointsAwarded > 0 || completions.length === 1);

      const sumSplits = normalizedSplits.reduce((acc, s) => acc + s.pointsAwarded, 0);
      if (sumSplits !== effectivePoints && normalizedSplits.length === 1) {
        normalizedSplits[0].pointsAwarded = effectivePoints;
      } else if (sumSplits !== effectivePoints) {
        return {
          success: false,
          awardedPoints: 0,
          requiresApproval: false,
          error: `Point split (${sumSplits}) must equal ${effectivePoints} pts`,
        };
      }
    } else if (template.assignedTo !== 'shared') {
      normalizedSplits = [{ profileId: template.assignedTo, pointsAwarded: effectivePoints }];
    } else if (current.profiles.length > 0) {
      normalizedSplits = [{ profileId: current.profiles[0].id, pointsAwarded: effectivePoints }];
    }

    const nowIso = now.toISOString();

    if (template.requiresApproval) {
      const nextInstances = current.instances.map((inst) =>
        inst.instanceId === instanceId
          ? {
              ...inst,
              status: 'awaiting_approval' as const,
              completedBy: normalizedSplits,
              completedAt: nowIso,
            }
          : inst
      );
      const nextSnapshot: ChoreEngineSnapshot = {
        ...current,
        instances: nextInstances,
        updated_at: nowIso,
      };
      set({ snapshot: nextSnapshot });
      await persistSnapshot(nextSnapshot);
      return {
        success: true,
        awardedPoints: effectivePoints,
        requiresApproval: true,
      };
    }

    // Immediate completion (requiresApproval === false) -> write to append-only ledger
    const newLedgerEntries: LedgerEntry[] = normalizedSplits
      .filter((s) => s.pointsAwarded > 0)
      .map((split) => ({
        id: generateId('ledger'),
        timestamp: nowIso,
        type: 'chore_completion',
        refId: instanceId,
        profileId: split.profileId,
        pointsDelta: split.pointsAwarded,
        note: `${template.title}${instance.isOverdue ? ' (Overdue)' : ''}`,
        approvedBy: 'auto',
        canRevert: true,
      }));

    const nextLedger = [...current.ledger, ...newLedgerEntries];
    const nextProfiles = recalculateProfilesFromLedger(current.profiles, nextLedger);
    const nextRewards = syncRewardUnlockStates(current.rewards, nextProfiles);
    const nextInstances = current.instances.map((inst) =>
      inst.instanceId === instanceId
        ? {
            ...inst,
            status: 'completed' as const,
            completedBy: normalizedSplits,
            completedAt: nowIso,
          }
        : inst
    );

    const nextSnapshot: ChoreEngineSnapshot = {
      ...current,
      profiles: nextProfiles,
      instances: nextInstances,
      rewards: nextRewards,
      ledger: nextLedger,
      updated_at: nowIso,
    };

    set({ snapshot: nextSnapshot });
    await persistSnapshot(nextSnapshot);
    return {
      success: true,
      awardedPoints: effectivePoints,
      requiresApproval: false,
    };
  },

  revertChoreSameDay: async (instanceId, now = new Date()) => {
    const current = get().snapshot;
    const instance = current.instances.find((i) => i.instanceId === instanceId);
    if (!instance) {
      return { success: false, error: 'Chore instance not found' };
    }

    if (!canSelfRevertInstance(instance, now)) {
      return {
        success: false,
        error: 'Past-day chores are locked after midnight and cannot be self-reverted.',
      };
    }

    const nowIso = now.toISOString();
    const template = current.templates.find((t) => t.id === instance.choreId);

    // If awaiting approval, simply cancel the pending review request
    if (instance.status === 'awaiting_approval') {
      const nextInstances = current.instances.map((inst) =>
        inst.instanceId === instanceId
          ? {
              ...inst,
              status: 'pending' as const,
              completedBy: undefined,
              completedAt: undefined,
            }
          : inst
      );
      const nextSnapshot: ChoreEngineSnapshot = {
        ...current,
        instances: nextInstances,
        updated_at: nowIso,
      };
      set({ snapshot: nextSnapshot });
      await persistSnapshot(nextSnapshot);
      return { success: true };
    }

    // If completed today, write offsetting reversion entries to the append-only ledger
    const activeCompletionEntries = current.ledger.filter(
      (entry) =>
        entry.type === 'chore_completion' && entry.refId === instanceId && entry.canRevert
    );

    const reversionEntries: LedgerEntry[] = activeCompletionEntries.map((entry) => ({
      id: generateId('ledger'),
      timestamp: nowIso,
      type: 'reversion',
      refId: entry.id,
      profileId: entry.profileId,
      pointsDelta: -entry.pointsDelta,
      note: `Self-reverted same day (${template?.title || 'Chore'})`,
      approvedBy: 'auto',
      canRevert: false,
    }));

    const revertedIds = new Set(activeCompletionEntries.map((e) => e.id));
    const nextLedger = [
      ...current.ledger.map((e) => (revertedIds.has(e.id) ? { ...e, canRevert: false } : e)),
      ...reversionEntries,
    ];

    const nextProfiles = recalculateProfilesFromLedger(current.profiles, nextLedger);
    const nextRewards = syncRewardUnlockStates(current.rewards, nextProfiles);
    const nextInstances = current.instances.map((inst) =>
      inst.instanceId === instanceId
        ? {
            ...inst,
            status: 'pending' as const,
            completedBy: undefined,
            completedAt: undefined,
          }
        : inst
    );

    const nextSnapshot: ChoreEngineSnapshot = {
      ...current,
      profiles: nextProfiles,
      instances: nextInstances,
      rewards: nextRewards,
      ledger: nextLedger,
      updated_at: nowIso,
    };

    set({ snapshot: nextSnapshot });
    await persistSnapshot(nextSnapshot);
    return { success: true };
  },

  proposeWishlistReward: async (proposal) => {
    const current = get().snapshot;
    const nowIso = new Date().toISOString();
    const newReward: WishlistReward = {
      id: generateId('reward'),
      profileId: proposal.profileId,
      title: proposal.title.trim(),
      sourceUrl: proposal.sourceUrl?.trim() || undefined,
      imageUrl: proposal.imageUrl?.trim() || undefined,
      rawPrice: proposal.rawPrice,
      pointsCost: 0,
      status: 'needs_pricing',
      createdAt: nowIso,
    };

    const nextSnapshot: ChoreEngineSnapshot = {
      ...current,
      rewards: [...current.rewards, newReward],
      updated_at: nowIso,
    };

    set({ snapshot: nextSnapshot });
    await persistSnapshot(nextSnapshot);
    return newReward;
  },

  claimUnlockedReward: async (rewardId) => {
    const current = get().snapshot;
    const reward = current.rewards.find((r) => r.id === rewardId);
    if (!reward) return { success: false, error: 'Reward not found' };
    if (reward.status !== 'unlocked') {
      return { success: false, error: 'Reward is not unlocked yet' };
    }

    const profile = current.profiles.find((p) => p.id === reward.profileId);
    if (!profile || profile.balance < reward.pointsCost) {
      return { success: false, error: 'Not enough points in balance' };
    }

    const nowIso = new Date().toISOString();
    const nextRewards = current.rewards.map((r) =>
      r.id === rewardId ? { ...r, status: 'pending_fulfillment' as const } : r
    );

    const nextSnapshot: ChoreEngineSnapshot = {
      ...current,
      rewards: nextRewards,
      updated_at: nowIso,
    };

    set({ snapshot: nextSnapshot });
    await persistSnapshot(nextSnapshot);
    return { success: true };
  },

  approveChoreInstance: async (instanceId, overrideSplits) => {
    const current = get().snapshot;
    const instance = current.instances.find((i) => i.instanceId === instanceId);
    if (!instance || instance.status !== 'awaiting_approval') return;

    const template = current.templates.find((t) => t.id === instance.choreId);
    const nowIso = new Date().toISOString();
    const finalSplits = overrideSplits || instance.completedBy || [];

    const newLedgerEntries: LedgerEntry[] = finalSplits
      .filter((s) => s.pointsAwarded > 0)
      .map((split) => ({
        id: generateId('ledger'),
        timestamp: nowIso,
        type: 'chore_completion',
        refId: instanceId,
        profileId: split.profileId,
        pointsDelta: Math.round(split.pointsAwarded),
        note: `${template?.title || 'Chore'}${instance.isOverdue ? ' (Overdue)' : ''}`,
        approvedBy: 'pin',
        canRevert: true,
      }));

    const nextLedger = [...current.ledger, ...newLedgerEntries];
    const nextProfiles = recalculateProfilesFromLedger(current.profiles, nextLedger);
    const nextRewards = syncRewardUnlockStates(current.rewards, nextProfiles);
    const nextInstances = current.instances.map((inst) =>
      inst.instanceId === instanceId
        ? {
            ...inst,
            status: 'completed' as const,
            completedBy: finalSplits,
            completedAt: inst.completedAt || nowIso,
          }
        : inst
    );

    const nextSnapshot: ChoreEngineSnapshot = {
      ...current,
      profiles: nextProfiles,
      instances: nextInstances,
      rewards: nextRewards,
      ledger: nextLedger,
      lastParentActionAt: nowIso,
      updated_at: nowIso,
    };

    set({ snapshot: nextSnapshot });
    await persistSnapshot(nextSnapshot);
  },

  approveAllPendingChores: async () => {
    const current = get().snapshot;
    const pendingList = current.instances.filter((i) => i.status === 'awaiting_approval');
    if (pendingList.length === 0) return 0;

    const nowIso = new Date().toISOString();
    const templateMap = new Map(current.templates.map((t) => [t.id, t]));
    const newLedgerEntries: LedgerEntry[] = [];

    for (const inst of pendingList) {
      const tpl = templateMap.get(inst.choreId);
      const splits = inst.completedBy || [];
      for (const split of splits) {
        if (split.pointsAwarded > 0) {
          newLedgerEntries.push({
            id: generateId('ledger'),
            timestamp: nowIso,
            type: 'chore_completion',
            refId: inst.instanceId,
            profileId: split.profileId,
            pointsDelta: Math.round(split.pointsAwarded),
            note: `${tpl?.title || 'Chore'}${inst.isOverdue ? ' (Overdue)' : ''}`,
            approvedBy: 'pin',
            canRevert: true,
          });
        }
      }
    }

    const nextLedger = [...current.ledger, ...newLedgerEntries];
    const nextProfiles = recalculateProfilesFromLedger(current.profiles, nextLedger);
    const nextRewards = syncRewardUnlockStates(current.rewards, nextProfiles);
    const nextInstances = current.instances.map((inst) =>
      inst.status === 'awaiting_approval'
        ? { ...inst, status: 'completed' as const, completedAt: inst.completedAt || nowIso }
        : inst
    );

    const nextSnapshot: ChoreEngineSnapshot = {
      ...current,
      profiles: nextProfiles,
      instances: nextInstances,
      rewards: nextRewards,
      ledger: nextLedger,
      lastParentActionAt: nowIso,
      updated_at: nowIso,
    };

    set({ snapshot: nextSnapshot });
    await persistSnapshot(nextSnapshot);
    return pendingList.length;
  },

  rejectChoreInstance: async (instanceId) => {
    const current = get().snapshot;
    const nowIso = new Date().toISOString();
    const nextInstances = current.instances.map((inst) =>
      inst.instanceId === instanceId
        ? {
            ...inst,
            status: 'pending' as const,
            completedBy: undefined,
            completedAt: undefined,
          }
        : inst
    );

    const nextSnapshot: ChoreEngineSnapshot = {
      ...current,
      instances: nextInstances,
      lastParentActionAt: nowIso,
      updated_at: nowIso,
    };

    set({ snapshot: nextSnapshot });
    await persistSnapshot(nextSnapshot);
  },

  priceWishlistReward: async (rewardId, updates) => {
    const current = get().snapshot;
    const nowIso = new Date().toISOString();
    const cost = Math.max(1, Math.round(updates.pointsCost));

    const updatedRewards = current.rewards.map((r) => {
      if (r.id !== rewardId) return r;
      return {
        ...r,
        title: updates.title !== undefined ? updates.title.trim() : r.title,
        imageUrl: updates.imageUrl !== undefined ? updates.imageUrl : r.imageUrl,
        sourceUrl: updates.sourceUrl !== undefined ? updates.sourceUrl : r.sourceUrl,
        rawPrice: updates.rawPrice !== undefined ? updates.rawPrice : r.rawPrice,
        pointsCost: cost,
        status: 'active_goal' as const,
        pricedAt: nowIso,
      };
    });

    const nextRewards = syncRewardUnlockStates(updatedRewards, current.profiles);
    const nextSnapshot: ChoreEngineSnapshot = {
      ...current,
      rewards: nextRewards,
      lastParentActionAt: nowIso,
      updated_at: nowIso,
    };

    set({ snapshot: nextSnapshot });
    await persistSnapshot(nextSnapshot);
  },

  deleteWishlistReward: async (rewardId) => {
    const current = get().snapshot;
    const nowIso = new Date().toISOString();
    const nextSnapshot: ChoreEngineSnapshot = {
      ...current,
      rewards: current.rewards.filter((r) => r.id !== rewardId),
      lastParentActionAt: nowIso,
      updated_at: nowIso,
    };

    set({ snapshot: nextSnapshot });
    await persistSnapshot(nextSnapshot);
  },

  fulfillRewardRedemption: async (rewardId) => {
    const current = get().snapshot;
    const reward = current.rewards.find((r) => r.id === rewardId);
    if (!reward) return { success: false, error: 'Reward not found' };

    const profile = current.profiles.find((p) => p.id === reward.profileId);
    if (!profile) return { success: false, error: 'Child profile not found' };
    if (profile.balance < reward.pointsCost) {
      return {
        success: false,
        error: `${profile.name} only has ${profile.balance} pts (needs ${reward.pointsCost} pts).`,
      };
    }

    const now = new Date();
    const nowIso = now.toISOString();

    const redemptionEntry: LedgerEntry = {
      id: generateId('ledger'),
      timestamp: nowIso,
      type: 'reward_redemption',
      refId: reward.id,
      profileId: reward.profileId,
      pointsDelta: -Math.abs(Math.round(reward.pointsCost)),
      note: `Redeemed: ${reward.title}`,
      approvedBy: 'pin',
      canRevert: true,
    };

    const newTrophy: TrophyItem = {
      id: generateId('trophy'),
      year: now.getFullYear(),
      profileId: reward.profileId,
      itemName: reward.title,
      pointsSpent: Math.round(reward.pointsCost),
      dateFulfilled: nowIso,
      imageUrl: reward.imageUrl,
      sourceUrl: reward.sourceUrl,
    };

    const nextLedger = [...current.ledger, redemptionEntry];
    const nextProfiles = recalculateProfilesFromLedger(current.profiles, nextLedger);
    const updatedRewards = current.rewards.map((r) =>
      r.id === rewardId
        ? { ...r, status: 'fulfilled' as const, fulfilledAt: nowIso }
        : r
    );
    const nextRewards = syncRewardUnlockStates(updatedRewards, nextProfiles);

    const nextSnapshot: ChoreEngineSnapshot = {
      ...current,
      profiles: nextProfiles,
      rewards: nextRewards,
      trophies: [newTrophy, ...current.trophies],
      ledger: nextLedger,
      lastParentActionAt: nowIso,
      updated_at: nowIso,
    };

    set({ snapshot: nextSnapshot });
    await persistSnapshot(nextSnapshot);
    return { success: true };
  },

  cancelRewardRedemption: async (rewardId) => {
    const current = get().snapshot;
    const nowIso = new Date().toISOString();
    const updatedRewards = current.rewards.map((r) =>
      r.id === rewardId ? { ...r, status: 'unlocked' as const } : r
    );
    const nextRewards = syncRewardUnlockStates(updatedRewards, current.profiles);

    const nextSnapshot: ChoreEngineSnapshot = {
      ...current,
      rewards: nextRewards,
      lastParentActionAt: nowIso,
      updated_at: nowIso,
    };

    set({ snapshot: nextSnapshot });
    await persistSnapshot(nextSnapshot);
  },

  addManualAdjustment: async (profileId, pointsDelta, note) => {
    const rounded = Math.round(pointsDelta);
    if (rounded === 0) return;

    const current = get().snapshot;
    const nowIso = new Date().toISOString();

    const adjustmentEntry: LedgerEntry = {
      id: generateId('ledger'),
      timestamp: nowIso,
      type: 'manual_adjustment',
      refId: generateId('adj'),
      profileId,
      pointsDelta: rounded,
      note: note.trim() || (rounded > 0 ? 'Parent bonus points' : 'Parent point deduction'),
      approvedBy: 'pin',
      canRevert: true,
    };

    const nextLedger = [...current.ledger, adjustmentEntry];
    const nextProfiles = recalculateProfilesFromLedger(current.profiles, nextLedger);
    const nextRewards = syncRewardUnlockStates(current.rewards, nextProfiles);

    const nextSnapshot: ChoreEngineSnapshot = {
      ...current,
      profiles: nextProfiles,
      rewards: nextRewards,
      ledger: nextLedger,
      lastParentActionAt: nowIso,
      updated_at: nowIso,
    };

    set({ snapshot: nextSnapshot });
    await persistSnapshot(nextSnapshot);
  },

  revertLedgerEntry: async (ledgerEntryId) => {
    const current = get().snapshot;
    const target = current.ledger.find((e) => e.id === ledgerEntryId);
    if (!target) return { success: false, error: 'Ledger entry not found' };
    if (!target.canRevert) return { success: false, error: 'Entry has already been reverted' };

    const nowIso = new Date().toISOString();
    const reversionEntry: LedgerEntry = {
      id: generateId('ledger'),
      timestamp: nowIso,
      type: 'reversion',
      refId: target.id,
      profileId: target.profileId,
      pointsDelta: -target.pointsDelta,
      note: `Parent reverted: ${target.note || target.type}`,
      approvedBy: 'pin',
      canRevert: false,
    };

    const nextLedger = [
      ...current.ledger.map((e) => (e.id === target.id ? { ...e, canRevert: false } : e)),
      reversionEntry,
    ];

    // Restore associated state if this was a chore completion or reward redemption
    let nextInstances = current.instances;
    let nextRewards = current.rewards;
    let nextTrophies = current.trophies;

    if (target.type === 'chore_completion') {
      // Check if any other un-reverted completion entries remain for this instance
      const otherActiveForInstance = nextLedger.some(
        (e) =>
          e.type === 'chore_completion' &&
          e.refId === target.refId &&
          e.canRevert
      );
      if (!otherActiveForInstance) {
        nextInstances = current.instances.map((inst) =>
          inst.instanceId === target.refId
            ? {
                ...inst,
                status: 'pending' as const,
                completedBy: undefined,
                completedAt: undefined,
              }
            : inst
        );
      }
    } else if (target.type === 'reward_redemption') {
      nextRewards = current.rewards.map((r) =>
        r.id === target.refId
          ? { ...r, status: 'unlocked' as const, fulfilledAt: undefined }
          : r
      );
      nextTrophies = current.trophies.filter(
        (t) => !(t.profileId === target.profileId && t.dateFulfilled === target.timestamp)
      );
    }

    const nextProfiles = recalculateProfilesFromLedger(current.profiles, nextLedger);
    nextRewards = syncRewardUnlockStates(nextRewards, nextProfiles);

    const nextSnapshot: ChoreEngineSnapshot = {
      ...current,
      profiles: nextProfiles,
      instances: nextInstances,
      rewards: nextRewards,
      trophies: nextTrophies,
      ledger: nextLedger,
      lastParentActionAt: nowIso,
      updated_at: nowIso,
    };

    set({ snapshot: nextSnapshot });
    await persistSnapshot(nextSnapshot);
    return { success: true };
  },

  upsertProfile: async (profileInput) => {
    const saved = await useProfileStore.getState().upsertHouseholdProfile({
      id: profileInput.id,
      name: profileInput.name,
      role: profileInput.role || 'kid',
      color: profileInput.color,
      avatarDataUrl: profileInput.avatarDataUrl || profileInput.avatarUrl,
      emoji: profileInput.emoji,
    });

    const current = get().snapshot;
    const nowIso = new Date().toISOString();
    const householdProfiles = useProfileStore.getState().profiles;
    const nextProfiles = mapHouseholdToChoreProfiles(householdProfiles, current.ledger);

    // Ensure if it was a kid profile, it appears in nextProfiles
    const hasSaved = nextProfiles.some((p) => p.id === saved.id);
    const mergedProfiles =
      !hasSaved && saved.role === 'kid'
        ? recalculateProfilesFromLedger(
            [
              ...nextProfiles,
              {
                id: saved.id,
                name: saved.name,
                role: saved.role,
                color: saved.color,
                avatarDataUrl: saved.avatarDataUrl,
                avatarUrl: saved.avatarDataUrl,
                emoji: saved.emoji,
                balance: 0,
                lifetimePoints: 0,
              },
            ],
            current.ledger
          )
        : nextProfiles;

    const nextSnapshot: ChoreEngineSnapshot = {
      ...current,
      profiles: mergedProfiles,
      lastParentActionAt: nowIso,
      updated_at: nowIso,
    };

    set({ snapshot: nextSnapshot });
    await persistSnapshot(nextSnapshot);
  },

  deleteProfile: async (profileId) => {
    await useProfileStore.getState().deleteHouseholdProfile(profileId);
    const current = get().snapshot;
    const nowIso = new Date().toISOString();
    const nextProfiles = current.profiles.filter((p) => p.id !== profileId);
    const nextTemplates = current.templates.map((t) =>
      t.assignedTo === profileId ? { ...t, assignedTo: 'shared' as const } : t
    );

    const nextSnapshot: ChoreEngineSnapshot = {
      ...current,
      profiles: nextProfiles,
      templates: nextTemplates,
      lastParentActionAt: nowIso,
      updated_at: nowIso,
    };

    set({ snapshot: nextSnapshot });
    await persistSnapshot(nextSnapshot);
  },

  upsertChoreTemplate: async (templateInput) => {
    const current = get().snapshot;
    const now = new Date();
    const nowIso = now.toISOString();
    const todayKey = localDateKey(now);
    const id = templateInput.id || generateId('chore-tpl');

    const normalizedTemplate: ChoreTemplate = {
      ...templateInput,
      id,
      title: templateInput.title.trim(),
      points: Math.max(0, Math.round(templateInput.points)),
      intervalAnchorDate: templateInput.intervalAnchorDate || todayKey,
    };

    const exists = current.templates.some((t) => t.id === id);
    const nextTemplates = exists
      ? current.templates.map((t) => (t.id === id ? normalizedTemplate : t))
      : [...current.templates, normalizedTemplate];

    const draftSnapshot: ChoreEngineSnapshot = {
      ...current,
      templates: nextTemplates,
      lastParentActionAt: nowIso,
      updated_at: nowIso,
    };

    const { snapshot: rolled } = evaluateChoreRollover(draftSnapshot, now);
    const finalSnapshot: ChoreEngineSnapshot = {
      ...rolled,
      lastParentActionAt: nowIso,
      updated_at: nowIso,
    };

    set({ snapshot: finalSnapshot });
    await persistSnapshot(finalSnapshot);
  },

  deleteChoreTemplate: async (templateId) => {
    const current = get().snapshot;
    const nowIso = new Date().toISOString();
    const nextTemplates = current.templates.filter((t) => t.id !== templateId);
    // Remove pending instances for deleted template while preserving completed history
    const nextInstances = current.instances.filter(
      (i) => !(i.choreId === templateId && i.status === 'pending')
    );

    const nextSnapshot: ChoreEngineSnapshot = {
      ...current,
      templates: nextTemplates,
      instances: nextInstances,
      lastParentActionAt: nowIso,
      updated_at: nowIso,
    };

    set({ snapshot: nextSnapshot });
    await persistSnapshot(nextSnapshot);
  },

  updateHouseholdSettings: async (partial) => {
    const current = get().snapshot;
    const now = new Date();
    const nowIso = now.toISOString();

    const draftSnapshot: ChoreEngineSnapshot = {
      ...current,
      householdSettings: {
        ...current.householdSettings,
        ...partial,
      },
      lastParentActionAt: nowIso,
      updated_at: nowIso,
    };

    const { snapshot: rolled } = evaluateChoreRollover(draftSnapshot, now);
    const finalSnapshot: ChoreEngineSnapshot = {
      ...rolled,
      lastParentActionAt: nowIso,
      updated_at: nowIso,
    };

    set({ snapshot: finalSnapshot });
    await persistSnapshot(finalSnapshot);
  },
}));

/**
 * Helper selector that aggregates all pending parent actions into a single counter:
 * `awaiting_approval` chores + `needs_pricing` wishlist proposals + `pending_fulfillment` reward redemptions.
 */
export function getPendingParentActionCounts(snapshot: ChoreEngineSnapshot): {
  awaitingApprovalCount: number;
  needsPricingCount: number;
  pendingFulfillmentCount: number;
  totalPendingCount: number;
} {
  const awaitingApprovalCount = snapshot.instances.filter(
    (i) => i.status === 'awaiting_approval'
  ).length;
  const needsPricingCount = snapshot.rewards.filter(
    (r) => r.status === 'needs_pricing'
  ).length;
  const pendingFulfillmentCount = snapshot.rewards.filter(
    (r) => r.status === 'pending_fulfillment'
  ).length;

  return {
    awaitingApprovalCount,
    needsPricingCount,
    pendingFulfillmentCount,
    totalPendingCount:
      awaitingApprovalCount + needsPricingCount + pendingFulfillmentCount,
  };
}

registerProfileSyncListener((householdProfiles) => {
  const state = useChoreStore.getState();
  if (!state.isInitialized) return;
  const current = state.snapshot;
  const { templates: nextTemplates, rewards: reconciledRewards } =
    reconcileTemplateAndRewardProfileIds(current.templates, current.rewards, householdProfiles);
  const nextProfiles = mapHouseholdToChoreProfiles(householdProfiles, current.ledger);
  const nextRewards = syncRewardUnlockStates(reconciledRewards, nextProfiles);
  const nowIso = new Date().toISOString();
  const nextSnapshot: ChoreEngineSnapshot = {
    ...current,
    templates: nextTemplates,
    profiles: nextProfiles,
    rewards: nextRewards,
    updated_at: nowIso,
  };
  useChoreStore.setState({ snapshot: nextSnapshot });
  persistSnapshot(nextSnapshot).catch(() => {});
});

