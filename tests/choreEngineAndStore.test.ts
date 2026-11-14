import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateEffectiveChorePoints,
  canSelfRevertInstance,
  evaluateChoreRollover,
  mergeChoreSnapshotsAuthoritative,
  prunePriorYearTrophies,
  recalculateProfilesFromLedger,
  selectProfilePointsFromLedger,
  validateChoreSplits,
} from '../src/utils/choreEngine';
import {
  getPendingParentActionCounts,
  selectPendingParentActionsCount,
  useChoreStore,
} from '../src/stores/useChoreStore';
import type { ChoreEngineSnapshot, ChoreTemplate } from '../src/types/chores';

function createBaseSnapshot(): ChoreEngineSnapshot {
  return {
    id: 'household_chores',
    profiles: [
      { id: 'kid_1', name: 'Alex', role: 'kid', color: '#6b8f71', balance: 0, lifetimePoints: 0 },
      { id: 'kid_2', name: 'Maya', role: 'kid', color: '#8b7fa8', balance: 0, lifetimePoints: 0 },
    ],
    templates: [
      {
        id: 'tpl_daily_auto',
        title: 'Make Bed',
        points: 10,
        assignedTo: 'kid_1',
        cadence: 'daily',
        requiresApproval: false,
        rolloverUntilDone: false,
        overduePolicy: 'zero',
      },
      {
        id: 'tpl_shared_approval',
        title: 'Clean Playroom',
        points: 20,
        assignedTo: 'shared',
        cadence: 'daily',
        requiresApproval: true,
        rolloverUntilDone: true,
        overduePolicy: 'half',
      },
    ],
    instances: [
      {
        instanceId: 'tpl_daily_auto_2026-11-10',
        choreId: 'tpl_daily_auto',
        dateScheduled: '2026-11-10',
        status: 'pending',
        isOverdue: false,
      },
      {
        instanceId: 'tpl_shared_approval_2026-11-10',
        choreId: 'tpl_shared_approval',
        dateScheduled: '2026-11-10',
        status: 'pending',
        isOverdue: false,
      },
    ],
    rewards: [
      {
        id: 'rew_1',
        profileId: 'kid_1',
        title: 'LEGO Set',
        pointsCost: 10,
        status: 'active_goal',
        createdAt: '2026-11-01T00:00:00.000Z',
      },
    ],
    trophies: [],
    ledger: [],
    householdSettings: {
      vacationMode: false,
      pointsPerDollar: 10,
      soundEffectsEnabled: false,
      lastRolloverDate: '2026-11-10',
      lastPrunedYear: 2026,
    },
    updated_at: '2026-11-10T12:00:00.000Z',
  };
}

describe('Chore Engine & useChoreStore', () => {
  beforeEach(() => {
    const base = createBaseSnapshot();
    useChoreStore.setState({
      isInitialized: true,
      snapshot: base,
      pendingParentActionsCount: selectPendingParentActionsCount(base),
    });
  });

  it('derives balance & lifetimePoints strictly from append-only ledger and auto-unlocks rewards', async () => {
    const now = new Date(2026, 10, 10, 15, 0, 0); // Nov 10, 2026 local
    const res = await useChoreStore
      .getState()
      .completeChore('tpl_daily_auto_2026-11-10', undefined, now);

    assert.equal(res.success, true);
    assert.equal(res.awardedPoints, 10);
    assert.equal(useChoreStore.getState().getProfileBalance('kid_1'), 10);
    assert.equal(useChoreStore.getState().getProfileLifetimePoints('kid_1'), 10);

    // Reward costing 10 pts automatically transitions to 'unlocked'
    const reward = useChoreStore.getState().snapshot.rewards.find((r) => r.id === 'rew_1');
    assert.equal(reward?.status, 'unlocked');

    // Redeeming deducts spendable balance while preserving lifetimePoints
    await useChoreStore.getState().claimUnlockedReward('rew_1');
    assert.equal(useChoreStore.getState().pendingParentActionsCount, 1);

    const fulfillRes = await useChoreStore.getState().fulfillRewardRedemption('rew_1');
    assert.equal(fulfillRes.success, true);

    const derived = selectProfilePointsFromLedger(
      useChoreStore.getState().snapshot.ledger,
      'kid_1'
    );
    assert.equal(derived.balance, 0);
    assert.equal(derived.lifetimePoints, 10);
    assert.equal(useChoreStore.getState().pendingParentActionsCount, 0);
  });

  it('enforces whole-number split sums and supports parent split-override on approval', async () => {
    // Fractional split rejected
    const fracCheck = validateChoreSplits(
      [
        { profileId: 'kid_1', pointsAwarded: 10.5 },
        { profileId: 'kid_2', pointsAwarded: 9.5 },
      ],
      20
    );
    assert.equal(fracCheck.valid, false);

    // Wrong sum rejected
    const badSumRes = await useChoreStore.getState().completeChore(
      'tpl_shared_approval_2026-11-10',
      [
        { profileId: 'kid_1', pointsAwarded: 8 },
        { profileId: 'kid_2', pointsAwarded: 8 },
      ],
      new Date(2026, 10, 10, 16, 0, 0)
    );
    assert.equal(badSumRes.success, false);

    // Valid whole-number split moves chore to awaiting_approval
    const okSplit = await useChoreStore.getState().completeChore(
      'tpl_shared_approval_2026-11-10',
      [
        { profileId: 'kid_1', pointsAwarded: 10 },
        { profileId: 'kid_2', pointsAwarded: 10 },
      ],
      new Date(2026, 10, 10, 16, 5, 0)
    );
    assert.equal(okSplit.success, true);
    assert.equal(okSplit.requiresApproval, true);
    assert.equal(useChoreStore.getState().pendingParentActionsCount, 1);

    // Parent overrides split to 15 / 5 on approval
    const approveRes = await useChoreStore
      .getState()
      .approveChoreInstance('tpl_shared_approval_2026-11-10', [
        { profileId: 'kid_1', pointsAwarded: 15 },
        { profileId: 'kid_2', pointsAwarded: 5 },
      ]);
    assert.deepEqual(approveRes, { success: true });
    assert.equal(useChoreStore.getState().getProfileBalance('kid_1'), 15);
    assert.equal(useChoreStore.getState().getProfileBalance('kid_2'), 5);
    assert.equal(useChoreStore.getState().pendingParentActionsCount, 0);
  });

  it('allows same-day self-revert with offsetting ledger entry and locks past-day chores at midnight', async () => {
    const sameDayNow = new Date(2026, 10, 10, 18, 0, 0); // 2026-11-10
    await useChoreStore
      .getState()
      .completeChore('tpl_daily_auto_2026-11-10', undefined, sameDayNow);
    assert.equal(useChoreStore.getState().getProfileBalance('kid_1'), 10);

    // Next day after midnight (2026-11-11) -> locked!
    const afterMidnight = new Date(2026, 10, 11, 0, 1, 0);
    const lockedAttempt = await useChoreStore
      .getState()
      .revertChoreSameDay('tpl_daily_auto_2026-11-10', afterMidnight);
    assert.equal(lockedAttempt.success, false);
    assert.equal(useChoreStore.getState().getProfileBalance('kid_1'), 10);

    // Same day -> allowed, appends offsetting reversion entry
    const sameDayRevert = await useChoreStore
      .getState()
      .revertChoreSameDay('tpl_daily_auto_2026-11-10', sameDayNow);
    assert.equal(sameDayRevert.success, true);
    assert.equal(useChoreStore.getState().getProfileBalance('kid_1'), 0);
    assert.equal(useChoreStore.getState().getProfileLifetimePoints('kid_1'), 0);

    const lastLedger = useChoreStore.getState().snapshot.ledger.at(-1);
    assert.equal(lastLedger?.type, 'reversion');
    assert.equal(lastLedger?.pointsDelta, -10);
    assert.match(lastLedger?.note || '', /Self-reverted same day/);

    // Past-day overdue instance completed today still cannot be self-reverted because dateScheduled !== today
    const pastOverdueInstance = {
      instanceId: 'tpl_shared_approval_2026-11-09',
      choreId: 'tpl_shared_approval',
      dateScheduled: '2026-11-09',
      status: 'completed' as const,
      completedAt: sameDayNow.toISOString(),
      isOverdue: true,
    };
    assert.equal(canSelfRevertInstance(pastOverdueInstance, sameDayNow), false);
  });

  it('evaluates all four overdue policies (full, half rounded down, zero, custom)', () => {
    const baseTpl: ChoreTemplate = {
      id: 't1',
      title: 'Test',
      points: 15,
      assignedTo: 'kid_1',
      cadence: 'daily',
      requiresApproval: false,
      rolloverUntilDone: true,
      overduePolicy: 'full',
    };

    assert.equal(
      calculateEffectiveChorePoints({ ...baseTpl, overduePolicy: 'full' }, true),
      15
    );
    assert.equal(
      calculateEffectiveChorePoints({ ...baseTpl, overduePolicy: 'half' }, true),
      7 // 15 * 0.5 = 7.5 -> rounded down to 7
    );
    assert.equal(
      calculateEffectiveChorePoints({ ...baseTpl, overduePolicy: 'zero' }, true),
      0
    );
    assert.equal(
      calculateEffectiveChorePoints(
        { ...baseTpl, overduePolicy: 'custom', overdueCustomPct: 30 },
        true
      ),
      4 // floor(15 * 0.30 = 4.5) -> 4
    );
  });

  it('handles midnight rollover expiration, overdue carry-over, vacation pause, and annual trophy pruning', () => {
    const snap = createBaseSnapshot();
    snap.trophies = [
      {
        id: 'tr_2025',
        year: 2025,
        profileId: 'kid_1',
        itemName: 'Scooter',
        pointsSpent: 200,
        dateFulfilled: '2025-08-10T00:00:00.000Z',
        imageUrl: 'https://example.com/scooter.jpg',
        sourceUrl: 'https://example.com/product/scooter',
      },
      {
        id: 'tr_2026',
        year: 2026,
        profileId: 'kid_1',
        itemName: 'Board Game',
        pointsSpent: 80,
        dateFulfilled: '2026-06-01T00:00:00.000Z',
        imageUrl: 'https://example.com/game.jpg',
        sourceUrl: 'https://example.com/product/game',
      },
    ];

    // 1. Vacation mode pauses expiration/generation while still running annual trophy pruning
    const vacationSnap: ChoreEngineSnapshot = {
      ...snap,
      householdSettings: { ...snap.householdSettings, vacationMode: true, lastPrunedYear: 2025 },
    };
    const { snapshot: afterVacationMidnight } = evaluateChoreRollover(
      vacationSnap,
      new Date(2026, 10, 11, 0, 0, 5) // 2026-11-11
    );
    // Instances untouched during vacation mode
    assert.equal(afterVacationMidnight.instances.length, 2);
    assert.equal(
      afterVacationMidnight.instances.find((i) => i.instanceId === 'tpl_daily_auto_2026-11-10')
        ?.status,
      'pending'
    );
    // Prior-year 2025 trophy stripped of imageUrl/sourceUrl, current-year 2026 trophy preserved
    const pruned2025 = afterVacationMidnight.trophies.find((t) => t.id === 'tr_2025');
    const kept2026 = afterVacationMidnight.trophies.find((t) => t.id === 'tr_2026');
    assert.equal(pruned2025?.imageUrl, undefined);
    assert.equal(pruned2025?.sourceUrl, undefined);
    assert.equal(kept2026?.imageUrl, 'https://example.com/game.jpg');

    // 2. Normal midnight rollover (vacationMode = false) on 2026-11-11:
    // - tpl_daily_auto (rolloverUntilDone = false) -> expired
    // - tpl_shared_approval (rolloverUntilDone = true) -> isOverdue: true
    // - New 2026-11-11 instances spawned
    const { snapshot: rolled } = evaluateChoreRollover(
      snap,
      new Date(2026, 10, 11, 0, 0, 5)
    );
    const oldDaily = rolled.instances.find(
      (i) => i.instanceId === 'tpl_daily_auto_2026-11-10'
    );
    const oldShared = rolled.instances.find(
      (i) => i.instanceId === 'tpl_shared_approval_2026-11-10'
    );
    const newDaily = rolled.instances.find(
      (i) => i.instanceId === 'tpl_daily_auto_2026-11-11'
    );

    assert.equal(oldDaily?.status, 'expired');
    assert.equal(oldShared?.status, 'pending');
    assert.equal(oldShared?.isOverdue, true);
    assert.equal(newDaily?.status, 'pending');

    // Direct prunePriorYearTrophies verification for 2027 rollover
    const { trophies: into2027, pruned } = prunePriorYearTrophies(rolled.trophies, 2027);
    assert.equal(pruned, true);
    assert.equal(into2027.find((t) => t.id === 'tr_2026')?.imageUrl, undefined);
  });

  it('resolves sync conflicts in favor of remote parent authoritative actions', () => {
    const base = createBaseSnapshot();

    // Offline kiosk: child auto-completed chore at 12:10 without parent action
    const offlineKiosk: ChoreEngineSnapshot = {
      ...base,
      instances: base.instances.map((i) =>
        i.instanceId === 'tpl_daily_auto_2026-11-10'
          ? {
              ...i,
              status: 'completed',
              completedBy: [{ profileId: 'kid_1', pointsAwarded: 10 }],
              completedAt: '2026-11-10T12:10:00.000Z',
            }
          : i
      ),
      ledger: [
        {
          id: 'kiosk_auto_1',
          timestamp: '2026-11-10T12:10:00.000Z',
          type: 'chore_completion',
          refId: 'tpl_daily_auto_2026-11-10',
          profileId: 'kid_1',
          pointsDelta: 10,
          approvedBy: 'auto',
          canRevert: true,
        },
      ],
      updated_at: '2026-11-10T12:10:00.000Z',
    };
    offlineKiosk.profiles = recalculateProfilesFromLedger(
      offlineKiosk.profiles,
      offlineKiosk.ledger
    );

    // Remote parent phone: parent overrode & awarded that instance to kid_2 via PIN at 12:08
    const remoteParent: ChoreEngineSnapshot = {
      ...base,
      instances: base.instances.map((i) =>
        i.instanceId === 'tpl_daily_auto_2026-11-10'
          ? {
              ...i,
              status: 'completed',
              completedBy: [{ profileId: 'kid_2', pointsAwarded: 10 }],
              completedAt: '2026-11-10T12:08:00.000Z',
            }
          : i
      ),
      ledger: [
        {
          id: 'parent_pin_1',
          timestamp: '2026-11-10T12:08:00.000Z',
          type: 'chore_completion',
          refId: 'tpl_daily_auto_2026-11-10',
          profileId: 'kid_2',
          pointsDelta: 10,
          approvedBy: 'pin',
          canRevert: true,
        },
      ],
      lastParentActionAt: '2026-11-10T12:08:00.000Z',
      updated_at: '2026-11-10T12:08:00.000Z',
    };

    const merged = mergeChoreSnapshotsAuthoritative(offlineKiosk, remoteParent);
    assert.equal(merged.profiles.find((p) => p.id === 'kid_1')?.balance, 0);
    assert.equal(merged.profiles.find((p) => p.id === 'kid_2')?.balance, 10);
    assert.deepEqual(
      merged.instances.find((i) => i.instanceId === 'tpl_daily_auto_2026-11-10')?.completedBy,
      [{ profileId: 'kid_2', pointsAwarded: 10 }]
    );
  });

  it('keeps weeklyAnyDay (1x/wk) chores hidden for the rest of the week after completion and respawns on weekStartsOn day', () => {
    const base = createBaseSnapshot();
    const laundryTpl = {
      id: 'tpl_laundry_alyssa',
      title: 'Laundry',
      points: 20,
      assignedTo: 'kid_2',
      cadence: 'weekly' as const,
      weeklyAnyDay: true,
      requiresApproval: false,
      rolloverUntilDone: true,
      overduePolicy: 'full' as const,
    };

    // Wednesday 2026-11-11: initial weeklyAnyDay pending instance
    const wednesdaySnap: ChoreEngineSnapshot = {
      ...base,
      templates: [laundryTpl],
      instances: [
        {
          instanceId: 'tpl_laundry_alyssa_2026-11-11',
          choreId: 'tpl_laundry_alyssa',
          dateScheduled: '2026-11-11',
          status: 'pending',
          isOverdue: false,
        },
      ],
      householdSettings: {
        ...base.householdSettings,
        weekStartsOn: 'sunday',
        lastRolloverDate: '2026-11-11',
      },
    };

    // Rollover to Thursday 2026-11-12: unchecked instance moves to Thursday
    const { snapshot: thursdaySnap } = evaluateChoreRollover(
      wednesdaySnap,
      new Date(2026, 10, 12, 8, 0, 0)
    );
    const thuPending = thursdaySnap.instances.filter(
      (i) => i.choreId === 'tpl_laundry_alyssa' && i.status === 'pending'
    );
    assert.equal(thuPending.length, 1);
    assert.equal(thuPending[0]?.dateScheduled, '2026-11-12');

    // Complete Laundry on Thursday 2026-11-12, and also simulate a stale Wednesday pending instance from multi-device merge
    const completedThursday: ChoreEngineSnapshot = {
      ...thursdaySnap,
      instances: [
        {
          instanceId: 'tpl_laundry_alyssa_2026-11-11',
          choreId: 'tpl_laundry_alyssa',
          dateScheduled: '2026-11-11',
          status: 'pending',
          isOverdue: false,
        },
        {
          instanceId: 'tpl_laundry_alyssa_2026-11-12',
          choreId: 'tpl_laundry_alyssa',
          dateScheduled: '2026-11-12',
          status: 'completed',
          completedBy: [{ profileId: 'kid_2', pointsAwarded: 20 }],
          completedAt: '2026-11-12T18:00:00.000Z',
          isOverdue: false,
        },
      ],
      ledger: [
        {
          id: 'ledger_laundry_thu',
          timestamp: '2026-11-12T18:00:00.000Z',
          type: 'chore_completion',
          refId: 'tpl_laundry_alyssa_2026-11-12',
          profileId: 'kid_2',
          pointsDelta: 20,
          approvedBy: 'auto',
          canRevert: true,
        },
      ],
    };

    // Rollover to Friday 2026-11-13: must NOT reappear as pending!
    const { snapshot: fridaySnap } = evaluateChoreRollover(
      completedThursday,
      new Date(2026, 10, 13, 8, 0, 0)
    );
    assert.equal(
      fridaySnap.instances.filter(
        (i) => i.choreId === 'tpl_laundry_alyssa' && i.status === 'pending'
      ).length,
      0
    );

    // If weekStartsOn is 'monday', Sunday 2026-11-15 is STILL in the same Mon–Sun week (2026-11-09..2026-11-15),
    // so it stays hidden on Sunday and comes back on Monday 2026-11-16!
    const mondayPrefSnap: ChoreEngineSnapshot = {
      ...fridaySnap,
      householdSettings: {
        ...fridaySnap.householdSettings,
        weekStartsOn: 'monday',
      },
    };
    const { snapshot: sundayWithMondayStart } = evaluateChoreRollover(
      mondayPrefSnap,
      new Date(2026, 10, 15, 8, 0, 0)
    );
    assert.equal(
      sundayWithMondayStart.instances.filter(
        (i) => i.choreId === 'tpl_laundry_alyssa' && i.status === 'pending'
      ).length,
      0
    );

    const { snapshot: mondayWithMondayStart } = evaluateChoreRollover(
      sundayWithMondayStart,
      new Date(2026, 10, 16, 8, 0, 0)
    );
    const monPending = mondayWithMondayStart.instances.filter(
      (i) => i.choreId === 'tpl_laundry_alyssa' && i.status === 'pending'
    );
    assert.equal(monPending.length, 1);
    assert.equal(monPending[0]?.dateScheduled, '2026-11-16');

    // If weekStartsOn is 'sunday', it comes back on Sunday 2026-11-15!
    const { snapshot: sundayWithSundayStart } = evaluateChoreRollover(
      fridaySnap,
      new Date(2026, 10, 15, 8, 0, 0)
    );
    const sunPending = sundayWithSundayStart.instances.filter(
      (i) => i.choreId === 'tpl_laundry_alyssa' && i.status === 'pending'
    );
    assert.equal(sunPending.length, 1);
    assert.equal(sunPending[0]?.dateScheduled, '2026-11-15');
  });

  it('allows kids to edit or withdraw unpriced proposals while locking priced rewards and preventing sync resurrection', async () => {
    // 1. Propose two pending rewards for kid_1 and kid_2
    const first = await useChoreStore.getState().proposeWishlistReward({
      profileId: 'kid_1',
      title: 'Mini Drone',
      sourceUrl: 'https://example.com/drone',
      imageUrl: 'https://example.com/drone.jpg',
      rawPrice: 25,
    });
    const second = await useChoreStore.getState().proposeWishlistReward({
      profileId: 'kid_2',
      title: 'Art Easel',
      rawPrice: 30,
    });

    assert.equal(
      getPendingParentActionCounts(useChoreStore.getState().snapshot).needsPricingCount,
      2
    );

    // 2. Kid edits the first unpriced proposal (including clearing optional imageUrl/rawPrice & reassigning profile)
    const editRes = await useChoreStore.getState().updateWishlistProposal(first.id, {
      profileId: 'kid_2',
      title: 'Deluxe Lego Set',
      sourceUrl: 'https://example.com/lego',
      imageUrl: undefined,
      rawPrice: undefined,
    });
    assert.equal(editRes.success, true);
    assert.equal(editRes.reward?.title, 'Deluxe Lego Set');
    assert.equal(editRes.reward?.profileId, 'kid_2');
    assert.equal(editRes.reward?.sourceUrl, 'https://example.com/lego');
    assert.equal(editRes.reward?.imageUrl, undefined);
    assert.equal(editRes.reward?.rawPrice, undefined);
    assert.equal(editRes.reward?.status, 'needs_pricing');
    assert.equal(editRes.reward?.pointsCost, 0);
    assert.ok(editRes.reward?.updatedAt);

    // Count remains accurate
    assert.equal(
      getPendingParentActionCounts(useChoreStore.getState().snapshot).needsPricingCount,
      2
    );

    // 3. Kid withdraws the second unpriced proposal cleanly -> added to deletedRewardIds & decrements count
    const withdrawRes = await useChoreStore.getState().withdrawWishlistProposal(second.id);
    assert.deepEqual(withdrawRes, { success: true });
    assert.equal(
      getPendingParentActionCounts(useChoreStore.getState().snapshot).needsPricingCount,
      1
    );
    assert.ok(useChoreStore.getState().snapshot.deletedRewardIds?.includes(second.id));

    // Sync merge against an older snapshot that still contained `second` must NOT resurrect it
    const staleRemote = {
      ...createBaseSnapshot(),
      rewards: [...createBaseSnapshot().rewards, second],
      updated_at: '2026-11-12T00:00:00.000Z',
    };
    const mergedAfterWithdraw = mergeChoreSnapshotsAuthoritative(
      useChoreStore.getState().snapshot,
      staleRemote
    );
    assert.equal(
      mergedAfterWithdraw.rewards.some((r) => r.id === second.id),
      false
    );

    // 4. Sync merge preserves a newer kid edit on a `needs_pricing` proposal even if another snapshot
    //    had a newer parent action on an unrelated chore
    const staleUneditedCopy = {
      ...useChoreStore.getState().snapshot,
      rewards: useChoreStore
        .getState()
        .snapshot.rewards.map((r) =>
          r.id === first.id
            ? { ...r, title: 'Mini Drone', updatedAt: '2026-11-10T10:00:00.000Z' }
            : r
        ),
      lastParentActionAt: '2099-01-01T00:00:00.000Z',
      updated_at: '2099-01-01T00:00:00.000Z',
    };
    const newerKidEditSnap = {
      ...useChoreStore.getState().snapshot,
      rewards: useChoreStore
        .getState()
        .snapshot.rewards.map((r) =>
          r.id === first.id
            ? { ...r, title: 'Updated Rocket Ship', updatedAt: '2026-11-15T12:00:00.000Z' }
            : r
        ),
    };
    const mergedKidEdit = mergeChoreSnapshotsAuthoritative(
      newerKidEditSnap,
      staleUneditedCopy
    );
    assert.equal(
      mergedKidEdit.rewards.find((r) => r.id === first.id)?.title,
      'Updated Rocket Ship'
    );

    // Conversely, if a parent priced the reward on remote, parent pricing strictly wins
    // even if a local device has a later timestamped unpriced edit
    const remoteParentPriced = {
      ...staleUneditedCopy,
      rewards: staleUneditedCopy.rewards.map((r) =>
        r.id === first.id
          ? {
              ...r,
              status: 'active_goal' as const,
              pointsCost: 250,
              pricedAt: '2026-11-16T00:00:00.000Z',
            }
          : r
      ),
      lastParentActionAt: '2026-11-16T00:00:00.000Z',
      updated_at: '2026-11-16T00:00:00.000Z',
    };
    const localNewerUnpricedEdit = {
      ...newerKidEditSnap,
      rewards: newerKidEditSnap.rewards.map((r) =>
        r.id === first.id
          ? { ...r, updatedAt: '2026-11-17T00:00:00.000Z' }
          : r
      ),
    };
    const mergedParentPriced = mergeChoreSnapshotsAuthoritative(
      localNewerUnpricedEdit,
      remoteParentPriced
    );
    assert.equal(
      mergedParentPriced.rewards.find((r) => r.id === first.id)?.status,
      'active_goal'
    );
    assert.equal(
      mergedParentPriced.rewards.find((r) => r.id === first.id)?.pointsCost,
      250
    );

    // 5. Once priced by parent, kid self-service edit/withdraw without Parent PIN is rejected
    await useChoreStore.getState().priceWishlistReward(first.id, { pointsCost: 150 });
    const priced = useChoreStore
      .getState()
      .snapshot.rewards.find((r) => r.id === first.id);
    assert.equal(priced?.status, 'active_goal');
    assert.equal(
      getPendingParentActionCounts(useChoreStore.getState().snapshot).needsPricingCount,
      0
    );

    const lockedEdit = await useChoreStore.getState().updateWishlistProposal(first.id, {
      profileId: 'kid_2',
      title: '1 Point Bike',
    });
    assert.equal(lockedEdit.success, false);

    const lockedWithdraw = await useChoreStore.getState().withdrawWishlistProposal(first.id);
    assert.equal(lockedWithdraw.success, false);

    assert.equal(
      useChoreStore.getState().snapshot.rewards.find((r) => r.id === first.id)?.title,
      'Deluxe Lego Set'
    );
  });
});
