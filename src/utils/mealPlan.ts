import type { MealEntry, MealPlanWidgetConfig, MealSlot, StickyNoteItem } from '../types/dashboard';
import { localDateKey, parseDateKey } from './timePrefs';

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
};

export const ALL_MEAL_SLOTS: MealSlot[] = ['breakfast', 'lunch', 'dinner'];

const KEEP_PAST_DAYS = 21;
const LIBRARY_LIMIT = 40;

export function slotsOf(config: MealPlanWidgetConfig): MealSlot[] {
  const chosen = ALL_MEAL_SLOTS.filter((s) => config.slots?.includes(s));
  return chosen.length > 0 ? chosen : ['dinner'];
}

export function cleanIngredients(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/\n|,/)) {
    const item = raw.replace(/^[-*•\s]+/, '').trim();
    const key = item.toLowerCase();
    if (item && !seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
  }
  return out;
}

/** The config changes for saving (or, with `entry` null, clearing) one meal. */
export function setMeal(
  config: MealPlanWidgetConfig,
  dateKey: string,
  slot: MealSlot,
  entry: MealEntry | null,
  today: Date = new Date()
): Pick<MealPlanWidgetConfig, 'meals' | 'library'> {
  const cutoff = new Date(today.getFullYear(), today.getMonth(), today.getDate() - KEEP_PAST_DAYS);
  const meals: NonNullable<MealPlanWidgetConfig['meals']> = {};
  for (const [key, day] of Object.entries(config.meals || {})) {
    if (parseDateKey(key) >= cutoff) meals[key] = { ...day };
  }

  const day = { ...(meals[dateKey] || {}) };
  if (entry && entry.title.trim()) {
    day[slot] = { title: entry.title.trim(), ingredients: entry.ingredients?.length ? entry.ingredients : undefined };
  } else {
    delete day[slot];
  }
  if (Object.keys(day).length > 0) meals[dateKey] = day;
  else delete meals[dateKey];

  let library = config.library || [];
  if (entry && entry.title.trim()) {
    const title = entry.title.trim();
    library = [
      { title, ingredients: entry.ingredients?.length ? entry.ingredients : undefined },
      ...library.filter((m) => m.title.toLowerCase() !== title.toLowerCase()),
    ].slice(0, LIBRARY_LIMIT);
  }
  return { meals, library };
}

export function ingredientsForDays(config: MealPlanWidgetConfig, dates: Date[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const date of dates) {
    const day = config.meals?.[localDateKey(date)];
    if (!day) continue;
    for (const slot of ALL_MEAL_SLOTS) {
      for (const item of day[slot]?.ingredients || []) {
        const key = item.trim().toLowerCase();
        if (key && !seen.has(key)) {
          seen.add(key);
          out.push(item.trim());
        }
      }
    }
  }
  return out;
}

/**
 * Adds ingredients to a checklist. Items already on the list and not ticked are left alone; items
 * ticked off earlier (bought last time) are unticked, since they're needed again.
 */
export function addToChecklist(
  items: NonNullable<StickyNoteItem['checklistItems']>,
  ingredients: string[],
  makeId: () => string
): { items: NonNullable<StickyNoteItem['checklistItems']>; added: number } {
  const next = items.map((i) => ({ ...i }));
  let added = 0;
  for (const ingredient of ingredients) {
    const key = ingredient.toLowerCase();
    const existing = next.find((i) => i.text.trim().toLowerCase() === key);
    if (existing) {
      if (existing.done) {
        existing.done = false;
        added++;
      }
    } else {
      next.push({ id: makeId(), text: ingredient, done: false });
      added++;
    }
  }
  return { items: next, added };
}
