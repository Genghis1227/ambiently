import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateIngredients,
  categorizeIngredient,
  formatShoppingListForGoogleKeep,
  mergeIngredientsIntoShoppingList,
  parseIngredient,
} from '../src/utils/ingredientAggregator';
import { useMealStore } from '../src/stores/useMealStore';

describe('Smart Ingredient Parser & Aggregator', () => {
  it('parses unicode fractions, slash fractions, mixed numbers, and scaleFactor', () => {
    const halfCup = parseIngredient('½ cup milk');
    assert.equal(halfCup.quantity, 0.5);
    assert.equal(halfCup.unit, 'cup');
    assert.equal(halfCup.itemName, 'milk');
    assert.equal(halfCup.category, 'Dairy & Eggs');

    const mixedScaled = parseIngredient('1 1/2 tbsp olive oil', 2);
    assert.equal(mixedScaled.quantity, 3);
    assert.equal(mixedScaled.unit, 'tbsp');
    assert.equal(mixedScaled.itemName, 'olive oil');
    assert.equal(mixedScaled.category, 'Pantry & Dry Goods');

    const attachedUnicodeHalf = parseIngredient('1½ lbs chicken breast', 0.5);
    assert.equal(attachedUnicodeHalf.quantity, 0.75);
    assert.equal(attachedUnicodeHalf.unit, 'lb');
    assert.equal(attachedUnicodeHalf.itemName, 'chicken breast');
    assert.equal(attachedUnicodeHalf.category, 'Meat & Seafood');
  });

  it('merges identical count and volume units accurately', () => {
    const items = aggregateIngredients([
      '1 onion',
      '2 onions',
      '1/2 cup milk',
      '1 cup milk',
    ]);

    const onion = items.find((i) => i.normalizedKey === 'onion');
    const milk = items.find((i) => i.normalizedKey === 'milk');

    assert.ok(onion);
    assert.equal(onion.displayLabel, '3 onions');
    assert.equal(onion.category, 'Produce');

    assert.ok(milk);
    assert.equal(milk.displayLabel, '1.5 cups milk');
    assert.equal(milk.category, 'Dairy & Eggs');
  });

  it('converts compatible units within standard volume and weight families', () => {
    const items = aggregateIngredients([
      '8 oz ground beef',
      '1 lb ground beef',
      '3 tsp vanilla extract',
      '1 tbsp vanilla extract',
    ]);

    const beef = items.find((i) => i.normalizedKey === 'ground beef');
    const vanilla = items.find((i) => i.normalizedKey === 'vanilla extract');

    assert.ok(beef);
    assert.equal(beef.displayLabel, '1.5 lbs ground beef');

    assert.ok(vanilla);
    assert.equal(vanilla.displayLabel, '2 tbsp vanilla extract');
  });

  it('respects per-recipe scaleFactor (0.5x, 1x, 2x) when merging', () => {
    const items = aggregateIngredients([
      { raw: '1/2 cup milk', scaleFactor: 2 },
      { raw: '1 cup milk', scaleFactor: 0.5 },
    ]);

    assert.equal(items.length, 1);
    assert.equal(items[0].displayLabel, '1.5 cups milk');
  });

  it('combines incompatible units losslessly under normalized item key', () => {
    const items = aggregateIngredients([
      '1 large onion',
      '1 cup chopped onion',
    ]);

    assert.equal(items.length, 1);
    assert.equal(items[0].normalizedKey, 'onion');
    assert.equal(items[0].displayLabel, 'Onion (1 large + 1 cup chopped)');
    assert.equal(items[0].components.length, 2);
  });

  it('does not merge into already checked-off items when importing new ingredients', () => {
    const initial = aggregateIngredients(['2 onions']);
    initial[0].checked = true;

    const afterSecondImport = mergeIngredientsIntoShoppingList(initial, ['1 onion']);
    assert.equal(afterSecondImport.length, 2);
    assert.equal(afterSecondImport[0].checked, true);
    assert.equal(afterSecondImport[0].displayLabel, '2 onions');
    assert.equal(afterSecondImport[1].checked, false);
    assert.equal(afterSecondImport[1].displayLabel, '1 onion');
  });

  it('maps grocery keywords into all 8 store zones', () => {
    assert.equal(categorizeIngredient('avocado'), 'Produce');
    assert.equal(categorizeIngredient('salmon fillet'), 'Meat & Seafood');
    assert.equal(categorizeIngredient('greek yogurt'), 'Dairy & Eggs');
    assert.equal(categorizeIngredient('sourdough bread'), 'Bakery');
    assert.equal(categorizeIngredient('jasmine rice'), 'Pantry & Dry Goods');
    assert.equal(categorizeIngredient('frozen peas'), 'Frozen');
    assert.equal(categorizeIngredient('sparkling water'), 'Beverages');
    assert.equal(categorizeIngredient('paper towels'), 'Household & Other');
  });

  it('formats Google Keep exports in both checklist and indented modes', async () => {
    const recipe = await useMealStore.getState().upsertRecipe({
      title: 'Weeknight Stir Fry',
      ingredients: ['1 onion', '2 onions', '1/2 cup milk', '2 tbsp soy sauce'],
      instructions: ['Prep veggies', 'Stir fry'],
      tags: ['quick', 'dinner'],
    });

    // Selective import of indices [0, 1, 2]
    await useMealStore.getState().importRecipeIngredients(recipe.id, {
      selectedIndices: [0, 1, 2],
      scaleFactor: 1,
    });

    const checklistOut = useMealStore
      .getState()
      .exportShoppingListForGoogleKeep('checklist');
    assert.match(checklistOut, /=== PRODUCE ===\n3 onions/);
    assert.match(checklistOut, /=== DAIRY & EGGS ===\n0\.5 cup milk/);

    const indentedOut = useMealStore
      .getState()
      .exportShoppingListForGoogleKeep('indented');
    assert.match(indentedOut, /=== PRODUCE ===\n  ☐ 3 onions/);
    assert.match(indentedOut, /=== DAIRY & EGGS ===\n  ☐ 0\.5 cup milk/);

    // Check off milk and clearCheckedItems()
    const milkItem = useMealStore
      .getState()
      .shoppingItems.find((i) => i.normalizedKey === 'milk');
    assert.ok(milkItem);
    await useMealStore.getState().toggleShoppingItemChecked(milkItem.id);
    const cleared = await useMealStore.getState().clearCheckedItems();
    assert.equal(cleared, 1);
    assert.equal(useMealStore.getState().shoppingItems.length, 1);

    // Direct pure helper check with custom aisleOrder
    const customOut = formatShoppingListForGoogleKeep(
      aggregateIngredients(['1 sourdough bread', '2 avocados']),
      ['Bakery', 'Produce'],
      'checklist'
    );
    assert.equal(
      customOut,
      '=== BAKERY ===\n1 sourdough bread\n\n=== PRODUCE ===\n2 avocados'
    );
  });
});
