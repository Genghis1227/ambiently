import React, { useEffect, useMemo, useState } from 'react';
import { Check, Gift, Star, X } from 'lucide-react';
import type { ChoreItem, ChorePerson, ChoresWidgetConfig } from '../../types/dashboard';
import { useDashboardStore } from '../../store/dashboardStore';
import { useTimePrefs } from '../../utils/timePrefs';
import { changeWidgetConfig } from '../../utils/widgetConfigQueue';
import { isDoneNow, isShownToday, redeemReward, toggleChore } from '../../utils/chores';

interface ChoresWidgetProps {
  widgetId: string;
  config: ChoresWidgetConfig;
  isLight?: boolean;
}

const ANYONE_COLOR = '#94a3b8';

type Overlay =
  | { kind: 'none' }
  | { kind: 'who-did'; chore: ChoreItem }
  | { kind: 'reward'; rewardId: string }
  | { kind: 'pin'; rewardId: string; personId: string }
  | { kind: 'redeemed'; text: string };

function useMinuteTick(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function Avatar({ person, size = 'md' }: { person: Pick<ChorePerson, 'name' | 'color' | 'emoji'>; size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'w-6 h-6 text-xs' : 'w-9 h-9 text-lg';
  return (
    <span
      className={`${box} shrink-0 rounded-full flex items-center justify-center font-bold text-white`}
      style={{ backgroundColor: person.color, boxShadow: `0 0 0 2px ${person.color}55` }}
      aria-hidden="true"
    >
      {person.emoji || person.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export const ChoresWidget: React.FC<ChoresWidgetProps> = ({ widgetId, config, isLight = false }) => {
  const now = useMinuteTick();
  const { weekStartsOn } = useTimePrefs();
  const pinLockEnabled = useDashboardStore((s) => s.settings.pinLockEnabled);
  const isUnlocked = useDashboardStore((s) => s.isUnlocked);
  const [overlay, setOverlay] = useState<Overlay>({ kind: 'none' });
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');

  const people = useMemo(() => config.people || [], [config.people]);
  const rewards = config.rewards || [];
  const done = config.done;

  const groups = useMemo(() => {
    const today = (config.chores || []).filter((c) => isShownToday(c, done, now));
    const byPerson = people.map((p) => ({
      person: p as Pick<ChorePerson, 'name' | 'color' | 'emoji'> & { id: string | null },
      chores: today.filter((c) => c.personId === p.id),
    }));
    const known = new Set(people.map((p) => p.id));
    const anyone = today.filter((c) => !c.personId || !known.has(c.personId));
    if (anyone.length > 0) {
      byPerson.push({ person: { id: null, name: 'Anyone', color: ANYONE_COLOR, emoji: '🙌' }, chores: anyone });
    }
    return byPerson.filter((g) => g.chores.length > 0 || g.person.id !== null);
  }, [config.chores, people, done, now]);

  const tap = (chore: ChoreItem) => {
    const isDone = isDoneNow(chore, done, now, weekStartsOn);
    const assigned = chore.personId && people.some((p) => p.id === chore.personId);
    if (!isDone && !assigned && people.length > 0) {
      setOverlay({ kind: 'who-did', chore });
      return;
    }
    changeWidgetConfig(widgetId, (c) => toggleChore(c, chore.id, undefined, new Date(), weekStartsOn));
  };

  const finishBy = (chore: ChoreItem, personId: string | undefined) => {
    setOverlay({ kind: 'none' });
    changeWidgetConfig(widgetId, (c) => toggleChore(c, chore.id, personId, new Date(), weekStartsOn));
  };

  const redeem = async (rewardId: string, personId: string) => {
    const reward = rewards.find((r) => r.id === rewardId);
    await changeWidgetConfig(widgetId, (c) => redeemReward(c, rewardId, personId));
    const person = people.find((p) => p.id === personId);
    setOverlay({ kind: 'redeemed', text: `${reward?.emoji || '🎁'} ${reward?.title || 'Reward'} for ${person?.name || 'you'}. Enjoy!` });
    setTimeout(() => setOverlay((o) => (o.kind === 'redeemed' ? { kind: 'none' } : o)), 3500);
  };

  const choosePersonForReward = (rewardId: string, personId: string) => {
    // A PIN-protected board asks a parent to approve spending stars
    if (pinLockEnabled && !isUnlocked) {
      setPin('');
      setPinError('');
      setOverlay({ kind: 'pin', rewardId, personId });
      return;
    }
    redeem(rewardId, personId);
  };

  const confirmPin = async (rewardId: string, personId: string) => {
    const store = useDashboardStore.getState();
    const ok = await store.unlockKiosk(pin);
    if (!ok) {
      setPinError('Wrong PIN');
      setPin('');
      return;
    }
    store.lockKiosk();
    await redeem(rewardId, personId);
  };

  const surface = isLight ? 'bg-white/70 border-slate-200' : 'bg-gray-950/40 border-white/10';
  const textMain = isLight ? 'text-slate-900' : 'text-white';
  const textSub = isLight ? 'text-slate-500' : 'text-gray-400';
  const dateLabel = now.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });

  if ((config.chores || []).length === 0) {
    return (
      <div className={`w-full h-full flex flex-col items-center justify-center text-center p-4 gap-2 ${textSub}`}>
        <span className="text-3xl" aria-hidden="true">✅</span>
        <p className={`text-sm font-semibold ${textMain}`}>No chores yet</p>
        <p className="text-xs max-w-[16rem]">Open this tile's settings (⚙️) to add family members, chores and rewards.</p>
      </div>
    );
  }

  return (
    <div className="@container relative w-full h-full flex flex-col overflow-hidden p-3 gap-2.5">
      <div className="flex items-baseline justify-between gap-2 shrink-0">
        <h3 className={`text-sm @md:text-base font-bold truncate ${textMain}`}>✅ Chores</h3>
        <span className={`text-xs @md:text-sm truncate ${textSub}`}>{dateLabel}</span>
      </div>

      <div
        className="flex-1 min-h-0 overflow-y-auto grid gap-2.5 content-start"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 11rem), 1fr))' }}
      >
        {groups.map(({ person, chores }) => {
          const total = chores.length;
          const finished = chores.filter((c) => isDoneNow(c, done, now, weekStartsOn)).length;
          const allDone = total > 0 && finished === total;
          const balance = person.id ? config.stars?.[person.id] || 0 : null;
          return (
            <section
              key={person.id ?? 'anyone'}
              className={`rounded-2xl border p-2.5 flex flex-col gap-1.5 ${surface}`}
              style={{ borderTopColor: person.color, borderTopWidth: 3 }}
              aria-label={`${person.name}'s chores, ${finished} of ${total} done`}
            >
              <div className="flex items-center gap-2">
                <Avatar person={person} />
                <div className="min-w-0 flex-1">
                  <div className={`text-sm @md:text-base font-bold truncate ${textMain}`}>{person.name}</div>
                  <div className={`text-xs ${textSub}`}>
                    {finished}/{total} done
                  </div>
                </div>
                {balance !== null && (
                  <span
                    className="flex items-center gap-1 text-sm font-bold text-amber-400"
                    title={`${balance} stars`}
                  >
                    <Star className="w-4 h-4 fill-current" aria-hidden="true" />
                    {balance}
                  </span>
                )}
              </div>

              {allDone && (
                <div className="text-center text-sm font-bold text-emerald-400 py-0.5">
                  <span className="inline-block motion-safe:animate-bounce" aria-hidden="true">
                    🎉
                  </span>{' '}
                  All done!
                </div>
              )}

              {chores.map((chore) => {
                const isDone = isDoneNow(chore, done, now, weekStartsOn);
                const doneBy = isDone && !chore.personId ? people.find((p) => p.id === done?.[chore.id]?.by) : undefined;
                return (
                  <button
                    key={chore.id}
                    type="button"
                    data-no-drag="true"
                    onClick={() => tap(chore)}
                    aria-pressed={isDone}
                    className={`w-full min-h-[44px] flex items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors cursor-pointer ${
                      isLight ? 'hover:bg-slate-100' : 'hover:bg-white/5'
                    } ${isDone ? 'opacity-70' : ''}`}
                  >
                    <span className="text-xl @md:text-2xl shrink-0" aria-hidden="true">
                      {chore.emoji || '•'}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span
                        className={`block text-sm @md:text-base font-semibold leading-tight ${textMain} ${
                          isDone ? 'line-through' : ''
                        }`}
                      >
                        {chore.title}
                      </span>
                      {(chore.repeat !== 'daily' || doneBy) && (
                        <span className={`block text-[11px] @md:text-xs ${textSub}`}>
                          {chore.repeat === 'weekly' ? 'This week' : chore.repeat === 'once' ? 'One time' : ''}
                          {doneBy ? `${chore.repeat !== 'daily' ? ' · ' : ''}Done by ${doneBy.name}` : ''}
                        </span>
                      )}
                    </span>
                    {chore.stars > 0 && (
                      <span className="text-xs font-bold text-amber-400 shrink-0" aria-label={`${chore.stars} stars`}>
                        +{chore.stars}★
                      </span>
                    )}
                    <span
                      className="w-7 h-7 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors"
                      style={{ borderColor: person.color, backgroundColor: isDone ? person.color : 'transparent' }}
                      aria-hidden="true"
                    >
                      {isDone && <Check className="w-4 h-4 text-white" strokeWidth={3} />}
                    </span>
                  </button>
                );
              })}
            </section>
          );
        })}
      </div>

      {rewards.length > 0 && people.length > 0 && (
        <div className="shrink-0 flex items-center gap-1.5 overflow-x-auto pb-0.5">
          <Gift className={`w-4 h-4 shrink-0 ${textSub}`} aria-hidden="true" />
          {rewards.map((r) => (
            <button
              key={r.id}
              type="button"
              data-no-drag="true"
              onClick={() => setOverlay({ kind: 'reward', rewardId: r.id })}
              className={`shrink-0 flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold cursor-pointer ${
                isLight ? 'border-slate-300 text-slate-700 hover:bg-slate-100' : 'border-white/15 text-gray-200 hover:bg-white/10'
              }`}
            >
              <span aria-hidden="true">{r.emoji || '🎁'}</span>
              {r.title}
              <span className="text-amber-400">{r.cost}★</span>
            </button>
          ))}
        </div>
      )}

      {overlay.kind !== 'none' && (
        <div
          data-no-drag="true"
          className="absolute inset-0 z-10 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget && overlay.kind !== 'redeemed') setOverlay({ kind: 'none' });
          }}
        >
          <div className="w-full max-w-xs rounded-2xl bg-gray-900 border border-gray-700 p-4 text-center relative" role="dialog" aria-modal="true">
            {overlay.kind !== 'redeemed' && (
              <button
                type="button"
                onClick={() => setOverlay({ kind: 'none' })}
                aria-label="Close"
                className="absolute top-2 right-2 p-1 rounded-lg text-gray-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {overlay.kind === 'who-did' && (
              <>
                <p className="text-sm font-bold text-white mb-3">
                  Who did {overlay.chore.emoji} {overlay.chore.title}?
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {people.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => finishBy(overlay.chore, p.id)}
                      className="flex items-center gap-2 rounded-xl bg-gray-800 hover:bg-gray-700 p-2 text-sm font-semibold text-white cursor-pointer"
                    >
                      <Avatar person={p} size="sm" />
                      <span className="truncate">{p.name}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => finishBy(overlay.chore, undefined)}
                  className="mt-2 w-full text-xs text-gray-400 hover:text-white py-1.5 cursor-pointer"
                >
                  Just mark it done (no stars)
                </button>
              </>
            )}

            {overlay.kind === 'reward' &&
              (() => {
                const reward = rewards.find((r) => r.id === overlay.rewardId);
                if (!reward) return null;
                return (
                  <>
                    <p className="text-sm font-bold text-white mb-1">
                      {reward.emoji || '🎁'} {reward.title}
                    </p>
                    <p className="text-xs text-gray-400 mb-3">Costs {reward.cost} stars. Who's getting it?</p>
                    <div className="grid grid-cols-2 gap-2">
                      {people.map((p) => {
                        const balance = config.stars?.[p.id] || 0;
                        const enough = balance >= reward.cost;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            disabled={!enough}
                            onClick={() => choosePersonForReward(reward.id, p.id)}
                            className="flex items-center gap-2 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed p-2 text-left cursor-pointer"
                          >
                            <Avatar person={p} size="sm" />
                            <span className="min-w-0">
                              <span className="block text-sm font-semibold text-white truncate">{p.name}</span>
                              <span className="block text-[11px] text-amber-400">{balance}★</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                );
              })()}

            {overlay.kind === 'pin' && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  confirmPin(overlay.rewardId, overlay.personId);
                }}
              >
                <p className="text-sm font-bold text-white mb-1">Parent approval</p>
                <p className="text-xs text-gray-400 mb-3">Enter the board PIN to spend the stars.</p>
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  autoFocus
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  aria-label="PIN"
                  className="w-full text-center tracking-[0.5em] rounded-xl bg-gray-950 border border-gray-700 p-2.5 text-lg text-white focus:outline-none focus:border-blue-500"
                />
                {pinError && <p className="text-xs text-red-400 mt-1.5">{pinError}</p>}
                <button
                  type="submit"
                  className="mt-3 w-full rounded-xl bg-blue-600 hover:bg-blue-500 py-2 text-sm font-semibold text-white cursor-pointer"
                >
                  Approve
                </button>
              </form>
            )}

            {overlay.kind === 'redeemed' && <p className="text-base font-bold text-white py-2">{overlay.text}</p>}
          </div>
        </div>
      )}
    </div>
  );
};
