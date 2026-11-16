import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Dices,
  Plus,
  RotateCcw,
  Sparkles,
  Users,
  Utensils,
  Vote,
  Zap,
} from 'lucide-react';
import type {
  DecisionMakerMode,
  DecisionMakerWidgetConfig,
  DecisionOption,
} from '../../types/phase2Widgets';
import { MAX_DECISION_OPTIONS } from '../../types/phase2Widgets';
import {
  buildWheelSliceGeometry,
  castPollVote,
  computeWheelSpinTargetDeg,
  DECISION_STARTER_PRESETS,
  DECISION_WHEEL_PALETTE,
  importOptionsFromProfiles,
  importOptionsFromRecipes,
  pickRandomOptionIndex,
  resolveDecisionOptions,
  tallyPollVotes,
} from '../../utils/decisionEngine';
import { useProfileStore } from '../../stores/useProfileStore';
import { useMealStore } from '../../stores/useMealStore';
import { ProfileAvatar } from '../common/ProfileAvatar';
import { triggerChoreCelebration } from '../../utils/confetti';
import type { HouseholdProfile } from '../../types/profiles';

interface DecisionMakerWidgetProps {
  title?: string;
  config?: DecisionMakerWidgetConfig;
  isLight?: boolean;
  transparentBg?: boolean;
  onUpdateConfig?: (updates: Record<string, any>) => void;
}

export const DecisionMakerWidget: React.FC<DecisionMakerWidgetProps> = ({
  title = 'Decision Wheel & Poll',
  config,
  isLight = false,
  transparentBg = false,
  onUpdateConfig,
}) => {
  const allProfiles = useProfileStore((s) => s.profiles);
  const profiles = useMemo(() => allProfiles.filter((p) => !p.deletedAt), [allProfiles]);
  const profileMap = useMemo(() => {
    const map = new Map<string, HouseholdProfile>();
    for (const p of profiles) map.set(p.id, p);
    return map;
  }, [profiles]);

  const recipes = useMealStore((s) => s.snapshot.recipes);
  const options = useMemo(() => resolveDecisionOptions(config?.options), [config?.options]);
  const votes = useMemo(() => config?.votes || {}, [config?.votes]);
  const eliminatedIds = useMemo(
    () => new Set(config?.eliminatedOptionIds || []),
    [config?.eliminatedOptionIds]
  );

  const [localMode, setLocalMode] = useState<DecisionMakerMode>(config?.mode || 'wheel');
  const mode: DecisionMakerMode = config?.mode || localMode;
  const promptText = config?.prompt?.trim() || 'What should we pick?';
  const allowMultiVote = Boolean(config?.allowMultiVote);
  const removeWinnerOnSpin = Boolean(config?.removeWinnerOnSpin);

  const [rotationDeg, setRotationDeg] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [localWinnerId, setLocalWinnerId] = useState<string | null>(
    config?.lastWinnerOptionId ?? null
  );
  const [tieBreakOptionIds, setTieBreakOptionIds] = useState<string[] | null>(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [quickOptionInput, setQuickOptionInput] = useState('');
  const [selectedVoterKey, setSelectedVoterKey] = useState<string>(() =>
    profiles[0]?.id || 'guest'
  );

  const spinTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (spinTimeoutRef.current !== null) {
        window.clearTimeout(spinTimeoutRef.current);
      }
    };
  }, []);

  const effectiveVoterKey =
    selectedVoterKey === 'guest' || profileMap.has(selectedVoterKey)
      ? selectedVoterKey
      : profiles[0]?.id || 'guest';

  const activeWheelOptions: DecisionOption[] = useMemo(() => {
    if (tieBreakOptionIds && tieBreakOptionIds.length >= 2) {
      const subset = options.filter((o) => tieBreakOptionIds.includes(o.id));
      if (subset.length >= 2) return subset;
    }
    const visible = options.filter((o) => !eliminatedIds.has(o.id));
    return visible.length > 0 ? visible : options;
  }, [options, eliminatedIds, tieBreakOptionIds]);

  const wheelSlices = useMemo(
    () => buildWheelSliceGeometry(activeWheelOptions.length, 92, 100, 100),
    [activeWheelOptions.length]
  );

  const tally = useMemo(() => tallyPollVotes(options, votes), [options, votes]);

  const displayedWinner = useMemo(() => {
    const id = localWinnerId ?? config?.lastWinnerOptionId;
    if (!id) return null;
    return options.find((o) => o.id === id) || null;
  }, [localWinnerId, config?.lastWinnerOptionId, options]);

  const handleModeSwitch = (nextMode: DecisionMakerMode) => {
    setLocalMode(nextMode);
    if (nextMode === 'poll') {
      setTieBreakOptionIds(null);
    }
    if (onUpdateConfig) {
      onUpdateConfig({ mode: nextMode });
    }
  };

  const triggerWheelSpin = (overrideOptions?: DecisionOption[]) => {
    if (isSpinning) return;
    const pool = overrideOptions && overrideOptions.length > 0 ? overrideOptions : activeWheelOptions;
    if (pool.length === 0) return;

    const winnerIdx = pickRandomOptionIndex(pool.length);
    const chosen = pool[winnerIdx];
    const jitter = 0.25 + (pickRandomOptionIndex(50) / 100); // safely stays in [0.25, 0.74] inside slice
    const targetDeg = computeWheelSpinTargetDeg(rotationDeg, winnerIdx, pool.length, 5, jitter);

    setIsSpinning(true);
    setRotationDeg(targetDeg);

    if (spinTimeoutRef.current !== null) {
      window.clearTimeout(spinTimeoutRef.current);
    }

    spinTimeoutRef.current = window.setTimeout(() => {
      spinTimeoutRef.current = null;
      setIsSpinning(false);
      setLocalWinnerId(chosen.id);
      triggerChoreCelebration();

      if (onUpdateConfig) {
        const nextEliminated =
          removeWinnerOnSpin && pool.length > 1
            ? Array.from(new Set([...(config?.eliminatedOptionIds || []), chosen.id]))
            : config?.eliminatedOptionIds;
        onUpdateConfig({
          lastWinnerOptionId: chosen.id,
          lastSpunAt: new Date().toISOString(),
          ...(nextEliminated !== undefined ? { eliminatedOptionIds: nextEliminated } : {}),
        });
      }
    }, 3450);
  };

  const handleSpinTieBreaker = () => {
    if (!tally.hasTie) return;
    const tiedOptions = options.filter((o) => tally.leadingOptionIds.includes(o.id));
    if (tiedOptions.length < 2) return;
    setTieBreakOptionIds(tally.leadingOptionIds);
    handleModeSwitch('wheel');
    // Reset base angle cleanly to match the new 2-slice/N-slice tie-breaker geometry
    const winnerIdx = pickRandomOptionIndex(tiedOptions.length);
    const chosen = tiedOptions[winnerIdx];
    const targetDeg = computeWheelSpinTargetDeg(0, winnerIdx, tiedOptions.length, 5, 0.5);
    setRotationDeg(0);
    setIsSpinning(true);

    if (spinTimeoutRef.current !== null) {
      window.clearTimeout(spinTimeoutRef.current);
    }

    window.requestAnimationFrame(() => {
      setRotationDeg(targetDeg);
    });

    spinTimeoutRef.current = window.setTimeout(() => {
      spinTimeoutRef.current = null;
      setIsSpinning(false);
      setLocalWinnerId(chosen.id);
      triggerChoreCelebration();
      if (onUpdateConfig) {
        onUpdateConfig({
          mode: 'wheel',
          lastWinnerOptionId: chosen.id,
          lastSpunAt: new Date().toISOString(),
        });
      }
    }, 3450);
  };

  const handleCastVote = (optionId: string) => {
    if (!onUpdateConfig) return;
    const nextVotes = castPollVote(votes, effectiveVoterKey, optionId, allowMultiVote);
    onUpdateConfig({ votes: nextVotes });
  };

  const handleQuickAddOption = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateConfig) return;
    const label = quickOptionInput.trim();
    if (!label || options.length >= MAX_DECISION_OPTIONS) return;
    const added: DecisionOption = {
      id: `opt-${Date.now()}`,
      label: label.slice(0, 60),
      color: DECISION_WHEEL_PALETTE[options.length % DECISION_WHEEL_PALETTE.length],
      sourceType: 'custom',
    };
    onUpdateConfig({ options: [...options, added] });
    setQuickOptionInput('');
  };

  const handleImportRecipes = (favoritesOnly: boolean) => {
    if (!onUpdateConfig) return;
    const merged = importOptionsFromRecipes(options, recipes, favoritesOnly);
    onUpdateConfig({ options: merged, eliminatedOptionIds: [] });
    setIsImportOpen(false);
  };

  const handleImportProfiles = () => {
    if (!onUpdateConfig) return;
    const merged = importOptionsFromProfiles(options, profiles);
    onUpdateConfig({ options: merged, eliminatedOptionIds: [] });
    setIsImportOpen(false);
  };

  const handleApplyPreset = (presetId: string) => {
    if (!onUpdateConfig) return;
    const preset = DECISION_STARTER_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const presetOpts: DecisionOption[] = preset.options.map((o, idx) => ({
      id: `opt-${preset.id}-${idx}`,
      label: o.label,
      ...(o.emoji ? { emoji: o.emoji } : {}),
      color: DECISION_WHEEL_PALETTE[idx % DECISION_WHEEL_PALETTE.length],
      sourceType: 'custom',
    }));
    onUpdateConfig({
      prompt: preset.prompt,
      options: presetOpts,
      votes: {},
      eliminatedOptionIds: [],
      lastWinnerOptionId: null,
    });
    setTieBreakOptionIds(null);
    setLocalWinnerId(null);
    setIsImportOpen(false);
  };

  const stopDrag = (e: React.PointerEvent) => {
    e.stopPropagation();
  };

  const stickerShadow =
    transparentBg && !isLight ? 'drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)]' : '';
  const surfaceClass = transparentBg
    ? isLight
      ? 'bg-white/60 border-slate-300/60'
      : 'bg-gray-950/45 border-gray-800/60'
    : isLight
      ? 'bg-slate-100/90 border-slate-200/90'
      : 'bg-gray-950/60 border-gray-800/80';

  return (
    <div className={`w-full h-full flex flex-col select-none p-1 overflow-hidden ${stickerShadow}`}>
      {/* Header with pr-20 clearance for Corkboard top-right controls */}
      <div className="flex items-center justify-between gap-2 shrink-0 mb-1.5 pr-20">
        <div className="flex items-center gap-1.5 min-w-0">
          {mode === 'poll' ? (
            <Vote className={`w-4 h-4 shrink-0 ${isLight ? 'text-blue-600' : 'text-blue-400'}`} />
          ) : (
            <Dices className={`w-4 h-4 shrink-0 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
          )}
          <span
            className={`text-xs font-bold tracking-wide truncate ${
              isLight ? 'text-slate-800' : 'text-gray-100'
            }`}
          >
            {title}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0" data-no-drag="true" onPointerDown={stopDrag}>
          {onUpdateConfig && (
            <button
              type="button"
              onClick={() => setIsImportOpen((v) => !v)}
              className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold border transition-colors cursor-pointer ${
                isImportOpen
                  ? 'bg-blue-600 text-white border-blue-500'
                  : isLight
                    ? 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    : 'bg-gray-900 text-gray-300 border-gray-700 hover:text-white'
              }`}
              title="Import saved recipes, family members, or quick presets"
            >
              Import / Edit
            </button>
          )}

          <div
            className={`inline-flex rounded-lg p-0.5 border text-[10px] font-semibold ${
              isLight
                ? 'bg-slate-200/80 border-slate-300 text-slate-600'
                : 'bg-gray-900/90 border-gray-800 text-gray-400'
            }`}
          >
            <button
              type="button"
              onClick={() => handleModeSwitch('wheel')}
              className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                mode === 'wheel'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : isLight
                    ? 'hover:text-slate-900'
                    : 'hover:text-white'
              }`}
            >
              Wheel
            </button>
            <button
              type="button"
              onClick={() => handleModeSwitch('poll')}
              className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer ${
                mode === 'poll'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : isLight
                    ? 'hover:text-slate-900'
                    : 'hover:text-white'
              }`}
            >
              Poll
            </button>
          </div>
        </div>
      </div>

      {/* Prompt Line */}
      <div className="flex items-center justify-between gap-2 mb-1.5 shrink-0">
        <span
          className={`text-[11px] font-semibold truncate ${
            isLight ? 'text-slate-600' : 'text-gray-300'
          }`}
        >
          {tieBreakOptionIds ? '⚡ Tie-Breaker Spin' : promptText}
        </span>
        {tieBreakOptionIds && (
          <button
            type="button"
            data-no-drag="true"
            onPointerDown={stopDrag}
            onClick={() => setTieBreakOptionIds(null)}
            className="text-[10px] font-semibold text-blue-400 hover:underline cursor-pointer shrink-0"
          >
            Full Wheel
          </button>
        )}
      </div>

      {/* Quick Import & Option Drawer */}
      {isImportOpen && onUpdateConfig && (
        <div
          data-no-drag="true"
          onPointerDown={stopDrag}
          className={`mb-2 p-2 rounded-xl border space-y-2 shrink-0 ${surfaceClass}`}
        >
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => handleImportRecipes(false)}
              className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-300 text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <Utensils className="w-3 h-3" />
              <span>+ Saved Recipes</span>
            </button>
            <button
              type="button"
              onClick={() => handleImportRecipes(true)}
              className="px-2 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-200 text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <Sparkles className="w-3 h-3" />
              <span>+ Favorites</span>
            </button>
            <button
              type="button"
              onClick={handleImportProfiles}
              className="px-2 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <Users className="w-3 h-3" />
              <span>+ Family Members</span>
            </button>
            {DECISION_STARTER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleApplyPreset(preset.id)}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold border cursor-pointer ${
                  isLight
                    ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    : 'bg-gray-900 border-gray-700 text-gray-300 hover:text-white'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <form onSubmit={handleQuickAddOption} className="flex items-center gap-1.5">
            <input
              type="text"
              value={quickOptionInput}
              onChange={(e) => setQuickOptionInput(e.target.value)}
              placeholder="Add custom option..."
              maxLength={60}
              className={`flex-1 rounded-lg px-2.5 py-1 text-xs border focus:outline-none ${
                isLight
                  ? 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                  : 'bg-gray-900 border-gray-700 text-white placeholder-gray-500'
              }`}
            />
            <button
              type="submit"
              className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Add</span>
            </button>
          </form>
        </div>
      )}

      {/* WHEEL MODE */}
      {mode === 'wheel' && (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-between gap-2 overflow-hidden">
          <div className="relative flex-1 min-h-0 w-full flex items-center justify-center">
            {/* Fixed 12 o'clock top pointer */}
            <div className="relative aspect-square h-full max-h-[240px] max-w-[240px] flex items-center justify-center">
              <div
                className="absolute -top-1 left-1/2 -translate-x-1/2 z-20 w-0 h-0 border-l-[8px] border-r-[8px] border-t-[14px] border-l-transparent border-r-transparent border-t-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.75)]"
                aria-hidden="true"
              />

              <svg
                viewBox="0 0 200 200"
                className="w-full h-full drop-shadow-xl"
                style={{
                  transform: `rotate(${rotationDeg}deg)`,
                  transition: isSpinning
                    ? 'transform 3.4s cubic-bezier(0.15, 0.85, 0.15, 1)'
                    : 'none',
                }}
              >
                <circle cx="100" cy="100" r="95" fill={isLight ? '#e2e8f0' : '#0f172a'} />
                {wheelSlices.map((slice, idx) => {
                  const opt = activeWheelOptions[idx];
                  if (!opt) return null;
                  const fill =
                    opt.color || DECISION_WHEEL_PALETTE[idx % DECISION_WHEEL_PALETTE.length];
                  const shortText =
                    `${opt.emoji ? `${opt.emoji} ` : ''}${opt.label}`.slice(0, 14);
                  return (
                    <g key={opt.id}>
                      <path
                        d={slice.path}
                        fill={fill}
                        stroke={isLight ? '#f8fafc' : '#090d16'}
                        strokeWidth="1.8"
                      />
                      <text
                        x={slice.labelX}
                        y={slice.labelY}
                        fill="#ffffff"
                        fontSize={activeWheelOptions.length > 8 ? '7.5' : '9'}
                        fontWeight="700"
                        textAnchor="middle"
                        dominantBaseline="central"
                        transform={`rotate(${slice.textRotationDeg} ${slice.labelX} ${slice.labelY})`}
                        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.65)' }}
                      >
                        {shortText}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {/* Center SPIN hub */}
              <button
                type="button"
                data-no-drag="true"
                onPointerDown={stopDrag}
                onClick={() => triggerWheelSpin()}
                disabled={isSpinning || activeWheelOptions.length === 0}
                className={`absolute inset-0 m-auto w-14 h-14 rounded-full font-extrabold text-[11px] tracking-wider uppercase shadow-xl border-2 transition-transform cursor-pointer flex items-center justify-center ${
                  isSpinning
                    ? 'bg-amber-500 text-gray-950 border-white scale-95 cursor-wait'
                    : 'bg-gray-950 hover:bg-gray-900 active:scale-95 text-white border-white/80'
                }`}
              >
                {isSpinning ? '...' : 'SPIN'}
              </button>
            </div>
          </div>

          {/* Winner Banner + Reset Hidden Options */}
          <div className="w-full flex items-center justify-between gap-2 shrink-0 min-h-[28px]">
            {displayedWinner && !isSpinning ? (
              <div
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1 rounded-xl border text-xs font-bold ${
                  isLight
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                    : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate">
                  {displayedWinner.emoji ? `${displayedWinner.emoji} ` : ''}
                  {displayedWinner.label}
                </span>
              </div>
            ) : (
              <span
                className={`text-[10px] mx-auto ${
                  isLight ? 'text-slate-500' : 'text-gray-400'
                }`}
              >
                {activeWheelOptions.length} option{activeWheelOptions.length === 1 ? '' : 's'} on wheel
              </span>
            )}

            {eliminatedIds.size > 0 && onUpdateConfig && (
              <button
                type="button"
                data-no-drag="true"
                onPointerDown={stopDrag}
                onClick={() => onUpdateConfig({ eliminatedOptionIds: [] })}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold inline-flex items-center gap-1 border cursor-pointer shrink-0 ${
                  isLight
                    ? 'bg-white border-slate-300 text-slate-700'
                    : 'bg-gray-900 border-gray-700 text-gray-300 hover:text-white'
                }`}
                title="Restore removed slices back to the wheel"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Restore ({eliminatedIds.size})</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* POLL MODE */}
      {mode === 'poll' && (
        <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
          {/* Household Voter Selector */}
          <div
            data-no-drag="true"
            onPointerDown={stopDrag}
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 shrink-0"
          >
            <span
              className={`text-[10px] font-semibold uppercase tracking-wider shrink-0 ${
                isLight ? 'text-slate-500' : 'text-gray-400'
              }`}
            >
              Vote as:
            </span>
            {profiles.map((profile) => {
              const active = effectiveVoterKey === profile.id;
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => setSelectedVoterKey(profile.id)}
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-all cursor-pointer shrink-0 ${
                    active
                      ? 'bg-blue-600 text-white border-blue-500 shadow-xs'
                      : isLight
                        ? 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                        : 'bg-gray-900/75 border-gray-800 text-gray-300 hover:border-gray-700'
                  }`}
                >
                  <ProfileAvatar profile={profile} size="xs" showRing={false} />
                  <span className="max-w-[70px] truncate">{profile.name.split(' ')[0]}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setSelectedVoterKey('guest')}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all cursor-pointer shrink-0 ${
                effectiveVoterKey === 'guest'
                  ? 'bg-blue-600 text-white border-blue-500'
                  : isLight
                    ? 'bg-white border-slate-200 text-slate-600'
                    : 'bg-gray-900/75 border-gray-800 text-gray-400'
              }`}
            >
              <span>Guest</span>
            </button>
          </div>

          {/* Poll Option Bars */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-0.5">
            {options.map((opt, idx) => {
              const row = tally.rows[idx];
              const isLeading = tally.maxVotes > 0 && row.count === tally.maxVotes;
              const votedByMe = row.voterKeys.includes(effectiveVoterKey);

              return (
                <button
                  key={opt.id}
                  type="button"
                  data-no-drag="true"
                  onPointerDown={stopDrag}
                  onClick={() => handleCastVote(opt.id)}
                  className={`relative w-full text-left rounded-xl border overflow-hidden px-3 py-2 transition-all cursor-pointer ${
                    votedByMe
                      ? isLight
                        ? 'border-blue-500 bg-blue-50/70'
                        : 'border-blue-500/70 bg-blue-500/10'
                      : isLeading
                        ? isLight
                          ? 'border-emerald-400 bg-white'
                          : 'border-emerald-500/50 bg-gray-950/70'
                        : isLight
                          ? 'border-slate-200 bg-white hover:border-slate-300'
                          : 'border-gray-800 bg-gray-950/60 hover:border-gray-700'
                  }`}
                >
                  {/* Animated background percentage fill */}
                  <div
                    className="absolute inset-y-0 left-0 opacity-20 transition-all duration-300 pointer-events-none"
                    style={{
                      width: `${row.percentage}%`,
                      backgroundColor:
                        opt.color || DECISION_WHEEL_PALETTE[idx % DECISION_WHEEL_PALETTE.length],
                    }}
                  />

                  <div className="relative z-10 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {votedByMe && <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
                      {opt.emoji && <span className="text-xs shrink-0">{opt.emoji}</span>}
                      <span
                        className={`text-xs font-semibold truncate ${
                          isLight ? 'text-slate-900' : 'text-white'
                        }`}
                      >
                        {opt.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {/* Stacked voter avatars */}
                      <div className="flex items-center -space-x-1">
                        {row.voterKeys.slice(0, 4).map((vk) => {
                          const p = profileMap.get(vk);
                          return p ? (
                            <ProfileAvatar key={vk} profile={p} size="xs" />
                          ) : (
                            <span
                              key={vk}
                              className="w-5 h-5 rounded-full bg-gray-700 text-white text-[9px] font-bold inline-flex items-center justify-center ring-1 ring-gray-900"
                            >
                              G
                            </span>
                          );
                        })}
                      </div>

                      <span
                        className={`text-[11px] font-mono font-bold min-w-[2.2rem] text-right ${
                          isLeading
                            ? isLight
                              ? 'text-emerald-700'
                              : 'text-emerald-300'
                            : isLight
                              ? 'text-slate-600'
                              : 'text-gray-300'
                        }`}
                      >
                        {row.count}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Poll Footer: Total / Tie-Breaker Spin / Clear */}
          <div className="flex items-center justify-between gap-2 pt-0.5 shrink-0">
            <span className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
              {tally.totalVotes} vote{tally.totalVotes === 1 ? '' : 's'}
              {allowMultiVote ? ' • Multi-pick' : ''}
            </span>

            <div className="flex items-center gap-1.5" data-no-drag="true" onPointerDown={stopDrag}>
              {tally.hasTie && (
                <button
                  type="button"
                  onClick={handleSpinTieBreaker}
                  className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-gray-950 text-[10px] font-extrabold inline-flex items-center gap-1 shadow-md cursor-pointer"
                >
                  <Zap className="w-3 h-3" />
                  <span>Spin Tie-Breaker!</span>
                </button>
              )}
              {tally.totalVotes > 0 && onUpdateConfig && (
                <button
                  type="button"
                  onClick={() => onUpdateConfig({ votes: {} })}
                  className={`px-2 py-1 rounded-lg text-[10px] font-semibold border cursor-pointer ${
                    isLight
                      ? 'bg-white border-slate-300 text-slate-600 hover:text-slate-900'
                      : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'
                  }`}
                >
                  Clear Votes
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
