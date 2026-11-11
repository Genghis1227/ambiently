import React, { useState, useMemo } from 'react';
import {
  X,
  Trophy,
  ExternalLink,
  Calendar,
  Award,
} from 'lucide-react';
import type { Profile, TrophyItem } from '../../types/chores';
import { HouseholdAvatar } from '../common/HouseholdAvatar';
import { openInAppWebViewer } from '../../utils/webViewer';

interface TrophyCaseModalProps {
  isOpen: boolean;
  profiles: Profile[];
  trophies: TrophyItem[];
  defaultScope?: string;
  onClose: () => void;
}

export const TrophyCaseModal: React.FC<TrophyCaseModalProps> = ({
  isOpen,
  profiles,
  trophies,
  defaultScope = 'household',
  onClose,
}) => {
  const [selectedScope, setSelectedScope] = useState<string>(defaultScope);
  const currentYear = new Date().getFullYear();

  const profileMap = useMemo(
    () => new Map(profiles.map((p) => [p.id, p])),
    [profiles]
  );

  const filteredTrophies = useMemo(() => {
    const list =
      selectedScope === 'household'
        ? trophies
        : trophies.filter((t) => t.profileId === selectedScope);
    return [...list].sort(
      (a, b) => new Date(b.dateFulfilled).getTime() - new Date(a.dateFulfilled).getTime()
    );
  }, [trophies, selectedScope]);

  const currentYearTrophies = useMemo(
    () => filteredTrophies.filter((t) => t.year === currentYear),
    [filteredTrophies, currentYear]
  );

  const priorYearGroups = useMemo(() => {
    const groups = new Map<number, TrophyItem[]>();
    for (const t of filteredTrophies) {
      if (t.year >= currentYear) continue;
      if (!groups.has(t.year)) groups.set(t.year, []);
      groups.get(t.year)!.push(t);
    }
    return Array.from(groups.entries()).sort((a, b) => b[0] - a[0]);
  }, [filteredTrophies, currentYear]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[94] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-slate-700/60 bg-slate-900/95 text-slate-100 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800/80 bg-slate-900/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-300">
              <Trophy className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100 flex items-center gap-2">
                <span>Family Trophy Case</span>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-950/80 text-amber-300 border border-amber-700/40 tabular-nums">
                  {filteredTrophies.length}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Fulfilled goals & permanent milestone achievements
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
        {profiles.length > 1 && (
          <div className="px-5 pt-3.5 pb-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar border-b border-slate-800/60 shrink-0">
            <button
              type="button"
              onClick={() => setSelectedScope('household')}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${
                selectedScope === 'household'
                  ? 'bg-slate-800 text-white border border-slate-600'
                  : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              All Kids ({trophies.length})
            </button>
            {profiles.map((profile) => {
              const count = trophies.filter((t) => t.profileId === profile.id).length;
              const isSelected = selectedScope === profile.id;
              return (
                <button
                  key={profile.id}
                  type="button"
                  onClick={() => setSelectedScope(profile.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer border ${
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
        <div className="p-5 overflow-y-auto space-y-6 flex-1">
          {filteredTrophies.length === 0 ? (
            <div className="py-12 px-4 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 space-y-2">
              <div className="text-3xl">🏆</div>
              <div className="text-sm font-medium text-slate-200">
                No Trophies Yet
              </div>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                When a child unlocks and redeems a goal, it is archived here as a permanent trophy!
              </p>
            </div>
          ) : (
            <>
              {/* Current Calendar Year — Full Rich Cards */}
              {currentYearTrophies.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-amber-300/90 flex items-center gap-1.5">
                      <Trophy className="w-3.5 h-3.5" />
                      {currentYear} Achievements ({currentYearTrophies.length})
                    </span>
                    <span className="text-[11px] text-slate-400 tabular-nums">
                      Total Spent:{' '}
                      {currentYearTrophies.reduce((acc, t) => acc + t.pointsSpent, 0)} pts
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {currentYearTrophies.map((trophy) => {
                      const child = profileMap.get(trophy.profileId);
                      const dateStr = new Date(trophy.dateFulfilled).toLocaleDateString(
                        undefined,
                        {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        }
                      );
                      return (
                        <div
                          key={trophy.id}
                          className="p-3.5 rounded-2xl bg-slate-950/70 border border-amber-500/25 flex items-start gap-3 shadow-sm"
                        >
                          {trophy.imageUrl ? (
                            <img
                              src={trophy.imageUrl}
                              alt={trophy.itemName}
                              className="w-14 h-14 rounded-xl object-cover bg-slate-900 border border-slate-800 shrink-0"
                            />
                          ) : (
                            <div className="w-14 h-14 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-2xl shrink-0">
                              🏆
                            </div>
                          )}

                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-start justify-between gap-1.5">
                              <h4 className="text-xs font-semibold text-slate-100 leading-snug line-clamp-2">
                                {trophy.itemName}
                              </h4>
                              {trophy.sourceUrl && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    openInAppWebViewer(trophy.sourceUrl!, trophy.itemName)
                                  }
                                  className="text-slate-400 hover:text-amber-300 shrink-0 cursor-pointer"
                                  title="View original item link"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>

                            <div className="flex items-center gap-2 flex-wrap pt-0.5">
                              {child && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-slate-300">
                                  <HouseholdAvatar profile={child} size="xs" showRing={false} />
                                  <span>{child.name}</span>
                                </span>
                              )}
                              <span className="text-[11px] font-semibold text-amber-300 tabular-nums">
                                {trophy.pointsSpent} pts
                              </span>
                            </div>

                            <div className="flex items-center gap-1 text-[10px] text-slate-500">
                              <Calendar className="w-2.5 h-2.5" />
                              <span>Fulfilled {dateStr}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Prior Calendar Years — Pruned Lightweight Ledger Badges */}
              {priorYearGroups.map(([year, items]) => (
                <div key={year} className="space-y-2.5 pt-2 border-t border-slate-800/70">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Award className="w-3.5 h-3.5 text-slate-400" />
                      {year} Archive ({items.length})
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Condensed annual trophy ledger
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {items.map((trophy) => {
                      const child = profileMap.get(trophy.profileId);
                      return (
                        <div
                          key={trophy.id}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs"
                        >
                          {child && (
                            <HouseholdAvatar profile={child} size="xs" showRing={false} />
                          )}
                          <span className="font-medium text-slate-200">
                            {trophy.itemName}
                          </span>
                          <span className="text-[11px] font-semibold text-amber-300/80 tabular-nums">
                            {trophy.pointsSpent} pts
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
