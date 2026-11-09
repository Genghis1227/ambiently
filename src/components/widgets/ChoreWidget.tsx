import React, { useState, useMemo } from 'react';
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
  Users,
} from 'lucide-react';
import { useChoreStore, getPendingParentActionCounts } from '../../store/choreStore';
import type {
  ActiveChoreInstance,
  ChoreTemplate,
  ChoreWidgetConfig,
  Profile,
} from '../../types/chores';
import {
  calculateEffectiveChorePoints,
  canSelfRevertInstance,
} from '../../utils/choreEngine';
import { localDateKey } from '../../utils/timePrefs';
import { HouseholdAvatar } from '../common/HouseholdAvatar';
import { PointSplitModal } from '../chores/PointSplitModal';
import { ProposeRewardModal } from '../chores/ProposeRewardModal';
import { ProposalsTrayModal } from '../chores/ProposalsTrayModal';
import { TrophyCaseModal } from '../chores/TrophyCaseModal';
import { triggerChoreCelebration } from '../../utils/confetti';

export interface ChoreWidgetProps {
  title?: string;
  config?: ChoreWidgetConfig;
  isLight?: boolean;
  variant?: 'tile' | 'view';
  onUpdateConfig?: (updates: Partial<ChoreWidgetConfig>) => void;
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
}) => {
  const snapshot = useChoreStore((s) => s.snapshot);
  const completeChore = useChoreStore((s) => s.completeChore);
  const revertChoreSameDay = useChoreStore((s) => s.revertChoreSameDay);
  const proposeWishlistReward = useChoreStore((s) => s.proposeWishlistReward);
  const setFullScreenOpen = useChoreStore((s) => s.setFullScreenOpen);
  const setParentDrawerOpen = useChoreStore((s) => s.setParentDrawerOpen);

  const [isProposeModalOpen, setIsProposeModalOpen] = useState(false);
  const [isProposalsTrayOpen, setIsProposalsTrayOpen] = useState(false);
  const [isTrophyCaseOpen, setIsTrophyCaseOpen] = useState(false);

  const configuredScope = config?.scope || 'household';
  const [activeScope, setActiveScope] = useState<string>(configuredScope);

  // Sync local scope filter if widget settings change
  React.useEffect(() => {
    setActiveScope(config?.scope || 'household');
  }, [config?.scope]);

  // Collapsible top-level accordion state
  const [expandedSections, setExpandedSections] = useState<Record<AccordionSectionId, boolean>>(() => {
    const defaults = config?.defaultExpandedSections || ['today', 'review'];
    return {
      today: defaults.includes('today'),
      review: defaults.includes('review'),
      completed: defaults.includes('completed'),
    };
  });

  // Collapsible per-child sub-group state (default expanded)
  const [collapsedChildKeys, setCollapsedChildKeys] = useState<Record<string, boolean>>({});

  // Modal state for shared chores
  const [splitTarget, setSplitTarget] = useState<{
    instance: ActiveChoreInstance;
    template: ChoreTemplate;
    defaultProfileId?: string;
  } | null>(null);

  const todayKey = localDateKey(new Date());
  const templateMap = useMemo(
    () => new Map(snapshot.templates.map((t) => [t.id, t])),
    [snapshot.templates]
  );

  const visibleProfiles = useMemo(() => {
    if (activeScope === 'household') return snapshot.profiles;
    const matched = snapshot.profiles.filter((p) => p.id === activeScope);
    return matched.length > 0 ? matched : snapshot.profiles;
  }, [snapshot.profiles, activeScope]);

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
    const now = new Date();
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

      const isRelevantDate = inst.dateScheduled === todayKey || inst.isOverdue;
      if (!isRelevantDate && inst.status !== 'awaiting_approval') continue;

      const effectivePoints = calculateEffectiveChorePoints(tpl, inst.isOverdue);
      const isShared = tpl.assignedTo === 'shared';
      const canUndo = canSelfRevertInstance(inst, now);

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
      } else if (inst.status === 'completed' && inst.dateScheduled === todayKey) {
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
  }, [snapshot.instances, templateMap, visibleProfiles, todayKey, activeScope]);

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

    // If shared chore and household has more than 1 kid profile, open the interactive PointSplitModal
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
        className={`group/row flex items-center justify-between gap-2.5 px-2.5 py-2 rounded-xl border transition-all select-none ${
          isOverdue
            ? isLight
              ? 'border-amber-400/50 bg-amber-50/60 hover:bg-amber-50/90'
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

              {/* Subtle "Yesterday" overdue pill */}
              {instance.isOverdue && (
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium border ${
                    isLight
                      ? 'bg-amber-100/80 text-amber-800 border-amber-300/60'
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
            </div>
          </div>
        </div>

        {/* Right Side: Points Pill & Same-Day Undo Hint */}
        <div className="flex items-center gap-1.5 shrink-0">
          {section !== 'today' && (
            canUndo ? (
              <span
                title="Tap to undo (same-day self-revert)"
                className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded opacity-60 group-hover/row:opacity-100 transition-opacity ${
                  isLight ? 'text-slate-500 hover:bg-slate-200/70' : 'text-slate-400 hover:bg-slate-800'
                }`}
              >
                <RotateCcw className="w-2.5 h-2.5" />
                Undo
              </span>
            ) : (
              <span title="Locked past midnight">
                <Lock className="w-3 h-3 text-slate-500 opacity-50" />
              </span>
            )
          )}

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
        {visibleProfiles.map((profile) => {
          const items = byChildMap.get(profile.id) || [];
          if (items.length === 0 && section !== 'today') return null;

          const subKey = `${section}_${profile.id}`;
          const isCollapsed = Boolean(collapsedChildKeys[subKey]);

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
                borderLeftColor: profile.color || '#6B8E7B',
              }}
            >
              {/* Child Sub-Header */}
              <button
                type="button"
                onClick={() => toggleChildSubGroup(section, profile.id)}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 text-left transition-colors ${
                  isLight ? 'hover:bg-slate-100/80' : 'hover:bg-slate-900/60'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <HouseholdAvatar profile={profile} size="xs" showRing={false} />
                  <span
                    className={`text-xs font-semibold truncate ${
                      isLight ? 'text-slate-800' : 'text-slate-200'
                    }`}
                  >
                    {profile.name}
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-medium ${
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
                    style={{ color: profile.color || '#8FA89B' }}
                  >
                    {profile.balance} pts
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
                    items.map((item) => renderChoreItemRow(item, section, profile))
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
              borderLeftColor: '#648296', // Calming Slate Blue
            }}
          >
            <button
              type="button"
              onClick={() => toggleChildSubGroup(section, '__shared__')}
              className={`w-full flex items-center justify-between px-2.5 py-1.5 text-left transition-colors ${
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
                  Shared & Bounties
                </span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-medium ${
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

  return (
    <div
      data-no-drag="true"
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
                ? 'Household View'
                : `${visibleProfiles[0]?.name || 'Child'}'s Chores`}
            </p>
          </div>
        </div>

        {/* Right Controls: 🛡️ X Review Pill + Maximize to Full-Screen View */}
        <div className="flex items-center gap-1.5 shrink-0 pr-12">
          {pendingCounts.totalPendingCount > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setParentDrawerOpen(true, 'approvals');
              }}
              title="Open Parent Review & Approvals (PIN Protected)"
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold border transition-all cursor-pointer ${
                isLight
                  ? 'bg-amber-100/90 hover:bg-amber-200 text-amber-900 border-amber-300'
                  : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border-amber-400/35'
              }`}
            >
              <Shield className="w-3 h-3 text-amber-400" />
              <span>{pendingCounts.totalPendingCount} Review</span>
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setFullScreenOpen(true);
            }}
            title="Open Full-Screen Chore & Reward Hub"
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              isLight
                ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-200 border-slate-700/60'
            }`}
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Scope Filter Strip (when configured as Household View) */}
      {configuredScope === 'household' && snapshot.profiles.length > 1 && (
        <div className="flex items-center gap-1.5 pb-2 overflow-x-auto no-scrollbar shrink-0">
          <button
            type="button"
            onClick={() => setActiveScope('household')}
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
            All Kids
          </button>
          {snapshot.profiles.map((profile) => {
            const isSelected = activeScope === profile.id;
            return (
              <button
                key={profile.id}
                type="button"
                onClick={() => setActiveScope(profile.id)}
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
                <HouseholdAvatar profile={profile} size="xs" showRing={false} />
                <span>{profile.name}</span>
                <span className="opacity-75 tabular-nums">({profile.balance})</span>
              </button>
            );
          })}
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
      <div className="flex-1 overflow-y-auto pr-1 space-y-2">
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
                className="w-full flex items-center justify-between px-3 py-2 text-left cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  {isOpen ? (
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                  )}
                  <span className="text-xs font-semibold tracking-tight">{sec.label}</span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold tabular-nums ${sec.badgeTone}`}
                >
                  {sec.count}
                </span>
              </button>

              {isOpen && <div className="px-2.5 pb-2.5 pt-0.5">{sec.renderContent()}</div>}
            </div>
          );
        })}
      </div>

      {/* Compact Footer Strip: + Wish, Proposals Tray, Trophy Case */}
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
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-600/90 hover:bg-emerald-500 text-white shadow-sm transition-colors cursor-pointer"
        >
          <Plus className="w-3 h-3" />
          <span>Wish</span>
        </button>
      </div>

      {/* Interactive Shared Chore Point Split Modal */}
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

      {/* Kid Wishlist Proposal Modal */}
      {isProposeModalOpen && (
        <ProposeRewardModal
          isOpen={isProposeModalOpen}
          profiles={snapshot.profiles}
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
          profiles={snapshot.profiles}
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
          profiles={snapshot.profiles}
          trophies={snapshot.trophies}
          defaultScope={activeScope}
          onClose={() => setIsTrophyCaseOpen(false)}
        />
      )}
    </div>
  );
};
