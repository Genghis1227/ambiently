import React from 'react';
import {
  Gift,
  Plus,
  Inbox,
  Trophy,
  Sparkles,
  ExternalLink,
  Shield,
  Clock,
} from 'lucide-react';
import type { Profile, TrophyItem, WishlistReward } from '../../types/chores';
import { HouseholdAvatar } from '../common/HouseholdAvatar';
import { openInAppWebViewer } from '../../utils/webViewer';
import { triggerChoreCelebration } from '../../utils/confetti';

interface RewardStorePanelProps {
  profiles: Profile[];
  rewards: WishlistReward[];
  trophies: TrophyItem[];
  activeScope?: string; // 'household' or profileId
  isLight?: boolean;
  onClaimReward: (rewardId: string) => Promise<{ success: boolean; error?: string }>;
  onOpenProposeModal: () => void;
  onOpenProposalsTray: () => void;
  onOpenTrophyCase: () => void;
  onOpenParentFulfillment: () => void;
}

export const RewardStorePanel: React.FC<RewardStorePanelProps> = ({
  profiles,
  rewards,
  trophies,
  activeScope = 'household',
  isLight = false,
  onClaimReward,
  onOpenProposeModal,
  onOpenProposalsTray,
  onOpenTrophyCase,
  onOpenParentFulfillment,
}) => {
  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  const visibleRewards = rewards.filter(
    (r) =>
      (r.status === 'active_goal' ||
        r.status === 'unlocked' ||
        r.status === 'pending_fulfillment') &&
      (activeScope === 'household' || r.profileId === activeScope)
  );

  // Sort: pending_fulfillment first, then unlocked, then closest to unlocking
  const sortedRewards = [...visibleRewards].sort((a, b) => {
    const rank = (r: WishlistReward) =>
      r.status === 'pending_fulfillment' ? 0 : r.status === 'unlocked' ? 1 : 2;
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const balA = profileMap.get(a.profileId)?.balance || 0;
    const balB = profileMap.get(b.profileId)?.balance || 0;
    const pctA = a.pointsCost > 0 ? balA / a.pointsCost : 0;
    const pctB = b.pointsCost > 0 ? balB / b.pointsCost : 0;
    return pctB - pctA;
  });

  const needsPricingCount = rewards.filter(
    (r) =>
      r.status === 'needs_pricing' &&
      (activeScope === 'household' || r.profileId === activeScope)
  ).length;

  const trophyCount = trophies.filter(
    (t) => activeScope === 'household' || t.profileId === activeScope
  ).length;

  const handleClaim = async (reward: WishlistReward, e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const child = profileMap.get(reward.profileId);
    const res = await onClaimReward(reward.id);
    if (res.success) {
      triggerChoreCelebration({
        originX: rect.left + rect.width / 2,
        originY: rect.top + rect.height / 2,
        accentColor: child?.color,
      });
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div
        className={`flex items-center justify-between gap-2 pb-3 mb-3 border-b shrink-0 ${
          isLight ? 'border-slate-200/80' : 'border-slate-800/80'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center border shrink-0 ${
              isLight
                ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                : 'bg-emerald-950/50 border-emerald-800/50 text-emerald-300'
            }`}
          >
            <Gift className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight truncate">
              Reward Store
            </h3>
            <p className={`text-[11px] truncate ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              Global Wallet goals & unlocked prizes
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onOpenProposeModal}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-emerald-600/90 hover:bg-emerald-500 text-white shadow-sm transition-colors shrink-0 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Wish</span>
        </button>
      </div>

      {/* Quick Access Pills: Proposals Tray & Trophy Case */}
      <div className="grid grid-cols-2 gap-2 mb-3 shrink-0">
        <button
          type="button"
          onClick={onOpenProposalsTray}
          className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
            isLight
              ? 'bg-slate-100/80 hover:bg-slate-200/80 border-slate-200 text-slate-700'
              : 'bg-slate-900/70 hover:bg-slate-800/80 border-slate-800 text-slate-200'
          }`}
        >
          <span className="inline-flex items-center gap-1.5 truncate">
            <Inbox className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">Proposals</span>
          </span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold tabular-nums ${
              needsPricingCount > 0
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                : isLight
                  ? 'bg-slate-200 text-slate-600'
                  : 'bg-slate-800 text-slate-400'
            }`}
          >
            {needsPricingCount}
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenTrophyCase}
          className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
            isLight
              ? 'bg-slate-100/80 hover:bg-slate-200/80 border-slate-200 text-slate-700'
              : 'bg-slate-900/70 hover:bg-slate-800/80 border-slate-800 text-slate-200'
          }`}
        >
          <span className="inline-flex items-center gap-1.5 truncate">
            <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">Trophies</span>
          </span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold tabular-nums ${
              isLight
                ? 'bg-slate-200 text-slate-600'
                : 'bg-slate-800 text-slate-300'
            }`}
          >
            {trophyCount}
          </span>
        </button>
      </div>

      {/* Scrollable Active Goals List */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-3">
        {sortedRewards.length === 0 ? (
          <div
            className={`p-6 rounded-2xl border border-dashed text-center space-y-2 ${
              isLight
                ? 'border-slate-200 bg-slate-50/60 text-slate-500'
                : 'border-slate-800/80 bg-slate-950/30 text-slate-400'
            }`}
          >
            <div className="text-2xl">🏦</div>
            <div className="text-xs font-semibold">
              Banking Points in Global Wallet
            </div>
            <p className="text-[11px] leading-relaxed max-w-xs mx-auto opacity-80">
              No active reward goals right now. Earned points are safely banked—tap &ldquo;+ Wish&rdquo; anytime to propose a reward!
            </p>
          </div>
        ) : (
          sortedRewards.map((reward) => {
            const child = profileMap.get(reward.profileId);
            const balance = child?.balance ?? 0;
            const cost = Math.max(1, reward.pointsCost);
            const progressPct = Math.min(100, Math.round((balance / cost) * 100));
            const isUnlocked =
              reward.status === 'unlocked' ||
              (reward.status === 'active_goal' && balance >= cost);
            const isPendingFulfillment = reward.status === 'pending_fulfillment';

            return (
              <div
                key={reward.id}
                className={`rounded-2xl border overflow-hidden transition-all ${
                  isPendingFulfillment
                    ? isLight
                      ? 'bg-amber-50/70 border-amber-300'
                      : 'bg-amber-950/20 border-amber-500/40'
                    : isUnlocked
                      ? isLight
                        ? 'bg-emerald-50/60 border-emerald-300 shadow-sm'
                        : 'bg-emerald-950/20 border-emerald-500/45 shadow-sm'
                      : isLight
                        ? 'bg-white border-slate-200/90'
                        : 'bg-slate-900/60 border-slate-800/80'
                }`}
              >
                {/* Achievement Unlocked Banner */}
                {isUnlocked && !isPendingFulfillment && (
                  <div className="px-3.5 py-1.5 bg-emerald-600/20 border-b border-emerald-500/30 flex items-center justify-between text-[11px] font-semibold text-emerald-300">
                    <span className="inline-flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Achievement Unlocked!</span>
                    </span>
                    <span className="tabular-nums">Ready to claim</span>
                  </div>
                )}

                {/* Pending Fulfillment Banner */}
                {isPendingFulfillment && (
                  <div className="px-3.5 py-1.5 bg-amber-500/20 border-b border-amber-500/30 flex items-center justify-between text-[11px] font-semibold text-amber-200">
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-300" />
                      <span>Claimed — Awaiting Parent PIN</span>
                    </span>
                  </div>
                )}

                <div className="p-3.5 space-y-3">
                  <div className="flex items-start gap-3">
                    {reward.imageUrl ? (
                      <img
                        src={reward.imageUrl}
                        alt={reward.title}
                        className="w-14 h-14 rounded-xl object-cover bg-slate-950 border border-slate-800 shrink-0"
                      />
                    ) : (
                      <div
                        className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl border shrink-0 ${
                          isLight
                            ? 'bg-slate-100 border-slate-200'
                            : 'bg-slate-950/70 border-slate-800'
                        }`}
                      >
                        🎁
                      </div>
                    )}

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-1.5">
                        <h4
                          className={`text-xs font-semibold leading-snug line-clamp-2 ${
                            isLight ? 'text-slate-900' : 'text-slate-100'
                          }`}
                        >
                          {reward.title}
                        </h4>
                        {reward.sourceUrl && (
                          <button
                            type="button"
                            onClick={() => openInAppWebViewer(reward.sourceUrl!, reward.title)}
                            className="text-slate-400 hover:text-emerald-400 shrink-0 cursor-pointer"
                            title="Open product link"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-0.5">
                        {child && (
                          <span className="inline-flex items-center gap-1.5 text-[11px] opacity-90">
                            <HouseholdAvatar profile={child} size="xs" showRing={false} />
                            <span className="font-medium">{child.name}</span>
                          </span>
                        )}
                        <span
                          className={`text-xs font-bold tabular-nums ${
                            isUnlocked
                              ? 'text-emerald-400'
                              : isLight
                                ? 'text-slate-700'
                                : 'text-slate-200'
                          }`}
                        >
                          {reward.pointsCost} pts
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Global Wallet Progress Bar */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] tabular-nums">
                      <span className={isLight ? 'text-slate-500' : 'text-slate-400'}>
                        Wallet: {balance} / {reward.pointsCost} pts
                      </span>
                      <span className="font-semibold">{progressPct}%</span>
                    </div>
                    <div
                      className={`w-full h-2 rounded-full overflow-hidden ${
                        isLight ? 'bg-slate-200' : 'bg-slate-950'
                      }`}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${progressPct}%`,
                          backgroundColor: isUnlocked
                            ? '#5B9A7D'
                            : child?.color || '#648296',
                        }}
                      />
                    </div>
                  </div>

                  {/* Action Button */}
                  {isPendingFulfillment ? (
                    <button
                      type="button"
                      onClick={onOpenParentFulfillment}
                      className="w-full py-2 px-3 rounded-xl text-xs font-semibold bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-400/40 inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Shield className="w-3.5 h-3.5 text-amber-300" />
                      <span>Parent Confirm Redemption (PIN)</span>
                    </button>
                  ) : isUnlocked ? (
                    <button
                      type="button"
                      onClick={(e) => handleClaim(reward, e)}
                      className="w-full py-2 px-3 rounded-xl text-xs font-semibold bg-emerald-600/90 hover:bg-emerald-500 text-white shadow-sm inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.99]"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Claim Reward</span>
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
