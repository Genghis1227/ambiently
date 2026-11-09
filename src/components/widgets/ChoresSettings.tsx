import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { ChoreItem, ChorePerson, ChoreReward } from '../../types/dashboard';
import { PERSON_COLORS } from '../../utils/chores';
import { newId } from '../../utils/widgetConfigQueue';
import { useTimePrefs, weekdayLabels } from '../../utils/timePrefs';

export interface ChoresDraft {
  people: ChorePerson[];
  chores: ChoreItem[];
  rewards: ChoreReward[];
  resetStars: boolean;
}

interface ChoresSettingsProps {
  value: ChoresDraft;
  onChange: (next: ChoresDraft) => void;
}

const inputClass =
  'rounded-lg bg-gray-950 border border-gray-800 px-2 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-blue-500';
const labelClass = 'text-xs font-semibold uppercase tracking-wider text-gray-400 block mb-1.5';

type RepeatChoice = 'daily' | 'some_days' | 'weekly' | 'once';

function repeatChoice(chore: ChoreItem): RepeatChoice {
  if (chore.repeat === 'daily' && chore.days && chore.days.length > 0) return 'some_days';
  return chore.repeat;
}

export const ChoresSettings: React.FC<ChoresSettingsProps> = ({ value, onChange }) => {
  const { weekStartsOn } = useTimePrefs();
  const dayNames = weekdayLabels(weekStartsOn, 'narrow');
  const { people, chores, rewards } = value;

  const setPeople = (next: ChorePerson[]) => {
    const ids = new Set(next.map((p) => p.id));
    // Chores of someone removed become "anyone" chores rather than disappearing
    onChange({
      ...value,
      people: next,
      chores: chores.map((c) => (c.personId && !ids.has(c.personId) ? { ...c, personId: null } : c)),
    });
  };
  const setChores = (next: ChoreItem[]) => onChange({ ...value, chores: next });
  const setRewards = (next: ChoreReward[]) => onChange({ ...value, rewards: next });
  const updateChore = (id: string, patch: Partial<ChoreItem>) =>
    setChores(chores.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  return (
    <div className="space-y-5">
      <div>
        <label className={labelClass}>Family members</label>
        <div className="space-y-2">
          {people.map((p) => (
            <div key={p.id} className="flex items-center gap-2">
              <input
                value={p.emoji || ''}
                onChange={(e) => setPeople(people.map((x) => (x.id === p.id ? { ...x, emoji: e.target.value.slice(0, 4) } : x)))}
                placeholder="🙂"
                aria-label="Emoji"
                className={`${inputClass} w-11 text-center`}
              />
              <input
                value={p.name}
                onChange={(e) => setPeople(people.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))}
                placeholder="Name"
                aria-label="Name"
                className={`${inputClass} flex-1 min-w-0`}
              />
              <div className="flex gap-1">
                {PERSON_COLORS.slice(0, 6).map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setPeople(people.map((x) => (x.id === p.id ? { ...x, color } : x)))}
                    aria-label={`Color ${color}`}
                    aria-pressed={p.color === color}
                    className={`w-5 h-5 rounded-full cursor-pointer ${p.color === color ? 'ring-2 ring-white ring-offset-1 ring-offset-gray-900' : ''}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => setPeople(people.filter((x) => x.id !== p.id))}
                aria-label={`Remove ${p.name || 'person'}`}
                className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-800 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setPeople([
                ...people,
                { id: newId('person'), name: '', color: PERSON_COLORS[people.length % PERSON_COLORS.length] },
              ])
            }
            className="flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add person
          </button>
        </div>
      </div>

      <div>
        <label className={labelClass}>Chores</label>
        <div className="space-y-2.5">
          {chores.map((c) => {
            const choice = repeatChoice(c);
            return (
              <div key={c.id} className="rounded-xl border border-gray-800 bg-gray-950/40 p-2 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    value={c.emoji || ''}
                    onChange={(e) => updateChore(c.id, { emoji: e.target.value.slice(0, 4) })}
                    placeholder="🧹"
                    aria-label="Emoji"
                    className={`${inputClass} w-11 text-center`}
                  />
                  <input
                    value={c.title}
                    onChange={(e) => updateChore(c.id, { title: e.target.value })}
                    placeholder="Chore"
                    aria-label="Chore"
                    className={`${inputClass} flex-1 min-w-0`}
                  />
                  <button
                    type="button"
                    onClick={() => setChores(chores.filter((x) => x.id !== c.id))}
                    aria-label={`Remove ${c.title || 'chore'}`}
                    className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-800 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={c.personId || ''}
                    onChange={(e) => updateChore(c.id, { personId: e.target.value || null })}
                    aria-label="Who"
                    className={inputClass}
                  >
                    <option value="">Anyone</option>
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name || 'Unnamed'}
                      </option>
                    ))}
                  </select>
                  <select
                    value={choice}
                    onChange={(e) => {
                      const next = e.target.value as RepeatChoice;
                      if (next === 'some_days') updateChore(c.id, { repeat: 'daily', days: [1, 2, 3, 4, 5] });
                      else updateChore(c.id, { repeat: next, days: undefined });
                    }}
                    aria-label="Repeats"
                    className={inputClass}
                  >
                    <option value="daily">Every day</option>
                    <option value="some_days">Some days</option>
                    <option value="weekly">Once a week</option>
                    <option value="once">One time</option>
                  </select>
                  <label className="flex items-center gap-1 text-xs text-gray-400">
                    Stars
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={c.stars}
                      onChange={(e) => updateChore(c.id, { stars: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })}
                      className={`${inputClass} w-14`}
                    />
                  </label>
                </div>
                {choice === 'some_days' && (
                  <div className="flex gap-1">
                    {dayNames.map((name, i) => {
                      const day = (i + weekStartsOn) % 7;
                      const on = c.days?.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          aria-pressed={on}
                          onClick={() => {
                            const days = on ? (c.days || []).filter((d) => d !== day) : [...(c.days || []), day];
                            updateChore(c.id, { days: days.length > 0 ? days.sort() : undefined });
                          }}
                          className={`w-7 h-7 rounded-full text-[11px] font-bold cursor-pointer ${
                            on ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400'
                          }`}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={() =>
              setChores([
                ...chores,
                { id: newId('chore'), title: '', personId: people[0]?.id || null, repeat: 'daily', stars: 1 },
              ])
            }
            className="flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add chore
          </button>
        </div>
      </div>

      <div>
        <label className={labelClass}>Rewards</label>
        <div className="space-y-2">
          {rewards.map((r) => (
            <div key={r.id} className="flex items-center gap-2">
              <input
                value={r.emoji || ''}
                onChange={(e) => setRewards(rewards.map((x) => (x.id === r.id ? { ...x, emoji: e.target.value.slice(0, 4) } : x)))}
                placeholder="🎁"
                aria-label="Emoji"
                className={`${inputClass} w-11 text-center`}
              />
              <input
                value={r.title}
                onChange={(e) => setRewards(rewards.map((x) => (x.id === r.id ? { ...x, title: e.target.value } : x)))}
                placeholder="Reward"
                aria-label="Reward"
                className={`${inputClass} flex-1 min-w-0`}
              />
              <label className="flex items-center gap-1 text-xs text-gray-400">
                Costs
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={r.cost}
                  onChange={(e) =>
                    setRewards(rewards.map((x) => (x.id === r.id ? { ...x, cost: Math.max(1, Math.min(999, Number(e.target.value) || 1)) } : x)))
                  }
                  className={`${inputClass} w-16`}
                />
              </label>
              <button
                type="button"
                onClick={() => setRewards(rewards.filter((x) => x.id !== r.id))}
                aria-label={`Remove ${r.title || 'reward'}`}
                className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-800 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRewards([...rewards, { id: newId('reward'), title: '', cost: 10 }])}
            className="flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add reward
          </button>
          <p className="text-[11px] text-gray-500">
            When the board has a PIN, spending stars on a reward asks for it, so a parent approves.
          </p>
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-gray-300 cursor-pointer">
        <input
          type="checkbox"
          checked={value.resetStars}
          onChange={(e) => onChange({ ...value, resetStars: e.target.checked })}
        />
        Reset everyone's stars to 0 when I save
      </label>
    </div>
  );
};
