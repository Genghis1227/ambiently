import React, { useState, useMemo } from 'react';
import {
  Check,
  CheckCheck,
  Calculator,
  Coins,
  Edit2,
  ExternalLink,
  History,
  KeyRound,
  Lock,
  Minus,
  Palmtree,
  Plus,
  RotateCcw,
  Shield,
  Sliders,
  Sparkles,
  Trash2,
  Trophy,
  UserCheck,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useChoreStore, getPendingParentActionCounts } from '../../store/choreStore';
import { useDashboardStore } from '../../store/dashboardStore';
import { useProfileStore } from '../../stores/useProfileStore';
import type {
  ActiveChoreInstance,
  CadenceType,
  ChoreTemplate,
  OverduePolicy,
  WishlistReward,
} from '../../types/chores';
import type { HouseholdProfile } from '../../types/profiles';
import { calculateEffectiveChorePoints } from '../../utils/choreEngine';
import { HouseholdAvatar } from '../common/HouseholdAvatar';
import { HouseholdProfileManager } from '../common/HouseholdProfileManager';
import { PinOverlay } from '../kiosk/PinOverlay';
import { openInAppWebViewer } from '../../utils/webViewer';

const CHORE_ICON_PRESETS = [
  '🧹', '🛏️', '🍽️', '🐕', '🗑️', '🧺', '📚', '🦷',
  '🌱', '🧸', '🎒', '🧽', '🚿', '🚲', '🎹', '✨',
];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const ParentChoreDrawer: React.FC = () => {
  const isParentDrawerOpen = useChoreStore((s) => s.isParentDrawerOpen);
  const activeParentTab = useChoreStore((s) => s.activeParentTab);
  const setParentDrawerOpen = useChoreStore((s) => s.setParentDrawerOpen);
  const snapshot = useChoreStore((s) => s.snapshot);

  const approveChoreInstance = useChoreStore((s) => s.approveChoreInstance);
  const approveAllPendingChores = useChoreStore((s) => s.approveAllPendingChores);
  const rejectChoreInstance = useChoreStore((s) => s.rejectChoreInstance);
  const priceWishlistReward = useChoreStore((s) => s.priceWishlistReward);
  const deleteWishlistReward = useChoreStore((s) => s.deleteWishlistReward);
  const fulfillRewardRedemption = useChoreStore((s) => s.fulfillRewardRedemption);
  const cancelRewardRedemption = useChoreStore((s) => s.cancelRewardRedemption);
  const addManualAdjustment = useChoreStore((s) => s.addManualAdjustment);
  const revertLedgerEntry = useChoreStore((s) => s.revertLedgerEntry);
  const upsertChoreTemplate = useChoreStore((s) => s.upsertChoreTemplate);
  const deleteChoreTemplate = useChoreStore((s) => s.deleteChoreTemplate);
  const updateHouseholdSettings = useChoreStore((s) => s.updateHouseholdSettings);

  // Global Household Profile Store
  const householdProfiles = useProfileStore((s) => s.profiles);

  // Dashboard PIN state
  const settings = useDashboardStore((s) => s.settings);
  const unlockKiosk = useDashboardStore((s) => s.unlockKiosk);
  const setPinLock = useDashboardStore((s) => s.setPinLock);

  const [isSessionVerified, setIsSessionVerified] = useState(false);
  const [quickPinInput, setQuickPinInput] = useState('');
  const [quickPinSaved, setQuickPinSaved] = useState(false);

  // Tab 1: Approvals Split Adjustment State
  const [editingSplitInstanceId, setEditingSplitInstanceId] = useState<string | null>(null);
  const [splitOverrides, setSplitOverrides] = useState<Record<string, number>>({});

  // Tab 2: Wishlist Pricing State
  const [priceInputs, setPriceInputs] = useState<Record<string, { rawPrice: string; pointsCost: string }>>({});

  // Tab 3: Redemption Feedback
  const [fulfillmentError, setFulfillmentError] = useState<string | null>(null);

  // Tab 4: Manual Bonus / Deduction & Ledger Filter
  const [bonusProfileId, setBonusProfileId] = useState<string>('');
  const [bonusMode, setBonusMode] = useState<'add' | 'deduct'>('add');
  const [bonusPoints, setBonusPoints] = useState<string>('10');
  const [bonusNote, setBonusNote] = useState<string>('');
  const [ledgerFilterProfileId, setLedgerFilterProfileId] = useState<string>('all');

  // Tab 5B: Chore Template Editor State
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [isAddingTemplate, setIsAddingTemplate] = useState(false);
  const [tplTitle, setTplTitle] = useState('');
  const [tplIcon, setTplIcon] = useState('🧹');
  const [tplPoints, setTplPoints] = useState('15');
  const [tplAssignedTo, setTplAssignedTo] = useState<string>('shared');
  const [tplCadence, setTplCadence] = useState<CadenceType>('daily');
  const [tplDaysOfWeek, setTplDaysOfWeek] = useState<number[]>([1, 3, 5]);
  const [tplIntervalDays, setTplIntervalDays] = useState('3');
  const [tplRequiresApproval, setTplRequiresApproval] = useState(false);
  const [tplRolloverUntilDone, setTplRolloverUntilDone] = useState(true);
  const [tplOverduePolicy, setTplOverduePolicy] = useState<OverduePolicy>('full');
  const [tplOverdueCustomPct, setTplOverdueCustomPct] = useState('50');

  const { profiles, templates, instances, rewards, ledger, householdSettings } = snapshot;

  const pendingCounts = useMemo(
    () => getPendingParentActionCounts(snapshot),
    [snapshot]
  );

  const templateMap = useMemo(() => {
    const map = new Map<string, ChoreTemplate>();
    for (const t of templates) {
      map.set(t.id, t);
    }
    return map;
  }, [templates]);

  const profileMap = useMemo(() => {
    const map = new Map<string, HouseholdProfile>();
    for (const p of householdProfiles) {
      map.set(p.id, p);
    }
    return map;
  }, [householdProfiles]);

  const pendingApprovals = useMemo(
    () => instances.filter((i) => i.status === 'awaiting_approval'),
    [instances]
  );

  const needsPricingRewards = useMemo(
    () => rewards.filter((r) => r.status === 'needs_pricing'),
    [rewards]
  );

  const pendingFulfillmentRewards = useMemo(
    () => rewards.filter((r) => r.status === 'pending_fulfillment'),
    [rewards]
  );

  const filteredLedger = useMemo(() => {
    const list =
      ledgerFilterProfileId === 'all'
        ? ledger
        : ledger.filter((e) => e.profileId === ledgerFilterProfileId);
    return [...list].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [ledger, ledgerFilterProfileId]);

  if (!isParentDrawerOpen) return null;

  const handleCloseDrawer = () => {
    setIsSessionVerified(false);
    setEditingSplitInstanceId(null);
    setParentDrawerOpen(false);
  };

  // Require 4-Digit Parent PIN if configured and not yet verified for this drawer opening
  const needsPinVerification = Boolean(
    settings.pinLockEnabled && settings.pinHash && !isSessionVerified
  );

  if (needsPinVerification) {
    return (
      <PinOverlay
        title="Parent Hub Locked"
        subtitle="Enter your 4-digit Parent PIN to approve chores, price wishlist items, and manage profiles"
        onUnlock={async (enteredPin) => {
          const ok = await unlockKiosk(enteredPin);
          if (ok) {
            setIsSessionVerified(true);
            return true;
          }
          return false;
        }}
        onPinRemoved={() => {
          setIsSessionVerified(true);
        }}
        onCancel={handleCloseDrawer}
      />
    );
  }

  // Helpers for Tab 1: Approvals & Split Rebalancing
  const startSplitEdit = (instance: ActiveChoreInstance, template?: ChoreTemplate) => {
    setEditingSplitInstanceId(instance.instanceId);
    const initial: Record<string, number> = {};
    for (const p of profiles) {
      initial[p.id] = 0;
    }
    if (instance.completedBy && instance.completedBy.length > 0) {
      for (const c of instance.completedBy) {
        initial[c.profileId] = c.pointsAwarded;
      }
    } else if (template && profiles[0]) {
      initial[profiles[0].id] = calculateEffectiveChorePoints(template, instance.isOverdue);
    }
    setSplitOverrides(initial);
  };

  const handleConfirmSplitApproval = async (instance: ActiveChoreInstance) => {
    const splits = Object.entries(splitOverrides)
      .filter(([, pts]) => pts > 0)
      .map(([profileId, pointsAwarded]) => ({
        profileId,
        pointsAwarded: Math.round(pointsAwarded),
      }));
    await approveChoreInstance(instance.instanceId, splits.length > 0 ? splits : undefined);
    setEditingSplitInstanceId(null);
  };

  // Helpers for Tab 2: Wishlist Pricing
  const getRewardInputState = (reward: WishlistReward) => {
    const existing = priceInputs[reward.id];
    if (existing) return existing;
    const rawStr = reward.rawPrice !== undefined ? String(reward.rawPrice) : '';
    const autoPoints =
      reward.rawPrice !== undefined && reward.rawPrice > 0
        ? String(Math.max(1, Math.round(reward.rawPrice * (householdSettings.pointsPerDollar || 10))))
        : reward.pointsCost > 0
        ? String(reward.pointsCost)
        : '100';
    return { rawPrice: rawStr, pointsCost: autoPoints };
  };

  const handlePriceInputChange = (reward: WishlistReward, field: 'rawPrice' | 'pointsCost', value: string) => {
    const current = getRewardInputState(reward);
    if (field === 'rawPrice') {
      const parsedDollar = parseFloat(value);
      const nextPoints =
        !Number.isNaN(parsedDollar) && parsedDollar > 0
          ? String(Math.max(1, Math.round(parsedDollar * (householdSettings.pointsPerDollar || 10))))
          : current.pointsCost;
      setPriceInputs((prev) => ({
        ...prev,
        [reward.id]: { rawPrice: value, pointsCost: nextPoints },
      }));
    } else {
      setPriceInputs((prev) => ({
        ...prev,
        [reward.id]: { ...current, pointsCost: value.replace(/[^\d]/g, '') },
      }));
    }
  };

  const handleApproveRewardPricing = async (reward: WishlistReward) => {
    const state = getRewardInputState(reward);
    const pointsCost = Math.max(1, parseInt(state.pointsCost, 10) || 0);
    const parsedPrice = parseFloat(state.rawPrice);
    await priceWishlistReward(reward.id, {
      pointsCost,
      rawPrice: !Number.isNaN(parsedPrice) && parsedPrice >= 0 ? parsedPrice : reward.rawPrice,
    });
  };

  // Helpers for Tab 4: Manual Bonus / Deduction
  const handleAddManualBonus = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetProfId = bonusProfileId || profiles[0]?.id;
    if (!targetProfId) return;
    const rawPts = Math.max(1, Math.round(Number(bonusPoints) || 0));
    const delta = bonusMode === 'deduct' ? -rawPts : rawPts;
    await addManualAdjustment(
      targetProfId,
      delta,
      bonusNote.trim() || (delta > 0 ? 'Parent bonus points' : 'Parent point deduction')
    );
    setBonusNote('');
  };

  // Helpers for Tab 5B: Chore Template Editor
  const openEditTemplate = (tpl: ChoreTemplate) => {
    setEditingTemplateId(tpl.id);
    setIsAddingTemplate(false);
    setTplTitle(tpl.title);
    setTplIcon(tpl.icon || '🧹');
    setTplPoints(String(tpl.points));
    setTplAssignedTo(tpl.assignedTo);
    setTplCadence(tpl.cadence);
    setTplDaysOfWeek(tpl.daysOfWeek || [1, 3, 5]);
    setTplIntervalDays(String(tpl.intervalDays || 3));
    setTplRequiresApproval(tpl.requiresApproval);
    setTplRolloverUntilDone(tpl.rolloverUntilDone);
    setTplOverduePolicy(tpl.overduePolicy);
    setTplOverdueCustomPct(String(tpl.overdueCustomPct ?? 50));
  };

  const openAddTemplate = () => {
    setEditingTemplateId(null);
    setIsAddingTemplate(true);
    setTplTitle('');
    setTplIcon('🧹');
    setTplPoints('15');
    setTplAssignedTo('shared');
    setTplCadence('daily');
    setTplDaysOfWeek([1, 3, 5]);
    setTplIntervalDays('3');
    setTplRequiresApproval(false);
    setTplRolloverUntilDone(true);
    setTplOverduePolicy('full');
    setTplOverdueCustomPct('50');
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tplTitle.trim()) return;
    await upsertChoreTemplate({
      id: editingTemplateId || undefined,
      title: tplTitle.trim(),
      icon: tplIcon || '🧹',
      points: Math.max(1, Math.round(Number(tplPoints) || 10)),
      assignedTo: tplAssignedTo,
      cadence: tplCadence,
      daysOfWeek: tplCadence === 'weekly' ? tplDaysOfWeek : undefined,
      intervalDays: tplCadence === 'interval' ? Math.max(1, Math.round(Number(tplIntervalDays) || 2)) : undefined,
      requiresApproval: tplRequiresApproval,
      rolloverUntilDone: tplRolloverUntilDone,
      overduePolicy: tplOverduePolicy,
      overdueCustomPct: tplOverduePolicy === 'custom' ? Math.max(0, Math.min(100, Math.round(Number(tplOverdueCustomPct) || 50))) : undefined,
    });
    setEditingTemplateId(null);
    setIsAddingTemplate(false);
  };

  return (
    <div
      className="fixed inset-0 z-[9200] flex justify-end bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-label="Parent Chore & Reward Controls"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl h-full bg-[#111622] border-l border-slate-800/90 shadow-2xl flex flex-col overflow-hidden text-slate-100"
      >
        {/* Top Drawer Header */}
        <header className="px-6 py-4 border-b border-slate-800/80 bg-slate-900/70 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-300">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Parent Command Drawer
                </h2>
                {settings.pinLockEnabled && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5" /> PIN Verified
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Authoritative approvals, wishlist appraisal, audit ledger & household profiles
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleCloseDrawer}
            className="p-2 rounded-xl bg-slate-800/70 hover:bg-slate-700/70 text-slate-400 hover:text-white border border-slate-700/60 transition-colors cursor-pointer"
            title="Close Parent Drawer"
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Optional Quick PIN Setup Banner if no PIN is configured yet */}
        {!settings.pinLockEnabled && (
          <div className="px-6 py-2.5 bg-amber-500/10 border-b border-amber-500/25 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 text-xs text-amber-200">
              <KeyRound className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Protect this Parent Drawer with a 4-digit PIN so kids can&apos;t self-approve:</span>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="password"
                maxLength={4}
                value={quickPinInput}
                onChange={(e) => setQuickPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="4-digit PIN"
                className="w-24 px-2.5 py-1 rounded-lg bg-slate-900 border border-amber-500/30 text-xs text-white font-mono text-center focus:outline-none focus:border-amber-400"
              />
              <button
                type="button"
                disabled={quickPinInput.length !== 4}
                onClick={async () => {
                  await setPinLock(quickPinInput);
                  setIsSessionVerified(true);
                  setQuickPinInput('');
                  setQuickPinSaved(true);
                  setTimeout(() => setQuickPinSaved(false), 3000);
                }}
                className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-xs transition-colors cursor-pointer"
              >
                Enable PIN
              </button>
            </div>
          </div>
        )}
        {quickPinSaved && (
          <div className="px-6 py-1.5 bg-emerald-500/15 border-b border-emerald-500/30 text-xs text-emerald-300 font-medium">
            4-Digit Parent PIN enabled!
          </div>
        )}

        {/* 5-Tab Navigation Bar */}
        <nav className="px-4 pt-2.5 border-b border-slate-800/80 bg-slate-900/40 flex items-center gap-1 overflow-x-auto shrink-0">
          <button
            type="button"
            onClick={() => setParentDrawerOpen(true, 'approvals')}
            className={`px-3 py-2 rounded-t-xl text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              activeParentTab === 'approvals'
                ? 'border-amber-400 text-amber-200 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>Approvals</span>
            {pendingCounts.awaitingApprovalCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500/25 text-amber-200 border border-amber-400/30">
                {pendingCounts.awaitingApprovalCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setParentDrawerOpen(true, 'pricing')}
            className={`px-3 py-2 rounded-t-xl text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              activeParentTab === 'pricing'
                ? 'border-amber-400 text-amber-200 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calculator className="w-3.5 h-3.5" />
            <span>Wishlist Pricing</span>
            {pendingCounts.needsPricingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500/25 text-amber-200 border border-amber-400/30">
                {pendingCounts.needsPricingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setParentDrawerOpen(true, 'fulfillment')}
            className={`px-3 py-2 rounded-t-xl text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              activeParentTab === 'fulfillment'
                ? 'border-amber-400 text-amber-200 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" />
            <span>Redemptions</span>
            {pendingCounts.pendingFulfillmentCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500/25 text-amber-200 border border-amber-400/30">
                {pendingCounts.pendingFulfillmentCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setParentDrawerOpen(true, 'ledger')}
            className={`px-3 py-2 rounded-t-xl text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              activeParentTab === 'ledger'
                ? 'border-amber-400 text-amber-200 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Ledger & Bonus</span>
          </button>

          <button
            type="button"
            onClick={() => setParentDrawerOpen(true, 'templates')}
            className={`px-3 py-2 rounded-t-xl text-xs font-semibold border-b-2 flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
              activeParentTab === 'templates'
                ? 'border-amber-400 text-amber-200 bg-amber-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Chores & Profiles</span>
          </button>
        </nav>

        {/* Scrollable Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* =========================================================
              TAB 1: PENDING CHORE APPROVALS
          ========================================================= */}
          {activeParentTab === 'approvals' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Chores Awaiting Parent Review ({pendingApprovals.length})
                  </h3>
                  <p className="text-xs text-slate-400">
                    Verify completed tasks or rebalance shared point splits before awarding points.
                  </p>
                </div>

                {pendingApprovals.length > 0 && (
                  <button
                    type="button"
                    onClick={() => approveAllPendingChores()}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600/25 hover:bg-emerald-600/35 text-emerald-200 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                  >
                    <CheckCheck className="w-4 h-4" />
                    <span>Approve All ({pendingApprovals.length})</span>
                  </button>
                )}
              </div>

              {pendingApprovals.length === 0 ? (
                <div className="p-8 rounded-2xl bg-slate-900/50 border border-slate-800/80 text-center space-y-2">
                  <Check className="w-8 h-8 text-emerald-400 mx-auto" />
                  <p className="text-sm font-semibold text-slate-200">All caught up!</p>
                  <p className="text-xs text-slate-400">
                    No chores are waiting for parent verification right now.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingApprovals.map((inst) => {
                    const tpl = templateMap.get(inst.choreId);
                    const totalPts = tpl
                      ? calculateEffectiveChorePoints(tpl, inst.isOverdue)
                      : (inst.completedBy || []).reduce((acc, c) => acc + c.pointsAwarded, 0);
                    const isEditingSplit = editingSplitInstanceId === inst.instanceId;
                    const splitSum = Object.values(splitOverrides).reduce((a, b) => a + b, 0);

                    return (
                      <div
                        key={inst.instanceId}
                        className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800/90 space-y-3"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <span className="text-2xl leading-none mt-0.5">
                              {tpl?.icon || '🧹'}
                            </span>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold text-white">
                                  {tpl?.title || 'Chore'}
                                </span>
                                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                  +{totalPts} pts
                                </span>
                                {inst.isOverdue && (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-400/30">
                                    Overdue ({inst.dateScheduled})
                                  </span>
                                )}
                              </div>

                              {/* Claimed By Summary */}
                              <div className="flex items-center flex-wrap gap-2 mt-2">
                                {(inst.completedBy || []).map((entry) => {
                                  const hp = profileMap.get(entry.profileId);
                                  return (
                                    <div
                                      key={entry.profileId}
                                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800/80 border border-slate-700/70 text-xs"
                                    >
                                      {hp && <HouseholdAvatar profile={hp} size="xs" />}
                                      <span className="font-medium text-slate-200">
                                        {hp?.name || entry.profileId}
                                      </span>
                                      <span className="font-mono font-bold text-emerald-300">
                                        +{entry.pointsAwarded}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                isEditingSplit
                                  ? setEditingSplitInstanceId(null)
                                  : startSplitEdit(inst, tpl)
                              }
                              className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700 transition-colors cursor-pointer"
                            >
                              {isEditingSplit ? 'Cancel Split' : 'Adjust Split'}
                            </button>
                            <button
                              type="button"
                              onClick={() => rejectChoreInstance(inst.instanceId)}
                              className="px-2.5 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold transition-colors cursor-pointer"
                              title="Return chore to pending list"
                            >
                              Return
                            </button>
                            <button
                              type="button"
                              onClick={() => approveChoreInstance(inst.instanceId)}
                              className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Approve</span>
                            </button>
                          </div>
                        </div>

                        {/* Interactive Parent Point Split Rebalancer */}
                        {isEditingSplit && (
                          <div className="pt-3 border-t border-slate-800 space-y-2.5">
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-slate-300 font-semibold">
                                Rebalance Points Across Kids:
                              </span>
                              <span
                                className={`font-mono font-bold ${
                                  splitSum === totalPts ? 'text-emerald-400' : 'text-amber-300'
                                }`}
                              >
                                Allocated: {splitSum} / {totalPts} pts
                              </span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {profiles.map((kid) => {
                                const hp = profileMap.get(kid.id);
                                const val = splitOverrides[kid.id] ?? 0;
                                return (
                                  <div
                                    key={kid.id}
                                    className="flex items-center justify-between p-2 rounded-xl bg-slate-950/70 border border-slate-800"
                                  >
                                    <div className="flex items-center gap-2">
                                      {hp && <HouseholdAvatar profile={hp} size="xs" />}
                                      <span className="text-xs font-semibold text-slate-200">
                                        {kid.name}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setSplitOverrides((prev) => ({
                                            ...prev,
                                            [kid.id]: Math.max(0, (prev[kid.id] ?? 0) - 1),
                                          }))
                                        }
                                        className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 cursor-pointer"
                                      >
                                        <Minus className="w-3 h-3" />
                                      </button>
                                      <input
                                        type="number"
                                        min={0}
                                        value={val}
                                        onChange={(e) =>
                                          setSplitOverrides((prev) => ({
                                            ...prev,
                                            [kid.id]: Math.max(0, parseInt(e.target.value, 10) || 0),
                                          }))
                                        }
                                        className="w-14 text-center bg-slate-900 border border-slate-700 rounded-lg py-0.5 text-xs font-mono text-white"
                                      />
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setSplitOverrides((prev) => ({
                                            ...prev,
                                            [kid.id]: (prev[kid.id] ?? 0) + 1,
                                          }))
                                        }
                                        className="w-6 h-6 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-300 cursor-pointer"
                                      >
                                        <Plus className="w-3 h-3" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="flex justify-end">
                              <button
                                type="button"
                                disabled={splitSum <= 0}
                                onClick={() => handleConfirmSplitApproval(inst)}
                                className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-xs font-bold cursor-pointer"
                              >
                                Approve Custom Split ({splitSum} pts)
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* =========================================================
              TAB 2: WISHLIST PRICING QUEUE
          ========================================================= */}
          {activeParentTab === 'pricing' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Wishlist Proposals Tray ({needsPricingRewards.length})
                  </h3>
                  <p className="text-xs text-slate-400">
                    Appraise kid-submitted wishlist items using the Points-per-Dollar calculator (
                    <span className="text-amber-300 font-mono">
                      $1 = {householdSettings.pointsPerDollar || 10} pts
                    </span>
                    ) or set a custom point target.
                  </p>
                </div>
              </div>

              {needsPricingRewards.length === 0 ? (
                <div className="p-8 rounded-2xl bg-slate-900/50 border border-slate-800/80 text-center space-y-2">
                  <Sparkles className="w-8 h-8 text-amber-300/70 mx-auto" />
                  <p className="text-sm font-semibold text-slate-200">Proposals Tray is empty</p>
                  <p className="text-xs text-slate-400">
                    When kids propose a wishlist item, it will appear here for point pricing before becoming an active goal.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {needsPricingRewards.map((reward) => {
                    const hp = profileMap.get(reward.profileId);
                    const state = getRewardInputState(reward);

                    return (
                      <div
                        key={reward.id}
                        className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800/90 space-y-3"
                      >
                        <div className="flex items-start gap-3">
                          {reward.imageUrl ? (
                            <img
                              src={reward.imageUrl}
                              alt={reward.title}
                              className="w-16 h-16 rounded-xl object-cover border border-slate-700/80 shrink-0 bg-slate-950"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-xl bg-slate-800/80 border border-slate-700/70 flex items-center justify-center text-2xl shrink-0">
                              🎁
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {hp && <HouseholdAvatar profile={hp} size="xs" />}
                              <span className="text-xs font-semibold text-slate-300">
                                {hp?.name || 'Child'}
                              </span>
                              <span className="text-[11px] text-slate-500">•</span>
                              <span className="text-[11px] text-slate-400">
                                Proposed {new Date(reward.createdAt).toLocaleDateString()}
                              </span>
                            </div>

                            <h4 className="text-sm font-bold text-white mt-1 truncate">
                              {reward.title}
                            </h4>

                            {reward.sourceUrl && (
                              <button
                                type="button"
                                onClick={() => openInAppWebViewer(reward.sourceUrl!, reward.title)}
                                className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 mt-1 cursor-pointer"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span className="truncate max-w-xs">Inspect Product Link</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Calculator + Arbitrary Point Controls */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80">
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                              1. Dollar Price ($1 = {householdSettings.pointsPerDollar || 10} pts)
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-mono">
                                $
                              </span>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0.00"
                                value={state.rawPrice}
                                onChange={(e) =>
                                  handlePriceInputChange(reward, 'rawPrice', e.target.value)
                                }
                                className="w-full pl-7 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono text-white focus:outline-none focus:border-amber-400"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                              2. Final Point Cost (Integer Points)
                            </label>
                            <div className="relative">
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={state.pointsCost}
                                onChange={(e) =>
                                  handlePriceInputChange(reward, 'pointsCost', e.target.value)
                                }
                                className="w-full px-3 py-1.5 rounded-xl bg-slate-950 border border-amber-500/40 text-xs font-mono font-bold text-amber-300 focus:outline-none focus:border-amber-400"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-amber-400/80 font-semibold">
                                pts
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => deleteWishlistReward(reward.id)}
                            className="px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Decline</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleApproveRewardPricing(reward)}
                            className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Publish to Reward Store ({state.pointsCost || 100} pts)</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* =========================================================
              TAB 3: REWARD REDEMPTION FULFILLMENT
          ========================================================= */}
          {activeParentTab === 'fulfillment' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-bold text-white">
                  Pending Reward Redemptions ({pendingFulfillmentRewards.length})
                </h3>
                <p className="text-xs text-slate-400">
                  Confirming a redemption deducts points from the child&apos;s spendable balance and archives the reward into their Trophy Case.
                </p>
              </div>

              {fulfillmentError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-200">
                  {fulfillmentError}
                </div>
              )}

              {pendingFulfillmentRewards.length === 0 ? (
                <div className="p-8 rounded-2xl bg-slate-900/50 border border-slate-800/80 text-center space-y-2">
                  <Trophy className="w-8 h-8 text-amber-400/70 mx-auto" />
                  <p className="text-sm font-semibold text-slate-200">No pending redemptions</p>
                  <p className="text-xs text-slate-400">
                    When a child unlocks and claims a reward goal, it will appear here for parent fulfillment.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingFulfillmentRewards.map((reward) => {
                    const kid = profiles.find((p) => p.id === reward.profileId);
                    const hp = profileMap.get(reward.profileId);
                    const canAfford = (kid?.balance ?? 0) >= reward.pointsCost;

                    return (
                      <div
                        key={reward.id}
                        className="p-4 rounded-2xl bg-slate-900/70 border border-amber-500/30 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            {reward.imageUrl ? (
                              <img
                                src={reward.imageUrl}
                                alt={reward.title}
                                className="w-14 h-14 rounded-xl object-cover border border-slate-700"
                              />
                            ) : (
                              <div className="w-14 h-14 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-2xl">
                                🏆
                              </div>
                            )}
                            <div>
                              <div className="flex items-center gap-2">
                                {hp && <HouseholdAvatar profile={hp} size="xs" />}
                                <span className="text-xs font-bold text-slate-200">
                                  {kid?.name || 'Child'}
                                </span>
                                <span className="text-[11px] text-slate-400 font-mono">
                                  (Wallet: {kid?.balance ?? 0} pts)
                                </span>
                              </div>
                              <h4 className="text-sm font-bold text-white mt-0.5">
                                {reward.title}
                              </h4>
                              <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-[11px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-400/30">
                                Cost: {reward.pointsCost} pts
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => cancelRewardRedemption(reward.id)}
                              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 cursor-pointer"
                            >
                              Return to Store
                            </button>

                            <button
                              type="button"
                              disabled={!canAfford}
                              onClick={async () => {
                                setFulfillmentError(null);
                                const res = await fulfillRewardRedemption(reward.id);
                                if (!res.success && res.error) {
                                  setFulfillmentError(res.error);
                                }
                              }}
                              className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                            >
                              <Trophy className="w-3.5 h-3.5" />
                              <span>Fulfill & Archive Trophy</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* =========================================================
              TAB 4: APPEND-ONLY AUDIT LEDGER & MANUAL BONUS POINTS
          ========================================================= */}
          {activeParentTab === 'ledger' && (
            <div className="space-y-5">
              {/* Ad-Hoc Manual Adjustment Form */}
              <form
                onSubmit={handleAddManualBonus}
                className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800/90 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Coins className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm font-bold text-white">
                      Manual Bonus or Point Adjustment
                    </h3>
                  </div>
                  <div className="inline-flex rounded-xl bg-slate-950 p-0.5 border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setBonusMode('add')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                        bonusMode === 'add'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      + Bonus
                    </button>
                    <button
                      type="button"
                      onClick={() => setBonusMode('deduct')}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                        bonusMode === 'deduct'
                          ? 'bg-rose-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      - Deduct
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <select
                    value={bonusProfileId || profiles[0]?.id || ''}
                    onChange={(e) => setBonusProfileId(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-400"
                  >
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.balance} pts)
                      </option>
                    ))}
                  </select>

                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={bonusPoints}
                    onChange={(e) => setBonusPoints(e.target.value)}
                    placeholder="Points"
                    className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-white focus:outline-none focus:border-amber-400"
                  />

                  <input
                    type="text"
                    value={bonusNote}
                    onChange={(e) => setBonusNote(e.target.value)}
                    placeholder="Reason note (e.g. Helped with groceries)"
                    className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    className={`px-4 py-1.5 rounded-xl text-xs font-bold text-white cursor-pointer ${
                      bonusMode === 'add'
                        ? 'bg-emerald-600 hover:bg-emerald-500'
                        : 'bg-rose-600 hover:bg-rose-500'
                    }`}
                  >
                    {bonusMode === 'add' ? 'Award Bonus Points' : 'Record Point Deduction'}
                  </button>
                </div>
              </form>

              {/* Chronological Append-Only Audit Ledger */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      Append-Only Point Audit Ledger ({filteredLedger.length})
                    </h3>
                    <p className="text-xs text-slate-400">
                      Every point transaction is permanently logged. Reverting appends an offsetting entry.
                    </p>
                  </div>

                  <select
                    value={ledgerFilterProfileId}
                    onChange={(e) => setLedgerFilterProfileId(e.target.value)}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-200"
                  >
                    <option value="all">All Kids</option>
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                  {filteredLedger.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-6">
                      No ledger transactions recorded yet.
                    </p>
                  ) : (
                    filteredLedger.slice(0, 80).map((entry) => {
                      const hp = profileMap.get(entry.profileId);
                      const isPositive = entry.pointsDelta >= 0;

                      return (
                        <div
                          key={entry.id}
                          className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {hp && <HouseholdAvatar profile={hp} size="xs" />}
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-slate-200">
                                  {hp?.name || entry.profileId}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400">
                                  {entry.type.replace('_', ' ')}
                                </span>
                                <span className="text-[11px] text-slate-500">
                                  {new Date(entry.timestamp).toLocaleString([], {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              </div>
                              {entry.note && (
                                <p className="text-xs text-slate-400 truncate mt-0.5">
                                  {entry.note}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`text-xs font-mono font-bold ${
                                isPositive ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {isPositive ? `+${entry.pointsDelta}` : entry.pointsDelta} pts
                            </span>

                            {entry.canRevert && (
                              <button
                                type="button"
                                onClick={() => revertLedgerEntry(entry.id)}
                                title="Append offsetting reversion entry"
                                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium flex items-center gap-1 cursor-pointer"
                              >
                                <RotateCcw className="w-3 h-3" />
                                <span>Revert</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}

          {/* =========================================================
              TAB 5: CHORE TEMPLATES, HOUSEHOLD PROFILES & VACATION MODE
          ========================================================= */}
          {activeParentTab === 'templates' && (
            <div className="space-y-6">
              {/* Section A: Household Settings & Vacation Mode */}
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800/90 space-y-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Palmtree className="w-4 h-4 text-emerald-400" />
                  <span>Household Engine & Vacation Mode</span>
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Vacation Mode Toggle */}
                  <button
                    type="button"
                    onClick={() =>
                      updateHouseholdSettings({ vacationMode: !householdSettings.vacationMode })
                    }
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      householdSettings.vacationMode
                        ? 'bg-amber-500/15 border-amber-400/40 text-amber-200'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">Vacation Mode</span>
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-800">
                        {householdSettings.vacationMode ? 'PAUSED' : 'ACTIVE'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Freezes midnight rollovers & overdue penalties while away.
                    </p>
                  </button>

                  {/* Points-per-Dollar Ratio */}
                  <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                    <label className="block text-xs font-bold text-slate-200">
                      Points per $1.00
                    </label>
                    <div className="flex items-center gap-2 mt-1.5">
                      <input
                        type="number"
                        min={1}
                        max={1000}
                        value={householdSettings.pointsPerDollar || 10}
                        onChange={(e) =>
                          updateHouseholdSettings({
                            pointsPerDollar: Math.max(1, parseInt(e.target.value, 10) || 10),
                          })
                        }
                        className="w-20 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-white"
                      />
                      <span className="text-[11px] text-slate-400">pts / $1</span>
                    </div>
                  </div>

                  {/* Celebration Sound Toggle */}
                  <button
                    type="button"
                    onClick={() =>
                      updateHouseholdSettings({
                        soundEffectsEnabled: !householdSettings.soundEffectsEnabled,
                      })
                    }
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      householdSettings.soundEffectsEnabled
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                        : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">Celebration Chime</span>
                      {householdSettings.soundEffectsEnabled ? (
                        <Volume2 className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <VolumeX className="w-4 h-4 text-slate-500" />
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      {householdSettings.soundEffectsEnabled
                        ? 'Soft chime enabled (muted in Night Mode)'
                        : 'Silent confetti only (audio off)'}
                    </p>
                  </button>
                </div>
              </div>

              {/* Section B: Global Household Profiles & WebP Avatar Upload */}
              <HouseholdProfileManager />

              {/* Section C: Chore Template Manager */}
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800/90 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-emerald-400" />
                      <span>Chore Templates ({templates.length})</span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Configure recurring schedules, shared chores, parent approval gates & overdue point policies.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={openAddTemplate}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600/25 hover:bg-emerald-600/35 text-emerald-200 border border-emerald-500/40 text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Chore</span>
                  </button>
                </div>

                {/* Add / Edit Chore Template Form */}
                {(isAddingTemplate || editingTemplateId) && (
                  <form
                    onSubmit={handleSaveTemplate}
                    className="p-4 rounded-xl bg-slate-950 border border-emerald-500/40 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-300">
                        {editingTemplateId ? 'Edit Chore Template' : 'Create Chore Template'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTemplateId(null);
                          setIsAddingTemplate(false);
                        }}
                        className="text-xs text-slate-400 hover:text-white cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="sm:col-span-2">
                        <label className="block text-[11px] text-slate-400 mb-1">Chore Title</label>
                        <input
                          type="text"
                          required
                          value={tplTitle}
                          onChange={(e) => setTplTitle(e.target.value)}
                          placeholder="e.g. Unload Dishwasher"
                          className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Points</label>
                        <input
                          type="number"
                          min={1}
                          required
                          value={tplPoints}
                          onChange={(e) => setTplPoints(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-white"
                        />
                      </div>
                    </div>

                    {/* Icon Picker */}
                    <div>
                      <label className="block text-[11px] text-slate-400 mb-1">Icon</label>
                      <div className="flex items-center flex-wrap gap-1.5">
                        {CHORE_ICON_PRESETS.map((ic) => (
                          <button
                            key={ic}
                            type="button"
                            onClick={() => setTplIcon(ic)}
                            className={`w-7 h-7 rounded-lg text-sm flex items-center justify-center border cursor-pointer ${
                              tplIcon === ic
                                ? 'bg-emerald-500/25 border-emerald-400'
                                : 'bg-slate-900 border-slate-800'
                            }`}
                          >
                            {ic}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Assigned To & Cadence */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Assigned To</label>
                        <select
                          value={tplAssignedTo}
                          onChange={(e) => setTplAssignedTo(e.target.value)}
                          className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
                        >
                          <option value="shared">Shared / Anyone (Supports Point Splitting)</option>
                          {profiles.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">Cadence</label>
                        <select
                          value={tplCadence}
                          onChange={(e) => setTplCadence(e.target.value as CadenceType)}
                          className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
                        >
                          <option value="daily">Daily (Every Day)</option>
                          <option value="weekdays">Weekdays (Mon–Fri)</option>
                          <option value="weekends">Weekends (Sat–Sun)</option>
                          <option value="weekly">Weekly (Specific Days)</option>
                          <option value="interval">Interval (Every N Days)</option>
                          <option value="bounty">One-Off Bounty</option>
                        </select>
                      </div>
                    </div>

                    {/* Conditional Weekly Day-of-Week Selector */}
                    {tplCadence === 'weekly' && (
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          Scheduled Days of Week
                        </label>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {DAY_LABELS.map((label, dayIdx) => {
                            const selected = tplDaysOfWeek.includes(dayIdx);
                            return (
                              <button
                                key={label}
                                type="button"
                                onClick={() =>
                                  setTplDaysOfWeek((prev) =>
                                    selected
                                      ? prev.filter((d) => d !== dayIdx)
                                      : [...prev, dayIdx].sort()
                                  )
                                }
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
                                  selected
                                    ? 'bg-emerald-600/30 border-emerald-400 text-emerald-200'
                                    : 'bg-slate-900 border-slate-800 text-slate-400'
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Conditional Interval Days Selector */}
                    {tplCadence === 'interval' && (
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">
                          Repeat Every N Days
                        </label>
                        <input
                          type="number"
                          min={2}
                          max={60}
                          value={tplIntervalDays}
                          onChange={(e) => setTplIntervalDays(e.target.value)}
                          className="w-28 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-white"
                        />
                      </div>
                    )}

                    {/* Rollover & Overdue Policy */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tplRequiresApproval}
                          onChange={(e) => setTplRequiresApproval(e.target.checked)}
                          className="rounded border-slate-700"
                        />
                        <span>Require Parent Approval before awarding points</span>
                      </label>

                      <label className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={tplRolloverUntilDone}
                          onChange={(e) => setTplRolloverUntilDone(e.target.checked)}
                          className="rounded border-slate-700"
                        />
                        <span>Carry over as Overdue if unfinished at midnight</span>
                      </label>
                    </div>

                    {tplRolloverUntilDone && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">
                            Overdue Point Policy
                          </label>
                          <select
                            value={tplOverduePolicy}
                            onChange={(e) => setTplOverduePolicy(e.target.value as OverduePolicy)}
                            className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white"
                          >
                            <option value="full">Full Points (100%)</option>
                            <option value="half">Half Points (50% rounded down)</option>
                            <option value="zero">Zero Points (0 pts — clears nag only)</option>
                            <option value="custom">Custom Percentage (%)</option>
                          </select>
                        </div>

                        {tplOverduePolicy === 'custom' && (
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">
                              Custom Overdue % (0–100)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={tplOverdueCustomPct}
                              onChange={(e) => setTplOverdueCustomPct(e.target.value)}
                              className="w-full px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs font-mono text-white"
                            />
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex justify-end pt-1">
                      <button
                        type="submit"
                        className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
                      >
                        Save Chore Template
                      </button>
                    </div>
                  </form>
                )}

                {/* Existing Chore Templates List */}
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {templates.map((tpl) => {
                    const assignedProfile =
                      tpl.assignedTo === 'shared' ? null : profileMap.get(tpl.assignedTo);
                    return (
                      <div
                        key={tpl.id}
                        className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-xl shrink-0">{tpl.icon || '🧹'}</span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-white truncate">
                                {tpl.title}
                              </span>
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                                {tpl.points} pts
                              </span>
                              <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-slate-300">
                                {tpl.cadence}
                              </span>
                              {tpl.requiresApproval && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-500/15 text-amber-300">
                                  🛡️ Review
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                              <span>
                                Assigned:{' '}
                                <strong className="text-slate-300">
                                  {tpl.assignedTo === 'shared'
                                    ? 'Shared (All Kids)'
                                    : assignedProfile?.name ||
                                      profiles.find((p) => p.id === tpl.assignedTo)?.name ||
                                      'Shared (All Kids)'}
                                </strong>
                              </span>
                              {tpl.rolloverUntilDone && (
                                <span>• Overdue: {tpl.overduePolicy}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditTemplate(tpl)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                            title="Edit chore"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteChoreTemplate(tpl.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 cursor-pointer"
                            title="Delete chore"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
