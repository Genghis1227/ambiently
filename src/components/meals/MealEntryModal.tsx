import type React from 'react';
import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Utensils,
  BookOpen,
  Link2,
  Globe,
  Search,
  Plus,
  Trash2,
  Check,
  Sparkles,
  ShoppingBag,
  Clock,
  Users,
  Heart,
  Edit3,
  Loader2,
  AlertCircle,
  Tag,
  Calendar,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import type {
  MealSlot,
  MetadataScrapeResponse,
  Recipe,
  ScheduledMeal,
} from '../../types/meals';
import { useMealStore } from '../../stores/useMealStore';
import { useProfileStore } from '../../stores/useProfileStore';
import {
  formatQuantity,
  formatUnitForQuantity,
  normalizeItemNameSingular,
  parseIngredient,
  pluralizeItemName,
} from '../../utils/ingredientAggregator';
import { localDateKey, parseDateKey } from '../../utils/dateKey';
import { ProfileAvatar } from '../common/ProfileAvatar';

function parseIngredientLine(
  line: string,
  scaleFactor: number
): {
  quantityLabel: string | null;
  itemLabel: string;
  notesLabel: string;
} {
  const trimmed = line.trim();
  if (!trimmed) {
    return { quantityLabel: null, itemLabel: '', notesLabel: '' };
  }
  const parsed = parseIngredient(trimmed, scaleFactor);
  if (parsed.quantity === null) {
    return { quantityLabel: null, itemLabel: trimmed, notesLabel: '' };
  }
  const qtyText = formatQuantity(parsed.quantity);
  const unitText = parsed.unit
    ? formatUnitForQuantity(parsed.unit, parsed.quantity)
    : null;
  const quantityLabel = unitText ? `${qtyText} ${unitText}` : qtyText;
  const baseName = parsed.itemName || trimmed;
  const itemLabel =
    !parsed.unit && parsed.quantity > 1
      ? pluralizeItemName(baseName)
      : baseName;
  return {
    quantityLabel,
    itemLabel,
    notesLabel: parsed.notes || '',
  };
}

export interface MealEntryModalProps {
  isOpen: boolean;
  date: string; // "YYYY-MM-DD"
  initialSlot?: MealSlot;
  editingMeal?: ScheduledMeal | null;
  initialMode?: 'quick' | 'recipe';
  defaultCookProfileId?: string;
  isLight?: boolean;
  onClose: () => void;
  onSaved?: (meal: ScheduledMeal) => void;
}

type EntryMode = 'quick' | 'recipe';
type RecipeSourceTab = 'book' | 'url' | 'mealdb';

interface EditableRecipeDraft {
  id?: string;
  title: string;
  sourceUrl: string;
  imageUrl: string;
  servings: string;
  prepTime: string;
  cookTime: string;
  ingredientsText: string;
  instructionsText: string;
  tags: string[];
  notes: string;
  isFavorite: boolean;
}

interface MealDbMealRecord {
  idMeal: string;
  strMeal: string;
  strCategory?: string | null;
  strArea?: string | null;
  strInstructions?: string | null;
  strMealThumb?: string | null;
  strTags?: string | null;
  strSource?: string | null;
  strYoutube?: string | null;
  [key: string]: unknown;
}

const PRESET_RECIPE_TAGS: readonly string[] = [
  'Quick',
  'Slow Cooker',
  'Kids Love',
  'One Pan',
  'Vegetarian',
  'Meal Prep',
];

const QUICK_MEAL_SUGGESTIONS: readonly string[] = [
  'Leftovers',
  'Tacos',
  'Pasta Night',
  'Homemade Pizza',
  'Stir-Fry',
  'Takeout',
];

const SCALE_OPTIONS: readonly number[] = [0.5, 1, 2];

const BASIC_PANTRY_KEYS: ReadonlySet<string> = new Set([
  'water',
  'salt',
  'kosher salt',
  'sea salt',
  'black pepper',
  'pepper',
  'ice',
]);

const SLOT_OPTIONS: readonly {
  id: MealSlot;
  label: string;
  activeDark: string;
  activeLight: string;
}[] = [
  {
    id: 'breakfast',
    label: 'Breakfast',
    activeDark: 'bg-amber-950/60 border-amber-600/60 text-amber-100',
    activeLight: 'bg-amber-100/90 border-amber-400/80 text-amber-950',
  },
  {
    id: 'lunch',
    label: 'Lunch',
    activeDark: 'bg-emerald-950/60 border-emerald-600/60 text-emerald-100',
    activeLight: 'bg-emerald-100/90 border-emerald-400/80 text-emerald-950',
  },
  {
    id: 'dinner',
    label: 'Dinner',
    activeDark: 'bg-slate-800 border-slate-500/70 text-slate-100',
    activeLight: 'bg-slate-200 border-slate-400 text-slate-900',
  },
];

function createEmptyDraft(): EditableRecipeDraft {
  return {
    title: '',
    sourceUrl: '',
    imageUrl: '',
    servings: '',
    prepTime: '',
    cookTime: '',
    ingredientsText: '',
    instructionsText: '',
    tags: [],
    notes: '',
    isFavorite: false,
  };
}

function recipeToDraft(recipe: Recipe): EditableRecipeDraft {
  return {
    id: recipe.id,
    title: recipe.title,
    sourceUrl: recipe.sourceUrl || '',
    imageUrl: recipe.imageUrl || '',
    servings: recipe.servings || '',
    prepTime: recipe.prepTime || '',
    cookTime: recipe.cookTime || '',
    ingredientsText: recipe.ingredients.join('\n'),
    instructionsText: recipe.instructions.join('\n'),
    tags: [...recipe.tags],
    notes: recipe.notes || '',
    isFavorite: Boolean(recipe.isFavorite),
  };
}

function mapMealDbRecordToDraft(record: MealDbMealRecord): EditableRecipeDraft {
  const ingredients: string[] = [];
  for (let i = 1; i <= 20; i += 1) {
    const rawIng = record[`strIngredient${i}`];
    const rawMeasure = record[`strMeasure${i}`];
    const ing = typeof rawIng === 'string' ? rawIng.trim() : '';
    const measure = typeof rawMeasure === 'string' ? rawMeasure.trim() : '';
    if (ing) {
      ingredients.push(measure ? `${measure} ${ing}`.trim() : ing);
    }
  }

  const rawInstructions =
    typeof record.strInstructions === 'string' ? record.strInstructions : '';
  const instructions = rawInstructions
    .split(/\r?\n+/)
    .map((line) =>
      line.replace(/^\s*(?:step\s*\d+\s*[:.-]?|\d+\s*[.)])\s*/i, '').trim()
    )
    .filter(Boolean);

  const rawTagList: string[] = [];
  if (typeof record.strCategory === 'string' && record.strCategory.trim()) {
    rawTagList.push(record.strCategory.trim());
  }
  if (typeof record.strArea === 'string' && record.strArea.trim()) {
    rawTagList.push(record.strArea.trim());
  }
  if (typeof record.strTags === 'string' && record.strTags.trim()) {
    for (const piece of record.strTags.split(',')) {
      const cleaned = piece.trim();
      if (cleaned) rawTagList.push(cleaned);
    }
  }
  const dedupedTags = Array.from(new Set(rawTagList)).slice(0, 6);

  return {
    title: record.strMeal || 'TheMealDB Recipe',
    sourceUrl:
      (typeof record.strSource === 'string' && record.strSource.trim()) ||
      (typeof record.strYoutube === 'string' && record.strYoutube.trim()) ||
      '',
    imageUrl:
      (typeof record.strMealThumb === 'string' && record.strMealThumb.trim()) ||
      '',
    servings: '4 servings',
    prepTime: '',
    cookTime: '',
    ingredientsText: ingredients.join('\n'),
    instructionsText: instructions.join('\n'),
    tags: dedupedTags,
    notes: '',
    isFavorite: false,
  };
}

function formatReadableDate(dateKey: string): string {
  try {
    const d = parseDateKey(dateKey);
    return d.toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateKey;
  }
}

interface MealEntryContentProps {
  date: string;
  initialSlot: MealSlot;
  editingMeal?: ScheduledMeal | null;
  initialMode?: 'quick' | 'recipe';
  defaultCookProfileId?: string;
  isLight: boolean;
  onClose: () => void;
  onSaved?: (meal: ScheduledMeal) => void;
}

const MealEntryModalContent: React.FC<MealEntryContentProps> = ({
  date,
  initialSlot,
  editingMeal,
  initialMode,
  defaultCookProfileId,
  isLight,
  onClose,
  onSaved,
}) => {
  const recipes = useMealStore((s) => s.recipes);
  const scheduledMeals = useMealStore((s) => s.scheduledMeals);
  const staples = useMealStore((s) => s.staples);
  const upsertRecipe = useMealStore((s) => s.upsertRecipe);
  const updateRecipeTags = useMealStore((s) => s.updateRecipeTags);
  const deleteRecipe = useMealStore((s) => s.deleteRecipe);
  const scheduleMeal = useMealStore((s) => s.scheduleMeal);
  const updateScheduledMeal = useMealStore((s) => s.updateScheduledMeal);
  const removeScheduledMeal = useMealStore((s) => s.removeScheduledMeal);
  const importRecipeIngredients = useMealStore(
    (s) => s.importRecipeIngredients
  );

  const profiles = useProfileStore((s) => s.profiles);
  const isProfileStoreInitialized = useProfileStore((s) => s.isInitialized);

  useEffect(() => {
    if (!isProfileStoreInitialized) {
      void useProfileStore.getState().initProfileStore();
    }
  }, [isProfileStoreInitialized]);

  const weekStartsOn = useMealStore((s) => s.weekStartsOn);

  // Core slot & assignment state
  const [selectedDate, setSelectedDate] = useState<string>(
    () => editingMeal?.date || date
  );
  const [selectedSlot, setSelectedSlot] = useState<MealSlot>(
    () => editingMeal?.slot || initialSlot
  );
  const [isCalendarOpen, setIsCalendarOpen] = useState<boolean>(false);
  const [calendarMonthDate, setCalendarMonthDate] = useState<Date>(() => {
    try {
      const parsed = parseDateKey(editingMeal?.date || date);
      return new Date(parsed.getFullYear(), parsed.getMonth(), 1);
    } catch {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), 1);
    }
  });

  const [todayKey] = useState<string>(() => localDateKey(new Date()));
  const [tomorrowKey] = useState<string>(() => {
    const now = new Date();
    return localDateKey(
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    );
  });

  const stepSelectedDateByDays = (deltaDays: number) => {
    try {
      const cur = parseDateKey(selectedDate);
      const next = new Date(
        cur.getFullYear(),
        cur.getMonth(),
        cur.getDate() + deltaDays
      );
      const nextKey = localDateKey(next);
      setCalendarMonthDate(new Date(next.getFullYear(), next.getMonth(), 1));
      syncFromTargetSlot(nextKey, selectedSlot);
    } catch {
      // Ignore invalid date
    }
  };

  const calendarDaysGrid = useMemo(() => {
    const year = calendarMonthDate.getFullYear();
    const month = calendarMonthDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startDayIndex = weekStartsOn === 'monday' ? 1 : 0;
    const leadingOffset = (firstOfMonth.getDay() - startDayIndex + 7) % 7;
    const gridStart = new Date(year, month, 1 - leadingOffset);

    const slotOrder: Record<MealSlot, number> = {
      breakfast: 0,
      lunch: 1,
      dinner: 2,
    };
    const mealsByDay = new Map<string, ScheduledMeal[]>();
    const slotsByDay = new Map<string, Set<MealSlot>>();
    for (const m of scheduledMeals) {
      if (m.deletedAt) continue;
      const set = slotsByDay.get(m.date) || new Set<MealSlot>();
      set.add(m.slot);
      slotsByDay.set(m.date, set);
      const list = mealsByDay.get(m.date) || [];
      list.push(m);
      mealsByDay.set(m.date, list);
    }
    for (const list of mealsByDay.values()) {
      list.sort((a, b) => (slotOrder[a.slot] ?? 9) - (slotOrder[b.slot] ?? 9));
    }

    return Array.from({ length: 42 }, (_, idx) => {
      const d = new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate() + idx
      );
      const key = localDateKey(d);
      return {
        date: d,
        dateKey: key,
        dayNumber: d.getDate(),
        inCurrentMonth: d.getMonth() === month,
        isToday: key === todayKey,
        isSelected: key === selectedDate,
        scheduledSlots: slotsByDay.get(key) || new Set<MealSlot>(),
        dayMeals: mealsByDay.get(key) || [],
      };
    });
  }, [
    calendarMonthDate,
    weekStartsOn,
    scheduledMeals,
    todayKey,
    selectedDate,
  ]);

  const existingMealAtSlot = useMemo(
    () =>
      scheduledMeals.find(
        (m) =>
          !m.deletedAt &&
          m.date === selectedDate &&
          m.slot === selectedSlot
      ) || null,
    [scheduledMeals, selectedDate, selectedSlot]
  );

  const effectiveEditingMeal = editingMeal || existingMealAtSlot;

  const [cookProfileId, setCookProfileId] = useState<string>(
    () =>
      (editingMeal || existingMealAtSlot)?.cookProfileId ||
      defaultCookProfileId ||
      ''
  );
  const [mealNotes, setMealNotes] = useState<string>(
    () => (editingMeal || existingMealAtSlot)?.notes || ''
  );

  // Mode state
  const [mode, setMode] = useState<EntryMode>(() => {
    if (initialMode) return initialMode;
    return (editingMeal || existingMealAtSlot)?.recipeId ? 'recipe' : 'quick';
  });

  // Quick-text state
  const [quickTitle, setQuickTitle] = useState<string>(() => {
    const initialMeal = editingMeal || existingMealAtSlot;
    return initialMeal && !initialMeal.recipeId ? initialMeal.title : '';
  });

  // Dynamic recent + starter quick-meal suggestions (filters as user types)
  const dynamicQuickSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const items: {
      title: string;
      source: 'recent' | 'starter';
      cookProfileId?: string;
      notes?: string;
    }[] = [];

    const sortedRecent = [...scheduledMeals]
      .filter((m) => !m.deletedAt && m.title.trim())
      .sort(
        (a, b) =>
          (Date.parse(b.updatedAt || '') || 0) -
          (Date.parse(a.updatedAt || '') || 0)
      );

    for (const m of sortedRecent) {
      const title = m.title.trim();
      const key = title.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        items.push({
          title,
          source: 'recent',
          cookProfileId: m.cookProfileId,
          notes: m.notes,
        });
      }
    }

    for (const r of recipes) {
      if (r.deletedAt || !r.title.trim()) continue;
      const title = r.title.trim();
      const key = title.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        items.push({ title, source: 'recent' });
      }
    }

    for (const starter of QUICK_MEAL_SUGGESTIONS) {
      const key = starter.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        items.push({ title: starter, source: 'starter' });
      }
    }

    const query = quickTitle.trim().toLowerCase();
    return items
      .filter((item) => !query || item.title.toLowerCase().includes(query))
      .slice(0, 8);
  }, [scheduledMeals, recipes, quickTitle]);

  // Recipe-linked state
  const [sourceTab, setSourceTab] = useState<RecipeSourceTab>('book');
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>(
    () => (editingMeal || existingMealAtSlot)?.recipeId || ''
  );
  const [scaleFactor, setScaleFactor] = useState<number>(() => {
    const initial = (editingMeal || existingMealAtSlot)?.scaleFactor;
    return typeof initial === 'number' && initial > 0 ? initial : 1;
  });

  // Recipe Book search & filter state
  const [bookSearch, setBookSearch] = useState<string>('');
  const [activeTagFilter, setActiveTagFilter] = useState<string>('');
  const [favoritesOnly, setFavoritesOnly] = useState<boolean>(false);
  const [confirmDeleteRecipeId, setConfirmDeleteRecipeId] = useState<
    string | null
  >(null);

  // Editable Recipe Preview / Custom Creator state
  const [isEditingDraft, setIsEditingDraft] = useState<boolean>(false);
  const [draft, setDraft] = useState<EditableRecipeDraft>(() =>
    createEmptyDraft()
  );
  const [customTagInput, setCustomTagInput] = useState<string>('');
  const [isSavingDraft, setIsSavingDraft] = useState<boolean>(false);

  // URL Scraper state
  const [scrapeUrlInput, setScrapeUrlInput] = useState<string>('');
  const [isScrapingUrl, setIsScrapingUrl] = useState<boolean>(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);

  // TheMealDB Fallback Search state
  const [mealDbQuery, setMealDbQuery] = useState<string>('');
  const [mealDbResults, setMealDbResults] = useState<MealDbMealRecord[]>([]);
  const [isSearchingMealDb, setIsSearchingMealDb] = useState<boolean>(false);
  const [mealDbError, setMealDbError] = useState<string | null>(null);
  const [hasSearchedMealDb, setHasSearchedMealDb] = useState<boolean>(false);

  // Selective Ingredient Import state
  const stapleKeySet = useMemo(() => {
    const set = new Set<string>();
    for (const st of staples) {
      const normalized = normalizeItemNameSingular(st.name);
      if (normalized) set.add(normalized);
    }
    return set;
  }, [staples]);

  const computeDefaultCheckedIndices = (recipe: Recipe | undefined): Set<number> => {
    if (!recipe) return new Set();
    const checked = new Set<number>();
    recipe.ingredients.forEach((line, idx) => {
      const parsed = parseIngredient(line, 1);
      const itemKey = normalizeItemNameSingular(parsed.itemName);
      if (!BASIC_PANTRY_KEYS.has(itemKey)) {
        checked.add(idx);
      }
    });
    return checked;
  };

  const [importToShoppingList, setImportToShoppingList] =
    useState<boolean>(false);
  const [selectedIngredientIndices, setSelectedIngredientIndices] = useState<
    Set<number>
  >(() => {
    const initialMeal = editingMeal || existingMealAtSlot;
    const initialRecipe = initialMeal?.recipeId
      ? recipes.find((r) => r.id === initialMeal.recipeId)
      : undefined;
    return computeDefaultCheckedIndices(initialRecipe);
  });

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [loadedFromExistingSlot, setLoadedFromExistingSlot] = useState<boolean>(
    () => Boolean(editingMeal || existingMealAtSlot)
  );

  const syncFromTargetSlot = (targetDate: string, targetSlot: MealSlot) => {
    setSelectedDate(targetDate);
    setSelectedSlot(targetSlot);
    if (editingMeal) return;

    const slotMeal = scheduledMeals.find(
      (m) => !m.deletedAt && m.date === targetDate && m.slot === targetSlot
    );
    if (!slotMeal) {
      if (loadedFromExistingSlot) {
        setQuickTitle('');
        setSelectedRecipeId('');
        setMealNotes('');
        setCookProfileId(defaultCookProfileId || '');
        setScaleFactor(1);
        setSelectedIngredientIndices(new Set());
        setLoadedFromExistingSlot(false);
      }
      return;
    }

    setLoadedFromExistingSlot(true);
    setCookProfileId(slotMeal.cookProfileId || defaultCookProfileId || '');
    setMealNotes(slotMeal.notes || '');
    if (slotMeal.recipeId) {
      setMode('recipe');
      setSelectedRecipeId(slotMeal.recipeId);
      setScaleFactor(
        typeof slotMeal.scaleFactor === 'number' && slotMeal.scaleFactor > 0
          ? slotMeal.scaleFactor
          : 1
      );
      const r = recipes.find((rec) => rec.id === slotMeal.recipeId);
      setSelectedIngredientIndices(computeDefaultCheckedIndices(r));
    } else {
      setMode('quick');
      setQuickTitle(slotMeal.title);
    }
  };

  const handleCookSelect = (nextCookId: string) => {
    setCookProfileId(nextCookId);
    if (
      effectiveEditingMeal &&
      effectiveEditingMeal.date === selectedDate &&
      effectiveEditingMeal.slot === selectedSlot
    ) {
      void updateScheduledMeal(effectiveEditingMeal.id, {
        cookProfileId: nextCookId || undefined,
      });
    }
  };

  // Escape key closes modal
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const selectedRecipe = useMemo(
    () => recipes.find((r) => r.id === selectedRecipeId) || null,
    [recipes, selectedRecipeId]
  );

  // Collect all tags across saved recipes + presets
  const allAvailableTags = useMemo(() => {
    const map = new Map<string, string>();
    for (const preset of PRESET_RECIPE_TAGS) {
      map.set(preset.toLowerCase(), preset);
    }
    for (const r of recipes) {
      for (const tag of r.tags) {
        const lower = tag.toLowerCase();
        if (!map.has(lower)) {
          map.set(lower, tag);
        }
      }
    }
    return Array.from(map.values());
  }, [recipes]);

  const filteredRecipes = useMemo(() => {
    const q = bookSearch.trim().toLowerCase();
    return recipes.filter((r) => {
      if (r.deletedAt) return false;
      if (favoritesOnly && !r.isFavorite) return false;
      if (
        activeTagFilter &&
        !r.tags.some((t) => t.toLowerCase() === activeTagFilter.toLowerCase())
      ) {
        return false;
      }
      if (!q) return true;
      const inTitle = r.title.toLowerCase().includes(q);
      const inTags = r.tags.some((t) => t.toLowerCase().includes(q));
      const inIngredients = r.ingredients.some((ing) =>
        ing.toLowerCase().includes(q)
      );
      return inTitle || inTags || inIngredients;
    });
  }, [recipes, bookSearch, activeTagFilter, favoritesOnly]);

  const handleSelectRecipe = (recipe: Recipe) => {
    setSelectedRecipeId(recipe.id);
    setSelectedIngredientIndices(computeDefaultCheckedIndices(recipe));
    setIsEditingDraft(false);
    if (!cookProfileId) {
      const recentForRecipe = scheduledMeals
        .filter((m) => !m.deletedAt && m.recipeId === recipe.id && m.cookProfileId)
        .sort(
          (a, b) =>
            (Date.parse(b.updatedAt || '') || 0) -
            (Date.parse(a.updatedAt || '') || 0)
        )[0];
      if (recentForRecipe?.cookProfileId) {
        handleCookSelect(recentForRecipe.cookProfileId);
      }
    }
  };

  const isIngredientHouseholdStaple = (rawLine: string): boolean => {
    const parsed = parseIngredient(rawLine, 1);
    const key = normalizeItemNameSingular(parsed.itemName);
    if (!key) return false;
    return BASIC_PANTRY_KEYS.has(key) || stapleKeySet.has(key);
  };

  const handleUncheckStaples = () => {
    if (!selectedRecipe) return;
    const next = new Set<number>();
    selectedRecipe.ingredients.forEach((line, idx) => {
      if (
        selectedIngredientIndices.has(idx) &&
        !isIngredientHouseholdStaple(line)
      ) {
        next.add(idx);
      }
    });
    setSelectedIngredientIndices(next);
  };

  const handleSelectAllIngredients = () => {
    if (!selectedRecipe) return;
    setSelectedIngredientIndices(
      new Set(selectedRecipe.ingredients.map((_, idx) => idx))
    );
  };

  const handleToggleIngredientIdx = (idx: number) => {
    setSelectedIngredientIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  // URL Scraper -> Editable Preview
  const handleScrapeUrl = async () => {
    const raw = scrapeUrlInput.trim();
    if (!raw || isScrapingUrl) return;

    const normalizedUrl = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    setIsScrapingUrl(true);
    setScrapeError(null);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 14_000);

    try {
      const res = await fetch(
        `/api/metadata?url=${encodeURIComponent(normalizedUrl)}`,
        { signal: controller.signal }
      );
      const data = (await res.json()) as MetadataScrapeResponse & {
        error?: string;
      };

      if (!res.ok || data.error) {
        setScrapeError(
          data.error || `Could not extract recipe (${res.status}).`
        );
        return;
      }

      const scraped = data.recipe;
      setDraft({
        title: scraped?.title || data.title || 'Imported Recipe',
        sourceUrl: data.sourceUrl || normalizedUrl,
        imageUrl: scraped?.image || data.imageUrl || '',
        servings: scraped?.servings || '',
        prepTime: scraped?.prepTime || '',
        cookTime: scraped?.cookTime || '',
        ingredientsText: (scraped?.ingredients || []).join('\n'),
        instructionsText: (scraped?.instructions || []).join('\n'),
        tags: [],
        notes: '',
        isFavorite: false,
      });
      setIsEditingDraft(true);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setScrapeError(
          'Recipe request timed out. You can try TheMealDB search or enter details manually.'
        );
      } else {
        setScrapeError(
          err instanceof Error
            ? err.message
            : 'Unable to reach recipe metadata scraper.'
        );
      }
    } finally {
      window.clearTimeout(timeoutId);
      setIsScrapingUrl(false);
    }
  };

  // TheMealDB Search -> Editable Preview
  const handleSearchMealDb = async () => {
    const q = mealDbQuery.trim();
    if (!q || isSearchingMealDb) return;

    setIsSearchingMealDb(true);
    setMealDbError(null);
    setHasSearchedMealDb(true);

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(
        `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(q)}`,
        { signal: controller.signal }
      );
      if (!res.ok) {
        setMealDbError(`TheMealDB returned status ${res.status}.`);
        setMealDbResults([]);
        return;
      }
      const payload = (await res.json()) as {
        meals?: MealDbMealRecord[] | null;
      };
      setMealDbResults(Array.isArray(payload.meals) ? payload.meals : []);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setMealDbError('TheMealDB search timed out. Please try again.');
      } else {
        setMealDbError(
          err instanceof Error
            ? err.message
            : 'Could not reach TheMealDB right now.'
        );
      }
      setMealDbResults([]);
    } finally {
      window.clearTimeout(timeoutId);
      setIsSearchingMealDb(false);
    }
  };

  const handleToggleDraftTag = (tag: string) => {
    setDraft((prev) => {
      const exists = prev.tags.some(
        (t) => t.toLowerCase() === tag.toLowerCase()
      );
      const nextTags = exists
        ? prev.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase())
        : [...prev.tags, tag];
      return { ...prev, tags: nextTags };
    });
  };

  const handleAddCustomDraftTag = () => {
    const cleaned = customTagInput.trim();
    if (!cleaned) return;
    handleToggleDraftTag(cleaned);
    setCustomTagInput('');
  };

  const handleSaveDraftRecipe = async () => {
    if (!draft.title.trim() || isSavingDraft) return;
    setIsSavingDraft(true);
    try {
      const saved = await upsertRecipe({
        id: draft.id,
        title: draft.title.trim(),
        sourceUrl: draft.sourceUrl.trim() || undefined,
        imageUrl: draft.imageUrl.trim() || undefined,
        servings: draft.servings.trim() || undefined,
        prepTime: draft.prepTime.trim() || undefined,
        cookTime: draft.cookTime.trim() || undefined,
        ingredients: draft.ingredientsText
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean),
        instructions: draft.instructionsText
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean),
        tags: draft.tags,
        notes: draft.notes.trim() || undefined,
        isFavorite: draft.isFavorite,
      });
      setSelectedRecipeId(saved.id);
      setSelectedIngredientIndices(computeDefaultCheckedIndices(saved));
      setIsEditingDraft(false);
      setSourceTab('book');
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleToggleRecipeFavorite = async (recipe: Recipe) => {
    await upsertRecipe({
      ...recipe,
      isFavorite: !recipe.isFavorite,
    });
  };

  const handleQuickTagToggleOnSavedRecipe = async (
    recipe: Recipe,
    tag: string
  ) => {
    const hasTag = recipe.tags.some(
      (t) => t.toLowerCase() === tag.toLowerCase()
    );
    const nextTags = hasTag
      ? recipe.tags.filter((t) => t.toLowerCase() !== tag.toLowerCase())
      : [...recipe.tags, tag];
    await updateRecipeTags(recipe.id, nextTags);
  };

  const handleSaveScheduledMeal = async () => {
    if (isSubmitting) return;
    const isQuick = mode === 'quick';
    const trimmedQuick = quickTitle.trim();

    if (isQuick && !trimmedQuick) return;

    let recipeForSchedule: Recipe | null = selectedRecipe;

    setIsSubmitting(true);
    try {
      // If user is currently editing/adding a recipe draft and clicks Schedule Meal directly, save the recipe first
      if (!isQuick && isEditingDraft && draft.title.trim()) {
        const savedDraft = await upsertRecipe({
          id: draft.id,
          title: draft.title.trim(),
          sourceUrl: draft.sourceUrl.trim() || undefined,
          imageUrl: draft.imageUrl.trim() || undefined,
          servings: draft.servings.trim() || undefined,
          prepTime: draft.prepTime.trim() || undefined,
          cookTime: draft.cookTime.trim() || undefined,
          ingredients: draft.ingredientsText
            .split(/\r?\n/)
            .map((l) => l.trim())
            .filter(Boolean),
          instructions: draft.instructionsText
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean),
          tags: draft.tags,
          notes: draft.notes.trim() || undefined,
          isFavorite: draft.isFavorite,
        });
        recipeForSchedule = savedDraft;
        setSelectedRecipeId(savedDraft.id);
        setIsEditingDraft(false);
      }

      if (!isQuick && !recipeForSchedule) return;

      const resolvedTitle = isQuick
        ? trimmedQuick
        : recipeForSchedule?.title || 'Planned Meal';
      const desiredRecipeId = isQuick ? undefined : recipeForSchedule?.id;
      const desiredCookId = cookProfileId || undefined;
      const desiredScale = isQuick ? 1 : scaleFactor;
      const desiredNotes = mealNotes.trim() || undefined;

      const movedSlotOrDate = Boolean(
        editingMeal &&
          (editingMeal.date !== selectedDate || editingMeal.slot !== selectedSlot)
      );

      const saved = await scheduleMeal({
        id: !movedSlotOrDate ? effectiveEditingMeal?.id : undefined,
        date: selectedDate,
        slot: selectedSlot,
        title: resolvedTitle,
        recipeId: desiredRecipeId,
        cookProfileId: desiredCookId,
        scaleFactor: desiredScale,
        notes: desiredNotes,
      });

      // Ensure cleared optional fields (e.g. converting recipe -> quick text or clearing cook) overwrite cleanly
      if (
        saved.recipeId !== desiredRecipeId ||
        saved.cookProfileId !== desiredCookId ||
        saved.notes !== desiredNotes
      ) {
        await updateScheduledMeal(saved.id, {
          recipeId: desiredRecipeId,
          cookProfileId: desiredCookId,
          notes: desiredNotes,
          scaleFactor: desiredScale,
        });
      }

      if (movedSlotOrDate && editingMeal && editingMeal.id !== saved.id) {
        await removeScheduledMeal(editingMeal.id);
      }

      // Selective Ingredient Import into Shopping List
      if (!isQuick && recipeForSchedule && importToShoppingList) {
        const orderedSelected = Array.from(selectedIngredientIndices).sort(
          (a, b) => a - b
        );
        if (orderedSelected.length > 0) {
          await importRecipeIngredients(recipeForSchedule.id, {
            selectedIndices: orderedSelected,
            scaleFactor: desiredScale,
            sourceMealId: saved.id,
          });
        }
      }

      onSaved?.(saved);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRemoveMeal = async () => {
    if (!effectiveEditingMeal || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await removeScheduledMeal(effectiveEditingMeal.id);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const canSaveMeal =
    mode === 'quick'
      ? Boolean(quickTitle.trim())
      : Boolean(selectedRecipe || (isEditingDraft && draft.title.trim()));

  return (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-3 md:p-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={effectiveEditingMeal ? 'Edit Planned Meal' : 'Plan a Meal'}
    >
      <div
        className={`w-full max-w-2xl max-h-[92vh] rounded-2xl border flex flex-col overflow-hidden shadow-2xl ${
          isLight
            ? 'bg-stone-50 border-stone-300/80 text-slate-800'
            : 'bg-slate-900/98 border-slate-700/60 text-slate-100'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          className={`shrink-0 px-5 py-3.5 border-b flex items-center justify-between gap-3 ${
            isLight
              ? 'bg-stone-100/90 border-stone-200'
              : 'bg-slate-900/80 border-slate-800/80'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center border shrink-0 ${
                isLight
                  ? 'bg-emerald-100/80 border-emerald-300/70 text-emerald-800'
                  : 'bg-emerald-950/50 border-emerald-800/60 text-emerald-300/90'
              }`}
            >
              <Utensils className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold tracking-tight truncate">
                {effectiveEditingMeal
                  ? 'Edit Scheduled Meal'
                  : 'Schedule Family Meal'}
              </h3>
              <p
                className={`text-xs truncate flex items-center gap-1.5 ${
                  isLight ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                <span>{formatReadableDate(selectedDate)}</span>
                <span>•</span>
                <span className="capitalize">{selectedSlot}</span>
                {cookProfileId && (
                  <>
                    <span>•</span>
                    <ProfileAvatar
                      profileId={cookProfileId}
                      size="xs"
                      showName
                      showRing={false}
                    />
                  </>
                )}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className={`min-h-[40px] min-w-[40px] rounded-xl inline-flex items-center justify-center transition-colors cursor-pointer ${
              isLight
                ? 'text-slate-500 hover:text-slate-800 hover:bg-stone-200/80'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/80'
            }`}
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Modal Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-5 space-y-4">
          {/* Date & Meal Slot Row */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
            <div className="md:col-span-6 min-w-0 relative">
              <label
                className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${
                  isLight ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                Date
              </label>

              <div className="flex items-center gap-1.5 min-w-0">
                <button
                  type="button"
                  onClick={() => stepSelectedDateByDays(-1)}
                  title="Previous day"
                  aria-label="Previous day"
                  className={`min-h-[46px] px-2.5 rounded-xl border inline-flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                    isLight
                      ? 'bg-white border-stone-300 text-slate-600 hover:bg-stone-100 hover:text-slate-900'
                      : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
                  }`}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (!isCalendarOpen) {
                      try {
                        const d = parseDateKey(selectedDate);
                        setCalendarMonthDate(
                          new Date(d.getFullYear(), d.getMonth(), 1)
                        );
                      } catch {
                        // Ignore
                      }
                    }
                    setIsCalendarOpen((open) => !open);
                  }}
                  aria-expanded={isCalendarOpen}
                  aria-label="Open calendar date selector"
                  className={`flex-1 min-w-0 min-h-[46px] px-2.5 rounded-xl border text-left inline-flex items-center justify-between gap-1.5 transition-colors cursor-pointer ${
                    isCalendarOpen
                      ? isLight
                        ? 'bg-emerald-50/70 border-emerald-500 text-slate-900'
                        : 'bg-slate-900 border-emerald-500/70 text-slate-100'
                      : isLight
                        ? 'bg-white border-stone-300 text-slate-800 hover:border-stone-400'
                        : 'bg-slate-950/70 border-slate-800 text-slate-100 hover:border-slate-700'
                  }`}
                >
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <Calendar
                      className={`w-4 h-4 shrink-0 ${
                        isLight ? 'text-emerald-700' : 'text-emerald-400'
                      }`}
                    />
                    <span className="text-sm font-semibold truncate">
                      {formatReadableDate(selectedDate)}
                    </span>
                    {selectedDate === todayKey && (
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-bold uppercase tracking-wider shrink-0 ${
                          isLight
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                        }`}
                      >
                        Today
                      </span>
                    )}
                    {selectedDate === tomorrowKey && (
                      <span
                        className={`px-1.5 py-0.2 rounded text-[10px] font-semibold shrink-0 ${
                          isLight
                            ? 'bg-stone-200 text-slate-700'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        Tmrw
                      </span>
                    )}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 shrink-0 transition-transform ${
                      isCalendarOpen ? 'rotate-180' : ''
                    } ${isLight ? 'text-slate-500' : 'text-slate-400'}`}
                  />
                </button>

                <button
                  type="button"
                  onClick={() => stepSelectedDateByDays(1)}
                  title="Next day"
                  aria-label="Next day"
                  className={`min-h-[46px] px-2.5 rounded-xl border inline-flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                    isLight
                      ? 'bg-white border-stone-300 text-slate-600 hover:bg-stone-100 hover:text-slate-900'
                      : 'bg-slate-950/70 border-slate-800 text-slate-400 hover:bg-slate-800/80 hover:text-slate-100'
                  }`}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Interactive Month Calendar Popover */}
              {isCalendarOpen && (
                <div
                  className={`mt-2 p-3 rounded-2xl border shadow-2xl z-30 ${
                    isLight
                      ? 'bg-white border-stone-300 text-slate-800'
                      : 'bg-slate-950 border-slate-700/80 text-slate-100'
                  }`}
                >
                  {/* Quick Date Chips: Today / Tomorrow */}
                  <div className="flex items-center justify-between gap-1.5 pb-2.5 mb-2.5 border-b border-slate-500/15">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          syncFromTargetSlot(todayKey, selectedSlot);
                          setIsCalendarOpen(false);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                          selectedDate === todayKey
                            ? isLight
                              ? 'bg-emerald-700 border-emerald-700 text-white'
                              : 'bg-emerald-600 border-emerald-500 text-white'
                            : isLight
                              ? 'bg-stone-100 border-stone-300 text-slate-700 hover:bg-stone-200'
                              : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        Today
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          syncFromTargetSlot(tomorrowKey, selectedSlot);
                          setIsCalendarOpen(false);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                          selectedDate === tomorrowKey
                            ? isLight
                              ? 'bg-emerald-700 border-emerald-700 text-white'
                              : 'bg-emerald-600 border-emerald-500 text-white'
                            : isLight
                              ? 'bg-stone-100 border-stone-300 text-slate-700 hover:bg-stone-200'
                              : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        Tomorrow
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsCalendarOpen(false)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-medium cursor-pointer ${
                        isLight
                          ? 'text-slate-500 hover:bg-stone-100'
                          : 'text-slate-400 hover:bg-slate-900'
                      }`}
                    >
                      Done
                    </button>
                  </div>

                  {/* Month Navigation Header */}
                  <div className="flex items-center justify-between mb-2">
                    <button
                      type="button"
                      onClick={() =>
                        setCalendarMonthDate(
                          (prev) =>
                            new Date(prev.getFullYear(), prev.getMonth() - 1, 1)
                        )
                      }
                      aria-label="Previous month"
                      className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                        isLight
                          ? 'bg-stone-50 border-stone-200 text-slate-700 hover:bg-stone-100'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-xs font-bold tracking-tight">
                      {calendarMonthDate.toLocaleDateString([], {
                        month: 'long',
                        year: 'numeric',
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setCalendarMonthDate(
                          (prev) =>
                            new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
                        )
                      }
                      aria-label="Next month"
                      className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                        isLight
                          ? 'bg-stone-50 border-stone-200 text-slate-700 hover:bg-stone-100'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Weekday Column Headers */}
                  <div className="grid grid-cols-7 gap-1 mb-1 text-center">
                    {(weekStartsOn === 'monday'
                      ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
                      : ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
                    ).map((dayLabel) => (
                      <div
                        key={dayLabel}
                        className={`text-[10px] font-semibold py-0.5 ${
                          isLight ? 'text-slate-400' : 'text-slate-500'
                        }`}
                      >
                        {dayLabel}
                      </div>
                    ))}
                  </div>

                  {/* 6-Week Calendar Days Grid */}
                  <div className="grid grid-cols-7 gap-1">
                    {calendarDaysGrid.map((cell) => {
                      const hasBkfst = cell.scheduledSlots.has('breakfast');
                      const hasLunch = cell.scheduledSlots.has('lunch');
                      const hasDinner = cell.scheduledSlots.has('dinner');
                      const tooltipText =
                        cell.dayMeals.length > 0
                          ? `${formatReadableDate(cell.dateKey)} — ${cell.dayMeals
                              .map(
                                (m) =>
                                  `${m.slot.charAt(0).toUpperCase() + m.slot.slice(1)}: ${m.title}`
                              )
                              .join(', ')}`
                          : formatReadableDate(cell.dateKey);
                      return (
                        <button
                          key={cell.dateKey}
                          type="button"
                          title={tooltipText}
                          onClick={() => {
                            syncFromTargetSlot(cell.dateKey, selectedSlot);
                            setIsCalendarOpen(false);
                          }}
                          className={`h-9 rounded-lg flex flex-col items-center justify-center relative text-xs font-medium transition-colors cursor-pointer border ${
                            cell.isSelected
                              ? isLight
                                ? 'bg-emerald-700 border-emerald-700 text-white font-bold shadow-sm'
                                : 'bg-emerald-600 border-emerald-400 text-white font-bold shadow-sm'
                              : cell.isToday
                                ? isLight
                                  ? 'bg-emerald-50 border-emerald-400 text-emerald-900 font-bold'
                                  : 'bg-emerald-950/60 border-emerald-600/70 text-emerald-200 font-bold'
                                : cell.inCurrentMonth
                                  ? isLight
                                    ? 'bg-stone-50/70 border-transparent text-slate-800 hover:bg-stone-200/70'
                                    : 'bg-slate-900/60 border-transparent text-slate-200 hover:bg-slate-800'
                                  : isLight
                                    ? 'border-transparent text-slate-300 hover:bg-stone-100'
                                    : 'border-transparent text-slate-600 hover:bg-slate-900'
                          }`}
                        >
                          <span className="leading-none">{cell.dayNumber}</span>
                          {(hasBkfst || hasLunch || hasDinner) && (
                            <span className="flex items-center gap-0.5 mt-0.5">
                              {hasBkfst && (
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    cell.isSelected
                                      ? 'bg-amber-200'
                                      : 'bg-amber-400'
                                  }`}
                                />
                              )}
                              {hasLunch && (
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    cell.isSelected
                                      ? 'bg-emerald-200'
                                      : 'bg-emerald-400'
                                  }`}
                                />
                              )}
                              {hasDinner && (
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    cell.isSelected
                                      ? 'bg-white'
                                      : 'bg-sky-400'
                                  }`}
                                />
                              )}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="md:col-span-6 min-w-0">
              <label
                className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${
                  isLight ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                Meal Slot
              </label>
              <div
                className={`grid grid-cols-3 gap-1.5 p-1 rounded-xl border ${
                  isLight
                    ? 'bg-stone-200/60 border-stone-300/80'
                    : 'bg-slate-950/70 border-slate-800'
                }`}
              >
                {SLOT_OPTIONS.map((slotOpt) => {
                  const active = selectedSlot === slotOpt.id;
                  return (
                    <button
                      key={slotOpt.id}
                      type="button"
                      onClick={() =>
                        syncFromTargetSlot(selectedDate, slotOpt.id)
                      }
                      className={`min-h-[38px] min-w-0 px-2 rounded-lg text-xs font-semibold border truncate transition-colors cursor-pointer ${
                        active
                          ? isLight
                            ? slotOpt.activeLight
                            : slotOpt.activeDark
                          : 'border-transparent opacity-70 hover:opacity-100'
                      }`}
                    >
                      {slotOpt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Cook Profile Assignment Chips */}
          <div>
            <label
              className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${
                isLight ? 'text-slate-500' : 'text-slate-400'
              }`}
            >
              Assigned Cook (Optional)
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleCookSelect('')}
                className={`min-h-[40px] px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  !cookProfileId
                    ? isLight
                      ? 'bg-stone-200 border-stone-400 text-slate-900 font-semibold'
                      : 'bg-slate-800 border-slate-600 text-slate-100 font-semibold'
                    : isLight
                      ? 'bg-white border-stone-300/80 text-slate-600 hover:bg-stone-100'
                      : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>Anyone</span>
              </button>

              {profiles
                .filter((p) => !p.deletedAt)
                .map((profile) => {
                  const selected = cookProfileId === profile.id;
                  return (
                    <button
                      key={profile.id}
                      type="button"
                      onClick={() =>
                        handleCookSelect(selected ? '' : profile.id)
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && selected && canSaveMeal) {
                          e.preventDefault();
                          void handleSaveScheduledMeal();
                        }
                      }}
                      className={`min-h-[40px] px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-2 transition-colors cursor-pointer ${
                        selected
                          ? isLight
                            ? 'bg-emerald-50 border-emerald-500/70 text-emerald-950 font-semibold'
                            : 'bg-emerald-950/50 border-emerald-600/70 text-emerald-100 font-semibold'
                          : isLight
                            ? 'bg-white border-stone-300/80 text-slate-700 hover:bg-stone-100'
                            : 'bg-slate-950/50 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <ProfileAvatar
                        profile={profile}
                        size="sm"
                        showRing={selected}
                      />
                      <span>{profile.name}</span>
                    </button>
                  );
                })}
            </div>
          </div>

          {/* Dual-Mode Switcher: Quick-Text vs Recipe-Linked */}
          <div
            className={`grid grid-cols-2 gap-1.5 p-1 rounded-xl border ${
              isLight
                ? 'bg-stone-200/70 border-stone-300/80'
                : 'bg-slate-950/80 border-slate-800'
            }`}
          >
            <button
              type="button"
              onClick={() => setMode('quick')}
              className={`min-h-[42px] px-3 rounded-lg text-xs md:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                mode === 'quick'
                  ? isLight
                    ? 'bg-white text-slate-900 border border-stone-300/80'
                    : 'bg-slate-800 text-slate-100 border border-slate-700'
                  : isLight
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-500/90" />
              <span>Quick-Text Meal</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('recipe')}
              className={`min-h-[42px] px-3 rounded-lg text-xs md:text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                mode === 'recipe'
                  ? isLight
                    ? 'bg-white text-slate-900 border border-stone-300/80'
                    : 'bg-slate-800 text-slate-100 border border-slate-700'
                  : isLight
                    ? 'text-slate-600 hover:text-slate-900'
                    : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BookOpen className="w-4 h-4 text-emerald-500/90" />
              <span>Recipe-Linked</span>
            </button>
          </div>

          {/* MODE 1: QUICK-TEXT */}
          {mode === 'quick' ? (
            <div className="space-y-3">
              <div>
                <label
                  className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${
                    isLight ? 'text-slate-500' : 'text-slate-400'
                  }`}
                >
                  What&apos;s on the menu?
                </label>
                <input
                  type="text"
                  placeholder="e.g., Tacos, Leftovers, Grilled Cheese..."
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && quickTitle.trim()) {
                      void handleSaveScheduledMeal();
                    }
                  }}
                  autoFocus
                  className={`w-full min-h-[46px] px-3.5 rounded-xl border text-sm md:text-base font-medium focus:outline-none ${
                    isLight
                      ? 'bg-white border-stone-300 text-slate-900 placeholder-slate-400 focus:border-emerald-600'
                      : 'bg-slate-950/80 border-slate-800 text-slate-100 placeholder-slate-500 focus:border-emerald-600/70'
                  }`}
                />
              </div>

              {dynamicQuickSuggestions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                  {dynamicQuickSuggestions.map((suggestion) => {
                    const isSelected =
                      quickTitle.trim().toLowerCase() ===
                      suggestion.title.toLowerCase();
                    return (
                      <button
                        key={suggestion.title}
                        type="button"
                        onClick={() => {
                          setQuickTitle(suggestion.title);
                          if (suggestion.cookProfileId && !cookProfileId) {
                            setCookProfileId(suggestion.cookProfileId);
                          }
                          if (suggestion.notes && !mealNotes.trim()) {
                            setMealNotes(suggestion.notes);
                          }
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border inline-flex items-center gap-1 transition-colors cursor-pointer ${
                          isSelected
                            ? isLight
                              ? 'bg-emerald-100 border-emerald-400 text-emerald-950'
                              : 'bg-emerald-950/50 border-emerald-700 text-emerald-200'
                            : isLight
                              ? 'bg-white border-stone-200 text-slate-600 hover:bg-stone-100'
                              : 'bg-slate-950/50 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {suggestion.cookProfileId ? (
                          <ProfileAvatar
                            profileId={suggestion.cookProfileId}
                            size="xs"
                            showRing={false}
                          />
                        ) : suggestion.source === 'recent' ? (
                          <Clock className="w-3 h-3 opacity-65 shrink-0" />
                        ) : null}
                        <span>{suggestion.title}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div>
                <label
                  className={`block text-[11px] font-semibold uppercase tracking-wider mb-1.5 ${
                    isLight ? 'text-slate-500' : 'text-slate-400'
                  }`}
                >
                  Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Defrost chicken in the morning, use sourdough..."
                  value={mealNotes}
                  onChange={(e) => setMealNotes(e.target.value)}
                  className={`w-full min-h-[42px] px-3.5 rounded-xl border text-xs md:text-sm focus:outline-none ${
                    isLight
                      ? 'bg-white border-stone-300 text-slate-800 placeholder-slate-400 focus:border-emerald-600'
                      : 'bg-slate-950/70 border-slate-800 text-slate-200 placeholder-slate-500 focus:border-emerald-600/70'
                  }`}
                />
              </div>
            </div>
          ) : (
            /* MODE 2: RECIPE-LINKED */
            <div className="space-y-4">
              {/* Sub-source switcher: Household Recipe Book | URL Scraper | TheMealDB */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div
                  className={`inline-flex items-center p-1 rounded-xl border ${
                    isLight
                      ? 'bg-stone-200/60 border-stone-300/80'
                      : 'bg-slate-950/70 border-slate-800'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setSourceTab('book');
                      setIsEditingDraft(false);
                    }}
                    className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                      sourceTab === 'book' && !isEditingDraft
                        ? isLight
                          ? 'bg-white text-slate-900 border border-stone-300/70'
                          : 'bg-slate-800 text-slate-100 border border-slate-700'
                        : 'opacity-70 hover:opacity-100'
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Recipe Book ({recipes.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSourceTab('url');
                      setIsEditingDraft(false);
                    }}
                    className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                      sourceTab === 'url' && !isEditingDraft
                        ? isLight
                          ? 'bg-white text-slate-900 border border-stone-300/70'
                          : 'bg-slate-800 text-slate-100 border border-slate-700'
                        : 'opacity-70 hover:opacity-100'
                    }`}
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    <span>URL Scraper</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSourceTab('mealdb');
                      setIsEditingDraft(false);
                    }}
                    className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                      sourceTab === 'mealdb' && !isEditingDraft
                        ? isLight
                          ? 'bg-white text-slate-900 border border-stone-300/70'
                          : 'bg-slate-800 text-slate-100 border border-slate-700'
                        : 'opacity-70 hover:opacity-100'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>TheMealDB</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setDraft(createEmptyDraft());
                    setIsEditingDraft(true);
                  }}
                  className={`min-h-[36px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                    isLight
                      ? 'bg-white border-stone-300 text-emerald-800 hover:bg-emerald-50'
                      : 'bg-slate-800/80 border-slate-700 text-emerald-300 hover:bg-slate-800'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Custom Recipe</span>
                </button>
              </div>

              {/* EDITABLE RECIPE PREVIEW / CUSTOM RECIPE EDITOR */}
              {isEditingDraft ? (
                <div
                  className={`rounded-2xl border p-4 space-y-3 ${
                    isLight
                      ? 'bg-white border-stone-300/90'
                      : 'bg-slate-950/75 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800/40">
                    <span className="text-xs font-semibold uppercase tracking-wider text-emerald-500">
                      {draft.id ? 'Edit Saved Recipe' : 'Editable Recipe Preview'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsEditingDraft(false)}
                      className="text-xs opacity-70 hover:opacity-100 underline cursor-pointer"
                    >
                      Cancel Preview
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    <div className="sm:col-span-8">
                      <label className="block text-[11px] font-medium opacity-75 mb-1">
                        Recipe Title *
                      </label>
                      <input
                        type="text"
                        placeholder="Honey Garlic Salmon"
                        value={draft.title}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, title: e.target.value }))
                        }
                        className={`w-full min-h-[40px] px-3 rounded-xl border text-sm focus:outline-none ${
                          isLight
                            ? 'bg-stone-50 border-stone-300 text-slate-900'
                            : 'bg-slate-900 border-slate-800 text-slate-100'
                        }`}
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <label className="block text-[11px] font-medium opacity-75 mb-1">
                        Servings
                      </label>
                      <input
                        type="text"
                        placeholder="4 servings"
                        value={draft.servings}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, servings: e.target.value }))
                        }
                        className={`w-full min-h-[40px] px-3 rounded-xl border text-sm focus:outline-none ${
                          isLight
                            ? 'bg-stone-50 border-stone-300 text-slate-900'
                            : 'bg-slate-900 border-slate-800 text-slate-100'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-medium opacity-75 mb-1">
                        Prep Time
                      </label>
                      <input
                        type="text"
                        placeholder="15 mins"
                        value={draft.prepTime}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, prepTime: e.target.value }))
                        }
                        className={`w-full min-h-[38px] px-3 rounded-xl border text-xs focus:outline-none ${
                          isLight
                            ? 'bg-stone-50 border-stone-300 text-slate-900'
                            : 'bg-slate-900 border-slate-800 text-slate-100'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium opacity-75 mb-1">
                        Cook Time
                      </label>
                      <input
                        type="text"
                        placeholder="25 mins"
                        value={draft.cookTime}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, cookTime: e.target.value }))
                        }
                        className={`w-full min-h-[38px] px-3 rounded-xl border text-xs focus:outline-none ${
                          isLight
                            ? 'bg-stone-50 border-stone-300 text-slate-900'
                            : 'bg-slate-900 border-slate-800 text-slate-100'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium opacity-75 mb-1">
                        Image URL
                      </label>
                      <input
                        type="url"
                        placeholder="https://..."
                        value={draft.imageUrl}
                        onChange={(e) =>
                          setDraft((p) => ({ ...p, imageUrl: e.target.value }))
                        }
                        className={`w-full min-h-[38px] px-3 rounded-xl border text-xs focus:outline-none ${
                          isLight
                            ? 'bg-stone-50 border-stone-300 text-slate-900'
                            : 'bg-slate-900 border-slate-800 text-slate-100'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Tags Picker */}
                  <div>
                    <label className="block text-[11px] font-medium opacity-75 mb-1">
                      Tags
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      {allAvailableTags.map((tag) => {
                        const selected = draft.tags.some(
                          (t) => t.toLowerCase() === tag.toLowerCase()
                        );
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => handleToggleDraftTag(tag)}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                              selected
                                ? isLight
                                  ? 'bg-emerald-100 border-emerald-500 text-emerald-950'
                                  : 'bg-emerald-950/60 border-emerald-600 text-emerald-200'
                                : isLight
                                  ? 'bg-stone-100 border-stone-300 text-slate-600'
                                  : 'bg-slate-900 border-slate-800 text-slate-400'
                            }`}
                          >
                            {tag}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder="Add custom tag (e.g. Air Fryer)..."
                        value={customTagInput}
                        onChange={(e) => setCustomTagInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomDraftTag();
                          }
                        }}
                        className={`flex-1 min-h-[36px] px-3 rounded-xl border text-xs focus:outline-none ${
                          isLight
                            ? 'bg-stone-50 border-stone-300 text-slate-900'
                            : 'bg-slate-900 border-slate-800 text-slate-100'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={handleAddCustomDraftTag}
                        className={`min-h-[36px] px-3 rounded-xl border text-xs font-medium cursor-pointer ${
                          isLight
                            ? 'bg-stone-100 border-stone-300 text-slate-700'
                            : 'bg-slate-800 border-slate-700 text-slate-200'
                        }`}
                      >
                        + Tag
                      </button>
                    </div>
                  </div>

                  {/* Ingredients & Instructions Textareas */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium opacity-75 mb-1">
                        Ingredients (one per line)
                      </label>
                      <textarea
                        rows={5}
                        placeholder={'2 lbs chicken breast\n3 cloves garlic, minced\n2 tbsp olive oil'}
                        value={draft.ingredientsText}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            ingredientsText: e.target.value,
                          }))
                        }
                        className={`w-full p-2.5 rounded-xl border text-xs leading-relaxed focus:outline-none ${
                          isLight
                            ? 'bg-stone-50 border-stone-300 text-slate-900'
                            : 'bg-slate-900 border-slate-800 text-slate-100'
                        }`}
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium opacity-75 mb-1">
                        Instructions (one step per line)
                      </label>
                      <textarea
                        rows={5}
                        placeholder={'Preheat oven to 400°F.\nSeason chicken and sear for 4 minutes.\nBake until cooked through.'}
                        value={draft.instructionsText}
                        onChange={(e) =>
                          setDraft((p) => ({
                            ...p,
                            instructionsText: e.target.value,
                          }))
                        }
                        className={`w-full p-2.5 rounded-xl border text-xs leading-relaxed focus:outline-none ${
                          isLight
                            ? 'bg-stone-50 border-stone-300 text-slate-900'
                            : 'bg-slate-900 border-slate-800 text-slate-100'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-1">
                    <button
                      type="button"
                      disabled={!draft.title.trim() || isSavingDraft}
                      onClick={() => void handleSaveDraftRecipe()}
                      className={`min-h-[42px] px-4 rounded-xl text-xs md:text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-45 ${
                        isLight
                          ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                          : 'bg-emerald-700/90 text-white hover:bg-emerald-600'
                      }`}
                    >
                      <Check className="w-4 h-4" />
                      <span>
                        {isSavingDraft
                          ? 'Saving...'
                          : 'Save to Recipe Book & Select'}
                      </span>
                    </button>
                  </div>
                </div>
              ) : sourceTab === 'url' ? (
                /* SUB-TAB 2: URL SCRAPER */
                <div
                  className={`rounded-2xl border p-4 space-y-3 ${
                    isLight
                      ? 'bg-white border-stone-300/80'
                      : 'bg-slate-950/60 border-slate-800'
                  }`}
                >
                  <p className="text-xs opacity-80">
                    Paste any recipe blog or cooking URL to extract ingredients,
                    prep time, and step-by-step instructions into an editable
                    preview before saving.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="url"
                      placeholder="https://www.seriouseats.com/..."
                      value={scrapeUrlInput}
                      onChange={(e) => setScrapeUrlInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleScrapeUrl();
                        }
                      }}
                      className={`flex-1 min-h-[44px] px-3.5 rounded-xl border text-sm focus:outline-none ${
                        isLight
                          ? 'bg-stone-50 border-stone-300 text-slate-900'
                          : 'bg-slate-900 border-slate-800 text-slate-100'
                      }`}
                    />
                    <button
                      type="button"
                      disabled={!scrapeUrlInput.trim() || isScrapingUrl}
                      onClick={() => void handleScrapeUrl()}
                      className={`min-h-[44px] px-4 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-45 ${
                        isLight
                          ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                          : 'bg-emerald-700/90 text-white hover:bg-emerald-600'
                      }`}
                    >
                      {isScrapingUrl ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Link2 className="w-4 h-4" />
                      )}
                      <span>{isScrapingUrl ? 'Fetching...' : 'Fetch Recipe'}</span>
                    </button>
                  </div>

                  {scrapeError && (
                    <div
                      className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                        isLight
                          ? 'bg-amber-50 border-amber-300 text-amber-900'
                          : 'bg-amber-950/40 border-amber-700/50 text-amber-200'
                      }`}
                    >
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{scrapeError}</span>
                    </div>
                  )}
                </div>
              ) : sourceTab === 'mealdb' ? (
                /* SUB-TAB 3: THEMEALDB FALLBACK SEARCH */
                <div
                  className={`rounded-2xl border p-4 space-y-3 ${
                    isLight
                      ? 'bg-white border-stone-300/80'
                      : 'bg-slate-950/60 border-slate-800'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      placeholder="Search TheMealDB (e.g., Teriyaki, Curry, Fajitas)..."
                      value={mealDbQuery}
                      onChange={(e) => setMealDbQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void handleSearchMealDb();
                        }
                      }}
                      className={`flex-1 min-h-[44px] px-3.5 rounded-xl border text-sm focus:outline-none ${
                        isLight
                          ? 'bg-stone-50 border-stone-300 text-slate-900'
                          : 'bg-slate-900 border-slate-800 text-slate-100'
                      }`}
                    />
                    <button
                      type="button"
                      disabled={!mealDbQuery.trim() || isSearchingMealDb}
                      onClick={() => void handleSearchMealDb()}
                      className={`min-h-[44px] px-4 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-45 ${
                        isLight
                          ? 'bg-slate-800 text-white hover:bg-slate-900'
                          : 'bg-slate-800 border border-slate-700 text-slate-100 hover:bg-slate-700'
                      }`}
                    >
                      {isSearchingMealDb ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Search className="w-4 h-4" />
                      )}
                      <span>Search</span>
                    </button>
                  </div>

                  {mealDbError && (
                    <div
                      className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                        isLight
                          ? 'bg-amber-50 border-amber-300 text-amber-900'
                          : 'bg-amber-950/40 border-amber-700/50 text-amber-200'
                      }`}
                    >
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{mealDbError}</span>
                    </div>
                  )}

                  {!isSearchingMealDb &&
                    hasSearchedMealDb &&
                    !mealDbError &&
                    mealDbResults.length === 0 && (
                      <p className="text-xs opacity-70 text-center py-3">
                        No matching dishes found on TheMealDB. Try a broader
                        dish name or create a custom recipe.
                      </p>
                    )}

                  {mealDbResults.length > 0 && (
                    <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                      {mealDbResults.map((item) => (
                        <div
                          key={item.idMeal}
                          className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 ${
                            isLight
                              ? 'bg-stone-50 border-stone-200'
                              : 'bg-slate-900/80 border-slate-800'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {typeof item.strMealThumb === 'string' &&
                              item.strMealThumb && (
                                <img
                                  src={item.strMealThumb}
                                  alt={item.strMeal}
                                  className="w-11 h-11 rounded-lg object-cover shrink-0"
                                />
                              )}
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">
                                {item.strMeal}
                              </p>
                              <p className="text-xs opacity-70 truncate">
                                {[item.strCategory, item.strArea]
                                  .filter(Boolean)
                                  .join(' • ')}
                              </p>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => {
                              setDraft(mapMealDbRecordToDraft(item));
                              setIsEditingDraft(true);
                            }}
                            className={`min-h-[38px] px-3 rounded-lg text-xs font-semibold shrink-0 border transition-colors cursor-pointer ${
                              isLight
                                ? 'bg-emerald-50 border-emerald-400 text-emerald-900 hover:bg-emerald-100'
                                : 'bg-emerald-950/50 border-emerald-700/70 text-emerald-200 hover:bg-emerald-900/60'
                            }`}
                          >
                            Preview &amp; Save
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                /* SUB-TAB 1: HOUSEHOLD RECIPE BOOK */
                <div className="space-y-2.5">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-50 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Search household recipes or ingredients..."
                        value={bookSearch}
                        onChange={(e) => setBookSearch(e.target.value)}
                        className={`w-full min-h-[40px] pl-9 pr-3 rounded-xl border text-xs md:text-sm focus:outline-none ${
                          isLight
                            ? 'bg-white border-stone-300 text-slate-900'
                            : 'bg-slate-950/70 border-slate-800 text-slate-100'
                        }`}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setFavoritesOnly((v) => !v)}
                      className={`min-h-[40px] px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                        favoritesOnly
                          ? isLight
                            ? 'bg-rose-50 border-rose-300 text-rose-800'
                            : 'bg-rose-950/40 border-rose-700/60 text-rose-200'
                          : isLight
                            ? 'bg-white border-stone-300 text-slate-600'
                            : 'bg-slate-950/70 border-slate-800 text-slate-400'
                      }`}
                    >
                      <Heart
                        className={`w-3.5 h-3.5 ${
                          favoritesOnly ? 'fill-current' : ''
                        }`}
                      />
                      <span>Favorites</span>
                    </button>
                  </div>

                  {/* Tag Filter Pills */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setActiveTagFilter('')}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors cursor-pointer ${
                        !activeTagFilter
                          ? isLight
                            ? 'bg-slate-800 border-slate-800 text-white'
                            : 'bg-slate-200 border-slate-200 text-slate-900'
                          : isLight
                            ? 'bg-white border-stone-300 text-slate-600'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400'
                      }`}
                    >
                      All
                    </button>
                    {allAvailableTags.map((tag) => {
                      const active =
                        activeTagFilter.toLowerCase() === tag.toLowerCase();
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() =>
                            setActiveTagFilter(active ? '' : tag)
                          }
                          className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors cursor-pointer ${
                            active
                              ? isLight
                                ? 'bg-emerald-700 border-emerald-700 text-white'
                                : 'bg-emerald-800 border-emerald-600 text-emerald-50'
                              : isLight
                                ? 'bg-white border-stone-300 text-slate-600 hover:bg-stone-100'
                                : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {tag}
                        </button>
                      );
                    })}
                  </div>

                  {/* Saved Recipes List */}
                  {filteredRecipes.length === 0 ? (
                    <div
                      className={`rounded-2xl border p-5 text-center text-xs space-y-2 ${
                        isLight
                          ? 'bg-white/80 border-stone-200 text-slate-500'
                          : 'bg-slate-950/40 border-slate-800/80 text-slate-400'
                      }`}
                    >
                      <p>
                        {recipes.length === 0
                          ? 'Your Household Recipe Book is empty. Import a recipe URL, search TheMealDB, or add a custom family favorite!'
                          : 'No saved recipes match your current search/tag filter.'}
                      </p>
                    </div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                      {filteredRecipes.map((recipe) => {
                        const isSelected = selectedRecipeId === recipe.id;
                        const isConfirmingDel =
                          confirmDeleteRecipeId === recipe.id;
                        return (
                          <div
                            key={recipe.id}
                            onClick={() => handleSelectRecipe(recipe)}
                            className={`p-3 rounded-xl border transition-colors cursor-pointer flex items-center justify-between gap-3 ${
                              isSelected
                                ? isLight
                                  ? 'bg-emerald-50/90 border-emerald-500 text-slate-900'
                                  : 'bg-emerald-950/40 border-emerald-600/80 text-slate-100'
                                : isLight
                                  ? 'bg-white border-stone-200/90 hover:border-stone-300'
                                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              {recipe.imageUrl && (
                                <img
                                  src={recipe.imageUrl}
                                  alt={recipe.title}
                                  className="w-11 h-11 rounded-lg object-cover shrink-0"
                                />
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-semibold truncate">
                                    {recipe.title}
                                  </span>
                                  {isSelected && (
                                    <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px] opacity-75">
                                  <span>
                                    {recipe.ingredients.length} ingredients
                                  </span>
                                  {recipe.prepTime && (
                                    <span className="inline-flex items-center gap-0.5">
                                      <Clock className="w-3 h-3" />
                                      {recipe.prepTime}
                                    </span>
                                  )}
                                  {recipe.servings && (
                                    <span className="inline-flex items-center gap-0.5">
                                      <Users className="w-3 h-3" />
                                      {recipe.servings}
                                    </span>
                                  )}
                                  {recipe.tags.slice(0, 3).map((t) => (
                                    <span
                                      key={t}
                                      className="px-1.5 py-0.2 rounded bg-slate-500/15"
                                    >
                                      {t}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div
                              className="flex items-center gap-1 shrink-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  void handleQuickTagToggleOnSavedRecipe(
                                    recipe,
                                    'Quick'
                                  )
                                }
                                title="Toggle 'Quick' tag"
                                className={`p-2 rounded-lg transition-colors cursor-pointer ${
                                  recipe.tags.some(
                                    (t) => t.toLowerCase() === 'quick'
                                  )
                                    ? 'text-emerald-400'
                                    : 'opacity-45 hover:opacity-100'
                                }`}
                              >
                                <Tag className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void handleToggleRecipeFavorite(recipe)
                                }
                                title="Favorite recipe"
                                className={`p-2 rounded-lg transition-colors cursor-pointer ${
                                  recipe.isFavorite
                                    ? 'text-rose-400'
                                    : 'opacity-45 hover:opacity-100'
                                }`}
                              >
                                <Heart
                                  className={`w-3.5 h-3.5 ${
                                    recipe.isFavorite ? 'fill-current' : ''
                                  }`}
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setDraft(recipeToDraft(recipe));
                                  setIsEditingDraft(true);
                                }}
                                title="Edit recipe"
                                className="p-2 rounded-lg opacity-65 hover:opacity-100 cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              {isConfirmingDel ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    void deleteRecipe(recipe.id);
                                    if (selectedRecipeId === recipe.id) {
                                      setSelectedRecipeId('');
                                    }
                                    setConfirmDeleteRecipeId(null);
                                  }}
                                  className="px-2 py-1 rounded-lg bg-amber-600/80 text-white text-[11px] font-semibold cursor-pointer"
                                >
                                  Confirm
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmDeleteRecipeId(recipe.id)
                                  }
                                  title="Delete recipe"
                                  className="p-2 rounded-lg opacity-55 hover:opacity-100 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* SELECTIVE INGREDIENT IMPORT PANEL (when a recipe is selected) */}
              {selectedRecipe && !isEditingDraft && (
                <div
                  className={`rounded-2xl border p-3.5 space-y-3 ${
                    isLight
                      ? 'bg-stone-100/90 border-stone-300/80'
                      : 'bg-slate-950/70 border-slate-800'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {/* Opt-in Toggle */}
                    <button
                      type="button"
                      onClick={() => setImportToShoppingList((v) => !v)}
                      className="inline-flex items-center gap-2.5 text-left cursor-pointer"
                    >
                      <span
                        className={`w-5 h-5 rounded-md flex items-center justify-center border transition-colors ${
                          importToShoppingList
                            ? 'bg-emerald-600 border-emerald-500 text-white'
                            : isLight
                              ? 'bg-white border-stone-400'
                              : 'bg-slate-900 border-slate-600'
                        }`}
                      >
                        {importToShoppingList && <Check className="w-3.5 h-3.5" />}
                      </span>
                      <span className="text-xs md:text-sm font-semibold inline-flex items-center gap-1.5">
                        <ShoppingBag className="w-4 h-4 text-emerald-500" />
                        Add ingredients to Shopping List?
                      </span>
                    </button>

                    {/* Scale 0.5x / 1x / 2x Switcher */}
                    <div
                      className={`inline-flex items-center p-0.5 rounded-lg border ${
                        isLight
                          ? 'bg-white border-stone-300'
                          : 'bg-slate-900 border-slate-800'
                      }`}
                      role="group"
                      aria-label="Portion scale"
                    >
                      {SCALE_OPTIONS.map((opt) => {
                        const active = Math.abs(scaleFactor - opt) < 0.01;
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setScaleFactor(opt)}
                            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                              active
                                ? isLight
                                  ? 'bg-emerald-100 text-emerald-900'
                                  : 'bg-emerald-900/70 text-emerald-100'
                                : 'opacity-65 hover:opacity-100'
                            }`}
                          >
                            {opt}x
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {importToShoppingList && (
                    <div className="space-y-2 pt-1">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="opacity-75">
                          {selectedIngredientIndices.size} of{' '}
                          {selectedRecipe.ingredients.length} selected
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={handleUncheckStaples}
                            className={`px-2.5 py-1 rounded-lg border font-medium transition-colors cursor-pointer ${
                              isLight
                                ? 'bg-white border-stone-300 text-slate-700 hover:bg-stone-100'
                                : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                            }`}
                          >
                            Uncheck staples
                          </button>
                          <button
                            type="button"
                            onClick={handleSelectAllIngredients}
                            className={`px-2.5 py-1 rounded-lg border font-medium transition-colors cursor-pointer ${
                              isLight
                                ? 'bg-white border-stone-300 text-slate-700 hover:bg-stone-100'
                                : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
                            }`}
                          >
                            Select all
                          </button>
                        </div>
                      </div>

                      <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                        {selectedRecipe.ingredients.map((rawLine, idx) => {
                          const checked = selectedIngredientIndices.has(idx);
                          const isStaple = isIngredientHouseholdStaple(rawLine);
                          const scaled = parseIngredientLine(
                            rawLine,
                            scaleFactor
                          );
                          return (
                            <button
                              key={`${idx}-${rawLine}`}
                              type="button"
                              onClick={() => handleToggleIngredientIdx(idx)}
                              className={`w-full px-2.5 py-1.5 rounded-lg border text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                                checked
                                  ? isLight
                                    ? 'bg-white border-stone-300/90 text-slate-800'
                                    : 'bg-slate-900/80 border-slate-800 text-slate-200'
                                  : 'border-transparent opacity-55'
                              }`}
                            >
                              <span className="flex items-center gap-2 min-w-0">
                                <span
                                  className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                                    checked
                                      ? 'bg-emerald-600 border-emerald-500 text-white'
                                      : isLight
                                        ? 'border-stone-400'
                                        : 'border-slate-600'
                                  }`}
                                >
                                  {checked && <Check className="w-3 h-3" />}
                                </span>
                                <span className="truncate">
                                  {scaled.quantityLabel ? (
                                    <strong className="font-semibold mr-1">
                                      {scaled.quantityLabel}
                                    </strong>
                                  ) : null}
                                  {scaled.itemLabel}
                                  {scaled.notesLabel
                                    ? ` (${scaled.notesLabel})`
                                    : ''}
                                </span>
                              </span>

                              {isStaple && (
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] shrink-0 ${
                                    isLight
                                      ? 'bg-amber-100 text-amber-900'
                                      : 'bg-amber-950/60 text-amber-300/90'
                                  }`}
                                >
                                  Staple
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div
          className={`shrink-0 px-5 py-3.5 border-t flex items-center justify-between gap-3 ${
            isLight
              ? 'bg-stone-100/90 border-stone-200'
              : 'bg-slate-900/80 border-slate-800/80'
          }`}
        >
          <div>
            {effectiveEditingMeal && (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void handleRemoveMeal()}
                className={`min-h-[44px] px-3.5 rounded-xl border text-xs md:text-sm font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isLight
                    ? 'bg-white border-stone-300 text-slate-600 hover:text-amber-900 hover:border-amber-400'
                    : 'bg-slate-800/70 border-slate-700 text-slate-300 hover:text-amber-200 hover:border-amber-700/60'
                }`}
              >
                <Trash2 className="w-4 h-4" />
                <span>Remove Meal</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className={`min-h-[44px] px-4 rounded-xl border text-xs md:text-sm font-medium transition-colors cursor-pointer ${
                isLight
                  ? 'bg-white border-stone-300 text-slate-700 hover:bg-stone-100'
                  : 'bg-slate-800/70 border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canSaveMeal || isSubmitting}
              onClick={() => void handleSaveScheduledMeal()}
              className={`min-h-[44px] px-5 rounded-xl text-xs md:text-sm font-semibold inline-flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                isLight
                  ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                  : 'bg-emerald-700/95 text-white hover:bg-emerald-600'
              }`}
            >
              <Check className="w-4 h-4" />
              <span>
                {isSubmitting
                  ? 'Saving...'
                  : effectiveEditingMeal
                    ? 'Update Meal'
                    : 'Schedule Meal'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const MealEntryModal: React.FC<MealEntryModalProps> = ({
  isOpen,
  date,
  initialSlot = 'dinner',
  editingMeal,
  initialMode,
  defaultCookProfileId,
  isLight = false,
  onClose,
  onSaved,
}) => {
  if (!isOpen) return null;

  const sessionKey = `${date}-${initialSlot}-${editingMeal?.id ?? 'new'}-${editingMeal?.updatedAt ?? ''}-${initialMode ?? 'auto'}-${defaultCookProfileId ?? ''}`;
  const content = (
    <MealEntryModalContent
      key={sessionKey}
      date={date}
      initialSlot={initialSlot}
      editingMeal={editingMeal}
      initialMode={initialMode}
      defaultCookProfileId={defaultCookProfileId}
      isLight={isLight}
      onClose={onClose}
      onSaved={onSaved}
    />
  );

  if (typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }
  return content;
};

export default MealEntryModal;
