import React from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Inbox,
  Plus,
  Shield,
  ExternalLink,
  Clock,
} from 'lucide-react';
import type { Profile, WishlistReward } from '../../types/chores';
import { HouseholdAvatar } from '../common/HouseholdAvatar';
import { openInAppWebViewer } from '../../utils/webViewer';

interface ProposalsTrayModalProps {
  isOpen: boolean;
  profiles: Profile[];
  rewards: WishlistReward[];
  activeScope?: string;
  onClose: () => void;
  onOpenProposeModal: () => void;
  onOpenParentPricing: () => void;
}

export const ProposalsTrayModal: React.FC<ProposalsTrayModalProps> = ({
  isOpen,
  profiles,
  rewards,
  activeScope = 'household',
  onClose,
  onOpenProposeModal,
  onOpenParentPricing,
}) => {
  if (!isOpen) return null;

  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const unpricedProposals = rewards.filter(
    (r) =>
      r.status === 'needs_pricing' &&
      (activeScope === 'household' || r.profileId === activeScope)
  );

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

        {/* Body */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1">
          {unpricedProposals.length === 0 ? (
            <div className="py-10 px-4 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 space-y-2">
              <div className="text-2xl">✨</div>
              <div className="text-sm font-medium text-slate-200">
                Proposals Tray is Empty
              </div>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                Kids can tap &ldquo;+ Propose Reward&rdquo; below to paste a link or wish for a new goal!
              </p>
            </div>
          ) : (
            unpricedProposals.map((item) => {
              const child = profileMap.get(item.profileId);
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
