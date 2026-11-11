import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Inbox,
  Lock,
  Maximize2,
  Palmtree,
  Plus,
  RotateCcw,
  Shield,
  Sparkles,
  Trophy,
  UserPlus,
  Users,
} from 'lucide-react';
import { useChoreStore, getPendingParentActionCounts } from '../../stores/useChoreStore';
import { useProfileStore } from '../../stores/useProfileStore';
import { useDashboardStore } from '../../store/dashboardStore';
import type {
  ActiveChoreInstance,
  ChoreTemplate,
  ChoreWidgetConfig,
  Profile,
} from '../../types/chores';
import { resolveProfileColorHex } from '../../types/profiles';
import {
  calculateEffectiveChorePoints,
  canSelfRevertInstance,
  daysBetweenDateKeys,
  isDateMatchingTemplateCadence,
  selectProfilePointsFromLedger,
} from '../../utils/choreEngine';
import { localDateKey } from '../../utils/timePrefs';
import { isAmbientlyInNightMode } from '../../utils/confetti';
import { ProfileAvatar } from '../common/ProfileAvatar';
import { fireConfettiCelebration } from '../common/ConfettiCelebration';
import { SharedSplitModal } from '../chores/SharedSplitModal';
import { ProposeRewardModal } from '../chores/ProposeRewardModal';
import { ProposalsTrayModal } from '../chores/ProposalsTrayModal';
import { TrophyCaseModal } from '../chores/TrophyCaseModal';

export interface ChoreWidgetProps {
  title?: string;
  config?: ChoreWidgetConfig & { includeParents?: boolean };
  isLight?: boolean;
  variant?: 'tile' | 'view';
  onUpdateConfig?: (updates: Partial<ChoreWidgetConfig> & { includeParents?: boolean }) => void;
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

export const ChoreWidget: React.FC<ChoreWidgetProps> = ({
  title = 'Family Chores',
  config,
  isLight = false,
  variant = 'tile',
  onUpdateConfig,
}) => {
  const snapshot = useChoreStore((s) => s.snapshot);
  const pendingParentActionsCount = useChoreStore((s) => s.pendingParentActionsCount);
  const completeChore = useChoreStore((s) => s.completeChore);
  const revertChoreSameDay = useChoreStore((s) => s.revertChoreSameDay);
  const dismissChoreInstance = useChoreStore((s) => s.dismissChoreInstance);
  const proposeWishlistReward = useChoreStore((s) => s.proposeWishlistReward);
  const setParentDrawerOpen = useChoreStore((s) => s.setParentDrawerOpen);

  const householdProfiles = useProfileStore((s) => s.profiles);
  const isProfileStoreInitialized = useProfileStore((s) => s.isInitialized);

  const dashboardSettings = useDashboardStore((s) => s.settings);
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNow(new Date());
    }, 30_000);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        setNow(new Date());
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  const isNightMode = useMemo(() => {
    void now;
    return (
      Boolean(dashboardSettings?.nightModeEnabled) ||
      isAmbientlyInNightMode(dashboardSettings)
    );
  }, [dashboardSettings, now]);

  const [isProposeModalOpen, setIsProposeModalOpen] = useState(false);
  const [isProposalsTrayOpen, setIsProposalsTrayOpen] = useState(false);
  const [isTrophyCaseOpen, setIsTrophyCaseOpen] = useState(false);

  const configuredScope = config?.scope || 'household';
  const [householdFilterId, setHouseholdFilterId] = useState<string>('household');
  const [localIncludeParents, setLocalIncludeParents] = useState<boolean>(false);
  const includeParents = config?.includeParents ?? localIncludeParents;

  // Collapsible top-level accordion state
  const [expandedSections, setExpandedSections] = useState<Record<AccordionSectionId, boolean>>(
    () => {
      const defaults = config?.defaultExpandedSections || ['today', 'review'];
      return {
        today: defaults.includes('today'),
        review: defaults.includes('review'),
        completed: defaults.includes('completed'),
      };
    }
  );

  // Collapsible per-child sub-group state (default expanded)
  const [collapsedChildKeys, setCollapsedChildKeys] = useState<Record<string, boolean>>({});

  // Modal state for shared chores
  const [splitTarget, setSplitTarget] = useState<{
    instance: ActiveChoreInstance;
    template: ChoreTemplate;
    defaultProfileId?: string;
  } | null>(null);

  // Merge live HouseholdProfile metadata/order with ledger-derived point balances
  const allProfiles: Profile[] = useMemo(() => {
    const snapshotMap = new Map(snapshot.profiles.map((p) => [p.id, p]));
    const activeHousehold = householdProfiles.filter((hp) => !hp.deletedAt);

    if (isProfileStoreInitialized && activeHousehold.length > 0) {
      return activeHousehold.map((hp) => {
        const snapProfile = snapshotMap.get(hp.id);
        const derived = snapProfile
          ? { balance: snapProfile.balance, lifetimePoints: snapProfile.lifetimePoints }
          : selectProfilePointsFromLedger(snapshot.ledger, hp.id);
        return {
          id: hp.id,
          name: hp.name,
          role: hp.role,
          color: resolveProfileColorHex(hp.color),
          avatarDataUrl: hp.avatarDataUrl,
          avatarUrl: hp.avatarDataUrl,
          emoji: hp.emoji,
          balance: derived.balance,
          lifetimePoints: derived.lifetimePoints,
        };
      });
    }

    const householdMap = new Map(activeHousehold.map((hp) => [hp.id, hp]));
    return snapshot.profiles.map((p) => {
      const hp = householdMap.get(p.id);
      return {
        ...p,
        name: hp?.name ?? p.name,
        role: hp?.role ?? p.role,
        color: resolveProfileColorHex(hp?.color ?? p.color),
        avatarDataUrl: hp?.avatarDataUrl ?? p.avatarDataUrl,
        avatarUrl: hp?.avatarDataUrl ?? p.avatarUrl,
        emoji: hp?.emoji ?? p.emoji,
      };
    });
  }, [householdProfiles, isProfileStoreInitialized, snapshot.profiles, snapshot.ledger]);

  const hasParentProfiles = useMemo(
    () => allProfiles.some((p) => p.role === 'parent'),
    [allProfiles]
  );

  // Profiles eligible for the configured widget scope
  const scopeProfiles: Profile[] = useMemo(() => {
    if (configuredScope !== 'household') {
      const pinned = allProfiles.filter((p) => p.id === configuredScope);
      if (pinned.length > 0) return pinned;
    }
    if (includeParents) {
      return allProfiles;
    }
    const kidsOnly = allProfiles.filter((p) => p.role !== 'parent');
    return kidsOnly.length > 0 ? kidsOnly : allProfiles;
  }, [configuredScope, includeParents, allProfiles]);

  // Active scope without synchronous setState in useEffect
  const activeScope = useMemo(() => {
    if (configuredScope !== 'household') {
      return allProfiles.some((p) => p.id === configuredScope) ? configuredScope : 'household';
    }
    if (
      householdFilterId !== 'household' &&
      scopeProfiles.some((p) => p.id === householdFilterId)
    ) {
      return householdFilterId;
    }
    return 'household';
  }, [configuredScope, allProfiles, householdFilterId, scopeProfiles]);

  const visibleProfiles = useMemo(() => {
    if (activeScope === 'household') return scopeProfiles;
    const matched = scopeProfiles.filter((p) => p.id === activeScope);
    return matched.length > 0 ? matched : scopeProfiles;
  }, [scopeProfiles, activeScope]);

  const splitModalProfiles = useMemo(() => {
    if (includeParents) return allProfiles;
    const kids = allProfiles.filter((p) => p.role !== 'parent');
    if (kids.length === 0) return allProfiles;
    if (activeScope !== 'household' && !kids.some((k) => k.id === activeScope)) {
      const pinned = allProfiles.find((p) => p.id === activeScope);
      return pinned ? [...kids, pinned] : kids;
    }
    return kids;
  }, [includeParents, allProfiles, activeScope]);

  const todayKey = useMemo(() => localDateKey(now), [now]);
  const templateMap = useMemo(
    () => new Map(snapshot.templates.map((t) => [t.id, t])),
    [snapshot.templates]
  );

  const pendingCounts = useMemo(
    () => getPendingParentActionCounts(snapshot),
    [snapshot]
  );

  // Partition active instances into the 3 accordion buckets
  const {
    todayByChild,
    sharedPendingItems,
    reviewByChild,
    completedByChild,
    todayTotalCount,
    reviewTotalCount,
    completedTotalCount,
  } = useMemo(() => {
    const tByChild = new Map<string, ChildChoreRowItem[]>();
    const rByChild = new Map<string, ChildChoreRowItem[]>();
    const cByChild = new Map<string, ChildChoreRowItem[]>();
    const sharedPending: ChildChoreRowItem[] = [];

    for (const p of visibleProfiles) {
      tByChild.set(p.id, []);
      rByChild.set(p.id, []);
      cByChild.set(p.id, []);
    }

    let tCount = 0;
    let rCount = 0;
    let cCount = 0;

    for (const inst of snapshot.instances) {
      const tpl = templateMap.get(inst.choreId);
      if (!tpl) continue;

      const isValidPending =
        inst.status !== 'pending' ||
        (isDateMatchingTemplateCadence(tpl, inst.dateScheduled) &&
          (inst.dateScheduled === todayKey ||
            (inst.isOverdue && daysBetweenDateKeys(inst.dateScheduled, todayKey) <= 1)));
      if (!isValidPending) continue;

      const completedToday =
        Boolean(inst.completedAt) &&
        localDateKey(new Date(inst.completedAt as string)) === todayKey;

      const isRelevantDate =
        inst.dateScheduled === todayKey || inst.isOverdue || completedToday;
      if (!isRelevantDate && inst.status !== 'awaiting_approval') continue;

      const effectivePoints = calculateEffectiveChorePoints(tpl, inst.isOverdue);
      const isShared = tpl.assignedTo === 'shared';
      const canUndo =
        inst.dateScheduled === todayKey && canSelfRevertInstance(inst, now);

      if (inst.status === 'pending') {
        if (isShared) {
          if (activeScope === 'household') {
            sharedPending.push({
              instance: inst,
              template: tpl,
              effectivePoints,
              isShared: true,
              canUndo: false,
            });
            tCount += 1;
          } else if (tByChild.has(activeScope)) {
            tByChild.get(activeScope)!.push({
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
      }
    }

    return {
      todayByChild: tByChild,
      sharedPendingItems: sharedPending,
      reviewByChild: rByChild,
      completedByChild: cByChild,
      todayTotalCount: tCount,
      reviewTotalCount: rCount,
      completedTotalCount: cCount,
    };
  }, [snapshot.instances, templateMap, visibleProfiles, todayKey, now, activeScope]);

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

  const handleToggleIncludeParents = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = !includeParents;
    setLocalIncludeParents(next);
    onUpdateConfig?.({ includeParents: next });
  };

  const handleMaximizeFullScreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    useChoreStore.getState().setFullScreenOpen(true);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ambiently:open-chores-fullscreen'));
    }
  };

  const maybeCelebrateCompletion = (
    accentColor?: string,
    originX?: number,
    originY?: number
  ) => {
    const currentlyNight = isNightMode || isAmbientlyInNightMode();
    if (currentlyNight) return;

    const soundEnabled = Boolean(snapshot.householdSettings?.soundEffectsEnabled);
    fireConfettiCelebration({
      originX,
      originY,
      accentColor: accentColor ? resolveProfileColorHex(accentColor) : undefined,
      playSound: soundEnabled,
    });
  };

  const handleTapPendingChore = async (
    item: ChildChoreRowItem,
    defaultProfileId?: string,
    e?: React.MouseEvent
  ) => {
    e?.stopPropagation();
    const { instance, template, effectivePoints } = item;

    // Single tap on a pending 'shared' chore opens SharedSplitModal
    if (template.assignedTo === 'shared') {
      setSplitTarget({
        instance,
        template,
        defaultProfileId,
      });
      return;
    }

    const targetProfileId = template.assignedTo;
    if (!targetProfileId) return;

    const profileObj = allProfiles.find((p) => p.id === targetProfileId);
    const rect = (e?.currentTarget as HTMLElement | undefined)?.getBoundingClientRect();
    const originX = rect ? rect.left + rect.width / 2 : undefined;
    const originY = rect ? rect.top + rect.height / 2 : undefined;

    const res = await completeChore(instance.instanceId, [
      { profileId: targetProfileId, pointsAwarded: effectivePoints },
    ]);

    // Trigger celebration ONLY if auto-approved (!template.requiresApproval) and not in Night Mode
    if (res.success && !res.requiresApproval && !template.requiresApproval) {
      maybeCelebrateCompletion(profileObj?.color, originX, originY);
    }
  };

  const handleTapUndoChore = async (item: ChildChoreRowItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!item.canUndo || item.instance.dateScheduled !== todayKey) return;
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
        className={`group/row flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-xl border transition-colors select-none ${
          isOverdue
            ? isLight
              ? 'border-amber-400/40 bg-amber-50/55 hover:bg-amber-50/85'
              : 'border-amber-400/40 bg-amber-950/15 hover:bg-amber-950/25'
            : isLight
              ? 'border-slate-200/80 bg-white/80 hover:bg-slate-50'
              : 'border-slate-800/80 bg-slate-900/55 hover:bg-slate-800/70'
        } ${section === 'today' || canUndo ? 'cursor-pointer active:scale-[0.99]' : 'cursor-default'}`}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* Status Checkbox / Indicator */}
          <div
            className={`w-5 h-5 rounded-lg flex items-center justify-center shrink-0 border transition-colors ${
              isCompleted
                ? 'bg-emerald-600/85 border-emerald-500/70 text-white'
                : isReview
                  ? 'bg-amber-500/20 border-amber-400/50 text-amber-300'
                  : isLight
                    ? 'border-slate-300 bg-slate-100/80 group-hover/row:border-emerald-500/60'
                    : 'border-slate-700 bg-slate-950/60 group-hover/row:border-emerald-400/60'
            }`}
          >
            {isCompleted ? (
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            ) : isReview ? (
              <Clock className="w-3 h-3" />
            ) : null}
          </div>

          {/* Icon + Title + Badges */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {template.icon && (
                <span className="text-sm leading-none shrink-0">{template.icon}</span>
              )}
              <span
                className={`text-xs font-medium truncate ${
                  isCompleted
                    ? isLight
                      ? 'line-through text-slate-400'
                      : 'line-through text-slate-500'
                    : isLight
                      ? 'text-slate-800'
                      : 'text-slate-100'
                }`}
              >
                {template.title}
              </span>

              {/* Quiet "Yesterday" overdue pill (zero harsh red, zero flashing) */}
              {instance.isOverdue && (
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium border ${
                    isLight
                      ? 'bg-amber-100/75 text-amber-800 border-amber-300/60'
                      : 'bg-amber-500/15 text-amber-300/90 border-amber-400/30'
                  }`}
                >
                  Yesterday
                </span>
              )}

              {/* Shared / Split badge */}
              {isShared && (
                <span
                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium ${
                    isLight
                      ? 'bg-slate-100 text-slate-600'
                      : 'bg-slate-800/90 text-slate-300'
                  }`}
                >
                  <Users className="w-2.5 h-2.5" />
                  Shared
                </span>
              )}

              {template.cadence === 'weekly' && template.weeklyAnyDay && (
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium border ${
                    isLight
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300/60'
                      : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                  }`}
                >
                  1× / wk
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Points Pill & Same-Day Undo / Past-Day Lock */}
        <div className="flex items-center gap-1.5 shrink-0">
          {section === 'today' && instance.isOverdue && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                dismissChoreInstance(instance.instanceId);
              }}
              title="Dismiss overdue task"
              className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                isLight
                  ? 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/70'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/80'
              }`}
            >
              Dismiss
            </button>
          )}
          {section !== 'today' &&
            (canUndo ? (
              <span
                title="Tap to undo (same-day self-revert)"
                className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded opacity-65 group-hover/row:opacity-100 transition-opacity ${
                  isLight
                    ? 'text-slate-500 hover:bg-slate-200/70'
                    : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                <RotateCcw className="w-2.5 h-2.5" />
                Undo
              </span>
            ) : (
              <span title="Locked past midnight" className="inline-flex items-center">
                <Lock className="w-3 h-3 text-slate-500 opacity-55" />
              </span>
            ))}

          <span
            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums border ${
              isCompleted
                ? isLight
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-emerald-950/50 text-emerald-300/90 border-emerald-700/40'
                : isReview
                  ? isLight
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-amber-950/50 text-amber-300/90 border-amber-700/40'
                  : isLight
                    ? 'bg-slate-100 text-slate-700 border-slate-200/80'
                    : 'bg-slate-800/80 text-slate-200 border-slate-700/60'
            }`}
          >
            +{displayPoints} pt{displayPoints === 1 ? '' : 's'}
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
          className={`px-3 py-3 text-center text-xs rounded-xl border border-dashed ${
            isLight
              ? 'text-slate-400 border-slate-200 bg-slate-50/50'
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
      <div className="space-y-2">
        {visibleProfiles.map((child) => {
          const items = byChildMap.get(child.id) || [];
          const hasPersonalTemplates = snapshot.templates.some(
            (t) => t.assignedTo === child.id
          );
          if (
            items.length === 0 &&
            (section !== 'today' ||
              (child.role === 'parent' &&
                !hasPersonalTemplates &&
                activeScope !== child.id))
          ) {
            return null;
          }

          const subKey = `${section}_${child.id}`;
          const isCollapsed = Boolean(collapsedChildKeys[subKey]);
          const accentHex = resolveProfileColorHex(child.color);

          return (
            <div
              key={subKey}
              className={`rounded-xl border overflow-hidden transition-colors ${
                isLight
                  ? 'bg-slate-50/70 border-slate-200/80'
                  : 'bg-slate-950/40 border-slate-800/70'
              }`}
              style={{
                borderLeftWidth: '3px',
                borderLeftColor: accentHex,
              }}
            >
              {/* Collapsible Child Sub-Header */}
              <button
                type="button"
                onClick={() => toggleChildSubGroup(section, child.id)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 text-left transition-colors cursor-pointer ${
                  isLight ? 'hover:bg-slate-100/80' : 'hover:bg-slate-900/60'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ProfileAvatar profile={child} size="xs" showRing={false} />
                  <span
                    className={`text-xs font-semibold truncate ${
                      isLight ? 'text-slate-800' : 'text-slate-200'
                    }`}
                  >
                    {child.name}
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-medium tabular-nums ${
                      isLight
                        ? 'bg-slate-200/80 text-slate-600'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {items.length}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className="text-[11px] font-medium tabular-nums"
                    style={{ color: accentHex }}
                  >
                    {child.balance} pts
                  </span>
                  {isCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </div>
              </button>

              {/* Child's Chore Rows */}
              {!isCollapsed && (
                <div className="px-2 pb-2 pt-0.5 space-y-1.5">
                  {items.length === 0 ? (
                    <div
                      className={`text-[11px] px-2 py-1.5 rounded-lg ${
                        isLight ? 'text-slate-400' : 'text-slate-500'
                      }`}
                    >
                      All personal chores done!
                    </div>
                  ) : (
                    items.map((item) => renderChoreItemRow(item, section, child))
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Shared / Bounty Chores Sub-Group in Household Today View */}
        {hasShared && extraSharedItems && (
          <div
            className={`rounded-xl border overflow-hidden ${
              isLight
                ? 'bg-slate-50/70 border-slate-200/80'
                : 'bg-slate-950/40 border-slate-800/70'
            }`}
            style={{
              borderLeftWidth: '3px',
              borderLeftColor: '#648296', // Calm Science Slate Blue
            }}
          >
            <button
              type="button"
              onClick={() => toggleChildSubGroup(section, '__shared__')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 text-left transition-colors cursor-pointer ${
                isLight ? 'hover:bg-slate-100/80' : 'hover:bg-slate-900/60'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-5 h-5 rounded-full bg-slate-700/70 text-slate-200 inline-flex items-center justify-center">
                  <Users className="w-3 h-3" />
                </span>
                <span
                  className={`text-xs font-semibold truncate ${
                    isLight ? 'text-slate-800' : 'text-slate-200'
                  }`}
                >
                  Shared &amp; Bounties
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-medium tabular-nums ${
                    isLight
                      ? 'bg-slate-200/80 text-slate-600'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {extraSharedItems.length}
                </span>
              </div>
              {collapsedChildKeys[`${section}___shared__`] ? (
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              )}
            </button>

            {!collapsedChildKeys[`${section}___shared__`] && (
              <div className="px-2 pb-2 pt-0.5 space-y-1.5">
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
      renderContent: () => renderChildSubGroups('completed', completedByChild),
    },
  ];

  // Review pill styling: warm amber in daytime, zero glow (shadow-none ring-0) in Night Mode
  const reviewPillClass = isNightMode
    ? isLight
      ? 'bg-amber-50/70 hover:bg-amber-100/70 text-amber-800/80 border-amber-200/70 shadow-none ring-0'
      : 'bg-slate-900/75 hover:bg-slate-800/80 text-amber-300/75 border-slate-700/70 shadow-none ring-0'
    : isLight
      ? 'bg-amber-100/90 hover:bg-amber-200 text-amber-900 border-amber-300 shadow-sm ring-1 ring-amber-300/50'
      : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border-amber-400/35 shadow-sm shadow-amber-500/10 ring-1 ring-amber-400/20';

  return (
    <div
      data-variant={variant}
      className={`w-full h-full flex flex-col overflow-hidden select-none ${
        isLight ? 'text-slate-800' : 'text-slate-100'
      }`}
    >
      {/* Top Header Bar */}
      <div
        className={`flex items-center justify-between gap-2 pb-2.5 mb-2 border-b shrink-0 ${
          isLight ? 'border-slate-200/80' : 'border-slate-800/80'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
              isLight
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-emerald-950/50 border-emerald-800/50 text-emerald-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xs font-semibold tracking-tight truncate">{title}</h3>
            <p className={`text-[10px] truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {activeScope === 'household'
                ? includeParents && hasParentProfiles
                  ? 'Household View • Kids & Parents'
                  : 'Household View'
                : `${visibleProfiles[0]?.name || 'Member'}'s Chores`}
            </p>
          </div>
        </div>

        {/* Right Controls: 🛡️ X Review Pill & Maximize Hub Button */}
        <div className="flex items-center gap-1.5 shrink-0">
          {pendingParentActionsCount > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setParentDrawerOpen(true);
              }}
              title="Open Parent Review & Approvals (PIN Protected)"
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold border transition-colors cursor-pointer ${reviewPillClass}`}
            >
              <Shield className="w-3 h-3 text-amber-400" />
              <span>{pendingParentActionsCount} Review</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleMaximizeFullScreen}
            title="Open Full-Screen Chore & Reward Hub"
            aria-label="Maximize Chore Hub"
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              isLight
                ? 'bg-slate-100/80 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border-slate-200'
                : 'bg-slate-900/70 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800'
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Scope Filter Strip (when configured as Household View) */}
      {configuredScope === 'household' && (scopeProfiles.length > 1 || hasParentProfiles) && (
        <div className="flex items-center gap-1.5 pb-2 overflow-x-auto no-scrollbar shrink-0">
          {scopeProfiles.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => setHouseholdFilterId('household')}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors shrink-0 cursor-pointer ${
                  activeScope === 'household'
                    ? isLight
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-700/90 text-white border border-slate-600'
                    : isLight
                      ? 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      : 'bg-slate-900/70 text-slate-400 hover:text-slate-200 border border-slate-800'
                }`}
              >
                Everyone
              </button>
              {scopeProfiles.map((profile) => {
                const isSelected = activeScope === profile.id;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => setHouseholdFilterId(profile.id)}
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors shrink-0 cursor-pointer border ${
                      isSelected
                        ? isLight
                          ? 'bg-slate-800 text-white border-slate-800'
                          : 'bg-slate-800 text-white border-slate-600'
                        : isLight
                          ? 'bg-slate-100/80 text-slate-700 border-slate-200 hover:bg-slate-200/70'
                          : 'bg-slate-900/60 text-slate-300 border-slate-800/80 hover:bg-slate-800/60'
                    }`}
                  >
                    <ProfileAvatar profile={profile} size="xs" showRing={false} />
                    <span>{profile.name}</span>
                    <span className="opacity-75 tabular-nums">({profile.balance})</span>
                  </button>
                );
              })}
            </>
          )}

          {hasParentProfiles && (
            <button
              type="button"
              onClick={handleToggleIncludeParents}
              title={
                includeParents
                  ? 'Hide parent profiles in Household View'
                  : 'Include parent profiles in Household View'
              }
              className={`ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-colors shrink-0 cursor-pointer ${
                includeParents
                  ? isLight
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                    : 'bg-emerald-950/50 text-emerald-300 border-emerald-700/50'
                  : isLight
                    ? 'bg-slate-50 text-slate-500 border-slate-200 hover:text-slate-700'
                    : 'bg-slate-950/50 text-slate-400 border-slate-800/80 hover:text-slate-200'
              }`}
            >
              <UserPlus className="w-3 h-3" />
              <span>Parents</span>
            </button>
          )}
        </div>
      )}

      {/* Vacation Mode Calm Banner */}
      {snapshot.householdSettings.vacationMode && (
        <div
          className={`flex items-center gap-2 px-3 py-1.5 mb-2 rounded-xl border text-xs shrink-0 ${
            isLight
              ? 'bg-teal-50 border-teal-200 text-teal-800'
              : 'bg-teal-950/35 border-teal-800/40 text-teal-200/90'
          }`}
        >
          <Palmtree className="w-3.5 h-3.5 shrink-0 text-teal-400" />
          <span className="truncate">Vacation Mode Active — Daily chores paused</span>
        </div>
      )}

      {/* Internal Scrollable Accordion Container */}
      <div className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
        {sections.map((sec) => {
          const isOpen = expandedSections[sec.id];
          return (
            <div
              key={sec.id}
              className={`rounded-xl border transition-colors ${
                isLight
                  ? 'bg-slate-100/60 border-slate-200/90'
                  : 'bg-slate-900/40 border-slate-800/80'
              }`}
            >
              <button
                type="button"
                onClick={() => toggleSection(sec.id)}
                aria-expanded={isOpen}
                aria-label={`${sec.label} (${sec.count})`}
                className="w-full flex items-center justify-between px-3 py-2 text-left cursor-pointer"
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isOpen ? (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  )}
                  <span className="text-xs font-semibold tracking-tight truncate">
                    {sec.label}
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold tabular-nums shrink-0 ${sec.badgeTone}`}
                >
                  {sec.count}
                </span>
              </button>

              {isOpen && <div className="px-2.5 pb-2.5 pt-0.5">{sec.renderContent()}</div>}
            </div>
          );
        })}
      </div>

      {/* Compact Footer Strip: Proposals Tray, Trophy Case, + Wish */}
      <div
        className={`pt-2 mt-2 border-t flex items-center justify-between gap-1.5 shrink-0 ${
          isLight ? 'border-slate-200/80' : 'border-slate-800/80'
        }`}
      >
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsProposalsTrayOpen(true);
            }}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
              isLight
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                : 'bg-slate-900/70 hover:bg-slate-800 text-slate-300 border-slate-800'
            }`}
          >
            <Inbox className="w-3 h-3 text-amber-400" />
            <span>Proposals ({pendingCounts.needsPricingCount})</span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsTrophyCaseOpen(true);
            }}
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
              isLight
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                : 'bg-slate-900/70 hover:bg-slate-800 text-slate-300 border-slate-800'
            }`}
          >
            <Trophy className="w-3 h-3 text-amber-400" />
            <span>Trophies ({snapshot.trophies.length})</span>
          </button>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setIsProposeModalOpen(true);
          }}
          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-600/90 hover:bg-emerald-500 text-white transition-colors cursor-pointer ${
            isNightMode ? 'shadow-none' : 'shadow-sm'
          }`}
        >
          <Plus className="w-3 h-3" />
          <span>Wish</span>
        </button>
      </div>

      {/* Interactive Shared Chore Split Modal */}
      {splitTarget && (
        <SharedSplitModal
          key={splitTarget.instance.instanceId}
          isOpen={Boolean(splitTarget)}
          instance={splitTarget.instance}
          template={splitTarget.template}
          profiles={splitModalProfiles}
          defaultSelectedProfileId={splitTarget.defaultProfileId}
          isLight={isLight}
          onClose={() => setSplitTarget(null)}
          onConfirmSplit={async (splits) => {
            const targetInstance = splitTarget.instance;
            const targetTemplate = splitTarget.template;
            const res = await completeChore(targetInstance.instanceId, splits);
            if (res.success && !res.requiresApproval && !targetTemplate.requiresApproval) {
              const firstProfile = allProfiles.find((p) => p.id === splits[0]?.profileId);
              maybeCelebrateCompletion(firstProfile?.color);
            }
          }}
        />
      )}

      {/* Kid Wishlist Proposal Modal */}
      {isProposeModalOpen && (
        <ProposeRewardModal
          isOpen={isProposeModalOpen}
          profiles={scopeProfiles}
          defaultProfileId={activeScope}
          onClose={() => setIsProposeModalOpen(false)}
          onSubmitProposal={async (proposal) => {
            await proposeWishlistReward(proposal);
          }}
        />
      )}

      {/* Proposals Tray Modal */}
      {isProposalsTrayOpen && (
        <ProposalsTrayModal
          isOpen={isProposalsTrayOpen}
          profiles={allProfiles}
          rewards={snapshot.rewards}
          activeScope={activeScope}
          onClose={() => setIsProposalsTrayOpen(false)}
          onOpenProposeModal={() => setIsProposeModalOpen(true)}
          onOpenParentPricing={() => setParentDrawerOpen(true, 'pricing')}
        />
      )}

      {/* Trophy Case Modal */}
      {isTrophyCaseOpen && (
        <TrophyCaseModal
          isOpen={isTrophyCaseOpen}
          profiles={allProfiles}
          trophies={snapshot.trophies}
          defaultScope={activeScope}
          onClose={() => setIsTrophyCaseOpen(false)}
        />
      )}
    </div>
  );
};

export default ChoreWidget;
