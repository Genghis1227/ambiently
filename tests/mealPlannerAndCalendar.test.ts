import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mergeMealSnapshots, useMealStore } from '../src/stores/useMealStore.ts';
import { DEFAULT_MEAL_SNAPSHOT } from '../src/services/db.ts';
import {
  MEAL_PLANNER_CALENDAR_ID,
  getDisplaySlotsForDay,
  groupScheduledMealsByDate,
  pickDefaultScheduleSlot,
  scheduledMealsToCalendarEvents,
} from '../src/utils/mealCalendarEvents.ts';
import { localDateKey } from '../src/utils/dateKey.ts';
import type { MealPlannerSnapshot, ScheduledMeal } from '../src/types/meals.ts';

function parseAllDayDateKey(dateStr: string): Date {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  assert.ok(match, `Expected YYYY-MM-DD date string, received: ${dateStr}`);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
}

describe('Meal Planner Today/Lunch Visibility & Family Calendar Integration', () => {
  beforeEach(() => {
    const fresh = structuredClone(DEFAULT_MEAL_SNAPSHOT);
    useMealStore.setState({
      isInitialized: true,
      snapshot: fresh,
      recipes: fresh.recipes,
      scheduledMeals: fresh.scheduledMeals,
      shoppingItems: fresh.shoppingItems,
      staples: fresh.staples,
      aisleOrder: fresh.aisleOrder,
      weekStartsOn: fresh.weekStartsOn,
    });
  });

  it('preserves newly scheduled Today Lunch even after legacy slot deletion tombstones and during remote merges', async () => {
    const refDate = new Date();
    const todayKey = localDateKey(refDate);
    const futureLunchTimestamp = '2099-11-14T16:00:00.000Z';

    // Simulate a legacy deterministic ID having been deleted earlier
    const seededDeleted = structuredClone(DEFAULT_MEAL_SNAPSHOT);
    seededDeleted.deletedScheduledMealIds = [`${todayKey}_lunch`];
    seededDeleted.updated_at = '2026-11-14T08:00:00.000Z';
    useMealStore.setState({
      snapshot: seededDeleted,
      scheduledMeals: [],
    });

    const lunchMeal = await useMealStore.getState().scheduleMeal({
      date: todayKey,
      slot: 'lunch',
      title: "Jason's Deli",
    });

    assert.notEqual(lunchMeal.id, `${todayKey}_lunch`);
    assert.equal(lunchMeal.date, todayKey);
    assert.equal(lunchMeal.slot, 'lunch');
    assert.equal(lunchMeal.title, "Jason's Deli");

    // Merging with an older remote snapshot carrying the legacy deterministic tombstone keeps Lunch intact
    const remoteWithLegacyTombstone: MealPlannerSnapshot = {
      ...structuredClone(DEFAULT_MEAL_SNAPSHOT),
      scheduledMeals: [
        {
          id: 'meal-stale-dinner',
          date: todayKey,
          slot: 'dinner',
          title: 'Pasta Night',
          updatedAt: '2026-11-14T07:00:00.000Z',
        },
      ],
      deletedScheduledMealIds: [`${todayKey}_lunch`],
      updated_at: '2026-11-14T08:00:00.000Z',
    };

    await useMealStore.getState().applyRemoteMealSnapshot(remoteWithLegacyTombstone);

    const todayMeals = useMealStore.getState().getMealsForScope('today', refDate);
    assert.deepEqual(
      todayMeals.map((m) => `${m.slot}:${m.title}`),
      ["lunch:Jason's Deli", 'dinner:Pasta Night']
    );

    // Resurrected same-ID check: newer local record outlives stale remote tombstone, and newer (date, slot) wins dedup
    const localSnapshot: MealPlannerSnapshot = {
      ...structuredClone(DEFAULT_MEAL_SNAPSHOT),
      scheduledMeals: [
        {
          id: 'meal-reborn-lunch',
          date: todayKey,
          slot: 'lunch',
          title: 'Soup Ga Nui',
          updatedAt: futureLunchTimestamp,
        },
      ],
      deletedScheduledMealIds: [],
      updated_at: futureLunchTimestamp,
    };
    const remoteSnapshotWithStaleTombstone: MealPlannerSnapshot = {
      ...structuredClone(DEFAULT_MEAL_SNAPSHOT),
      scheduledMeals: [
        {
          id: 'meal-other-lunch',
          date: todayKey,
          slot: 'lunch',
          title: 'Leftovers',
          updatedAt: '2026-11-14T09:00:00.000Z',
        },
      ],
      deletedScheduledMealIds: ['meal-reborn-lunch'],
      updated_at: '2026-11-14T09:00:00.000Z',
    };

    const merged = mergeMealSnapshots(localSnapshot, remoteSnapshotWithStaleTombstone);
    assert.deepEqual(
      merged.scheduledMeals.map((m) => `${m.id}:${m.title}`),
      ['meal-reborn-lunch:Soup Ga Nui']
    );
    assert.ok(!merged.deletedScheduledMealIds?.includes('meal-reborn-lunch'));
  });

  it('returns Today meals in slot order via getMealsForScope("today")', async () => {
    const store = useMealStore.getState();
    const refDate = new Date();
    const today = localDateKey(refDate);
    const tomorrow = localDateKey(
      new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate() + 1)
    );

    await store.scheduleMeal({ date: today, slot: 'dinner', title: 'Tacos' });
    await store.scheduleMeal({ date: today, slot: 'lunch', title: 'Sandwich' });
    await store.scheduleMeal({ date: today, slot: 'breakfast', title: 'Cereal' });
    await store.scheduleMeal({ date: tomorrow, slot: 'lunch', title: 'Tomorrow Pho' });

    const todayMeals = useMealStore
      .getState()
      .getMealsForScope('today', refDate);

    assert.deepEqual(
      todayMeals.map((m) => `${m.slot}:${m.title}`),
      ['breakfast:Cereal', 'lunch:Sandwich', 'dinner:Tacos']
    );
  });

  it('keeps scheduled Lunch visible even when widget visibleSlots omits lunch', () => {
    const dayMeals: ScheduledMeal[] = [
      {
        id: 'm1',
        date: '2026-11-14',
        slot: 'breakfast',
        title: 'Oatmeal',
        updatedAt: '2026-11-14T07:00:00.000Z',
      },
      {
        id: 'm2',
        date: '2026-11-14',
        slot: 'lunch',
        title: 'Bento Box',
        updatedAt: '2026-11-14T09:00:00.000Z',
      },
    ];

    const grouped = groupScheduledMealsByDate(dayMeals);
    assert.equal(grouped.get('2026-11-14')?.length, 2);

    const displaySlots = getDisplaySlotsForDay(['breakfast', 'dinner'], dayMeals);
    assert.deepEqual(displaySlots, ['breakfast', 'lunch', 'dinner']);
  });

  it('picks an unoccupied slot instead of clobbering existing meals when opening Day +', () => {
    const existingMeals: ScheduledMeal[] = [
      {
        id: 'm-bkfst',
        date: '2026-11-14',
        slot: 'breakfast',
        title: 'Cereal',
        updatedAt: '2026-11-14T07:00:00.000Z',
      },
      {
        id: 'm-dinner',
        date: '2026-11-14',
        slot: 'dinner',
        title: 'Homemade Pizza',
        updatedAt: '2026-11-14T08:00:00.000Z',
      },
    ];

    // Even if Lunch isn't in visibleSlots, opening + picks open 'lunch' cleanly with editingMeal=null
    const pick = pickDefaultScheduleSlot(['breakfast', 'dinner'], existingMeals);
    assert.equal(pick.slot, 'lunch');
    assert.equal(pick.editingMeal, null);
  });

  it('maps Today Lunch into a local CalendarEvent matching CalendarWidget date filters', () => {
    const meals: ScheduledMeal[] = [
      {
        id: 'm-lunch',
        date: '2026-11-14',
        slot: 'lunch',
        title: "Jason's Deli",
        notes: 'Extra pickle',
        updatedAt: '2026-11-14T09:30:00.000Z',
      },
      {
        id: 'm-deleted',
        date: '2026-11-14',
        slot: 'dinner',
        title: 'Removed',
        updatedAt: '2026-11-14T09:00:00.000Z',
        deletedAt: '2026-11-14T09:10:00.000Z',
      },
    ];

    const events = scheduledMealsToCalendarEvents(meals);
    assert.equal(events.length, 1);

    const lunchEvent = events[0];
    assert.equal(lunchEvent.uid, 'meal-m-lunch');
    assert.equal(lunchEvent.calendarId, MEAL_PLANNER_CALENDAR_ID);
    assert.equal(lunchEvent.calendarName, 'Meal Plan');
    assert.equal(lunchEvent.mealSlot, 'lunch');
    assert.equal(lunchEvent.summary, "Jason's Deli");
    assert.equal(lunchEvent.start, '2026-11-14');
    assert.equal(lunchEvent.isAllDay, true);

    const parsedLocal = parseAllDayDateKey(lunchEvent.start);
    const nov14 = new Date(2026, 10, 14, 0, 0, 0, 0);
    assert.equal(parsedLocal.getTime(), nov14.getTime());
  });
});
