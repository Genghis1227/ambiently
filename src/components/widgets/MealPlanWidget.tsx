import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ShoppingCart, X } from 'lucide-react';
import type { MealEntry, MealPlanWidgetConfig, MealSlot, StickyNoteItem } from '../../types/dashboard';
import { useDashboardStore } from '../../store/dashboardStore';
import { localDateKey, startOfWeek, useTimePrefs } from '../../utils/timePrefs';
import { changeWidgetConfig, newId } from '../../utils/widgetConfigQueue';
import { MEAL_SLOT_LABELS, addToChecklist, cleanIngredients, ingredientsForDays, setMeal, slotsOf } from '../../utils/mealPlan';

interface MealPlanWidgetProps {
  widgetId: string;
  tabId: string;
  config: MealPlanWidgetConfig;
  isLight?: boolean;
}

interface Editing {
  dateKey: string;
  date: Date;
  slot: MealSlot;
  title: string;
  ingredients: string;
  existed: boolean;
}

const LIST_NAME_PATTERN = /shopping|grocer|essentials/i;

function isUsableList(note: StickyNoteItem | undefined): note is StickyNoteItem {
  return Boolean(note && note.isChecklist && !note.deleted_at && !note.archivedAt);
}

function useDayTick(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export const MealPlanWidget: React.FC<MealPlanWidgetProps> = ({ widgetId, tabId, config, isLight = false }) => {
  const now = useDayTick();
  const { weekStartsOn } = useTimePrefs();
  const notes = useDashboardStore((s) => s.notes);
  const [weekOffset, setWeekOffset] = useState(0);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [message, setMessage] = useState('');

  const slots = slotsOf(config);
  const todayKey = localDateKey(now);
  const weekStart = useMemo(() => {
    const d = startOfWeek(now, weekStartsOn);
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [now, weekStartsOn, weekOffset]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i)),
    [weekStart]
  );

  // Ingredients still to buy: the rest of this week, or the whole week when looking ahead
  const shoppingDays = days.filter((d) => localDateKey(d) >= todayKey);
  const ingredients = ingredientsForDays(config, shoppingDays);

  const listNote = useMemo(() => {
    const chosen = notes.find((n) => n.id === config.listNoteId);
    if (isUsableList(chosen)) return chosen;
    return notes.find((n) => isUsableList(n) && n.tabId === tabId && LIST_NAME_PATTERN.test(n.title || ''));
  }, [notes, config.listNoteId, tabId]);

  const startEdit = (date: Date, slot: MealSlot) => {
    const dateKey = localDateKey(date);
    const meal = config.meals?.[dateKey]?.[slot];
    setEditing({
      dateKey,
      date,
      slot,
      title: meal?.title || '',
      ingredients: (meal?.ingredients || []).join('\n'),
      existed: Boolean(meal),
    });
  };

  const save = (entry: MealEntry | null) => {
    if (!editing) return;
    const { dateKey, slot } = editing;
    setEditing(null);
    changeWidgetConfig(widgetId, (c) => setMeal(c, dateKey, slot, entry));
  };

  const addIngredientsToList = async () => {
    if (ingredients.length === 0) return;
    const store = useDashboardStore.getState();
    const current = store.notes.find((n) => n.id === listNote?.id);
    if (isUsableList(current)) {
      const { items, added } = addToChecklist(current.checklistItems || [], ingredients, () => newId('item'));
      if (added > 0) await store.updateNote(current.id, { checklistItems: items });
      if (config.listNoteId !== current.id) changeWidgetConfig(widgetId, () => ({ listNoteId: current.id }));
      setMessage(added > 0 ? `Added ${added} to ${current.title || 'the list'}` : `Everything's already on ${current.title || 'the list'}`);
    } else {
      const id = newId('note');
      const { items } = addToChecklist([], ingredients, () => newId('item'));
      await store.addNote({
        id,
        tabId,
        title: '🛒 Shopping List',
        content: '',
        isChecklist: true,
        checklistItems: items,
        bgColor: '#bbf7d0',
      });
      changeWidgetConfig(widgetId, () => ({ listNoteId: id }));
      setMessage(`Made a 🛒 Shopping List with ${items.length} items`);
    }
    setTimeout(() => setMessage(''), 4000);
  };

  const textMain = isLight ? 'text-slate-900' : 'text-white';
  const textSub = isLight ? 'text-slate-500' : 'text-gray-400';
  const rowBorder = isLight ? 'border-slate-200' : 'border-white/10';
  const weekLabel = `${days[0].toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString([], {
    month: days[6].getMonth() === days[0].getMonth() ? undefined : 'short',
    day: 'numeric',
  })}`;
  const suggestions = editing
    ? (config.library || [])
        .filter((m) => !editing.title.trim() || m.title.toLowerCase().includes(editing.title.trim().toLowerCase()))
        .filter((m) => m.title.toLowerCase() !== editing.title.trim().toLowerCase())
        .slice(0, 6)
    : [];

  return (
    <div className="@container relative w-full h-full flex flex-col overflow-hidden p-3 gap-2">
      <div className="flex items-center justify-between gap-2 shrink-0">
        <h3 className={`text-sm @md:text-base font-bold truncate ${textMain}`}>🍽️ Meals</h3>
        <div className="flex items-center gap-1">
          {weekOffset !== 0 && (
            <button
              type="button"
              data-no-drag="true"
              onClick={() => setWeekOffset(0)}
              className={`text-[11px] font-semibold px-2 py-1 rounded-lg cursor-pointer ${isLight ? 'hover:bg-slate-100 text-slate-600' : 'hover:bg-white/10 text-gray-300'}`}
            >
              This week
            </button>
          )}
          <button
            type="button"
            data-no-drag="true"
            onClick={() => setWeekOffset((w) => w - 1)}
            aria-label="Previous week"
            className={`p-1 rounded-lg cursor-pointer ${isLight ? 'hover:bg-slate-100 text-slate-600' : 'hover:bg-white/10 text-gray-300'}`}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className={`text-xs @md:text-sm font-medium tabular-nums ${textSub}`}>{weekLabel}</span>
          <button
            type="button"
            data-no-drag="true"
            onClick={() => setWeekOffset((w) => w + 1)}
            aria-label="Next week"
            className={`p-1 rounded-lg cursor-pointer ${isLight ? 'hover:bg-slate-100 text-slate-600' : 'hover:bg-white/10 text-gray-300'}`}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        {days.map((date) => {
          const key = localDateKey(date);
          const isToday = key === todayKey;
          const isPast = key < todayKey;
          const day = config.meals?.[key];
          return (
            <div
              key={key}
              className={`flex items-stretch gap-2 border-b last:border-b-0 py-1.5 ${rowBorder} ${isPast ? 'opacity-55' : ''}`}
            >
              <div
                className={`w-11 @md:w-14 shrink-0 flex flex-col items-center justify-center rounded-xl py-1 ${
                  isToday ? 'bg-blue-500 text-white' : textSub
                }`}
              >
                <span className="text-[11px] @md:text-xs font-semibold uppercase leading-none">
                  {date.toLocaleDateString([], { weekday: 'short' })}
                </span>
                <span className={`text-base @md:text-lg font-bold leading-tight ${isToday ? 'text-white' : textMain}`}>
                  {date.getDate()}
                </span>
              </div>
              <div className="flex-1 min-w-0 grid gap-1" style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }}>
                {slots.map((slot) => {
                  const meal = day?.[slot];
                  return (
                    <button
                      key={slot}
                      type="button"
                      data-no-drag="true"
                      onClick={() => startEdit(date, slot)}
                      className={`min-h-[40px] rounded-xl px-2 py-1 text-left cursor-pointer transition-colors ${
                        isLight ? 'hover:bg-slate-100' : 'hover:bg-white/5'
                      }`}
                    >
                      {slots.length > 1 && (
                        <span className={`block text-[10px] @md:text-[11px] uppercase tracking-wide ${textSub}`}>
                          {MEAL_SLOT_LABELS[slot]}
                        </span>
                      )}
                      {meal ? (
                        <>
                          <span className={`block text-sm @md:text-base font-semibold leading-tight truncate ${textMain}`}>
                            {meal.title}
                          </span>
                          {meal.ingredients && meal.ingredients.length > 0 && (
                            <span className={`block text-[11px] @md:text-xs truncate ${textSub}`}>
                              {meal.ingredients.length} ingredient{meal.ingredients.length === 1 ? '' : 's'}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className={`block text-xs @md:text-sm ${isLight ? 'text-slate-400' : 'text-gray-500'}`}>
                          + {MEAL_SLOT_LABELS[slot].toLowerCase()}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="shrink-0 flex items-center gap-2 min-h-[32px]">
        {message ? (
          <span className="text-xs font-semibold text-emerald-400" role="status">
            {message}
          </span>
        ) : ingredients.length > 0 ? (
          <button
            type="button"
            data-no-drag="true"
            onClick={addIngredientsToList}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs @md:text-sm font-semibold text-white cursor-pointer"
          >
            <ShoppingCart className="w-4 h-4" aria-hidden="true" />
            Add {ingredients.length} ingredient{ingredients.length === 1 ? '' : 's'} to {listNote?.title || 'a shopping list'}
          </button>
        ) : (
          <span className={`text-[11px] @md:text-xs ${textSub}`}>Tap a day to plan a meal. Add ingredients to fill the shopping list.</span>
        )}
      </div>

      {editing && (
        <div
          data-no-drag="true"
          className="absolute inset-0 z-10 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditing(null);
          }}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-label={`${MEAL_SLOT_LABELS[editing.slot]} on ${editing.date.toLocaleDateString()}`}
            className="w-full max-w-sm max-h-full overflow-y-auto rounded-2xl bg-gray-900 border border-gray-700 p-4 relative"
            onSubmit={(e) => {
              e.preventDefault();
              save({ title: editing.title, ingredients: cleanIngredients(editing.ingredients) });
            }}
          >
            <button
              type="button"
              onClick={() => setEditing(null)}
              aria-label="Close"
              className="absolute top-2 right-2 p-1 rounded-lg text-gray-400 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
            <p className="text-sm font-bold text-white mb-3 pr-6">
              {MEAL_SLOT_LABELS[editing.slot]} ·{' '}
              {editing.date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' })}
            </p>
            <input
              type="text"
              autoFocus
              value={editing.title}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              placeholder="e.g. Taco night"
              aria-label="Meal"
              className="w-full rounded-xl bg-gray-950 border border-gray-700 p-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {suggestions.map((m) => (
                  <button
                    key={m.title}
                    type="button"
                    onClick={() =>
                      setEditing({ ...editing, title: m.title, ingredients: (m.ingredients || []).join('\n') })
                    }
                    className="rounded-full border border-gray-700 px-2.5 py-1 text-xs text-gray-200 hover:bg-gray-800 cursor-pointer"
                  >
                    {m.title}
                  </button>
                ))}
              </div>
            )}
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400 mt-3 mb-1">
              Ingredients (one per line)
            </label>
            <textarea
              value={editing.ingredients}
              onChange={(e) => setEditing({ ...editing, ingredients: e.target.value })}
              rows={4}
              placeholder={'tortillas\nground beef\nsalsa'}
              className="w-full rounded-xl bg-gray-950 border border-gray-700 p-2.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500 resize-none"
            />
            <div className="flex gap-2 mt-3">
              {editing.existed && (
                <button
                  type="button"
                  onClick={() => save(null)}
                  className="rounded-xl border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-300 hover:bg-gray-800 cursor-pointer"
                >
                  Remove
                </button>
              )}
              <button
                type="submit"
                className="flex-1 rounded-xl bg-blue-600 hover:bg-blue-500 py-2 text-sm font-semibold text-white cursor-pointer"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
