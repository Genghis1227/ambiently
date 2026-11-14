import { create } from 'zustand';
import { db, DEFAULT_MEAL_SNAPSHOT, DEFAULT_HOUSEHOLD_STAPLES } from '../services/db';
import {
  DEFAULT_AISLE_ORDER,
  type GoogleKeepExportMode,
  type GroceryCategory,
  type MealPlannerSnapshot,
  type MealSlot,
  type MetadataScrapeResponse,
  type Recipe,
  type ScheduledMeal,
  type ShoppingListItem,
  type StapleItem,
  type WeekStartDay,
  type WidgetMealScope,
} from '../types/meals';
import {
  formatShoppingListForGoogleKeep,
  mergeIngredientsIntoShoppingList,
  type IngredientInputSpec,
} from '../utils/ingredientAggregator';
import { localDateKey } from '../utils/dateKey';

let mealCloudSyncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let mealPersistListener: (() => void) | null = null;

export function registerMealPersistListener(listener: () => void): void {
  mealPersistListener = listener;
}

function generateMealId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

async function persistMealSnapshot(snapshot: MealPlannerSnapshot): Promise<void> {
  if (typeof indexedDB !== 'undefined') {
    try {
      await db.meals.put(snapshot);
    } catch (err) {
      console.warn('Failed to persist meal snapshot to IndexedDB:', err);
    }
  }

  if (mealCloudSyncDebounceTimer) {
    clearTimeout(mealCloudSyncDebounceTimer);
  }
  mealCloudSyncDebounceTimer = setTimeout(() => {
    try {
      mealPersistListener?.();
    } catch {
      // Ignore if offline or unauthenticated
    }
  }, 150);
}

function normalizeTags(tags?: string[]): string[] {
  if (!Array.isArray(tags)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const cleaned = (t || '').trim();
    const key = cleaned.toLowerCase();
    if (cleaned && !seen.has(key)) {
      seen.add(key);
      out.push(cleaned);
    }
  }
  return out;
}

export const KEEP_PAST_SCHEDULED_MEAL_DAYS = 21;
const MAX_DELETED_MEAL_TOMBSTONES = 250;

function addDaysToLocalDate(baseDate: Date, daysDelta: number): string {
  const next = new Date(
    baseDate.getFullYear(),
    baseDate.getMonth(),
    baseDate.getDate() + daysDelta,
    0,
    0,
    0,
    0
  );
  return localDateKey(next);
}

/**
 * Drops scheduled meals strictly older than `KEEP_PAST_SCHEDULED_MEAL_DAYS` (21 days) before
 * `referenceDate` so the calendar schedule stays compact over time while keeping Recipe Book
 * recipes permanently.
 */
export function prunePastScheduledMeals(
  meals: ScheduledMeal[],
  existingDeletedIds: string[] = [],
  referenceDate: Date = new Date()
): { scheduledMeals: ScheduledMeal[]; deletedScheduledMealIds: string[] } {
  const cutoffKey = addDaysToLocalDate(referenceDate, -KEEP_PAST_SCHEDULED_MEAL_DAYS);
  const kept: ScheduledMeal[] = [];
  const prunedIds: string[] = [];

  for (const meal of meals || []) {
    if (!meal || meal.deletedAt) continue;
    if (meal.date && meal.date < cutoffKey) {
      prunedIds.push(meal.id);
    } else {
      kept.push(meal);
    }
  }

  const combinedDeleted = Array.from(new Set([...existingDeletedIds, ...prunedIds])).slice(
    -MAX_DELETED_MEAL_TOMBSTONES
  );

  return {
    scheduledMeals: kept,
    deletedScheduledMealIds: combinedDeleted,
  };
}

function getWeekBounds(
  referenceDate: Date,
  weekStartsOn: WeekStartDay
): { startKey: string; endKey: string } {
  const day = referenceDate.getDay(); // 0 = Sun .. 6 = Sat
  const startDayNum = weekStartsOn === 'monday' ? 1 : 0;
  const offset = (day - startDayNum + 7) % 7;
  const startKey = addDaysToLocalDate(referenceDate, -offset);
  const endKey = addDaysToLocalDate(referenceDate, 6 - offset);
  return { startKey, endKey };
}

/**
 * Merges local and remote `MealPlannerSnapshot` states by per-record `updatedAt` and tombstones.
 */
export function mergeMealSnapshots(
  local: MealPlannerSnapshot,
  remote: MealPlannerSnapshot
): MealPlannerSnapshot {
  const localUpdated = Date.parse(local.updated_at || '') || 0;
  const remoteUpdated = Date.parse(remote.updated_at || '') || 0;
  const remoteWinsScalar = remoteUpdated >= localUpdated;

  const deletedRecipeIds = Array.from(
    new Set([...(local.deletedRecipeIds || []), ...(remote.deletedRecipeIds || [])])
  );
  const deletedRecipeSet = new Set(deletedRecipeIds);

  const localDeletedMealSet = new Set(local.deletedScheduledMealIds || []);
  const remoteDeletedMealSet = new Set(remote.deletedScheduledMealIds || []);
  const resurrectedMealIds = new Set<string>();

  for (const item of local.scheduledMeals || []) {
    if (!item || item.deletedAt || localDeletedMealSet.has(item.id)) continue;
    if (
      remoteDeletedMealSet.has(item.id) &&
      (Date.parse(item.updatedAt || '') || 0) > remoteUpdated
    ) {
      resurrectedMealIds.add(item.id);
    }
  }
  for (const item of remote.scheduledMeals || []) {
    if (!item || item.deletedAt || remoteDeletedMealSet.has(item.id)) continue;
    if (
      localDeletedMealSet.has(item.id) &&
      (Date.parse(item.updatedAt || '') || 0) > localUpdated
    ) {
      resurrectedMealIds.add(item.id);
    }
  }

  const deletedScheduledMealIds = Array.from(
    new Set([
      ...(local.deletedScheduledMealIds || []),
      ...(remote.deletedScheduledMealIds || []),
    ])
  ).filter((id) => !resurrectedMealIds.has(id));
  const deletedMealSet = new Set(deletedScheduledMealIds);

  const deletedShoppingItemIds = Array.from(
    new Set([
      ...(local.deletedShoppingItemIds || []),
      ...(remote.deletedShoppingItemIds || []),
    ])
  );
  const deletedShopSet = new Set(deletedShoppingItemIds);

  const deletedStapleIds = Array.from(
    new Set([...(local.deletedStapleIds || []), ...(remote.deletedStapleIds || [])])
  );
  const deletedStapleSet = new Set(deletedStapleIds);

  const mergeById = <T extends { id: string; updatedAt: string }>(
    localArr: T[],
    remoteArr: T[],
    deletedSet: Set<string>
  ): T[] => {
    const map = new Map<string, T>();
    for (const item of localArr || []) {
      if (!deletedSet.has(item.id) && !(item as { deletedAt?: string | null }).deletedAt) {
        map.set(item.id, item);
      }
    }
    for (const item of remoteArr || []) {
      if (deletedSet.has(item.id) || (item as { deletedAt?: string | null }).deletedAt) {
        map.delete(item.id);
        continue;
      }
      const existing = map.get(item.id);
      if (!existing) {
        map.set(item.id, item);
      } else {
        const lt = Date.parse(existing.updatedAt || '') || 0;
        const rt = Date.parse(item.updatedAt || '') || 0;
        if (rt >= lt) {
          map.set(item.id, item);
        }
      }
    }
    return Array.from(map.values());
  };

  const primary = remoteWinsScalar ? remote : local;
  const latestUpdatedAt = remoteWinsScalar ? remote.updated_at : local.updated_at;

  const mergedScheduledRaw = mergeById(
    local.scheduledMeals,
    remote.scheduledMeals,
    deletedMealSet
  );
  // Deduplicate by (date, slot) keeping the newer updatedAt so concurrent offline edits converge cleanly
  const dedupedBySlot = new Map<string, ScheduledMeal>();
  for (const meal of mergedScheduledRaw) {
    const slotKey = `${meal.date}_${meal.slot}`;
    const prev = dedupedBySlot.get(slotKey);
    if (!prev) {
      dedupedBySlot.set(slotKey, meal);
    } else {
      const prevTime = Date.parse(prev.updatedAt || '') || 0;
      const curTime = Date.parse(meal.updatedAt || '') || 0;
      if (curTime >= prevTime) {
        dedupedBySlot.set(slotKey, meal);
      }
    }
  }
  const mergedScheduled = Array.from(dedupedBySlot.values());
  const pruned = prunePastScheduledMeals(mergedScheduled, deletedScheduledMealIds);

  return {
    id: 'household_meals',
    recipes: mergeById(local.recipes, remote.recipes, deletedRecipeSet),
    scheduledMeals: pruned.scheduledMeals,
    shoppingItems: mergeById(local.shoppingItems, remote.shoppingItems, deletedShopSet),
    staples: mergeById(local.staples, remote.staples, deletedStapleSet),
    aisleOrder:
      Array.isArray(primary.aisleOrder) && primary.aisleOrder.length > 0
        ? primary.aisleOrder
        : [...DEFAULT_AISLE_ORDER],
    weekStartsOn: primary.weekStartsOn === 'monday' ? 'monday' : 'sunday',
    deletedRecipeIds,
    deletedScheduledMealIds: pruned.deletedScheduledMealIds,
    deletedShoppingItemIds,
    deletedStapleIds,
    updated_at: latestUpdatedAt || new Date().toISOString(),
  };
}

export interface MealStoreState {
  isInitialized: boolean;
  snapshot: MealPlannerSnapshot;
  recipes: Recipe[];
  scheduledMeals: ScheduledMeal[];
  shoppingItems: ShoppingListItem[];
  staples: StapleItem[];
  aisleOrder: GroceryCategory[];
  weekStartsOn: WeekStartDay;

  initMealStore: () => Promise<void>;
  applyRemoteMealSnapshot: (remote: MealPlannerSnapshot) => Promise<void>;

  // Recipes (custom & scraped with tags)
  upsertRecipe: (
    input: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt' | 'tags'> & {
      id?: string;
      tags?: string[];
    }
  ) => Promise<Recipe>;
  scrapeAndSaveRecipe: (
    url: string,
    tags?: string[]
  ) => Promise<{ success: boolean; recipe?: Recipe; error?: string }>;
  updateRecipeTags: (recipeId: string, tags: string[]) => Promise<void>;
  deleteRecipe: (recipeId: string) => Promise<void>;

  // Scheduled Meals
  scheduleMeal: (input: {
    id?: string;
    date: string;
    slot: MealSlot;
    title?: string;
    recipeId?: string;
    cookProfileId?: string;
    scaleFactor?: number;
    notes?: string;
  }) => Promise<ScheduledMeal>;
  updateScheduledMeal: (
    mealId: string,
    updates: Partial<Omit<ScheduledMeal, 'id' | 'updatedAt'>>
  ) => Promise<void>;
  removeScheduledMeal: (mealId: string) => Promise<void>;
  getMealsForScope: (scope: WidgetMealScope, referenceDate?: Date) => ScheduledMeal[];

  // Shopping List & Selective Ingredient Import
  importIngredientsToShoppingList: (
    inputs: (string | IngredientInputSpec)[],
    defaultScaleFactor?: number
  ) => Promise<ShoppingListItem[]>;
  importRecipeIngredients: (
    recipeId: string,
    options?: {
      selectedIndices?: number[];
      selectedLines?: string[];
      scaleFactor?: number;
      sourceMealId?: string;
    }
  ) => Promise<ShoppingListItem[]>;
  addShoppingItem: (
    rawLine: string,
    categoryOverride?: GroceryCategory
  ) => Promise<ShoppingListItem[]>;
  addStapleToShoppingList: (stapleId: string) => Promise<ShoppingListItem[]>;
  toggleShoppingItemChecked: (itemId: string) => Promise<void>;
  updateShoppingItem: (
    itemId: string,
    updates: Partial<Pick<ShoppingListItem, 'displayLabel' | 'category' | 'checked'>>
  ) => Promise<void>;
  removeShoppingItem: (itemId: string) => Promise<void>;
  clearCheckedItems: () => Promise<number>;

  // Staples & Settings
  upsertStaple: (
    input: Omit<StapleItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => Promise<StapleItem>;
  deleteStaple: (stapleId: string) => Promise<void>;
  setAisleOrder: (aisleOrder: GroceryCategory[]) => Promise<void>;
  setWeekStartsOn: (weekStartsOn: WeekStartDay) => Promise<void>;

  // Google Keep Export
  exportShoppingListForGoogleKeep: (
    mode?: GoogleKeepExportMode,
    options?: { includeChecked?: boolean }
  ) => string;
}

export const useMealStore = create<MealStoreState>((set, get) => {
  const commitMealState = (
    nextSnapshot: MealPlannerSnapshot,
    extra?: Partial<MealStoreState>
  ) => {
    set({
      ...extra,
      snapshot: nextSnapshot,
      recipes: nextSnapshot.recipes,
      scheduledMeals: nextSnapshot.scheduledMeals,
      shoppingItems: nextSnapshot.shoppingItems,
      staples: nextSnapshot.staples,
      aisleOrder: nextSnapshot.aisleOrder,
      weekStartsOn: nextSnapshot.weekStartsOn,
    });
  };

  return {
    isInitialized: false,
    snapshot: DEFAULT_MEAL_SNAPSHOT,
    recipes: DEFAULT_MEAL_SNAPSHOT.recipes,
    scheduledMeals: DEFAULT_MEAL_SNAPSHOT.scheduledMeals,
    shoppingItems: DEFAULT_MEAL_SNAPSHOT.shoppingItems,
    staples: DEFAULT_MEAL_SNAPSHOT.staples,
    aisleOrder: DEFAULT_MEAL_SNAPSHOT.aisleOrder,
    weekStartsOn: DEFAULT_MEAL_SNAPSHOT.weekStartsOn,

    initMealStore: async () => {
      try {
        const stored = await db.meals.get('household_meals');
        if (!stored) {
          await db.meals.put(DEFAULT_MEAL_SNAPSHOT);
          commitMealState(DEFAULT_MEAL_SNAPSHOT, { isInitialized: true });
          return;
        }

        const deletedStapleSet = new Set(stored.deletedStapleIds || []);
        const staples =
          Array.isArray(stored.staples) && stored.staples.length > 0
            ? stored.staples
            : DEFAULT_HOUSEHOLD_STAPLES.filter((s) => !deletedStapleSet.has(s.id));

        const pruned = prunePastScheduledMeals(
          stored.scheduledMeals || [],
          stored.deletedScheduledMealIds || []
        );

        const hydrated: MealPlannerSnapshot = {
          ...DEFAULT_MEAL_SNAPSHOT,
          ...stored,
          scheduledMeals: pruned.scheduledMeals,
          deletedScheduledMealIds: pruned.deletedScheduledMealIds,
          staples,
          aisleOrder:
            Array.isArray(stored.aisleOrder) && stored.aisleOrder.length > 0
              ? stored.aisleOrder
              : [...DEFAULT_AISLE_ORDER],
          weekStartsOn: stored.weekStartsOn === 'monday' ? 'monday' : 'sunday',
        };
        commitMealState(hydrated, { isInitialized: true });
      } catch (err) {
        console.warn('Failed to initialize meal store from IndexedDB:', err);
        commitMealState(DEFAULT_MEAL_SNAPSHOT, { isInitialized: true });
      }
    },

    applyRemoteMealSnapshot: async (remote) => {
      const storedLocal = get().isInitialized
        ? get().snapshot
        : typeof indexedDB !== 'undefined'
          ? await db.meals.get('household_meals').catch(() => undefined)
          : undefined;
      const local = storedLocal || remote;
      const merged = mergeMealSnapshots(local, remote);
      commitMealState(merged, { isInitialized: true });
      if (typeof indexedDB !== 'undefined') {
        try {
          await db.meals.put(merged);
        } catch (err) {
          console.warn('Failed to persist merged meal snapshot to IndexedDB:', err);
        }
      }
    },

    upsertRecipe: async (input) => {
      const current = get().snapshot;
      const nowIso = new Date().toISOString();
      const existing = input.id
        ? current.recipes.find((r) => r.id === input.id)
        : input.sourceUrl
          ? current.recipes.find(
              (r) =>
                r.sourceUrl &&
                r.sourceUrl.toLowerCase() === input.sourceUrl?.trim().toLowerCase()
            )
          : undefined;

      const id = existing?.id || input.id || generateMealId('recipe');
      const record: Recipe = {
        id,
        title: input.title.trim() || 'Untitled Recipe',
        sourceUrl: input.sourceUrl?.trim() || existing?.sourceUrl,
        imageUrl: input.imageUrl?.trim() || existing?.imageUrl,
        servings: input.servings ?? existing?.servings,
        prepTime: input.prepTime ?? existing?.prepTime,
        cookTime: input.cookTime ?? existing?.cookTime,
        ingredients: (input.ingredients || []).map((line) => line.trim()).filter(Boolean),
        instructions: (input.instructions || []).map((step) => step.trim()).filter(Boolean),
        tags: normalizeTags(input.tags ?? existing?.tags ?? []),
        notes: input.notes !== undefined ? input.notes : existing?.notes,
        isFavorite:
          input.isFavorite !== undefined ? input.isFavorite : existing?.isFavorite ?? false,
        createdAt: existing?.createdAt || nowIso,
        updatedAt: nowIso,
        deletedAt: null,
      };

      const nextRecipes = existing
        ? current.recipes.map((r) => (r.id === id ? record : r))
        : [record, ...current.recipes];

      const nextSnapshot: MealPlannerSnapshot = {
        ...current,
        recipes: nextRecipes,
        deletedRecipeIds: (current.deletedRecipeIds || []).filter((rid) => rid !== id),
        updated_at: nowIso,
      };

      commitMealState(nextSnapshot);
      await persistMealSnapshot(nextSnapshot);
      return record;
    },

    scrapeAndSaveRecipe: async (url, tags = []) => {
      const rawUrl = url.trim();
      if (!rawUrl) return { success: false, error: 'Missing recipe URL.' };

      const normalizedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
      try {
        const res = await fetch(`/api/metadata?url=${encodeURIComponent(normalizedUrl)}`);
        const data = (await res.json()) as MetadataScrapeResponse & { error?: string };

        if (!res.ok || data.error) {
          return {
            success: false,
            error: data.error || `Failed to scrape recipe (${res.status}).`,
          };
        }

        const scraped = data.recipe;
        const title = scraped?.title || data.title || 'Saved Recipe';
        const saved = await get().upsertRecipe({
          title,
          sourceUrl: data.sourceUrl || normalizedUrl,
          imageUrl: scraped?.image || data.imageUrl,
          servings: scraped?.servings,
          prepTime: scraped?.prepTime,
          cookTime: scraped?.cookTime,
          ingredients: scraped?.ingredients || [],
          instructions: scraped?.instructions || [],
          tags,
        });

        return { success: true, recipe: saved };
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : 'Could not reach recipe scraper.',
        };
      }
    },

    updateRecipeTags: async (recipeId, tags) => {
      const current = get().snapshot;
      const target = current.recipes.find((r) => r.id === recipeId);
      if (!target) return;

      const nowIso = new Date().toISOString();
      const updated: Recipe = {
        ...target,
        tags: normalizeTags(tags),
        updatedAt: nowIso,
      };
      const nextSnapshot: MealPlannerSnapshot = {
        ...current,
        recipes: current.recipes.map((r) => (r.id === recipeId ? updated : r)),
        updated_at: nowIso,
      };
      commitMealState(nextSnapshot);
      await persistMealSnapshot(nextSnapshot);
    },

    deleteRecipe: async (recipeId) => {
      const current = get().snapshot;
      const nowIso = new Date().toISOString();
      const nextDeletedRecipeIds = Array.from(
        new Set([...(current.deletedRecipeIds || []), recipeId])
      );
      const nextScheduled = current.scheduledMeals.map((m) =>
        m.recipeId === recipeId ? { ...m, recipeId: undefined, updatedAt: nowIso } : m
      );
      const nextSnapshot: MealPlannerSnapshot = {
        ...current,
        recipes: current.recipes.filter((r) => r.id !== recipeId),
        scheduledMeals: nextScheduled,
        deletedRecipeIds: nextDeletedRecipeIds,
        updated_at: nowIso,
      };
      commitMealState(nextSnapshot);
      await persistMealSnapshot(nextSnapshot);
    },

    scheduleMeal: async (input) => {
      const current = get().snapshot;
      const nowIso = new Date().toISOString();
      const linkedRecipe = input.recipeId
        ? current.recipes.find((r) => r.id === input.recipeId)
        : undefined;

      const deletedMealIdSet = new Set(current.deletedScheduledMealIds || []);
      const existing = input.id
        ? current.scheduledMeals.find((m) => !m.deletedAt && m.id === input.id)
        : current.scheduledMeals.find(
            (m) => !m.deletedAt && m.date === input.date && m.slot === input.slot
          );

      const id =
        existing?.id ||
        (input.id && !deletedMealIdSet.has(input.id) ? input.id : undefined) ||
        generateMealId('meal');
      const resolvedTitle =
        input.title?.trim() || linkedRecipe?.title || existing?.title || 'Planned Meal';

      const record: ScheduledMeal = {
        id,
        date: input.date,
        slot: input.slot,
        title: resolvedTitle,
        recipeId: input.recipeId !== undefined ? input.recipeId : existing?.recipeId,
        cookProfileId:
          input.cookProfileId !== undefined ? input.cookProfileId : existing?.cookProfileId,
        scaleFactor:
          input.scaleFactor !== undefined ? input.scaleFactor : existing?.scaleFactor ?? 1,
        notes: input.notes !== undefined ? input.notes : existing?.notes,
        updatedAt: nowIso,
        deletedAt: null,
      };

      const nextMealsRaw = existing
        ? current.scheduledMeals.map((m) => (m.id === id ? record : m))
        : [...current.scheduledMeals, record];

      const cleanedDeletedIds = (current.deletedScheduledMealIds || []).filter(
        (mid) => mid !== id
      );
      const pruned = prunePastScheduledMeals(nextMealsRaw, cleanedDeletedIds);

      const nextSnapshot: MealPlannerSnapshot = {
        ...current,
        scheduledMeals: pruned.scheduledMeals,
        deletedScheduledMealIds: pruned.deletedScheduledMealIds,
        updated_at: nowIso,
      };

      commitMealState(nextSnapshot);
      await persistMealSnapshot(nextSnapshot);
      return record;
    },

    updateScheduledMeal: async (mealId, updates) => {
      const current = get().snapshot;
      const existing = current.scheduledMeals.find((m) => m.id === mealId);
      if (!existing) return;

      const nowIso = new Date().toISOString();
      const updated: ScheduledMeal = {
        ...existing,
        ...updates,
        updatedAt: nowIso,
      };

      const nextSnapshot: MealPlannerSnapshot = {
        ...current,
        scheduledMeals: current.scheduledMeals.map((m) =>
          m.id === mealId ? updated : m
        ),
        updated_at: nowIso,
      };

      commitMealState(nextSnapshot);
      await persistMealSnapshot(nextSnapshot);
    },

    removeScheduledMeal: async (mealId) => {
      const current = get().snapshot;
      const nowIso = new Date().toISOString();
      const nextDeletedMealIds = Array.from(
        new Set([...(current.deletedScheduledMealIds || []), mealId])
      );

      const nextSnapshot: MealPlannerSnapshot = {
        ...current,
        scheduledMeals: current.scheduledMeals.filter((m) => m.id !== mealId),
        deletedScheduledMealIds: nextDeletedMealIds,
        updated_at: nowIso,
      };

      commitMealState(nextSnapshot);
      await persistMealSnapshot(nextSnapshot);
    },

    getMealsForScope: (scope, referenceDate = new Date()) => {
      const { scheduledMeals, weekStartsOn } = get();
      let startKey: string;
      let endKey: string;

      if (scope === 'today') {
        startKey = localDateKey(referenceDate);
        endKey = startKey;
      } else if (scope === 'tomorrow') {
        startKey = addDaysToLocalDate(referenceDate, 1);
        endKey = startKey;
      } else if (scope === 'three_day') {
        startKey = localDateKey(referenceDate);
        endKey = addDaysToLocalDate(referenceDate, 2);
      } else {
        const bounds = getWeekBounds(referenceDate, weekStartsOn);
        startKey = bounds.startKey;
        endKey = bounds.endKey;
      }

      const slotOrder: Record<MealSlot, number> = {
        breakfast: 0,
        lunch: 1,
        dinner: 2,
      };

      return scheduledMeals
        .filter((m) => !m.deletedAt && m.date >= startKey && m.date <= endKey)
        .slice()
        .sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return (slotOrder[a.slot] ?? 9) - (slotOrder[b.slot] ?? 9);
        });
    },

    importIngredientsToShoppingList: async (inputs, defaultScaleFactor = 1) => {
      if (!inputs || inputs.length === 0) return get().shoppingItems;
      const current = get().snapshot;
      const nowIso = new Date().toISOString();
      const nextShoppingItems = mergeIngredientsIntoShoppingList(
        current.shoppingItems,
        inputs,
        defaultScaleFactor
      );

      const nextSnapshot: MealPlannerSnapshot = {
        ...current,
        shoppingItems: nextShoppingItems,
        updated_at: nowIso,
      };

      commitMealState(nextSnapshot);
      await persistMealSnapshot(nextSnapshot);
      return nextShoppingItems;
    },

    importRecipeIngredients: async (recipeId, options) => {
      const current = get().snapshot;
      const recipe = current.recipes.find((r) => r.id === recipeId);
      if (!recipe) return current.shoppingItems;

      const scaleFactor = options?.scaleFactor ?? 1;
      let linesToImport: string[];

      if (Array.isArray(options?.selectedLines)) {
        linesToImport = options.selectedLines;
      } else if (Array.isArray(options?.selectedIndices)) {
        const idxSet = new Set(options.selectedIndices);
        linesToImport = recipe.ingredients.filter((_, idx) => idxSet.has(idx));
      } else {
        linesToImport = recipe.ingredients;
      }

      const specs: IngredientInputSpec[] = linesToImport.map((raw) => ({
        raw,
        scaleFactor,
        sourceRecipeId: recipe.id,
        sourceMealId: options?.sourceMealId,
      }));

      return get().importIngredientsToShoppingList(specs, scaleFactor);
    },

    addShoppingItem: async (rawLine, categoryOverride) => {
      const trimmed = rawLine.trim();
      if (!trimmed) return get().shoppingItems;
      return get().importIngredientsToShoppingList([
        {
          raw: trimmed,
          scaleFactor: 1,
          categoryOverride,
        },
      ]);
    },

    addStapleToShoppingList: async (stapleId) => {
      const staple = get().staples.find((s) => s.id === stapleId);
      if (!staple) return get().shoppingItems;

      const qtyPart =
        staple.defaultQuantity !== null && staple.defaultQuantity !== undefined
          ? `${staple.defaultQuantity} `
          : '';
      const unitPart = staple.defaultUnit ? `${staple.defaultUnit} ` : '';
      const raw = `${qtyPart}${unitPart}${staple.name}`.trim();

      return get().importIngredientsToShoppingList([
        {
          raw,
          scaleFactor: 1,
          categoryOverride: staple.category,
        },
      ]);
    },

    toggleShoppingItemChecked: async (itemId) => {
      const current = get().snapshot;
      const target = current.shoppingItems.find((i) => i.id === itemId);
      if (!target) return;

      const nowIso = new Date().toISOString();
      const nextItems = current.shoppingItems.map((i) =>
        i.id === itemId ? { ...i, checked: !i.checked, updatedAt: nowIso } : i
      );

      const nextSnapshot: MealPlannerSnapshot = {
        ...current,
        shoppingItems: nextItems,
        updated_at: nowIso,
      };
      commitMealState(nextSnapshot);
      await persistMealSnapshot(nextSnapshot);
    },

    updateShoppingItem: async (itemId, updates) => {
      const current = get().snapshot;
      const target = current.shoppingItems.find((i) => i.id === itemId);
      if (!target) return;

      const nowIso = new Date().toISOString();
      const nextItems = current.shoppingItems.map((i) =>
        i.id === itemId ? { ...i, ...updates, updatedAt: nowIso } : i
      );

      const nextSnapshot: MealPlannerSnapshot = {
        ...current,
        shoppingItems: nextItems,
        updated_at: nowIso,
      };
      commitMealState(nextSnapshot);
      await persistMealSnapshot(nextSnapshot);
    },

    removeShoppingItem: async (itemId) => {
      const current = get().snapshot;
      const nowIso = new Date().toISOString();
      const nextDeletedShopIds = Array.from(
        new Set([...(current.deletedShoppingItemIds || []), itemId])
      );
      const nextSnapshot: MealPlannerSnapshot = {
        ...current,
        shoppingItems: current.shoppingItems.filter((i) => i.id !== itemId),
        deletedShoppingItemIds: nextDeletedShopIds,
        updated_at: nowIso,
      };
      commitMealState(nextSnapshot);
      await persistMealSnapshot(nextSnapshot);
    },

    clearCheckedItems: async () => {
      const current = get().snapshot;
      const checkedItems = current.shoppingItems.filter((i) => i.checked);
      if (checkedItems.length === 0) return 0;

      const nowIso = new Date().toISOString();
      const removedIds = checkedItems.map((i) => i.id);
      const nextDeletedShopIds = Array.from(
        new Set([...(current.deletedShoppingItemIds || []), ...removedIds])
      );
      const nextSnapshot: MealPlannerSnapshot = {
        ...current,
        shoppingItems: current.shoppingItems.filter((i) => !i.checked),
        deletedShoppingItemIds: nextDeletedShopIds,
        updated_at: nowIso,
      };

      commitMealState(nextSnapshot);
      await persistMealSnapshot(nextSnapshot);
      return checkedItems.length;
    },

    upsertStaple: async (input) => {
      const current = get().snapshot;
      const nowIso = new Date().toISOString();
      const existing = input.id
        ? current.staples.find((s) => s.id === input.id)
        : undefined;
      const id = existing?.id || input.id || generateMealId('staple');

      const record: StapleItem = {
        id,
        name: input.name.trim() || 'Staple',
        defaultQuantity: input.defaultQuantity ?? existing?.defaultQuantity ?? null,
        defaultUnit: input.defaultUnit ?? existing?.defaultUnit ?? null,
        category: input.category,
        createdAt: existing?.createdAt || nowIso,
        updatedAt: nowIso,
      };

      const nextStaples = existing
        ? current.staples.map((s) => (s.id === id ? record : s))
        : [...current.staples, record];

      const nextSnapshot: MealPlannerSnapshot = {
        ...current,
        staples: nextStaples,
        deletedStapleIds: (current.deletedStapleIds || []).filter((sid) => sid !== id),
        updated_at: nowIso,
      };

      commitMealState(nextSnapshot);
      await persistMealSnapshot(nextSnapshot);
      return record;
    },

    deleteStaple: async (stapleId) => {
      const current = get().snapshot;
      const nowIso = new Date().toISOString();
      const nextDeletedStapleIds = Array.from(
        new Set([...(current.deletedStapleIds || []), stapleId])
      );

      const nextSnapshot: MealPlannerSnapshot = {
        ...current,
        staples: current.staples.filter((s) => s.id !== stapleId),
        deletedStapleIds: nextDeletedStapleIds,
        updated_at: nowIso,
      };

      commitMealState(nextSnapshot);
      await persistMealSnapshot(nextSnapshot);
    },

    setAisleOrder: async (aisleOrder) => {
      if (!Array.isArray(aisleOrder) || aisleOrder.length === 0) return;
      const current = get().snapshot;
      const nowIso = new Date().toISOString();
      const nextSnapshot: MealPlannerSnapshot = {
        ...current,
        aisleOrder: [...aisleOrder],
        updated_at: nowIso,
      };
      commitMealState(nextSnapshot);
      await persistMealSnapshot(nextSnapshot);
    },

    setWeekStartsOn: async (weekStartsOn) => {
      const current = get().snapshot;
      const nowIso = new Date().toISOString();
      const nextSnapshot: MealPlannerSnapshot = {
        ...current,
        weekStartsOn,
        updated_at: nowIso,
      };
      commitMealState(nextSnapshot);
      await persistMealSnapshot(nextSnapshot);
    },

    exportShoppingListForGoogleKeep: (mode = 'checklist', options) => {
      const { shoppingItems, aisleOrder } = get();
      return formatShoppingListForGoogleKeep(shoppingItems, aisleOrder, mode, options);
    },
  };
});
