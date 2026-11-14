import type { CalendarEvent } from '../services/feeds';
import type { MealSlot, ScheduledMeal } from '../types/meals';

export const MEAL_PLANNER_CALENDAR_ID = '__ambiently_meals__';

export const ALL_MEAL_SLOTS: readonly MealSlot[] = ['breakfast', 'lunch', 'dinner'];

export const MEAL_SLOT_ORDER: Record<MealSlot, number> = {
  breakfast: 0,
  lunch: 1,
  dinner: 2,
};

export const MEAL_SLOT_CALENDAR_META: Record<
  MealSlot,
  { label: string; shortLabel: string; color: string }
> = {
  breakfast: { label: 'Breakfast', shortLabel: 'Bkfst', color: '#d97706' },
  lunch: { label: 'Lunch', shortLabel: 'Lunch', color: '#10b981' },
  dinner: { label: 'Dinner', shortLabel: 'Dinner', color: '#38bdf8' },
};

/** Groups all non-deleted scheduled meals by YYYY-MM-DD date in breakfast -> lunch -> dinner order. */
export function groupScheduledMealsByDate(
  scheduledMeals: readonly ScheduledMeal[]
): Map<string, ScheduledMeal[]> {
  const map = new Map<string, ScheduledMeal[]>();

  for (const meal of scheduledMeals) {
    if (!meal || meal.deletedAt || !meal.date) continue;
    const arr = map.get(meal.date) || [];
    arr.push(meal);
    map.set(meal.date, arr);
  }

  for (const arr of map.values()) {
    arr.sort((a, b) => (MEAL_SLOT_ORDER[a.slot] ?? 9) - (MEAL_SLOT_ORDER[b.slot] ?? 9));
  }

  return map;
}

/**
 * Keeps configured empty slot prompts scoped to `visibleSlots` while always
 * showing any slot that already has a scheduled meal on that day.
 */
export function getDisplaySlotsForDay(
  visibleSlots: readonly MealSlot[],
  dayMeals: readonly ScheduledMeal[]
): MealSlot[] {
  const visibleSet = new Set<MealSlot>(visibleSlots);
  const scheduledSet = new Set<MealSlot>(dayMeals.map((m) => m.slot));
  return ALL_MEAL_SLOTS.filter((slot) => visibleSet.has(slot) || scheduledSet.has(slot));
}

/**
 * Picks an explicit slot if requested, otherwise prefers the first unoccupied
 * slot across visibleSlots and then all meal slots before falling back to editing.
 */
export function pickDefaultScheduleSlot(
  visibleSlots: readonly MealSlot[],
  dayMeals: readonly ScheduledMeal[],
  preferredSlot?: MealSlot
): { slot: MealSlot; editingMeal: ScheduledMeal | null } {
  if (preferredSlot) {
    return {
      slot: preferredSlot,
      editingMeal: dayMeals.find((m) => m.slot === preferredSlot) || null,
    };
  }

  const occupiedSlots = new Set<MealSlot>(dayMeals.map((m) => m.slot));
  const openVisible = visibleSlots.find((s) => !occupiedSlots.has(s));
  if (openVisible) {
    return { slot: openVisible, editingMeal: null };
  }

  const openAny = ALL_MEAL_SLOTS.find((s) => !occupiedSlots.has(s));
  if (openAny) {
    return { slot: openAny, editingMeal: null };
  }

  const fallbackSlot = visibleSlots[visibleSlots.length - 1] || 'dinner';
  return {
    slot: fallbackSlot,
    editingMeal: dayMeals.find((m) => m.slot === fallbackSlot) || null,
  };
}

/** Maps non-deleted scheduled meals into all-day CalendarEvent records for Family Calendar views. */
export function scheduledMealsToCalendarEvents(
  scheduledMeals: readonly ScheduledMeal[]
): CalendarEvent[] {
  return scheduledMeals
    .filter((meal) => Boolean(meal && !meal.deletedAt && meal.date))
    .slice()
    .sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return (MEAL_SLOT_ORDER[a.slot] ?? 9) - (MEAL_SLOT_ORDER[b.slot] ?? 9);
    })
    .map((meal) => {
      const meta = MEAL_SLOT_CALENDAR_META[meal.slot] || MEAL_SLOT_CALENDAR_META.dinner;
      return {
        uid: `meal-${meal.id}`,
        calendarId: MEAL_PLANNER_CALENDAR_ID,
        calendarName: 'Meal Plan',
        color: meta.color,
        summary: meal.title,
        description: meal.notes,
        start: meal.date,
        isAllDay: true,
        mealSlot: meal.slot,
      };
    });
}
