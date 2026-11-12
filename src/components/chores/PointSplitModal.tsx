import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Users, UserCheck, Sparkles, Minus, Plus, Equal } from 'lucide-react';
import type { ActiveChoreInstance, ChoreTemplate, Profile } from '../../types/chores';
import { calculateEffectiveChorePoints } from '../../utils/choreEngine';
import { HouseholdAvatar } from '../common/HouseholdAvatar';

interface PointSplitModalProps {
  isOpen: boolean;
  instance: ActiveChoreInstance;
  template: ChoreTemplate;
  profiles: Profile[];
  defaultSelectedProfileId?: string;
  onClose: () => void;
  onConfirmSplit: (splits: { profileId: string; pointsAwarded: number }[]) => Promise<void> | void;
}

export const PointSplitModal: React.FC<PointSplitModalProps> = ({
  isOpen,
  instance,
  template,
  profiles,
  defaultSelectedProfileId,
  onClose,
  onConfirmSplit,
}) => {
  const effectivePoints = useMemo(
    () => calculateEffectiveChorePoints(template, instance.isOverdue),
    [template, instance.isOverdue]
  );

  const [mode, setMode] = useState<'solo' | 'split'>('solo');
  const [selectedSoloId, setSelectedSoloId] = useState<string>(
    defaultSelectedProfileId || profiles[0]?.id || ''
  );

  // Initialize an even split across all kids when switching to split mode
  const buildEvenSplit = (helperIds: string[], totalPts: number): Record<string, number> => {
    const result: Record<string, number> = {};
    if (helperIds.length === 0) return result;
    const base = Math.floor(totalPts / helperIds.length);
    let remainder = totalPts - base * helperIds.length;
    for (const id of helperIds) {
      result[id] = base + (remainder > 0 ? 1 : 0);
      if (remainder > 0) remainder -= 1;
    }
    return result;
  };

  const [activeHelpers, setActiveHelpers] = useState<string[]>(() =>
    profiles.map((p) => p.id)
  );
  const [splits, setSplits] = useState<Record<string, number>>(() =>
    buildEvenSplit(
      profiles.map((p) => p.id),
      effectivePoints
    )
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const currentSplitSum = activeHelpers.reduce((acc, id) => acc + (splits[id] ?? 0), 0);
  const isSplitValid =
    mode === 'solo'
      ? Boolean(selectedSoloId)
      : activeHelpers.length > 0 && currentSplitSum === effectivePoints;

  const handleToggleHelper = (profileId: string) => {
    let nextHelpers: string[];
    if (activeHelpers.includes(profileId)) {
      if (activeHelpers.length <= 1) return; // Keep at least 1 helper selected
      nextHelpers = activeHelpers.filter((id) => id !== profileId);
    } else {
      nextHelpers = [...activeHelpers, profileId];
    }
    setActiveHelpers(nextHelpers);
    setSplits(buildEvenSplit(nextHelpers, effectivePoints));
  };

  const handleAdjustPoints = (targetId: string, desiredValue: number) => {
    const clamped = Math.max(0, Math.min(effectivePoints, Math.round(desiredValue)));
    const otherHelpers = activeHelpers.filter((id) => id !== targetId);

    if (otherHelpers.length === 0) {
      setSplits({ [targetId]: effectivePoints });
      return;
    }

    // Automatically balance the remaining points across the other participating kids
    const remaining = effectivePoints - clamped;
    const nextSplits: Record<string, number> = { ...splits, [targetId]: clamped };

    if (otherHelpers.length === 1) {
      nextSplits[otherHelpers[0]] = remaining;
    } else {
      const currentOthersTotal = otherHelpers.reduce((acc, id) => acc + (splits[id] ?? 0), 0);
      if (currentOthersTotal === 0) {
        const evenOthers = buildEvenSplit(otherHelpers, remaining);
        for (const id of otherHelpers) {
          nextSplits[id] = evenOthers[id];
        }
      } else {
        let allocated = 0;
        otherHelpers.forEach((id, idx) => {
          if (idx === otherHelpers.length - 1) {
            nextSplits[id] = Math.max(0, remaining - allocated);
          } else {
            const share = Math.round(((splits[id] ?? 0) / currentOthersTotal) * remaining);
            nextSplits[id] = share;
            allocated += share;
          }
        });
      }
    }

    setSplits(nextSplits);
  };

  const handleConfirm = async () => {
    if (!isSplitValid || isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (mode === 'solo') {
        await onConfirmSplit([
          {
            profileId: selectedSoloId,
            pointsAwarded: effectivePoints,
          },
        ]);
      } else {
        const finalSplits = activeHelpers
          .map((id) => ({
            profileId: id,
            pointsAwarded: Math.round(splits[id] ?? 0),
          }))
          .filter((s) => s.pointsAwarded > 0 || effectivePoints === 0);
        await onConfirmSplit(finalSplits);
      }
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      data-no-drag="true"
      className="fixed inset-0 z-[920] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl border border-slate-700/60 bg-slate-900/95 text-slate-100 shadow-2xl overflow-hidden"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/80 bg-slate-900/60">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-slate-800/90 border border-slate-700/60 flex items-center justify-center text-xl shrink-0">
              {template.icon || '✨'}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-slate-100 truncate">
                Who helped?
              </h3>
              <p className="text-xs text-slate-400 truncate">
                {template.title} •{' '}
                <span className="font-medium text-emerald-300/90">
                  {effectivePoints} pts
                </span>
                {instance.isOverdue && (
                  <span className="ml-1.5 text-amber-300/80">(Yesterday)</span>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800/70 transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Toggle: Solo vs Split */}
        <div className="px-5 pt-4">
          <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-950/70 border border-slate-800/80">
            <button
              type="button"
              onClick={() => setMode('solo')}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                mode === 'solo'
                  ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/70'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5 text-emerald-400/90" />
              Solo (100% Points)
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('split');
                setSplits(buildEvenSplit(activeHelpers, effectivePoints));
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                mode === 'split'
                  ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/70'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-sky-400/90" />
              Split Points
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {mode === 'solo' ? (
            <div className="space-y-2.5">
              <p className="text-xs text-slate-400">
                Select who completed this shared chore to claim all{' '}
                <span className="text-slate-200 font-medium">{effectivePoints} pts</span>:
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                {profiles.map((profile) => {
                  const isSelected = selectedSoloId === profile.id;
                  return (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => setSelectedSoloId(profile.id)}
                      className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'bg-slate-800/90 border-emerald-500/50 ring-1 ring-emerald-500/30'
                          : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <HouseholdAvatar
                        profile={profile}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm font-medium text-slate-100 truncate">
                            {profile.name}
                          </span>
                          {profile.role === 'parent' && (
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-700/80 text-slate-300 shrink-0">
                              Parent
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-emerald-300/90 font-medium">
                          +{effectivePoints} pts
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">
                  Adjust whole-number points for each helper:
                </span>
                <button
                  type="button"
                  onClick={() => setSplits(buildEvenSplit(activeHelpers, effectivePoints))}
                  className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-md bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700/60 transition-colors"
                >
                  <Equal className="w-3 h-3" />
                  Even Split
                </button>
              </div>

              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {profiles.map((profile) => {
                  const isParticipating = activeHelpers.includes(profile.id);
                  const pts = isParticipating ? (splits[profile.id] ?? 0) : 0;

                  return (
                    <div
                      key={profile.id}
                      className={`p-3 rounded-xl border transition-all ${
                        isParticipating
                          ? 'bg-slate-800/60 border-slate-700/80'
                          : 'bg-slate-900/40 border-slate-800/50 opacity-55'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleHelper(profile.id)}
                          className="flex items-center gap-2.5 min-w-0 text-left"
                        >
                          <HouseholdAvatar
                            profile={profile}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-sm font-medium text-slate-100 truncate">
                                {profile.name}
                              </span>
                              {profile.role === 'parent' && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-slate-700/80 text-slate-300 shrink-0">
                                  Parent
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {isParticipating ? 'Helped' : 'Tap to include'}
                            </div>
                          </div>
                        </button>

                        {isParticipating && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleAdjustPoints(profile.id, pts - 1)}
                              disabled={pts <= 0}
                              className="w-7 h-7 rounded-lg bg-slate-900/90 border border-slate-700/70 flex items-center justify-center text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition-colors"
                              aria-label={`Decrease points for ${profile.name}`}
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <span className="w-14 text-center text-sm font-semibold text-emerald-300 tabular-nums">
                              +{pts} pt{pts === 1 ? '' : 's'}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleAdjustPoints(profile.id, pts + 1)}
                              disabled={pts >= effectivePoints}
                              className="w-7 h-7 rounded-lg bg-slate-900/90 border border-slate-700/70 flex items-center justify-center text-slate-300 hover:bg-slate-700 disabled:opacity-40 transition-colors"
                              aria-label={`Increase points for ${profile.name}`}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      {isParticipating && effectivePoints > 0 && (
                        <div className="mt-2.5 flex items-center gap-2">
                          <input
                            type="range"
                            min={0}
                            max={effectivePoints}
                            step={1}
                            value={pts}
                            onChange={(e) =>
                              handleAdjustPoints(profile.id, parseInt(e.target.value, 10) || 0)
                            }
                            className="w-full accent-emerald-500 h-1.5 bg-slate-950 rounded-lg cursor-pointer"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Distribution Summary Bar */}
              <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs">
                <span className="text-slate-400">Total Distributed:</span>
                <span
                  className={`font-semibold tabular-nums ${
                    currentSplitSum === effectivePoints
                      ? 'text-emerald-300'
                      : 'text-amber-300'
                  }`}
                >
                  {currentSplitSum} / {effectivePoints} pts
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 border-t border-slate-800/80 bg-slate-900/80">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!isSplitValid || isSubmitting}
            onClick={handleConfirm}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600/90 hover:bg-emerald-500 text-white shadow-sm disabled:opacity-40 transition-all"
          >
            <Sparkles className="w-3.5 h-3.5" />
            {template.requiresApproval ? 'Submit for Review' : 'Complete Chore'}
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== 'undefined') {
    return createPortal(modalContent, document.body);
  }
  return modalContent;
};
