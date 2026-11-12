import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Equal, Minus, Plus, Sparkles, UserCheck, Users, X } from 'lucide-react';
import type {
  ActiveChoreInstance,
  ChoreCompletionSplit,
  ChoreTemplate,
  Profile,
} from '../../types/chores';
import { resolveProfileColorHex } from '../../types/profiles';
import { calculateEffectiveChorePoints, validateChoreSplits } from '../../utils/choreEngine';
import { ProfileAvatar } from '../common/ProfileAvatar';

export interface SharedSplitModalProps {
  isOpen: boolean;
  instance: ActiveChoreInstance;
  template: ChoreTemplate;
  profiles: Profile[];
  defaultSelectedProfileId?: string;
  isLight?: boolean;
  onClose: () => void;
  onConfirmSplit: (splits: ChoreCompletionSplit[]) => Promise<void> | void;
}

/**
 * Distributes `totalPts` as whole-number integers across `helperIds` with zero decimals/floats.
 */
function buildEvenIntegerSplit(helperIds: string[], totalPts: number): Record<string, number> {
  const safeTotal = Math.max(0, Math.trunc(totalPts));
  const result: Record<string, number> = {};
  if (helperIds.length === 0) return result;

  const count = helperIds.length;
  const base = Math.trunc(safeTotal / count);
  let remainder = safeTotal - base * count;

  for (const id of helperIds) {
    result[id] = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) {
      remainder -= 1;
    }
  }
  return result;
}

export const SharedSplitModal: React.FC<SharedSplitModalProps> = ({
  isOpen,
  instance,
  template,
  profiles,
  defaultSelectedProfileId,
  isLight = false,
  onClose,
  onConfirmSplit,
}) => {
  const effectivePoints = useMemo(
    () => Math.max(0, Math.trunc(calculateEffectiveChorePoints(template, instance.isOverdue))),
    [template, instance.isOverdue]
  );

  const defaultHelperProfiles = useMemo(() => {
    const kids = profiles.filter((p) => p.role !== 'parent');
    return kids.length > 0 ? kids : profiles;
  }, [profiles]);

  const fallbackSoloId = useMemo(() => {
    if (
      defaultSelectedProfileId &&
      defaultSelectedProfileId !== 'household' &&
      profiles.some((p) => p.id === defaultSelectedProfileId)
    ) {
      return defaultSelectedProfileId;
    }
    return defaultHelperProfiles[0]?.id || profiles[0]?.id || '';
  }, [defaultSelectedProfileId, defaultHelperProfiles, profiles]);

  const [mode, setMode] = useState<'solo' | 'split'>('solo');
  const [selectedSoloId, setSelectedSoloId] = useState<string>(() => fallbackSoloId);
  const [activeHelpers, setActiveHelpers] = useState<string[]>(() =>
    defaultHelperProfiles.map((p) => p.id)
  );
  const [splits, setSplits] = useState<Record<string, number>>(() =>
    buildEvenIntegerSplit(
      defaultHelperProfiles.map((p) => p.id),
      effectivePoints
    )
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const effectiveSoloId = profiles.some((p) => p.id === selectedSoloId)
    ? selectedSoloId
    : fallbackSoloId;

  const currentSplitSum = useMemo(
    () =>
      activeHelpers.reduce((acc, id) => {
        const val = Math.max(0, Math.trunc(splits[id] ?? 0));
        return acc + val;
      }, 0),
    [activeHelpers, splits]
  );

  const candidateSplits: ChoreCompletionSplit[] = useMemo(() => {
    if (mode === 'solo') {
      if (!effectiveSoloId) return [];
      return [{ profileId: effectiveSoloId, pointsAwarded: effectivePoints }];
    }
    return activeHelpers.map((id) => ({
      profileId: id,
      pointsAwarded: Math.max(0, Math.trunc(splits[id] ?? 0)),
    }));
  }, [mode, effectiveSoloId, effectivePoints, activeHelpers, splits]);

  const splitValidation = useMemo(
    () => validateChoreSplits(candidateSplits, effectivePoints),
    [candidateSplits, effectivePoints]
  );

  const willRequireApproval = useMemo(() => {
    if (!template.requiresApproval) return false;
    const roleMap = new Map(profiles.map((p) => [p.id, p.role]));
    const active = candidateSplits.filter((s) => s.pointsAwarded > 0 || effectivePoints === 0);
    const isOnlyParents =
      active.length > 0 && active.every((s) => roleMap.get(s.profileId) === 'parent');
    return !isOnlyParents;
  }, [template.requiresApproval, profiles, candidateSplits, effectivePoints]);

  if (!isOpen) return null;

  const handleToggleHelper = (profileId: string) => {
    const isSelected = activeHelpers.includes(profileId);
    const nextHelpers = isSelected
      ? activeHelpers.filter((id) => id !== profileId)
      : [...activeHelpers, profileId];

    setActiveHelpers(nextHelpers);
    setSplits(buildEvenIntegerSplit(nextHelpers, effectivePoints));
  };

  const handleAdjustPoints = (targetId: string, rawValue: number) => {
    if (!Number.isFinite(rawValue)) return;
    const clamped = Math.max(0, Math.min(effectivePoints, Math.round(Math.trunc(rawValue))));
    const otherHelpers = activeHelpers.filter((id) => id !== targetId);

    if (otherHelpers.length === 1) {
      // Exact integer complement when splitting between 2 helpers
      const complement = Math.max(0, effectivePoints - clamped);
      setSplits((prev) => ({
        ...prev,
        [targetId]: clamped,
        [otherHelpers[0]]: complement,
      }));
      return;
    }

    setSplits((prev) => ({
      ...prev,
      [targetId]: clamped,
    }));
  };

  const handleConfirm = async () => {
    const validation = validateChoreSplits(candidateSplits, effectivePoints);
    if (!validation.valid || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onConfirmSplit(validation.normalizedSplits);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      data-no-drag="true"
      aria-label={`Complete shared chore: ${template.title}`}
      className="fixed inset-0 z-[920] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4 select-none"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onClose}
    >
      <div
        className={`w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden ${
          isLight
            ? 'bg-white border-slate-200 text-slate-800'
            : 'bg-slate-900/95 border-slate-700/60 text-slate-100'
        }`}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between px-5 py-4 border-b ${
            isLight
              ? 'border-slate-200/90 bg-slate-50/80'
              : 'border-slate-800/80 bg-slate-900/60'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center text-xl shrink-0 ${
                isLight
                  ? 'bg-white border-slate-200'
                  : 'bg-slate-800/90 border-slate-700/60'
              }`}
            >
              {template.icon || '✨'}
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold truncate">Who helped?</h3>
              <p
                className={`text-xs truncate ${
                  isLight ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                {template.title} •{' '}
                <span
                  className={`font-semibold tabular-nums ${
                    isLight ? 'text-emerald-700' : 'text-emerald-300/90'
                  }`}
                >
                  {effectivePoints} pt{effectivePoints === 1 ? '' : 's'}
                </span>
                {instance.isOverdue && (
                  <span
                    className={`ml-1.5 ${
                      isLight ? 'text-amber-700' : 'text-amber-300/80'
                    }`}
                  >
                    (Yesterday)
                  </span>
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`w-9 h-9 rounded-xl inline-flex items-center justify-center transition-colors cursor-pointer ${
              isLight
                ? 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/70'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/70'
            }`}
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Toggle: Single Completion vs Multi-Child Split */}
        <div className="px-5 pt-4">
          <div
            className={`grid grid-cols-2 gap-1.5 p-1 rounded-xl border ${
              isLight
                ? 'bg-slate-100 border-slate-200/80'
                : 'bg-slate-950/70 border-slate-800/80'
            }`}
          >
            <button
              type="button"
              onClick={() => setMode('solo')}
              className={`flex items-center justify-center gap-2 min-h-[40px] py-2 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                mode === 'solo'
                  ? isLight
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                    : 'bg-slate-800 text-slate-100 border border-slate-700/70'
                  : isLight
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>Single (100% Points)</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMode('split');
                if (activeHelpers.length === 0) {
                  const defaultIds = defaultHelperProfiles.map((p) => p.id);
                  setActiveHelpers(defaultIds);
                  setSplits(buildEvenIntegerSplit(defaultIds, effectivePoints));
                }
              }}
              className={`flex items-center justify-center gap-2 min-h-[40px] py-2 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                mode === 'split'
                  ? isLight
                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                    : 'bg-slate-800 text-slate-100 border border-slate-700/70'
                  : isLight
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-sky-400" />
              <span>Who Helped? (Split)</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4">
          {mode === 'solo' ? (
            <div className="space-y-2.5">
              <p className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                Tap who completed this shared chore to award 100% (
                <span
                  className={`font-semibold tabular-nums ${
                    isLight ? 'text-slate-800' : 'text-slate-200'
                  }`}
                >
                  {effectivePoints} pt{effectivePoints === 1 ? '' : 's'}
                </span>
                ):
              </p>

              <div className="grid grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-0.5">
                {profiles.map((profile) => {
                  const isSelected = effectiveSoloId === profile.id;
                  const accentHex = resolveProfileColorHex(profile.color);
                  return (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() => setSelectedSoloId(profile.id)}
                      style={{
                        borderLeftWidth: '3px',
                        borderLeftColor: accentHex,
                      }}
                      className={`flex items-center gap-2.5 p-3 min-h-[52px] rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? isLight
                            ? 'bg-emerald-50/70 border-emerald-500/60 ring-1 ring-emerald-500/30'
                            : 'bg-slate-800/90 border-emerald-500/50 ring-1 ring-emerald-500/30'
                          : isLight
                            ? 'bg-slate-50/80 border-slate-200 hover:border-slate-300'
                            : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
                      }`}
                    >
                      <ProfileAvatar profile={profile} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-sm font-medium truncate">{profile.name}</span>
                          {profile.role === 'parent' && (
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-medium shrink-0 ${
                                isLight
                                  ? 'bg-slate-200 text-slate-600'
                                  : 'bg-slate-700/80 text-slate-300'
                              }`}
                            >
                              Parent
                            </span>
                          )}
                        </div>
                        <div
                          className={`text-xs font-semibold tabular-nums ${
                            isLight ? 'text-emerald-700' : 'text-emerald-300/90'
                          }`}
                        >
                          +{effectivePoints} pt{effectivePoints === 1 ? '' : 's'}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
                  Toggle helpers &amp; adjust whole-number shares:
                </span>
                <button
                  type="button"
                  disabled={activeHelpers.length === 0}
                  onClick={() =>
                    setSplits(buildEvenIntegerSplit(activeHelpers, effectivePoints))
                  }
                  className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-lg border transition-colors cursor-pointer disabled:opacity-40 ${
                    isLight
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                      : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border-slate-700/60'
                  }`}
                >
                  <Equal className="w-3 h-3" />
                  <span>Even Split</span>
                </button>
              </div>

              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {profiles.map((profile) => {
                  const isParticipating = activeHelpers.includes(profile.id);
                  const pts = isParticipating
                    ? Math.max(0, Math.trunc(splits[profile.id] ?? 0))
                    : 0;
                  const accentHex = resolveProfileColorHex(profile.color);

                  return (
                    <div
                      key={profile.id}
                      style={{
                        borderLeftWidth: '3px',
                        borderLeftColor: accentHex,
                      }}
                      className={`p-3 rounded-xl border transition-all ${
                        isParticipating
                          ? isLight
                            ? 'bg-slate-50/90 border-slate-200'
                            : 'bg-slate-800/60 border-slate-700/80'
                          : isLight
                            ? 'bg-slate-50/40 border-slate-200/60 opacity-60'
                            : 'bg-slate-900/40 border-slate-800/50 opacity-55'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => handleToggleHelper(profile.id)}
                          className="flex items-center gap-2.5 min-w-0 text-left flex-1 cursor-pointer"
                        >
                          <span
                            className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                              isParticipating
                                ? 'bg-emerald-600/90 border-emerald-500 text-white'
                                : isLight
                                  ? 'border-slate-300 bg-white'
                                  : 'border-slate-700 bg-slate-950/60'
                            }`}
                          >
                            {isParticipating && <Check className="w-3 h-3 stroke-[2.5]" />}
                          </span>
                          <ProfileAvatar profile={profile} size="sm" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-sm font-medium truncate">
                                {profile.name}
                              </span>
                              {profile.role === 'parent' && (
                                <span
                                  className={`px-1.5 py-0.2 rounded text-[10px] font-medium shrink-0 ${
                                    isLight
                                      ? 'bg-slate-200 text-slate-600'
                                      : 'bg-slate-700/80 text-slate-300'
                                  }`}
                                >
                                  Parent
                                </span>
                              )}
                            </div>
                            <div
                              className={`text-[11px] ${
                                isLight ? 'text-slate-500' : 'text-slate-400'
                              }`}
                            >
                              {isParticipating ? 'Helped' : 'Tap to include'}
                            </div>
                          </div>
                        </button>

                        {isParticipating && (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleAdjustPoints(profile.id, pts - 1)}
                              disabled={pts <= 0}
                              className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-default ${
                                isLight
                                  ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                                  : 'bg-slate-900/90 border-slate-700/70 text-slate-300 hover:bg-slate-700'
                              }`}
                              aria-label={`Decrease points for ${profile.name}`}
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>

                            <span
                              className={`w-14 text-center text-sm font-semibold tabular-nums ${
                                isLight ? 'text-emerald-700' : 'text-emerald-300'
                              }`}
                            >
                              +{pts} pt{pts === 1 ? '' : 's'}
                            </span>

                            <button
                              type="button"
                              onClick={() => handleAdjustPoints(profile.id, pts + 1)}
                              disabled={pts >= effectivePoints}
                              className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-default ${
                                isLight
                                  ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                                  : 'bg-slate-900/90 border-slate-700/70 text-slate-300 hover:bg-slate-700'
                              }`}
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
                              handleAdjustPoints(
                                profile.id,
                                Math.trunc(Number(e.target.value) || 0)
                              )
                            }
                            aria-label={`Point share slider for ${profile.name}`}
                            className={`w-full accent-emerald-500 h-1.5 rounded-lg cursor-pointer ${
                              isLight ? 'bg-slate-200' : 'bg-slate-950'
                            }`}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Distribution Summary Bar */}
              <div
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border text-xs ${
                  splitValidation.valid
                    ? isLight
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                      : 'bg-slate-950/60 border-slate-800/80 text-slate-300'
                    : isLight
                      ? 'bg-amber-50 border-amber-300/70 text-amber-800'
                      : 'bg-amber-950/25 border-amber-400/35 text-amber-200'
                }`}
              >
                <span className="truncate">
                  {splitValidation.valid ? 'Total Distributed:' : splitValidation.error}
                </span>
                <span
                  className={`font-semibold tabular-nums shrink-0 ${
                    splitValidation.valid
                      ? isLight
                        ? 'text-emerald-700'
                        : 'text-emerald-300'
                      : isLight
                        ? 'text-amber-700'
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
        <div
          className={`flex items-center justify-end gap-2.5 px-5 py-3.5 border-t ${
            isLight
              ? 'border-slate-200/90 bg-slate-50/80'
              : 'border-slate-800/80 bg-slate-900/80'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className={`px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-medium transition-colors cursor-pointer ${
              isLight
                ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!splitValidation.valid || isSubmitting}
            onClick={handleConfirm}
            className="inline-flex items-center gap-1.5 px-4 py-2 min-h-[40px] rounded-xl text-xs font-semibold bg-emerald-600/90 hover:bg-emerald-500 text-white disabled:opacity-40 disabled:cursor-default transition-all cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{willRequireApproval ? 'Submit for Review' : 'Complete Chore'}</span>
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

export default SharedSplitModal;
