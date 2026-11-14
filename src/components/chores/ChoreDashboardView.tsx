import React, { useState, useMemo, useEffect } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Inbox,
  Lock,
  Minimize2,
  Minus,
  Palmtree,
  Plus,
  RotateCcw,
  Settings,
  Shield,
  Sparkles,
  Trophy,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { useChoreStore, getPendingParentActionCounts } from '../../store/choreStore';
import { useDashboardStore } from '../../store/dashboardStore';
import type {
  ActiveChoreInstance,
  ChoreTemplate,
  ChoreWidgetConfig,
  Profile,
  WishlistReward,
} from '../../types/chores';
import {
  calculateEffectiveChorePoints,
  canSelfRevertInstance,
  daysBetweenDateKeys,
  getWeekEndDateKey,
  getWeekStartDateKey,
  isDateMatchingTemplateCadence,
  isWeeklyChoreCompletedInWeek,
} from '../../utils/choreEngine';
import { localDateKey } from '../../utils/timePrefs';
import { HouseholdAvatar } from '../common/HouseholdAvatar';
import { PointSplitModal } from './PointSplitModal';
import { ProposeRewardModal } from './ProposeRewardModal';
import { ProposalsTrayModal } from './ProposalsTrayModal';
import { TrophyCaseModal } from './TrophyCaseModal';
import { RewardStorePanel } from './RewardStorePanel';
import { triggerChoreCelebration } from '../../utils/confetti';

export interface ChoreDashboardViewProps {
  isOpen: boolean;
  onClose?: () => void;
  variant?: 'view';
  mode?: 'overlay' | 'canvas';
  title?: string;
  config?: ChoreWidgetConfig;
  isLight?: boolean;
  dockPaddingClass?: string;
  onOpenWidgetSettings?: () => void;
}

type AccordionSectionId = 'today' | 'review' | 'completed';

interface ChildChoreRowItem {
  instance: ActiveChoreInstance;
  template: ChoreTemplate;
  effectivePoints: number;
  awardedPointsForChild?: number;
  isShared: boolean;
  canUndo: boolean;
}

export const ChoreDashboardView: React.FC<ChoreDashboardViewProps> = ({
  isOpen,
  onClose,
  mode = 'overlay',
  title,
  config,
  isLight = false,
  dockPaddingClass,
  onOpenWidgetSettings,
}) => {
  const snapshot = useChoreStore((s) => s.snapshot);
  const dashboardWeekStartsOn = useDashboardStore((s) => s.settings.weekStartsOn);
  const completeChore = useChoreStore((s) => s.completeChore);
  const revertChoreSameDay = useChoreStore((s) => s.revertChoreSameDay);
  const skipChoreInstance = useChoreStore((s) => s.skipChoreInstance);
  const dismissChoreInstance = useChoreStore((s) => s.dismissChoreInstance);
  const proposeWishlistReward = useChoreStore((s) => s.proposeWishlistReward);
  const updateWishlistProposal = useChoreStore((s) => s.updateWishlistProposal);
  const withdrawWishlistProposal = useChoreStore((s) => s.withdrawWishlistProposal);
  const claimUnlockedReward = useChoreStore((s) => s.claimUnlockedReward);
  const setParentDrawerOpen = useChoreStore((s) => s.setParentDrawerOpen);

  const [activeScope, setActiveScope] = useState<string>(config?.scope || 'household');
  const [mobileColumnTab, setMobileColumnTab] = useState<'chores' | 'rewards' | 'profiles'>('chores');

  useEffect(() => {
    if (mode === 'canvas') {
      setActiveScope(config?.scope || 'household');
    }
  }, [mode, config?.scope]);

  const effectiveScope = useMemo(() => {
    if (activeScope === 'household') return 'household';
    return snapshot.profiles.some((p) => p.id === activeScope) ? activeScope : 'household';
  }, [activeScope, snapshot.profiles]);

  const [expandedSections, setExpandedSections] = useState<Record<AccordionSectionId, boolean>>(() => {
    if (mode === 'canvas' && Array.isArray(config?.defaultExpandedSections)) {
      const defaults = config.defaultExpandedSections;
      return {
        today: defaults.includes('today'),
        review: defaults.includes('review'),
        completed: defaults.includes('completed'),
      };
    }
    return {
      today: true,
      review: true,
      completed: true,
    };
  });
  const [collapsedChildKeys, setCollapsedChildKeys] = useState<Record<string, boolean>>({});

  const [splitTarget, setSplitTarget] = useState<{
    instance: ActiveChoreInstance;
    template: ChoreTemplate;
    defaultProfileId?: string;
  } | null>(null);
  const [isProposeModalOpen, setIsProposeModalOpen] = useState(false);
  const [editingProposal, setEditingProposal] = useState<WishlistReward | null>(null);
  const [isProposalsTrayOpen, setIsProposalsTrayOpen] = useState(false);
  const [proposalsTrayScope, setProposalsTrayScope] = useState<string>('household');
  const [isTrophyCaseOpen, setIsTrophyCaseOpen] = useState(false);

  useEffect(() => {
    if (!isOpen || mode === 'canvas' || !onClose) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' &&
        !splitTarget &&
        !isProposeModalOpen &&
        !editingProposal &&
        !isProposalsTrayOpen &&
        !isTrophyCaseOpen &&
        !useChoreStore.getState().isParentDrawerOpen
      ) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    isOpen,
    mode,
    onClose,
    splitTarget,
    isProposeModalOpen,
    editingProposal,
    isProposalsTrayOpen,
    isTrophyCaseOpen,
  ]);

  const todayKey = localDateKey(new Date());
  const templateMap = useMemo(
    () => new Map(snapshot.templates.map((t) => [t.id, t])),
    [snapshot.templates]
  );

  const visibleProfiles = useMemo(() => {
    if (effectiveScope === 'household') return snapshot.profiles;
    const matched = snapshot.profiles.filter((p) => p.id === effectiveScope);
    return matched.length > 0 ? matched : snapshot.profiles;
  }, [snapshot.profiles, effectiveScope]);

  const pendingCounts = useMemo(
    () => getPendingParentActionCounts(snapshot),
    [snapshot]
  );

  const {
    todayByChild,
    sharedPendingItems,
    reviewByChild,
    completedByChild,
    sharedCompletedItems,
    todayTotalCount,
    reviewTotalCount,
    completedTotalCount,
  } = useMemo(() => {
    const now = new Date();
    const tByChild = new Map<string, ChildChoreRowItem[]>();
    const rByChild = new Map<string, ChildChoreRowItem[]>();
    const cByChild = new Map<string, ChildChoreRowItem[]>();
    const sharedPending: ChildChoreRowItem[] = [];
    const sharedCompleted: ChildChoreRowItem[] = [];

    for (const p of visibleProfiles) {
      tByChild.set(p.id, []);
      rByChild.set(p.id, []);
      cByChild.set(p.id, []);
    }

    let tCount = 0;
    let rCount = 0;
    let cCount = 0;

    const weekStartsOn: 'sunday' | 'monday' =
      dashboardWeekStartsOn === 'monday' ||
      snapshot.householdSettings?.weekStartsOn === 'monday'
        ? 'monday'
        : 'sunday';
    const currentWeekStartKey = getWeekStartDateKey(todayKey, weekStartsOn);
    const currentWeekEndKey = getWeekEndDateKey(todayKey, weekStartsOn);
    const seenWeeklyAnyDayPending = new Set<string>();

    for (const inst of snapshot.instances) {
      const tpl = templateMap.get(inst.choreId);
      if (!tpl) continue;

      if (inst.status === 'pending' && tpl.cadence === 'weekly' && tpl.weeklyAnyDay) {
        if (
          seenWeeklyAnyDayPending.has(tpl.id) ||
          inst.dateScheduled < currentWeekStartKey ||
          isWeeklyChoreCompletedInWeek(
            tpl.id,
            currentWeekStartKey,
            currentWeekEndKey,
            snapshot.instances,
            snapshot.ledger
          )
        ) {
          continue;
        }
        seenWeeklyAnyDayPending.add(tpl.id);
      }

      const isValidPending =
        inst.status !== 'pending' ||
        (isDateMatchingTemplateCadence(tpl, inst.dateScheduled) &&
          (inst.dateScheduled === todayKey ||
            (inst.isOverdue && daysBetweenDateKeys(inst.dateScheduled, todayKey) <= 1)));
      if (!isValidPending) continue;

      const completedToday =
        Boolean(inst.completedAt) &&
        localDateKey(new Date(inst.completedAt as string)) === todayKey;
      const skippedToday =
        inst.status === 'skipped' &&
        (inst.dateScheduled === todayKey ||
          (Boolean(inst.skippedAt) &&
            localDateKey(new Date(inst.skippedAt as string)) === todayKey));
      const isRelevantDate =
        inst.dateScheduled === todayKey || inst.isOverdue || completedToday || skippedToday;
      if (!isRelevantDate && inst.status !== 'awaiting_approval') continue;

      const effectivePoints = calculateEffectiveChorePoints(tpl, inst.isOverdue);
      const isShared = tpl.assignedTo === 'shared';
      const canUndo =
        inst.dateScheduled === todayKey && canSelfRevertInstance(inst, now);

      if (inst.status === 'pending') {
        if (isShared) {
          if (effectiveScope === 'household') {
            sharedPending.push({
              instance: inst,
              template: tpl,
              effectivePoints,
              isShared: true,
              canUndo: false,
            });
            tCount += 1;
          } else if (tByChild.has(effectiveScope)) {
            tByChild.get(effectiveScope)!.push({
              instance: inst,
              template: tpl,
              effectivePoints,
              isShared: true,
              canUndo: false,
            });
            tCount += 1;
          }
        } else if (tByChild.has(tpl.assignedTo)) {
          tByChild.get(tpl.assignedTo)!.push({
            instance: inst,
            template: tpl,
            effectivePoints,
            isShared: false,
            canUndo: false,
          });
          tCount += 1;
        }
      } else if (inst.status === 'awaiting_approval') {
        const completers =
          inst.completedBy && inst.completedBy.length > 0
            ? inst.completedBy
            : tpl.assignedTo !== 'shared'
              ? [{ profileId: tpl.assignedTo, pointsAwarded: effectivePoints }]
              : [];

        let matchedAny = false;
        for (const split of completers) {
          if (rByChild.has(split.profileId)) {
            rByChild.get(split.profileId)!.push({
              instance: inst,
              template: tpl,
              effectivePoints,
              awardedPointsForChild: split.pointsAwarded,
              isShared,
              canUndo,
            });
            matchedAny = true;
          }
        }
        if (matchedAny) rCount += 1;
      } else if (
        inst.status === 'completed' &&
        (inst.dateScheduled === todayKey || completedToday)
      ) {
        const completers =
          inst.completedBy && inst.completedBy.length > 0
            ? inst.completedBy
            : tpl.assignedTo !== 'shared'
              ? [{ profileId: tpl.assignedTo, pointsAwarded: effectivePoints }]
              : [];

        let matchedAny = false;
        for (const split of completers) {
          if (cByChild.has(split.profileId)) {
            cByChild.get(split.profileId)!.push({
              instance: inst,
              template: tpl,
              effectivePoints,
              awardedPointsForChild: split.pointsAwarded,
              isShared,
              canUndo,
            });
            matchedAny = true;
          }
        }
        if (matchedAny) cCount += 1;
      } else if (
        inst.status === 'skipped' &&
        (inst.dateScheduled === todayKey || skippedToday)
      ) {
        const rowItem: ChildChoreRowItem = {
          instance: inst,
          template: tpl,
          effectivePoints,
          awardedPointsForChild: 0,
          isShared,
          canUndo,
        };
        if (!isShared) {
          if (cByChild.has(tpl.assignedTo)) {
            cByChild.get(tpl.assignedTo)!.push(rowItem);
            cCount += 1;
          }
        } else if (inst.skippedByProfileId && cByChild.has(inst.skippedByProfileId)) {
          cByChild.get(inst.skippedByProfileId)!.push(rowItem);
          cCount += 1;
        } else if (effectiveScope === 'household') {
          sharedCompleted.push(rowItem);
          cCount += 1;
        } else if (cByChild.has(effectiveScope)) {
          cByChild.get(effectiveScope)!.push(rowItem);
          cCount += 1;
        }
      }
    }

    return {
      todayByChild: tByChild,
      sharedPendingItems: sharedPending,
      reviewByChild: rByChild,
      completedByChild: cByChild,
      sharedCompletedItems: sharedCompleted,
      todayTotalCount: tCount,
      reviewTotalCount: rCount,
      completedTotalCount: cCount,
    };
  }, [
    snapshot.instances,
    snapshot.ledger,
    snapshot.householdSettings?.weekStartsOn,
    dashboardWeekStartsOn,
    templateMap,
    visibleProfiles,
    todayKey,
    effectiveScope,
  ]);

  if (!isOpen) return null;

  const toggleSection = (section: AccordionSectionId) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const toggleChildSubGroup = (section: AccordionSectionId, childId: string) => {
    const key = `${section}_${childId}`;
    setCollapsedChildKeys((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleTapPendingChore = async (
    item: ChildChoreRowItem,
    defaultProfileId?: string,
    e?: React.MouseEvent
  ) => {
    e?.stopPropagation();
    const { instance, template, effectivePoints } = item;

    if (template.assignedTo === 'shared' && snapshot.profiles.length > 1) {
      setSplitTarget({
        instance,
        template,
        defaultProfileId,
      });
      return;
    }

    const targetProfileId =
      template.assignedTo === 'shared'
        ? defaultProfileId || snapshot.profiles[0]?.id
        : template.assignedTo;

    if (!targetProfileId) return;

    const profileObj = snapshot.profiles.find((p) => p.id === targetProfileId);
    const rect = (e?.currentTarget as HTMLElement | undefined)?.getBoundingClientRect();

    const res = await completeChore(instance.instanceId, [
      { profileId: targetProfileId, pointsAwarded: effectivePoints },
    ]);

    if (res.success) {
      triggerChoreCelebration({
        originX: rect ? rect.left + rect.width / 2 : undefined,
        originY: rect ? rect.top + rect.height / 2 : undefined,
        accentColor: profileObj?.color,
      });
    }
  };

  const handleTapUndoChore = async (item: ChildChoreRowItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!item.canUndo) return;
    await revertChoreSameDay(item.instance.instanceId);
  };

  const renderChoreItemRow = (
    item: ChildChoreRowItem,
    section: AccordionSectionId,
    profile?: Profile
  ) => {
    const { instance, template, effectivePoints, awardedPointsForChild, isShared, canUndo } = item;
    const displayPoints = awardedPointsForChild ?? effectivePoints;
    const isOverdue = instance.isOverdue && section === 'today';
    const isCompleted = section === 'completed';
    const isSkipped = instance.status === 'skipped';
    const isReview = section === 'review';

    return (
      <div
        key={`${section}-${instance.instanceId}-${profile?.id || 'shared'}`}
        onClick={(e) => {
          if (section === 'today') {
            handleTapPendingChore(item, profile?.id, e);
          } else if (canUndo) {
            handleTapUndoChore(item, e);
          }
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (section === 'today') {
              handleTapPendingChore(item, profile?.id);
            } else if (canUndo) {
              handleTapUndoChore(item);
            }
          }
        }}
        className={`group/row flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl border transition-all select-none ${
          isOverdue
            ? isLight
              ? 'border-amber-300 bg-amber-50/70 hover:bg-amber-50'
              : 'border-amber-400/40 bg-amber-950/15 hover:bg-amber-950/25'
            : isLight
              ? 'border-slate-200/90 bg-white hover:bg-slate-50'
              : 'border-slate-800/80 bg-slate-900/60 hover:bg-slate-800/75'
        } ${section === 'today' || canUndo ? 'cursor-pointer active:scale-[0.99]' : 'cursor-default'}`}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
              isCompleted && isSkipped
                ? isLight
                  ? 'bg-slate-200/80 border-slate-300 text-slate-500'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
                : isCompleted
                  ? 'bg-emerald-600/85 border-emerald-500/70 text-white'
                  : isReview
                    ? isLight
                      ? 'bg-amber-100 border-amber-300 text-amber-700'
                      : 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                    : isLight
                      ? 'border-slate-300 bg-slate-50 group-hover/row:border-emerald-500'
                      : 'border-slate-700 bg-slate-950/60 group-hover/row:border-emerald-400/60'
            }`}
          >
            {isCompleted && isSkipped ? (
              <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
            ) : isCompleted ? (
              <Check className="w-4 h-4 stroke-[2.5]" />
            ) : isReview ? (
              <Clock className="w-3.5 h-3.5" />
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {template.icon && (
                <span className="text-base leading-none shrink-0">{template.icon}</span>
              )}
              <span
                className={`text-sm font-medium truncate ${
                  isCompleted
                    ? 'line-through text-slate-400'
                    : isLight
                      ? 'text-slate-800'
                      : 'text-slate-100'
                }`}
              >
                {template.title}
              </span>

              {isCompleted && isSkipped && (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border ${
                    isLight
                      ? 'bg-slate-100 text-slate-600 border-slate-200'
                      : 'bg-slate-800/90 text-slate-400 border-slate-700/70'
                  }`}
                >
                  Skipped
                </span>
              )}

              {instance.isOverdue && (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border ${
                    isLight
                      ? 'bg-amber-100 text-amber-800 border-amber-300'
                      : 'bg-amber-500/15 text-amber-300/90 border-amber-400/30'
                  }`}
                >
                  Yesterday
                </span>
              )}

              {isShared && (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium ${
                    isLight ? 'bg-slate-100 text-slate-600' : 'bg-slate-800/90 text-slate-300'
                  }`}
                >
                  <Users className="w-3 h-3" />
                  Shared
                </span>
              )}

              {template.cadence === 'weekly' && template.weeklyAnyDay && (
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium border ${
                    isLight
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                  }`}
                >
                  1× / wk (Any day)
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {section === 'today' && !instance.isOverdue && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                skipChoreInstance(instance.instanceId, profile?.id);
              }}
              onKeyDown={(e) => e.stopPropagation()}
              title="Skip for today (no points awarded)"
              className={`px-2 py-0.5 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer ${
                isLight
                  ? 'bg-white hover:bg-slate-100 text-slate-500 hover:text-slate-700 border-slate-200 hover:border-slate-300'
                  : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-400 hover:text-slate-200 border-slate-700/60 hover:border-slate-600'
              }`}
            >
              Skip
            </button>
          )}
          {section === 'today' && instance.isOverdue && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                dismissChoreInstance(instance.instanceId);
              }}
              onKeyDown={(e) => e.stopPropagation()}
              title="Dismiss overdue task"
              className={`px-2 py-0.5 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer ${
                isLight
                  ? 'bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 border-slate-200 hover:border-rose-300'
                  : 'bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border-slate-700/60 hover:border-rose-500/40'
              }`}
            >
              Dismiss
            </button>
          )}
          {section !== 'today' && (
            canUndo ? (
              <span
                title="Tap to undo (same-day self-revert)"
                className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded opacity-70 group-hover/row:opacity-100 transition-opacity ${
                  isLight ? 'text-slate-500 hover:bg-slate-100' : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                <RotateCcw className="w-3 h-3" />
                Undo
              </span>
            ) : (
              <span title="Locked past midnight">
                <Lock className="w-3.5 h-3.5 text-slate-500 opacity-50" />
              </span>
            )
          )}

          <span
            className={`px-2.5 py-1 rounded-full text-xs font-semibold tabular-nums border ${
              isCompleted && isSkipped
                ? isLight
                  ? 'bg-slate-100 text-slate-500 border-slate-200'
                  : 'bg-slate-800/60 text-slate-400 border-slate-700/60'
                : isCompleted
                  ? isLight
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-emerald-950/50 text-emerald-300/90 border-emerald-700/40'
                  : isReview
                    ? isLight
                      ? 'bg-amber-50 text-amber-700 border-amber-200'
                      : 'bg-amber-950/50 text-amber-300/90 border-amber-700/40'
                    : isLight
                      ? 'bg-slate-100 text-slate-700 border-slate-200'
                      : 'bg-slate-800/80 text-slate-200 border-slate-700/60'
            }`}
          >
            {isSkipped ? '0 pts' : `+${displayPoints} pt${displayPoints === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>
    );
  };

  const renderChildSubGroups = (
    section: AccordionSectionId,
    byChildMap: Map<string, ChildChoreRowItem[]>,
    extraSharedItems?: ChildChoreRowItem[]
  ) => {
    const hasAnyChildItems = Array.from(byChildMap.values()).some((arr) => arr.length > 0);
    const hasShared = Boolean(extraSharedItems && extraSharedItems.length > 0);

    if (!hasAnyChildItems && !hasShared) {
      return (
        <div
          className={`px-4 py-5 text-center text-xs rounded-xl border border-dashed ${
            isLight
              ? 'text-slate-400 border-slate-200 bg-slate-50/60'
              : 'text-slate-500 border-slate-800/70 bg-slate-950/30'
          }`}
        >
          {section === 'today'
            ? 'All caught up for today!'
            : section === 'review'
              ? 'No chores awaiting parent review.'
              : 'No chores completed yet today.'}
        </div>
      );
    }

    return (
      <div className="space-y-2.5">
        {visibleProfiles.map((profile) => {
          const items = byChildMap.get(profile.id) || [];
          const hasPersonalTemplates = snapshot.templates.some(
            (t) => t.assignedTo === profile.id
          );
          if (
            items.length === 0 &&
            (section !== 'today' ||
              (profile.role === 'parent' &&
                !hasPersonalTemplates &&
                effectiveScope !== profile.id))
          ) {
            return null;
          }

          const subKey = `${section}_${profile.id}`;
          const isCollapsed = Boolean(collapsedChildKeys[subKey]);

          return (
            <div
              key={subKey}
              className={`rounded-xl border overflow-hidden ${
                isLight
                  ? 'border-slate-200/80 bg-slate-50/70'
                  : 'border-slate-800/70 bg-slate-950/45'
              }`}
              style={{
                borderLeftWidth: '3px',
                borderLeftColor: profile.color || '#6B8E7B',
              }}
            >
              <button
                type="button"
                onClick={() => toggleChildSubGroup(section, profile.id)}
                className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors cursor-pointer ${
                  isLight ? 'hover:bg-slate-100/80' : 'hover:bg-slate-900/60'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <HouseholdAvatar profile={profile} size="xs" showRing={false} />
                  <span
                    className={`text-xs font-semibold truncate ${
                      isLight ? 'text-slate-800' : 'text-slate-200'
                    }`}
                  >
                    {profile.name}
                  </span>
                  <span
                    className={`text-[11px] px-1.5 py-0.2 rounded-full font-medium tabular-nums ${
                      isLight ? 'bg-slate-200/80 text-slate-600' : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {items.length}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className="text-xs font-medium tabular-nums"
                    style={{ color: profile.color || '#8FA89B' }}
                  >
                    {profile.balance} pts
                  </span>
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </button>

              {!isCollapsed && (
                <div className="px-2.5 pb-2.5 pt-0.5 space-y-2">
                  {items.length === 0 ? (
                    <div className="text-xs text-slate-500 px-2.5 py-2 rounded-lg">
                      All personal chores done!
                    </div>
                  ) : (
                    items.map((item) => renderChoreItemRow(item, section, profile))
                  )}
                </div>
              )}
            </div>
          );
        })}

        {hasShared && extraSharedItems && (
          <div
            className={`rounded-xl border overflow-hidden ${
              isLight
                ? 'border-slate-200/80 bg-slate-50/70'
                : 'border-slate-800/70 bg-slate-950/45'
            }`}
            style={{
              borderLeftWidth: '3px',
              borderLeftColor: '#648296',
            }}
          >
            <button
              type="button"
              onClick={() => toggleChildSubGroup(section, '__shared__')}
              className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors cursor-pointer ${
                isLight ? 'hover:bg-slate-100/80' : 'hover:bg-slate-900/60'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span
                  className={`w-6 h-6 rounded-full inline-flex items-center justify-center ${
                    isLight ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-slate-200'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" />
                </span>
                <span
                  className={`text-xs font-semibold truncate ${
                    isLight ? 'text-slate-800' : 'text-slate-200'
                  }`}
                >
                  Shared & Bounties
                </span>
                <span
                  className={`text-[11px] px-1.5 py-0.2 rounded-full font-medium tabular-nums ${
                    isLight ? 'bg-slate-200/80 text-slate-600' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {extraSharedItems.length}
                </span>
              </div>
              {collapsedChildKeys[`${section}___shared__`] ? (
                <ChevronRight className="w-4 h-4 text-slate-400" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-400" />
              )}
            </button>

            {!collapsedChildKeys[`${section}___shared__`] && (
              <div className="px-2.5 pb-2.5 pt-0.5 space-y-2">
                {extraSharedItems.map((item) => renderChoreItemRow(item, section))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const sections: {
    id: AccordionSectionId;
    label: string;
    count: number;
    badgeTone: string;
    renderContent: () => React.ReactNode;
  }[] = [
    {
      id: 'today',
      label: "Today's Chores",
      count: todayTotalCount,
      badgeTone: isLight
        ? 'bg-emerald-100 text-emerald-800'
        : 'bg-emerald-950/70 text-emerald-300 border border-emerald-700/40',
      renderContent: () => renderChildSubGroups('today', todayByChild, sharedPendingItems),
    },
    {
      id: 'review',
      label: 'Awaiting Parent Review',
      count: reviewTotalCount,
      badgeTone: isLight
        ? 'bg-amber-100 text-amber-800'
        : 'bg-amber-950/70 text-amber-300 border border-amber-700/40',
      renderContent: () => renderChildSubGroups('review', reviewByChild),
    },
    {
      id: 'completed',
      label: 'Completed Today',
      count: completedTotalCount,
      badgeTone: isLight
        ? 'bg-slate-200 text-slate-700'
        : 'bg-slate-800 text-slate-300 border border-slate-700/50',
      renderContent: () =>
        renderChildSubGroups('completed', completedByChild, sharedCompletedItems),
    },
  ];

  const formattedDate = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  const totalHouseholdBank = snapshot.profiles.reduce((sum, p) => sum + p.balance, 0);
  const resolvedHeaderTitle =
    title && title.trim() && title.trim() !== 'Family Chores'
      ? title.trim()
      : 'Family Chore & Reward Hub';

  return (
    <div
      className={
        mode === 'canvas'
          ? `w-full h-full flex flex-col overflow-hidden select-none ${
              isLight
                ? 'bg-slate-50/92 text-slate-800'
                : 'bg-[#0c1118]/90 text-slate-100'
            } ${dockPaddingClass || ''}`
          : 'fixed inset-0 z-[75] bg-[#0c1118]/98 backdrop-blur-xl text-slate-100 flex flex-col overflow-hidden select-none'
      }
    >
      {/* Top Bar */}
      <header
        className={`flex items-center justify-between gap-4 px-5 py-3.5 border-b shrink-0 ${
          isLight
            ? 'border-slate-200/90 bg-white/80'
            : 'border-slate-800/80 bg-slate-950/60'
        } ${mode === 'canvas' && onOpenWidgetSettings ? 'sm:pr-24' : ''}`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${
              isLight
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
            }`}
          >
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h1
              className={`text-base sm:text-lg font-semibold tracking-tight truncate ${
                isLight ? 'text-slate-900' : 'text-slate-100'
              }`}
            >
              {resolvedHeaderTitle}
            </h1>
            <p className={`text-xs truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {formattedDate} •{' '}
              {effectiveScope === 'household'
                ? 'Household View'
                : `${visibleProfiles[0]?.name || 'Child'}'s View`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          {snapshot.householdSettings.vacationMode && (
            <span
              className={`hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-medium ${
                isLight
                  ? 'bg-teal-50 border-teal-200 text-teal-800'
                  : 'bg-teal-950/50 border-teal-700/40 text-teal-200'
              }`}
            >
              <Palmtree className="w-3.5 h-3.5 text-teal-500" />
              <span>Vacation Mode</span>
            </span>
          )}

          {/* Parent Review & Settings Drawer Trigger */}
          <button
            type="button"
            onClick={() =>
              setParentDrawerOpen(
                true,
                pendingCounts.awaitingApprovalCount > 0
                  ? 'approvals'
                  : pendingCounts.needsPricingCount > 0
                    ? 'pricing'
                    : pendingCounts.pendingFulfillmentCount > 0
                      ? 'fulfillment'
                      : 'approvals'
              )
            }
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              pendingCounts.totalPendingCount > 0
                ? isLight
                  ? 'bg-amber-100/90 hover:bg-amber-200 text-amber-900 border-amber-300 shadow-sm'
                  : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border-amber-400/40 shadow-sm'
                : isLight
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                  : 'bg-slate-800/80 hover:bg-slate-800 text-slate-200 border-slate-700/70'
            }`}
          >
            <Shield className="w-4 h-4 text-amber-400" />
            <span>
              {pendingCounts.totalPendingCount > 0
                ? `${pendingCounts.totalPendingCount} Parent Review`
                : 'Parent Controls'}
            </span>
          </button>

          {mode === 'canvas' && onOpenWidgetSettings && (
            <button
              type="button"
              onClick={onOpenWidgetSettings}
              title="Configure Chores widget & presentation mode"
              className={`sm:hidden inline-flex items-center justify-center p-2 rounded-xl border transition-colors cursor-pointer ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-200'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border-slate-800'
              }`}
            >
              <Settings className="w-4 h-4" />
            </button>
          )}

          {/* Minimize / Close Full-Screen Overlay View */}
          {mode === 'overlay' && onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Return to Dashboard Canvas (Esc)"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 transition-colors cursor-pointer"
            >
              <Minimize2 className="w-4 h-4" />
              <span className="hidden sm:inline">Canvas</span>
            </button>
          )}
        </div>
      </header>

      {/* Mobile Column Switcher (< 1024px) */}
      <div
        className={`flex lg:hidden items-center gap-1.5 px-4 py-2 border-b shrink-0 ${
          isLight ? 'border-slate-200 bg-white/60' : 'border-slate-800/80 bg-slate-950/40'
        }`}
      >
        {[
          { id: 'profiles' as const, label: 'Profiles & Wallet' },
          { id: 'chores' as const, label: `Chores (${todayTotalCount})` },
          { id: 'rewards' as const, label: 'Reward Store' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setMobileColumnTab(tab.id)}
            className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              mobileColumnTab === tab.id
                ? isLight
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-emerald-600/25 text-emerald-300 border border-emerald-500/40'
                : isLight
                  ? 'text-slate-500 hover:text-slate-800'
                  : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main 3-Column Content Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 p-4 sm:p-6 overflow-hidden">
        {/* LEFT COLUMN: Profile Switcher, Point Banks & Quick Access Trays */}
        <aside
          className={`lg:col-span-3 flex flex-col gap-4 overflow-y-auto pr-1 ${
            mobileColumnTab === 'profiles' ? 'flex' : 'hidden lg:flex'
          }`}
        >
          {/* Profile Switcher & Spendable Point Banks */}
          <div
            className={`p-4 rounded-2xl border space-y-3 ${
              isLight
                ? 'bg-white/90 border-slate-200/90 shadow-sm'
                : 'bg-slate-900/55 border-slate-800/80'
            }`}
          >
            <div className="flex items-center justify-between">
              <span
                className={`text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5 ${
                  isLight ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                <Wallet className="w-3.5 h-3.5 text-emerald-500" />
                Point Banks
              </span>
              <span className={`text-[11px] tabular-nums ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Total: {totalHouseholdBank} pts
              </span>
            </div>

            <div className="space-y-2">
              {/* Household View Card */}
              <button
                type="button"
                onClick={() => setActiveScope('household')}
                className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  effectiveScope === 'household'
                    ? isLight
                      ? 'bg-emerald-50/80 border-emerald-400 ring-1 ring-emerald-400/25'
                      : 'bg-slate-800/90 border-emerald-500/50 ring-1 ring-emerald-500/25'
                    : isLight
                      ? 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
                      : 'bg-slate-950/50 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-full border flex items-center justify-center text-base shrink-0 ${
                      isLight
                        ? 'bg-emerald-50 border-emerald-200'
                        : 'bg-emerald-500/15 border-emerald-500/30'
                    }`}
                  >
                    🏠
                  </div>
                  <div className="min-w-0">
                    <div
                      className={`text-xs font-semibold truncate ${
                        isLight ? 'text-slate-800' : 'text-slate-100'
                      }`}
                    >
                      Everyone (Household)
                    </div>
                    <div className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                      {snapshot.profiles.length} active profiles
                    </div>
                  </div>
                </div>
                <span
                  className={`text-xs font-bold tabular-nums ${
                    isLight ? 'text-emerald-700' : 'text-emerald-300'
                  }`}
                >
                  {totalHouseholdBank} pts
                </span>
              </button>

              {/* Individual Child Profile Cards */}
              {snapshot.profiles.map((profile) => {
                const isSelected = effectiveScope === profile.id;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => setActiveScope(profile.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? isLight
                          ? 'bg-emerald-50/80 border-emerald-400 ring-1 ring-emerald-400/25'
                          : 'bg-slate-800/90 border-emerald-500/50 ring-1 ring-emerald-500/25'
                        : isLight
                          ? 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
                          : 'bg-slate-950/50 border-slate-800/80 hover:border-slate-700'
                    }`}
                    style={{
                      borderLeftWidth: '3px',
                      borderLeftColor: profile.color || '#6B8E7B',
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <HouseholdAvatar profile={profile} size="md" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`text-sm font-semibold truncate ${
                              isLight ? 'text-slate-800' : 'text-slate-100'
                            }`}
                          >
                            {profile.name}
                          </span>
                          {profile.role === 'parent' && (
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-medium shrink-0 ${
                                isLight
                                  ? 'bg-slate-200/80 text-slate-600'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              Parent
                            </span>
                          )}
                        </div>
                        <div
                          className={`text-[10px] tabular-nums ${
                            isLight ? 'text-slate-500' : 'text-slate-400'
                          }`}
                        >
                          Lifetime: {profile.lifetimePoints} pts
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div
                        className="text-sm font-bold tabular-nums"
                        style={{ color: profile.color || '#8FA89B' }}
                      >
                        {profile.balance}
                      </div>
                      <div className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                        spendable
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Access Trays */}
          <div
            className={`p-4 rounded-2xl border space-y-2.5 ${
              isLight
                ? 'bg-white/90 border-slate-200/90 shadow-sm'
                : 'bg-slate-900/55 border-slate-800/80'
            }`}
          >
            <span
              className={`text-xs font-semibold uppercase tracking-wider block ${
                isLight ? 'text-slate-500' : 'text-slate-400'
              }`}
            >
              Wishlist & Milestones
            </span>

            <button
              type="button"
              onClick={() => setIsProposeModalOpen(true)}
              className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                isLight
                  ? 'bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
                  : 'bg-emerald-600/20 hover:bg-emerald-600/30 border-emerald-500/35'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Plus className={`w-4 h-4 ${isLight ? 'text-emerald-700' : 'text-emerald-300'}`} />
                <div>
                  <div
                    className={`text-xs font-semibold ${
                      isLight ? 'text-emerald-900' : 'text-emerald-200'
                    }`}
                  >
                    Propose a Reward
                  </div>
                  <div
                    className={`text-[10px] ${
                      isLight ? 'text-emerald-700/80' : 'text-emerald-300/75'
                    }`}
                  >
                    Paste a product link or wish
                  </div>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setProposalsTrayScope('household');
                setIsProposalsTrayOpen(true);
              }}
              className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                isLight
                  ? 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                  : 'bg-slate-950/60 hover:bg-slate-800/70 border-slate-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Inbox className="w-4 h-4 text-amber-500" />
                <div>
                  <div className={`text-xs font-semibold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                    Proposals Tray
                  </div>
                  <div className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    Awaiting parent pricing
                  </div>
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-semibold border tabular-nums ${
                  isLight
                    ? 'bg-amber-100 text-amber-800 border-amber-300'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                }`}
              >
                {pendingCounts.needsPricingCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setIsTrophyCaseOpen(true)}
              className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                isLight
                  ? 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                  : 'bg-slate-950/60 hover:bg-slate-800/70 border-slate-800'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Trophy className="w-4 h-4 text-amber-500" />
                <div>
                  <div className={`text-xs font-semibold ${isLight ? 'text-slate-800' : 'text-slate-200'}`}>
                    Trophy Case
                  </div>
                  <div className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                    Fulfilled rewards archive
                  </div>
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums ${
                  isLight ? 'bg-slate-200 text-slate-700' : 'bg-slate-800 text-slate-300'
                }`}
              >
                {snapshot.trophies.length}
              </span>
            </button>
          </div>
        </aside>

        {/* CENTER COLUMN: Active Daily Chores, Subtle Overdue Carry-Overs & Shared Bounties */}
        <main
          className={`lg:col-span-5 flex flex-col overflow-hidden rounded-2xl border p-4 ${
            isLight
              ? 'bg-white/90 border-slate-200/90 shadow-sm'
              : 'bg-slate-900/55 border-slate-800/80'
          } ${mobileColumnTab === 'chores' ? 'flex' : 'hidden lg:flex'}`}
        >
          <div
            className={`flex items-center justify-between pb-3 mb-3 border-b shrink-0 ${
              isLight ? 'border-slate-200' : 'border-slate-800/80'
            }`}
          >
            <div>
              <h2 className={`text-sm font-semibold ${isLight ? 'text-slate-800' : 'text-slate-100'}`}>
                Daily Chores & Bounties
              </h2>
              <p className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Single tap to complete • Same-day undo supported
              </p>
            </div>
            {effectiveScope !== 'household' && (
              <button
                type="button"
                onClick={() => setActiveScope('household')}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium cursor-pointer ${
                  isLight
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                }`}
              >
                <X className="w-3 h-3" />
                <span>Show Everyone</span>
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto pr-1 space-y-3">
            {sections.map((sec) => {
              const isExpanded = expandedSections[sec.id];
              return (
                <div
                  key={sec.id}
                  className={`rounded-xl border overflow-hidden ${
                    isLight
                      ? 'border-slate-200/90 bg-slate-50/40'
                      : 'border-slate-800/80 bg-slate-950/35'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleSection(sec.id)}
                    className={`w-full flex items-center justify-between px-3.5 py-2.5 text-left transition-colors cursor-pointer ${
                      isLight ? 'hover:bg-slate-100/70' : 'hover:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )}
                      <span
                        className={`text-xs font-semibold tracking-tight ${
                          isLight ? 'text-slate-800' : 'text-slate-100'
                        }`}
                      >
                        {sec.label}
                      </span>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums ${sec.badgeTone}`}
                    >
                      {sec.count}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 pt-1">{sec.renderContent()}</div>
                  )}
                </div>
              );
            })}
          </div>
        </main>

        {/* RIGHT COLUMN: Visual Reward Store */}
        <section
          className={`lg:col-span-4 flex flex-col overflow-hidden rounded-2xl border p-4 ${
            isLight
              ? 'bg-white/90 border-slate-200/90 shadow-sm'
              : 'bg-slate-900/55 border-slate-800/80'
          } ${mobileColumnTab === 'rewards' ? 'flex' : 'hidden lg:flex'}`}
        >
          <RewardStorePanel
            profiles={snapshot.profiles}
            rewards={snapshot.rewards}
            trophies={snapshot.trophies}
            activeScope={effectiveScope}
            isLight={isLight}
            onClaimReward={claimUnlockedReward}
            onOpenProposeModal={() => {
              setEditingProposal(null);
              setIsProposeModalOpen(true);
            }}
            onOpenProposalsTray={() => {
              setProposalsTrayScope(effectiveScope);
              setIsProposalsTrayOpen(true);
            }}
            onOpenTrophyCase={() => setIsTrophyCaseOpen(true)}
            onOpenParentFulfillment={() => setParentDrawerOpen(true, 'fulfillment')}
          />
        </section>
      </div>

      {/* Modals */}
      {splitTarget && (
        <PointSplitModal
          isOpen={Boolean(splitTarget)}
          instance={splitTarget.instance}
          template={splitTarget.template}
          profiles={snapshot.profiles}
          defaultSelectedProfileId={splitTarget.defaultProfileId}
          onClose={() => setSplitTarget(null)}
          onConfirmSplit={async (splits) => {
            const res = await completeChore(splitTarget.instance.instanceId, splits);
            if (res.success) {
              const firstProfile = snapshot.profiles.find(
                (p) => p.id === splits[0]?.profileId
              );
              triggerChoreCelebration({
                accentColor: firstProfile?.color,
              });
            }
          }}
        />
      )}

      {(isProposeModalOpen || Boolean(editingProposal)) && (
        <ProposeRewardModal
          key={editingProposal?.id || 'new-proposal'}
          isOpen={isProposeModalOpen || Boolean(editingProposal)}
          profiles={snapshot.profiles}
          defaultProfileId={effectiveScope}
          editingProposal={editingProposal}
          onClose={() => {
            setIsProposeModalOpen(false);
            setEditingProposal(null);
          }}
          onSubmitProposal={async (proposal) => {
            if (editingProposal) {
              await updateWishlistProposal(editingProposal.id, proposal);
            } else {
              await proposeWishlistReward(proposal);
            }
          }}
        />
      )}

      {isProposalsTrayOpen && (
        <ProposalsTrayModal
          isOpen={isProposalsTrayOpen}
          profiles={snapshot.profiles}
          rewards={snapshot.rewards}
          defaultScope={proposalsTrayScope}
          onClose={() => setIsProposalsTrayOpen(false)}
          onOpenProposeModal={() => {
            setEditingProposal(null);
            setIsProposeModalOpen(true);
          }}
          onEditProposal={(reward) => setEditingProposal(reward)}
          onWithdrawProposal={withdrawWishlistProposal}
          onOpenParentPricing={() => setParentDrawerOpen(true, 'pricing')}
        />
      )}

      {isTrophyCaseOpen && (
        <TrophyCaseModal
          isOpen={isTrophyCaseOpen}
          profiles={snapshot.profiles}
          trophies={snapshot.trophies}
          defaultScope={effectiveScope}
          onClose={() => setIsTrophyCaseOpen(false)}
        />
      )}
    </div>
  );
};
