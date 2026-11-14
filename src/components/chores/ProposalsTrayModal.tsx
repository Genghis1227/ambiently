import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Inbox,
  Plus,
  Shield,
  ExternalLink,
  Clock,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { Profile, WishlistReward } from '../../types/chores';
import { HouseholdAvatar } from '../common/HouseholdAvatar';
import { openInAppWebViewer } from '../../utils/webViewer';

interface ProposalsTrayModalProps {
  isOpen: boolean;
  profiles: Profile[];
  rewards: WishlistReward[];
  defaultScope?: string;
  activeScope?: string;
  onClose: () => void;
  onOpenProposeModal: () => void;
  onEditProposal?: (reward: WishlistReward) => void;
  onWithdrawProposal?: (
    rewardId: string
  ) => Promise<{ success: boolean; error?: string }> | void;
  onOpenParentPricing: () => void;
}

function resolveInitialTrayScope(
  profiles: Profile[],
  rewards: WishlistReward[],
  requestedScope: string
): string {
  if (
    requestedScope !== 'household' &&
    profiles.some((p) => p.id === requestedScope) &&
    rewards.some(
      (r) => r.status === 'needs_pricing' && r.profileId === requestedScope
    )
  ) {
    return requestedScope;
  }
  return 'household';
}

const ProposalsTrayContent: React.FC<Omit<ProposalsTrayModalProps, 'isOpen'>> = ({
  profiles,
  rewards,
  defaultScope,
  activeScope = 'household',
  onClose,
  onOpenProposeModal,
  onEditProposal,
  onWithdrawProposal,
  onOpenParentPricing,
}) => {
  const [selectedScope, setSelectedScope] = useState<string>(() =>
    resolveInitialTrayScope(profiles, rewards, defaultScope ?? activeScope)
  );
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [isRemovingId, setIsRemovingId] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const profileMap = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles]
  );

  const allPendingProposals = useMemo(
    () => rewards.filter((r) => r.status === 'needs_pricing'),
    [rewards]
  );

  const countByProfileId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of allPendingProposals) {
      counts.set(item.profileId, (counts.get(item.profileId) ?? 0) + 1);
    }
    return counts;
  }, [allPendingProposals]);

  const filterProfiles = useMemo(
    () =>
      profiles.filter(
        (p) => p.role !== 'parent' || (countByProfileId.get(p.id) ?? 0) > 0
      ),
    [profiles, countByProfileId]
  );

  const unpricedProposals = useMemo(
    () =>
      allPendingProposals.filter(
        (r) => selectedScope === 'household' || r.profileId === selectedScope
      ),
    [allPendingProposals, selectedScope]
  );

  const selectedProfile =
    selectedScope !== 'household' ? profileMap.get(selectedScope) : undefined;

  const handleConfirmWithdraw = async (rewardId: string) => {
    if (!onWithdrawProposal || isRemovingId) return;
    setIsRemovingId(rewardId);
    try {
      await onWithdrawProposal(rewardId);
      setConfirmRemoveId(null);
    } finally {
      setIsRemovingId(null);
    }
  };

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      data-no-drag="true"
      className="fixed inset-0 z-[940] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-700/60 bg-slate-900/95 text-slate-100 shadow-2xl overflow-hidden flex flex-col max-h-[82vh]"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/80 bg-slate-900/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-300">
              <Inbox className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <span>Wishlist Proposals Tray</span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950/80 text-amber-300 border border-amber-700/40 tabular-nums">
                  {unpricedProposals.length}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Unpriced kid submissions waiting for parent point appraisal
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Profile Filter Pills */}
        {allPendingProposals.length > 0 && filterProfiles.length > 1 && (
          <div className="px-5 pt-3 pb-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar border-b border-slate-800/60 shrink-0">
            <button
              type="button"
              onClick={() => {
                setSelectedScope('household');
                setConfirmRemoveId(null);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer shrink-0 ${
                selectedScope === 'household'
                  ? 'bg-slate-800 text-white border border-slate-600'
                  : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              All Pending ({allPendingProposals.length})
            </button>
            {filterProfiles.map((profile) => {
              const count = countByProfileId.get(profile.id) ?? 0;
              const isSelected = selectedScope === profile.id;
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => {
                    setSelectedScope(profile.id);
                    setConfirmRemoveId(null);
                  }}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer border shrink-0 ${
                    isSelected
                      ? 'bg-slate-800 text-white border-slate-600'
                      : 'bg-slate-950/60 text-slate-300 border-slate-800 hover:bg-slate-800/60'
                  }`}
                >
                  <HouseholdAvatar profile={profile} size="xs" showRing={false} />
                  <span>{profile.name}</span>
                  <span className="opacity-70 tabular-nums">({count})</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1">
          {unpricedProposals.length === 0 ? (
            <div className="py-10 px-4 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 space-y-2.5">
              <div className="text-2xl">✨</div>
              <div className="text-sm font-medium text-slate-200">
                {selectedProfile && allPendingProposals.length > 0
                  ? `No Pending Proposals for ${selectedProfile.name}`
                  : 'Proposals Tray is Empty'}
              </div>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                {selectedProfile && allPendingProposals.length > 0
                  ? `${allPendingProposals.length} pending ${
                      allPendingProposals.length === 1 ? 'proposal is' : 'proposals are'
                    } waiting under other household profiles.`
                  : 'Kids can tap “+ Propose Reward” below to paste a link or wish for a new goal!'}
              </p>
              {selectedScope !== 'household' && allPendingProposals.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedScope('household')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 transition-colors cursor-pointer"
                >
                  Show All Pending ({allPendingProposals.length})
                </button>
              )}
            </div>
          ) : (
            unpricedProposals.map((item) => {
              const child = profileMap.get(item.profileId);
              const isConfirmingRemove = confirmRemoveId === item.id;
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.title}
                        className="w-12 h-12 rounded-lg object-cover bg-slate-900 border border-slate-800 shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-lg shrink-0">
                        🎁
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-100 truncate">
                          {item.title}
                        </span>
                        {item.sourceUrl && (
                          <button
                            type="button"
                            onClick={() => openInAppWebViewer(item.sourceUrl!, item.title)}
                            className="text-slate-400 hover:text-emerald-300 shrink-0 cursor-pointer"
                            title="Preview product link"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {child && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-300">
                            <HouseholdAvatar profile={child} size="xs" showRing={false} />
                            <span>{child.name}</span>
                          </span>
                        )}
                        {item.rawPrice !== undefined && item.rawPrice > 0 && (
                          <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-medium tabular-nums">
                            Est. ${item.rawPrice.toFixed(2)}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 text-[10px] text-amber-300/90">
                          <Clock className="w-2.5 h-2.5" />
                          Needs Pricing
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Kid Self-Service Edit / Withdraw Controls */}
                  {(onEditProposal || onWithdrawProposal) && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isConfirmingRemove ? (
                        <div className="flex items-center gap-1 bg-slate-900/95 border border-rose-500/35 rounded-xl px-2 py-1">
                          <span className="text-[11px] text-rose-200 font-medium pr-1">
                            Remove?
                          </span>
                          <button
                            type="button"
                            disabled={isRemovingId === item.id}
                            onClick={() => handleConfirmWithdraw(item.id)}
                            className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-rose-600/90 hover:bg-rose-500 text-white disabled:opacity-50 transition-colors cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            disabled={isRemovingId === item.id}
                            onClick={() => setConfirmRemoveId(null)}
                            className="px-2 py-1 rounded-lg text-[11px] font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          {onEditProposal && (
                            <button
                              type="button"
                              onClick={() => onEditProposal(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/80 transition-colors cursor-pointer"
                              title="Edit proposal"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>Edit</span>
                            </button>
                          )}
                          {onWithdrawProposal && (
                            <button
                              type="button"
                              onClick={() => setConfirmRemoveId(item.id)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/15 transition-colors cursor-pointer"
                              title="Remove proposal"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-t border-slate-800/80 bg-slate-900/80 shrink-0">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenParentPricing();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-400/35 transition-colors cursor-pointer"
          >
            <Shield className="w-3.5 h-3.5 text-amber-400" />
            <span>Parent Appraisal (PIN)</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenProposeModal();
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600/90 hover:bg-emerald-500 text-white shadow-sm transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Propose Reward</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};

export const ProposalsTrayModal: React.FC<ProposalsTrayModalProps> = (props) => {
  if (!props.isOpen) return null;
  return (
    <ProposalsTrayContent
      key={props.defaultScope ?? props.activeScope ?? 'household'}
      {...props}
    />
  );
};
