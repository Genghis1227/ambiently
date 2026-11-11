import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { useProfileStore } from '../src/stores/useProfileStore.ts';
import { useMealStore, prunePastScheduledMeals } from '../src/stores/useMealStore.ts';
import { DEFAULT_HOUSEHOLD_PROFILES, DEFAULT_MEAL_SNAPSHOT } from '../src/services/db.ts';
import { resolveProfileColorHex } from '../src/types/profiles.ts';

describe('useProfileStore & useMealStore', () => {
  beforeEach(() => {
    useProfileStore.setState({
      isInitialized: true,
      profiles: structuredClone(DEFAULT_HOUSEHOLD_PROFILES),
    });

    const freshMeal = structuredClone(DEFAULT_MEAL_SNAPSHOT);
    useMealStore.setState({
      isInitialized: true,
      snapshot: freshMeal,
      recipes: freshMeal.recipes,
      scheduledMeals: freshMeal.scheduledMeals,
      shoppingItems: freshMeal.shoppingItems,
      staples: freshMeal.staples,
      aisleOrder: freshMeal.aisleOrder,
      weekStartsOn: freshMeal.weekStartsOn,
    });
  });

  it('useProfileStore manages CRUD, Calm Science palette tokens, and Realtime conflict resolution', async () => {
    const store = useProfileStore.getState();

    // Upsert with Calm Science token ('sage') resolves to hex
    const created = await store.upsertHouseholdProfile({
      name: 'Leo',
      role: 'kid',
      color: 'sage',
    });
    assert.equal(created.color, resolveProfileColorHex('sage'));
    assert.equal(useProfileStore.getState().getProfileById(created.id)?.name, 'Leo');

    // Older remote Realtime UPDATE is ignored; newer remote UPDATE wins
    await store.applyRemoteProfileRow(
      {
        ...created,
        name: 'Stale Leo',
        updatedAt: '2020-01-01T00:00:00.000Z',
      },
      'UPDATE'
    );
    assert.equal(useProfileStore.getState().getProfileById(created.id)?.name, 'Leo');

    const futureIso = '2099-01-01T00:00:00.000Z';
    await store.applyRemoteProfileRow(
      {
        ...created,
        name: 'Leo Updated',
        updatedAt: futureIso,
      },
      'UPDATE'
    );
    assert.equal(useProfileStore.getState().getProfileById(created.id)?.name, 'Leo Updated');

    // Remote DELETE removes active profile
    await store.applyRemoteProfileRow(
      {
        ...created,
        updatedAt: '2099-01-02T00:00:00.000Z',
        deletedAt: '2099-01-02T00:00:00.000Z',
      },
      'DELETE'
    );
    assert.equal(useProfileStore.getState().getProfileById(created.id), undefined);
  });

  it('useMealStore manages recipes, selective scaled ingredient import, staples, and Google Keep export', async () => {
    const store = useMealStore.getState();
    assert.ok(store.staples.length >= 8, 'seeded with sensible household staples');

    const recipe = await store.upsertRecipe({
      title: 'Family Pancakes',
      servings: '4',
      ingredients: ['1 1/2 cups flour', '1/2 cup milk', '2 eggs', '1 pinch cinnamon'],
      instructions: ['Whisk dry ingredients.', 'Mix wet ingredients and cook on griddle.'],
      tags: ['Breakfast', 'breakfast', 'Kid Favorite'],
    });
    assert.deepEqual(recipe.tags, ['Breakfast', 'Kid Favorite']);

    const meal = await store.scheduleMeal({
      date: '2026-11-12',
      slot: 'breakfast',
      recipeId: recipe.id,
      cookProfileId: 'p_parent_1',
      scaleFactor: 2,
    });
    assert.equal(meal.title, 'Family Pancakes');
    assert.equal(meal.scaleFactor, 2);

    // Selective import of indices [0, 1] at 2x scaleFactor -> 3 cups flour + 1 cup milk
    await useMealStore.getState().importRecipeIngredients(recipe.id, {
      selectedIndices: [0, 1],
      scaleFactor: 2,
      sourceMealId: meal.id,
    });

    // Import another 1/2 cup milk -> merges to 1.5 cups milk
    await useMealStore.getState().importIngredientsToShoppingList(['1/2 cup milk']);

    const items = useMealStore.getState().shoppingItems;
    assert.equal(items.length, 2);
    const milkItem = items.find((i) => i.normalizedKey === 'milk');
    const flourItem = items.find((i) => i.normalizedKey === 'flour');
    assert.ok(milkItem);
    assert.ok(flourItem);
    assert.equal(milkItem.displayLabel, '1.5 cups milk');
    assert.equal(flourItem.displayLabel, '3 cups flour');

    // Export in checklist and indented Google Keep formats
    const checklist = useMealStore.getState().exportShoppingListForGoogleKeep('checklist');
    assert.match(checklist, /=== DAIRY & EGGS ===\n1\.5 cups milk/);
    assert.match(checklist, /=== PANTRY & DRY GOODS ===\n3 cups flour/);

    const indented = useMealStore.getState().exportShoppingListForGoogleKeep('indented');
    assert.match(indented, /=== DAIRY & EGGS ===\n  ☐ 1\.5 cups milk/);

    // Check off flour and clearCheckedItems()
    await useMealStore.getState().toggleShoppingItemChecked(flourItem.id);
    const cleared = await useMealStore.getState().clearCheckedItems();
    assert.equal(cleared, 1);
    assert.equal(useMealStore.getState().shoppingItems.length, 1);
    assert.equal(useMealStore.getState().shoppingItems[0].normalizedKey, 'milk');

    // Prunes scheduled meals older than 21 days while keeping recent/upcoming meals and Recipe Book
    const pruned = prunePastScheduledMeals(
      [
        {
          id: 'meal_2026-10-01_dinner',
          date: '2026-10-01',
          slot: 'dinner',
          title: 'Ancient Pasta',
          updatedAt: '2026-10-01T18:00:00.000Z',
        },
        {
          id: 'meal_2026-11-05_dinner',
          date: '2026-11-05',
          slot: 'dinner',
          title: 'Recent Tacos',
          updatedAt: '2026-11-05T18:00:00.000Z',
        },
        {
          id: 'meal_2026-11-14_dinner',
          date: '2026-11-14',
          slot: 'dinner',
          title: 'Upcoming Roast',
          updatedAt: '2026-11-11T18:00:00.000Z',
        },
      ],
      [],
      new Date(2026, 10, 11, 12, 0, 0) // 2026-11-11 local time -> cutoff 2026-10-21
    );
    assert.deepEqual(
      pruned.scheduledMeals.map((m) => m.date),
      ['2026-11-05', '2026-11-14']
    );
    assert.deepEqual(pruned.deletedScheduledMealIds, ['meal_2026-10-01_dinner']);
    assert.equal(useMealStore.getState().recipes.length, 1);
  });
});
