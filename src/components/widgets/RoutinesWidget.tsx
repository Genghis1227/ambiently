import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  ListChecks,
  Moon,
  Plus,
  RotateCcw,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import type {
  RoutineCadenceType,
  RoutineItem,
  RoutinesWidgetConfig,
} from '../../types/phase2Widgets';
import { MAX_ROUTINES_PER_WIDGET } from '../../types/phase2Widgets';
import {
  evaluateRoutineStatus,
  formatWeeklyDaysSummary,
  normalizeDaysOfWeek,
  resolveRoutineItems,
  toggleDayOfWeek,
  WEEKDAY_FULL_LABELS,
  WEEKDAY_SHORT_LABELS,
  WEEKDAY_SINGLE_LETTERS,
} from '../../utils/routinesEngine';
import { useRoutinesStore } from '../../stores/useRoutinesStore';
import { useProfileStore } from '../../stores/useProfileStore';
import { ProfileAvatar } from '../common/ProfileAvatar';
import { useSharedClock } from '../../utils/sharedClock';
import { useDisplayActivity } from '../../utils/displayActivity';
import { useTimePrefs } from '../../utils/timePrefs';
import type { HouseholdProfile } from '../../types/profiles';

interface RoutinesWidgetProps {
  title?: string;
  config?: RoutinesWidgetConfig;
  isLight?: boolean;
  transparentBg?: boolean;
  onUpdateConfig?: (updates: Record<string, any>) => void;
}

const CADENCE_LABELS: Record<RoutineCadenceType, string> = {
  am_pm: 'AM / PM',
  daily: 'Daily',
  weekly: 'Weekly',
  alternating_week: 'Alt Week Pickup',
  every_n_days: 'Every N Days',
};

function currentTimestampIso(): string {
  return new Date().toISOString();
}

function getCurrentWeekday(): number {
  return new Date().getDay();
}

export const RoutinesWidget: React.FC<RoutinesWidgetProps> = ({
  title = 'Home Check-Ins & Rhythms',
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

  const { hour12 } = useTimePrefs();
  const { isOledNightClock } = useDisplayActivity();
  const nowRaw = useSharedClock('10s', !isOledNightClock);
  const minuteBucketMs = Math.floor(nowRaw.getTime() / 60_000) * 60_000;
  const now = useMemo(() => new Date(minuteBucketMs), [minuteBucketMs]);

  const isStoreInitialized = useRoutinesStore((s) => s.isInitialized);
  const storeItems = useRoutinesStore((s) => s.items);
  const toggleCheckIn = useRoutinesStore((s) => s.toggleCheckIn);
  const addRoutineItem = useRoutinesStore((s) => s.addRoutineItem);
  const removeRoutineItem = useRoutinesStore((s) => s.removeRoutineItem);

  useEffect(() => {
    if (!isStoreInitialized) {
      void useRoutinesStore.getState().initRoutinesStore();
    }
  }, [isStoreInitialized]);

  const items = useMemo(
    () => (isStoreInitialized ? storeItems : resolveRoutineItems(config?.items)),
    [isStoreInitialized, storeItems, config?.items]
  );
  const compactMode = Boolean(config?.compactMode);

  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(
    config?.defaultProfileId ?? null
  );
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newEmoji, setNewEmoji] = useState('✓');
  const [newCadence, setNewCadence] = useState<RoutineCadenceType>('daily');
  const [newIntervalDays, setNewIntervalDays] = useState('7');
  const [newPickupDay, setNewPickupDay] = useState(4);
  const [newDaysOfWeek, setNewDaysOfWeek] = useState<number[]>(() => [getCurrentWeekday()]);

  const effectiveProfileId =
    selectedProfileId && profileMap.has(selectedProfileId)
      ? selectedProfileId
      : config?.defaultProfileId && profileMap.has(config.defaultProfileId)
        ? config.defaultProfileId
        : null;

  const formatTimeShort = (iso: string): string => {
    try {
      return new Date(iso).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
        hour12,
      });
    } catch {
      return '';
    }
  };

  const handleSelectAuthor = (pid: string | null) => {
    setSelectedProfileId(pid);
    if (onUpdateConfig) {
      onUpdateConfig({ defaultProfileId: pid });
    }
  };

  const handleToggle = (itemId: string, slotKey: string) => {
    const nowIso = currentTimestampIso();
    void toggleCheckIn(itemId, slotKey, effectiveProfileId, nowIso);
  };

  const handleAddRoutine = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newLabel.trim();
    if (!trimmed) return;
    if (items.length >= MAX_ROUTINES_PER_WIDGET) return;

    const added: RoutineItem = {
      id: `routine-${Date.now()}`,
      label: trimmed.slice(0, 60),
      emoji: newEmoji.trim() || undefined,
      cadence: newCadence,
      ...(newCadence === 'weekly'
        ? { daysOfWeek: normalizeDaysOfWeek(newDaysOfWeek, getCurrentWeekday()) }
        : {}),
      ...(newCadence === 'every_n_days'
        ? { intervalDays: Math.max(1, Math.min(365, parseInt(newIntervalDays, 10) || 7)) }
        : {}),
      ...(newCadence === 'alternating_week'
        ? {
            pickupDayOfWeek: newPickupDay,
            anchorDate: '2026-01-01',
            weekALabel: 'Trash + Recycling',
            weekBLabel: 'Trash Only',
          }
        : {}),
      completions: [],
    };

    void addRoutineItem(added);
    setNewLabel('');
    setNewEmoji('✓');
    setIsAddOpen(false);
  };

  const handleDeleteRoutine = (itemId: string) => {
    void removeRoutineItem(itemId);
  };

  const renderAttribution = (
    profileId: string | null | undefined,
    completedAt: string,
    compactText?: boolean
  ) => {
    const profile = profileId ? profileMap.get(profileId) : undefined;
    return (
      <span className="inline-flex items-center gap-1 min-w-0">
        {profile ? (
          <ProfileAvatar profile={profile} size="xs" showRing={false} />
        ) : (
          <Check className="w-3 h-3 text-emerald-400 shrink-0" />
        )}
        <span className="truncate font-semibold">
          {profile ? profile.name.split(' ')[0] : 'Done'}
        </span>
        {!compactText && (
          <span className="opacity-75 shrink-0 font-mono text-[10px]">
            • {formatTimeShort(completedAt)}
          </span>
        )}
      </span>
    );
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
      {/* Header bar with pr-20 clearance for Corkboard top-right buttons */}
      <div className="flex items-center justify-between gap-2 shrink-0 mb-1.5 pr-20">
        <div className="flex items-center gap-1.5 min-w-0">
          <ListChecks
            className={`w-4 h-4 shrink-0 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}
          />
          <span
            className={`text-xs font-bold tracking-wide truncate ${
              isLight ? 'text-slate-800' : 'text-gray-100'
            }`}
          >
            {title}
          </span>
        </div>

        {items.length < MAX_ROUTINES_PER_WIDGET && (
          <button
            type="button"
            data-no-drag="true"
            onPointerDown={stopDrag}
            onClick={() => setIsAddOpen((v) => !v)}
            className={`px-2 py-1 rounded-lg text-[10px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${
              isAddOpen
                ? 'bg-blue-600 text-white'
                : isLight
                  ? 'bg-slate-200/90 hover:bg-slate-300 text-slate-700'
                  : 'bg-gray-800 hover:bg-gray-700 text-gray-200'
            }`}
            title="Add routine"
          >
            {isAddOpen ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
            <span>{isAddOpen ? 'Close' : 'Add'}</span>
          </button>
        )}
      </div>

      {/* Acting Profile Bar */}
      {profiles.length > 0 && (
        <div
          data-no-drag="true"
          onPointerDown={stopDrag}
          className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1.5 mb-1 shrink-0"
        >
          <span
            className={`text-[10px] font-semibold uppercase tracking-wider shrink-0 ${
              isLight ? 'text-slate-500' : 'text-gray-400'
            }`}
          >
            Stamp:
          </span>
          {profiles.map((profile) => {
            const active = effectiveProfileId === profile.id;
            return (
              <button
                key={profile.id}
                type="button"
                onClick={() => handleSelectAuthor(active ? null : profile.id)}
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold border transition-all cursor-pointer shrink-0 ${
                  active
                    ? isLight
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-emerald-600/30 text-emerald-200 border-emerald-500/70'
                    : isLight
                      ? 'bg-white/80 text-slate-700 border-slate-200 hover:border-slate-300'
                      : 'bg-gray-900/75 text-gray-300 border-gray-800 hover:border-gray-700'
                }`}
                title={`Check in as ${profile.name}`}
              >
                <ProfileAvatar profile={profile} size="xs" showRing={false} />
                <span className="max-w-[70px] truncate">{profile.name.split(' ')[0]}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => handleSelectAuthor(null)}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border transition-all cursor-pointer shrink-0 ${
              effectiveProfileId === null
                ? isLight
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-gray-700 text-white border-gray-600'
                : isLight
                  ? 'bg-white/60 text-slate-500 border-slate-200 hover:text-slate-800'
                  : 'bg-gray-900/50 text-gray-400 border-gray-800 hover:text-gray-200'
            }`}
          >
            <Check className="w-3 h-3" />
            <span>Anyone</span>
          </button>
        </div>
      )}

      {/* Inline Quick Add Form */}
      {isAddOpen && (
        <form
          onSubmit={handleAddRoutine}
          data-no-drag="true"
          onPointerDown={stopDrag}
          className={`mb-2 p-2 rounded-xl border space-y-2 shrink-0 ${surfaceClass}`}
        >
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={newEmoji}
              onChange={(e) => setNewEmoji(e.target.value)}
              maxLength={4}
              aria-label="Emoji icon"
              className={`w-10 text-center rounded-lg px-1.5 py-1 text-xs border focus:outline-none ${
                isLight
                  ? 'bg-white border-slate-300 text-slate-900'
                  : 'bg-gray-900 border-gray-700 text-white'
              }`}
            />
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g., Walk Dog, Change Filter..."
              maxLength={60}
              className={`flex-1 rounded-lg px-2.5 py-1 text-xs border focus:outline-none ${
                isLight
                  ? 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                  : 'bg-gray-900 border-gray-700 text-white placeholder-gray-500'
              }`}
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(Object.keys(CADENCE_LABELS) as RoutineCadenceType[]).map((cad) => (
              <button
                key={cad}
                type="button"
                onClick={() => setNewCadence(cad)}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold border transition-colors cursor-pointer ${
                  newCadence === cad
                    ? 'bg-blue-600 text-white border-blue-500'
                    : isLight
                      ? 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                      : 'bg-gray-900 text-gray-300 border-gray-800 hover:border-gray-700'
                }`}
              >
                {CADENCE_LABELS[cad]}
              </button>
            ))}

            {newCadence === 'every_n_days' && (
              <label className="inline-flex items-center gap-1 text-[10px] ml-auto">
                <span className={isLight ? 'text-slate-600' : 'text-gray-400'}>Every</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={newIntervalDays}
                  onChange={(e) => setNewIntervalDays(e.target.value)}
                  className={`w-12 rounded px-1.5 py-0.5 text-center border text-[11px] font-mono ${
                    isLight
                      ? 'bg-white border-slate-300 text-slate-900'
                      : 'bg-gray-900 border-gray-700 text-white'
                  }`}
                />
                <span className={isLight ? 'text-slate-600' : 'text-gray-400'}>d</span>
              </label>
            )}

            {newCadence === 'alternating_week' && (
              <select
                value={newPickupDay}
                onChange={(e) => setNewPickupDay(Number(e.target.value))}
                className={`rounded-lg px-2 py-1 text-[10px] border ml-auto ${
                  isLight
                    ? 'bg-white border-slate-300 text-slate-800'
                    : 'bg-gray-900 border-gray-700 text-gray-200'
                }`}
              >
                {WEEKDAY_SHORT_LABELS.map((day, idx) => (
                  <option key={day} value={idx}>
                    {day} Pickup
                  </option>
                ))}
              </select>
            )}

            {newCadence === 'weekly' && (
              <div className="w-full flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-1" role="group" aria-label="Days of week">
                  {WEEKDAY_SINGLE_LETTERS.map((letter, dIdx) => {
                    const active = newDaysOfWeek.includes(dIdx);
                    return (
                      <button
                        key={WEEKDAY_FULL_LABELS[dIdx]}
                        type="button"
                        aria-pressed={active}
                        title={WEEKDAY_FULL_LABELS[dIdx]}
                        onClick={() => setNewDaysOfWeek((prev) => toggleDayOfWeek(prev, dIdx))}
                        className={`w-6 h-6 rounded-md text-[10px] font-bold border transition-colors cursor-pointer flex items-center justify-center ${
                          active
                            ? 'bg-blue-600 border-blue-500 text-white shadow-xs'
                            : isLight
                              ? 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'
                              : 'bg-gray-900 border-gray-800 text-gray-400 hover:text-white'
                        }`}
                      >
                        {letter}
                      </button>
                    );
                  })}
                </div>
                <span
                  className={`text-[10px] font-semibold ${
                    isLight ? 'text-blue-700' : 'text-blue-300'
                  }`}
                >
                  {formatWeeklyDaysSummary(newDaysOfWeek)}
                </span>
              </div>
            )}

            <button
              type="submit"
              className="ml-auto px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold cursor-pointer"
            >
              Add Routine
            </button>
          </div>
        </form>
      )}

      {/* Routine List */}
      <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-0.5">
        {items.length === 0 ? (
          <div
            className={`h-full min-h-[96px] flex flex-col items-center justify-center text-center rounded-xl border p-4 text-xs ${surfaceClass}`}
          >
            <p className={isLight ? 'text-slate-600 font-semibold' : 'text-gray-300 font-semibold'}>
              No household routines configured
            </p>
            <p className={`text-[11px] mt-1 ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
              Tap + Add above or open Tile Settings to track feeding, meds, bins, or filters.
            </p>
          </div>
        ) : (
          items.map((item) => {
            const evalResult = evaluateRoutineStatus(item, now);

            return (
              <div
                key={item.id}
                className={`rounded-xl border transition-colors ${surfaceClass} ${
                  compactMode ? 'px-2.5 py-1.5' : 'px-3 py-2'
                }`}
              >
                {/* DAILY */}
                {evalResult.cadence === 'daily' && (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {item.emoji && <span className="text-sm shrink-0">{item.emoji}</span>}
                      <span
                        className={`text-xs font-semibold truncate ${
                          evalResult.dayStamp
                            ? isLight
                              ? 'text-slate-500 line-through'
                              : 'text-gray-400 line-through'
                            : isLight
                              ? 'text-slate-900'
                              : 'text-white'
                        }`}
                      >
                        {item.label}
                      </span>
                    </div>

                    <button
                      type="button"
                      data-no-drag="true"
                      onPointerDown={stopDrag}
                      onClick={() => handleToggle(item.id, evalResult.todaySlotKey)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border inline-flex items-center gap-1.5 transition-all cursor-pointer shrink-0 max-w-[56%] ${
                        evalResult.dayStamp
                          ? isLight
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                            : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/30'
                          : isLight
                            ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                            : 'bg-gray-900 border-gray-700 text-gray-200 hover:border-blue-500/60'
                      }`}
                      title={evalResult.dayStamp ? 'Tap to undo today check-in' : 'Tap to check in'}
                    >
                      {evalResult.dayStamp ? (
                        renderAttribution(evalResult.dayStamp.profileId, evalResult.dayStamp.completedAt)
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5 opacity-60" />
                          <span>Check In</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* AM / PM SPLIT */}
                {evalResult.cadence === 'am_pm' && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {item.emoji && <span className="text-sm shrink-0">{item.emoji}</span>}
                      <span
                        className={`text-xs font-semibold truncate ${
                          isLight ? 'text-slate-900' : 'text-white'
                        }`}
                      >
                        {item.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {(
                        [
                          {
                            half: 'AM' as const,
                            slotKey: evalResult.amSlotKey,
                            stamp: evalResult.amStamp,
                            icon: Sun,
                          },
                          {
                            half: 'PM' as const,
                            slotKey: evalResult.pmSlotKey,
                            stamp: evalResult.pmStamp,
                            icon: Moon,
                          },
                        ] as const
                      ).map(({ half, slotKey, stamp, icon: Icon }) => {
                        const isActiveHalf = evalResult.activeHalf === half;
                        return (
                          <button
                            key={half}
                            type="button"
                            data-no-drag="true"
                            onPointerDown={stopDrag}
                            onClick={() => handleToggle(item.id, slotKey)}
                            className={`px-2 py-1 rounded-lg text-[10px] font-semibold border inline-flex items-center gap-1 transition-all cursor-pointer ${
                              stamp
                                ? isLight
                                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                  : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                                : isActiveHalf
                                  ? isLight
                                    ? 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                                    : 'bg-amber-500/15 border-amber-500/40 text-amber-200 hover:bg-amber-500/25'
                                  : isLight
                                    ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                    : 'bg-gray-900/70 border-gray-800 text-gray-400 hover:text-gray-200'
                            }`}
                            title={stamp ? `Undo ${half} check-in` : `Check in ${half}`}
                          >
                            <Icon className="w-3 h-3 shrink-0" />
                            <span>{half}</span>
                            {stamp && renderAttribution(stamp.profileId, stamp.completedAt, true)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* FIXED-WEEKDAY WEEKLY */}
                {evalResult.cadence === 'weekly' && (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {item.emoji && <span className="text-sm shrink-0">{item.emoji}</span>}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`text-xs font-semibold truncate ${
                              evalResult.isDueToday && evalResult.activeStamp
                                ? isLight
                                  ? 'text-slate-500 line-through'
                                  : 'text-gray-400 line-through'
                                : isLight
                                  ? 'text-slate-900'
                                  : 'text-white'
                            }`}
                          >
                            {item.label}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                              evalResult.daysUntilNext === 0
                                ? evalResult.activeStamp
                                  ? isLight
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                                : evalResult.daysUntilNext === 1
                                  ? isLight
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-blue-500/20 text-blue-300'
                                  : isLight
                                    ? 'bg-slate-200 text-slate-700'
                                    : 'bg-gray-800 text-gray-300'
                            }`}
                          >
                            {evalResult.daysUntilNext === 0
                              ? `${evalResult.nextDayLabel} • Today`
                              : evalResult.daysUntilNext === 1
                                ? `${evalResult.nextDayLabel} • Tomorrow`
                                : `${evalResult.nextDayLabel} • in ${evalResult.daysUntilNext}d`}
                          </span>
                        </div>
                        <div
                          className={`text-[10px] truncate ${
                            isLight ? 'text-slate-500' : 'text-gray-400'
                          }`}
                        >
                          {evalResult.settledFromPrevSlot
                            ? `${evalResult.scheduleLabel} • Logged ${evalResult.prevDayLabel}`
                            : evalResult.scheduleLabel}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      data-no-drag="true"
                      onPointerDown={stopDrag}
                      onClick={() => handleToggle(item.id, evalResult.activeSlotKey)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border inline-flex items-center gap-1 transition-all cursor-pointer shrink-0 max-w-[46%] ${
                        evalResult.activeStamp
                          ? isLight
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                            : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/30'
                          : isLight
                            ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                            : 'bg-gray-900 border-gray-700 text-gray-200 hover:border-blue-500/60'
                      }`}
                      title={
                        evalResult.activeStamp
                          ? 'Tap to undo check-in'
                          : evalResult.daysUntilNext === 1
                            ? `Check in early for ${evalResult.nextDayLabel}`
                            : evalResult.daysUntilNext >= 2
                              ? `Log check-in for ${evalResult.prevDayLabel}`
                              : `Check in for ${evalResult.nextDayLabel}`
                      }
                    >
                      {evalResult.activeStamp ? (
                        renderAttribution(
                          evalResult.activeStamp.profileId,
                          evalResult.activeStamp.completedAt,
                          true
                        )
                      ) : (
                        <>
                          <Check className="w-3 h-3 opacity-60" />
                          <span>{evalResult.daysUntilNext === 1 ? 'Early' : 'Check In'}</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* ALTERNATING WEEK CURBSIDE PICKUP */}
                {evalResult.cadence === 'alternating_week' && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {item.emoji && <span className="text-sm shrink-0">{item.emoji}</span>}
                        <span
                          className={`text-xs font-semibold truncate ${
                            isLight ? 'text-slate-900' : 'text-white'
                          }`}
                        >
                          {item.label}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                            evalResult.daysUntilPickup === 0
                              ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40'
                              : evalResult.daysUntilPickup === 1
                                ? isLight
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-blue-500/20 text-blue-300'
                                : isLight
                                  ? 'bg-slate-200 text-slate-700'
                                  : 'bg-gray-800 text-gray-300'
                          }`}
                        >
                          {evalResult.daysUntilPickup === 0
                            ? `${evalResult.pickupDayLabel} • Today`
                            : evalResult.daysUntilPickup === 1
                              ? `${evalResult.pickupDayLabel} • Tomorrow`
                              : `${evalResult.pickupDayLabel} • in ${evalResult.daysUntilPickup}d`}
                        </span>
                      </div>

                      <button
                        type="button"
                        data-no-drag="true"
                        onPointerDown={stopDrag}
                        onClick={() => handleToggle(item.id, evalResult.cycleSlotKey)}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border inline-flex items-center gap-1 transition-all cursor-pointer shrink-0 ${
                          evalResult.pickupStamp
                            ? isLight
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                              : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                            : isLight
                              ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                              : 'bg-gray-900 border-gray-700 text-gray-200 hover:border-blue-500/50'
                        }`}
                      >
                        {evalResult.pickupStamp ? (
                          renderAttribution(
                            evalResult.pickupStamp.profileId,
                            evalResult.pickupStamp.completedAt,
                            true
                          )
                        ) : (
                          <>
                            <Check className="w-3 h-3 opacity-60" />
                            <span>At Curb</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      <span
                        className={`px-2 py-0.5 rounded-md font-bold border ${
                          evalResult.isWeekA
                            ? isLight
                              ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                              : 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40'
                            : isLight
                              ? 'bg-slate-200 text-slate-800 border-slate-300'
                              : 'bg-gray-800 text-gray-200 border-gray-700'
                        }`}
                      >
                        This Week: {evalResult.currentLabel}
                      </span>
                      <span className={`truncate ${isLight ? 'text-slate-500' : 'text-gray-400'}`}>
                        Next: {evalResult.nextLabel}
                      </span>
                    </div>
                  </div>
                )}

                {/* EVERY N DAYS INTERVAL */}
                {evalResult.cadence === 'every_n_days' && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {item.emoji && <span className="text-sm shrink-0">{item.emoji}</span>}
                        <div className="min-w-0">
                          <div
                            className={`text-xs font-semibold truncate ${
                              isLight ? 'text-slate-900' : 'text-white'
                            }`}
                          >
                            {item.label}
                          </div>
                          <div
                            className={`text-[10px] truncate ${
                              evalResult.isOverdue
                                ? 'text-rose-400 font-semibold'
                                : evalResult.isDueToday
                                  ? 'text-amber-400 font-semibold'
                                  : isLight
                                    ? 'text-slate-500'
                                    : 'text-gray-400'
                            }`}
                          >
                            {evalResult.isDoneToday
                              ? `Checked in today • Next in ${evalResult.intervalDays}d`
                              : evalResult.isOverdue
                                ? `Overdue by ${evalResult.daysOverdue}d (every ${evalResult.intervalDays}d)`
                                : evalResult.daysElapsed === null
                                  ? `Never logged • Every ${evalResult.intervalDays}d`
                                  : `Due in ${evalResult.daysRemaining}d (${evalResult.daysElapsed}/${evalResult.intervalDays}d)`}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          data-no-drag="true"
                          onPointerDown={stopDrag}
                          onClick={() => handleToggle(item.id, evalResult.todaySlotKey)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border inline-flex items-center gap-1 transition-all cursor-pointer ${
                            evalResult.isDoneToday && evalResult.lastStamp
                              ? isLight
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                                : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-200'
                              : evalResult.isOverdue
                                ? 'bg-rose-600 hover:bg-rose-500 border-rose-500 text-white'
                                : isLight
                                  ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                                  : 'bg-gray-900 border-gray-700 text-gray-200 hover:border-emerald-500/60'
                          }`}
                          title={evalResult.isDoneToday ? 'Tap to undo' : 'Log completion today'}
                        >
                          {evalResult.isDoneToday && evalResult.lastStamp ? (
                            renderAttribution(
                              evalResult.lastStamp.profileId,
                              evalResult.lastStamp.completedAt,
                              true
                            )
                          ) : (
                            <>
                              {evalResult.isOverdue ? (
                                <AlertCircle className="w-3 h-3" />
                              ) : (
                                <RotateCcw className="w-3 h-3 opacity-70" />
                              )}
                              <span>Done</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div
                      className={`w-full h-1 rounded-full overflow-hidden ${
                        isLight ? 'bg-slate-200' : 'bg-gray-800'
                      }`}
                    >
                      <div
                        className={`h-full rounded-full transition-all ${
                          evalResult.isDoneToday
                            ? 'bg-emerald-500'
                            : evalResult.isOverdue
                              ? 'bg-rose-500'
                              : evalResult.isDueToday
                                ? 'bg-amber-400'
                                : 'bg-blue-500'
                        }`}
                        style={{ width: `${Math.round(evalResult.progressRatio * 100)}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Tiny quick-remove shown only while quick-add form is open */}
                {isAddOpen && (
                  <div className="flex justify-end mt-1 pt-1 border-t border-gray-800/30">
                    <button
                      type="button"
                      data-no-drag="true"
                      onPointerDown={stopDrag}
                      onClick={() => handleDeleteRoutine(item.id)}
                      className="text-[10px] text-rose-400 hover:text-rose-300 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Remove</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
