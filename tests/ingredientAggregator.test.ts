import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateIngredients,
  categorizeIngredient,
  formatShoppingListForGoogleKeep,
  mergeIngredientsIntoShoppingList,
  parseIngredient,
  singularizeWord,
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

  it('keeps words like olives and chives intact on the shopping list', () => {
    assert.equal(singularizeWord('olives'), 'olive');
    assert.equal(singularizeWord('chives'), 'chive');
    assert.equal(singularizeWord('cloves'), 'clove');
    assert.equal(singularizeWord('endives'), 'endive');
    assert.equal(singularizeWord('glasses'), 'glass');
    // Real "-f" plurals still work
    assert.equal(singularizeWord('leaves'), 'leaf');
    assert.equal(singularizeWord('loaves'), 'loaf');
    assert.equal(singularizeWord('halves'), 'half');
    assert.equal(singularizeWord('knives'), 'knife');

    const list = aggregateIngredients([
      '1 cup kalamata olives',
      '1/2 cup kalamata olives',
      '2 tbsp chives',
      '10 basil leaves',
    ]);
    const labels = list.map((i) => i.displayLabel);
    assert.ok(labels.includes('1.5 cups kalamata olive'), labels.join(' | '));
    assert.ok(labels.includes('2 tbsp chive'), labels.join(' | '));
    assert.ok(labels.includes('10 basil leaves'), labels.join(' | '));
    assert.equal(list.find((i) => i.normalizedKey === 'kalamata olive')?.category, 'Pantry & Dry Goods');
    assert.equal(list.find((i) => i.normalizedKey === 'chive')?.category, 'Produce');
    assert.equal(labels.some((l) => /olif|chif/i.test(l)), false);
  });

  it('reads a package size in brackets before the unit', () => {
    const canned = parseIngredient('1 (14 oz) can diced tomatoes');
    assert.equal(canned.quantity, 1);
    assert.equal(canned.unit, 'can');
    assert.equal(canned.itemName, 'tomato');
    assert.equal(canned.notes, '14 oz, diced');

    const creamCheese = parseIngredient('1 (8 oz) package cream cheese, softened');
    assert.equal(creamCheese.unit, 'pkg');
    assert.equal(creamCheese.itemName, 'cream cheese');
    assert.equal(creamCheese.notes, '8 oz, softened');

    // Brackets not followed by a unit keep working as before
    const tortillas = parseIngredient('2 (6 inch) tortillas');
    assert.equal(tortillas.unit, null);
    assert.equal(tortillas.itemName, 'tortilla');
    assert.equal(tortillas.notes, '6 inch');

    const list = aggregateIngredients([
      '1 (15 oz) can black beans, drained',
      '1 can black beans',
      '1 (14 oz) can diced tomatoes',
      '2 cans diced tomatoes',
    ]);
    assert.equal(list.length, 2);
    const beans = list.find((i) => i.normalizedKey === 'black bean');
    const tomatoes = list.find((i) => i.normalizedKey === 'tomato');
    assert.equal(beans?.displayLabel, '2 cans black bean (15 oz, drained)');
    assert.equal(tomatoes?.displayLabel, '3 cans tomato (14 oz, diced)');
  });
});
