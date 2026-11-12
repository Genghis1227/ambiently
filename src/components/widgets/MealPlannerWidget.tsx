import type React from 'react';
import { useState, useEffect, useMemo } from 'react';
import {
  Utensils,
  Plus,
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Check,
  Copy,
  Trash2,
  X,
  Sparkles,
  StickyNote,
} from 'lucide-react';
import type {
  GoogleKeepExportMode,
  GroceryCategory,
  MealSlot,
  MealWidgetConfig,
  Recipe,
  ScheduledMeal,
  ShoppingListItem,
  WeekStartDay,
  WidgetMealScope,
} from '../../types/meals';
import type { StickyNoteItem } from '../../types/dashboard';
import { DEFAULT_AISLE_ORDER } from '../../types/meals';
import { useMealStore } from '../../stores/useMealStore';
import { useProfileStore } from '../../stores/useProfileStore';
import { useDashboardStore } from '../../store/dashboardStore';
import {
  aggregateIngredients,
  normalizeItemNameSingular,
} from '../../utils/ingredientAggregator';
import { isAmbientlyInNightMode } from '../../utils/confetti';
import { localDateKey } from '../../utils/dateKey';
import { ProfileAvatar } from '../common/ProfileAvatar';
import { MealEntryModal } from '../meals/MealEntryModal';
import { CookingModeModal } from '../meals/CookingModeModal';

export interface MealPlannerWidgetProps {
  title?: string;
  config?: MealWidgetConfig & { weekStartsOn?: WeekStartDay };
  isLight?: boolean;
  onUpdateConfig?: (
    updates: Partial<MealWidgetConfig> & { weekStartsOn?: WeekStartDay }
  ) => void;
}

const ALL_SLOTS: readonly MealSlot[] = ['breakfast', 'lunch', 'dinner'];

const SLOT_SHORT_LABELS: Record<MealSlot, string> = {
  breakfast: 'Bkfst',
  lunch: 'Lunch',
  dinner: 'Dinner',
};

const SLOT_FULL_LABELS: Record<MealSlot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
};

const SCOPE_OPTIONS: readonly { id: WidgetMealScope; label: string }[] = [
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'three_day', label: '3-Day' },
  { id: 'full_week', label: 'Week' },
];

function addDays(base: Date, daysDelta: number): Date {
  return new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate() + daysDelta,
    0,
    0,
    0,
    0
  );
}

function getStartOfWeekDate(ref: Date, weekStartsOn: WeekStartDay): Date {
  const dayOfWeek = ref.getDay(); // 0 = Sun .. 6 = Sat
  const startIndex = weekStartsOn === 'monday' ? 1 : 0;
  const offset = (dayOfWeek - startIndex + 7) % 7;
  return addDays(ref, -offset);
}

function getSlotPillClasses(slot: MealSlot, isLight: boolean): string {
  if (slot === 'breakfast') {
    return isLight
      ? 'bg-amber-50/90 border-amber-300/70 text-amber-950 hover:bg-amber-100/80'
      : 'bg-amber-950/35 border-amber-700/35 text-amber-100/95 hover:bg-amber-900/45';
  }
  if (slot === 'lunch') {
    return isLight
      ? 'bg-emerald-50/90 border-emerald-300/70 text-emerald-950 hover:bg-emerald-100/80'
      : 'bg-emerald-950/35 border-emerald-700/35 text-emerald-100/95 hover:bg-emerald-900/45';
  }
  return isLight
    ? 'bg-slate-100/95 border-slate-300/80 text-slate-900 hover:bg-slate-200/85'
    : 'bg-slate-800/70 border-slate-600/45 text-slate-100 hover:bg-slate-800/95';
}

interface DayBoxDescriptor {
  dateObj: Date;
  dateKey: string;
  isToday: boolean;
  isTomorrow: boolean;
  weekdayShort: string;
  monthDayLabel: string;
}

export const MealPlannerWidget: React.FC<MealPlannerWidgetProps> = ({
  title = 'Family Meal Planner',
  config,
  isLight = false,
  onUpdateConfig,
}) => {
  const isMealStoreInitialized = useMealStore((s) => s.isInitialized);
  const recipes = useMealStore((s) => s.recipes);
  const scheduledMeals = useMealStore((s) => s.scheduledMeals);
  const shoppingItems = useMealStore((s) => s.shoppingItems);
  const staples = useMealStore((s) => s.staples);
  const aisleOrder = useMealStore((s) => s.aisleOrder);
  const storeWeekStartsOn = useMealStore((s) => s.weekStartsOn);

  const setWeekStartsOn = useMealStore((s) => s.setWeekStartsOn);
  const addShoppingItem = useMealStore((s) => s.addShoppingItem);
  const addStapleToShoppingList = useMealStore(
    (s) => s.addStapleToShoppingList
  );
  const toggleShoppingItemChecked = useMealStore(
    (s) => s.toggleShoppingItemChecked
  );
  const removeShoppingItem = useMealStore((s) => s.removeShoppingItem);
  const clearCheckedItems = useMealStore((s) => s.clearCheckedItems);
  const exportShoppingListForGoogleKeep = useMealStore(
    (s) => s.exportShoppingListForGoogleKeep
  );

  const settings = useDashboardStore((s) => s.settings);
  const boardNotes = useDashboardStore((s) => s.notes);
  const activeTabId = useDashboardStore((s) => s.activeTabId);

  // Refresh clock tick every 60s so midnight date rollover and Night Mode schedules stay accurate
  const [clockTick, setClockTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => {
      setClockTick(Date.now());
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Ensure store hydration if mounted standalone
  const isProfileStoreInitialized = useProfileStore((s) => s.isInitialized);
  useEffect(() => {
    if (!isMealStoreInitialized) {
      void useMealStore.getState().initMealStore();
    }
    if (!isProfileStoreInitialized) {
      void useProfileStore.getState().initProfileStore();
    }
  }, [isMealStoreInitialized, isProfileStoreInitialized]);

  const isNightMode = useMemo(
    () =>
      Boolean(settings?.nightModeEnabled) || isAmbientlyInNightMode(settings),
    // clockTick keeps scheduled night window evaluation live
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, clockTick]
  );

  // Scope & Week navigation state
  const [fallbackScope, setFallbackScope] =
    useState<WidgetMealScope>('three_day');
  const effectiveScope: WidgetMealScope = config?.scope || fallbackScope;

  const effectiveWeekStartsOn: WeekStartDay =
    config?.weekStartsOn || storeWeekStartsOn || 'sunday';

  const visibleSlots: MealSlot[] = useMemo(() => {
    if (Array.isArray(config?.visibleSlots) && config.visibleSlots.length > 0) {
      return ALL_SLOTS.filter((s) => config.visibleSlots?.includes(s));
    }
    return [...ALL_SLOTS];
  }, [config?.visibleSlots]);

  const showCookAvatar = config?.showCookAvatar !== false;

  const [weekOffset, setWeekOffset] = useState<number>(0);

  // Shopping List Drawer state
  const [isShoppingOpen, setIsShoppingOpen] = useState<boolean>(false);
  const [quickShopInput, setQuickShopInput] = useState<string>('');
  const [showStapleTray, setShowStapleTray] = useState<boolean>(false);
  const [recentlyAddedStapleId, setRecentlyAddedStapleId] = useState<
    string | null
  >(null);
  const [keepExportMode, setKeepExportMode] =
    useState<GoogleKeepExportMode>('checklist');
  const [copiedKeepNotice, setCopiedKeepNotice] = useState<boolean>(false);
  const [stickyNoteNotice, setStickyNoteNotice] = useState<string>('');

  // Meal Entry & Cooking Mode Modals state
  const [entryModalState, setEntryModalState] = useState<{
    isOpen: boolean;
    date: string;
    slot: MealSlot;
    editingMeal: ScheduledMeal | null;
    initialMode?: 'quick' | 'recipe';
  }>({
    isOpen: false,
    date: localDateKey(new Date()),
    slot: 'dinner',
    editingMeal: null,
  });

  const [cookingModalState, setCookingModalState] = useState<{
    isOpen: boolean;
    recipe: Recipe | null;
    scheduledMeal: ScheduledMeal | null;
  }>({
    isOpen: false,
    recipe: null,
    scheduledMeal: null,
  });

  // Compute reference Today & Tomorrow dates
  const todayDate = useMemo(() => {
    const now = new Date(clockTick);
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, [clockTick]);

  const todayKey = useMemo(() => localDateKey(todayDate), [todayDate]);
  const tomorrowKey = useMemo(
    () => localDateKey(addDays(todayDate, 1)),
    [todayDate]
  );

  // Build visible Day Box descriptors for active scope
  const dayBoxes: DayBoxDescriptor[] = useMemo(() => {
    const buildDescriptor = (d: Date): DayBoxDescriptor => {
      const key = localDateKey(d);
      return {
        dateObj: d,
        dateKey: key,
        isToday: key === todayKey,
        isTomorrow: key === tomorrowKey,
        weekdayShort: d.toLocaleDateString([], { weekday: 'short' }),
        monthDayLabel: d.toLocaleDateString([], {
          month: 'short',
          day: 'numeric',
        }),
      };
    };

    if (effectiveScope === 'tomorrow') {
      return [buildDescriptor(addDays(todayDate, 1))];
    }

    if (effectiveScope === 'three_day') {
      return [
        buildDescriptor(todayDate),
        buildDescriptor(addDays(todayDate, 1)),
        buildDescriptor(addDays(todayDate, 2)),
      ];
    }

    // full_week
    const shiftedRef = addDays(todayDate, weekOffset * 7);
    const weekStart = getStartOfWeekDate(shiftedRef, effectiveWeekStartsOn);
    return Array.from({ length: 7 }, (_, idx) =>
      buildDescriptor(addDays(weekStart, idx))
    );
  }, [
    effectiveScope,
    todayDate,
    todayKey,
    tomorrowKey,
    weekOffset,
    effectiveWeekStartsOn,
  ]);

  const weekRangeLabel = useMemo(() => {
    if (effectiveScope !== 'full_week' || dayBoxes.length < 7) return '';
    const first = dayBoxes[0].dateObj;
    const last = dayBoxes[6].dateObj;
    const sameMonth = first.getMonth() === last.getMonth();
    const startStr = first.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
    });
    const endStr = sameMonth
      ? String(last.getDate())
      : last.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `${startStr} – ${endStr}`;
  }, [effectiveScope, dayBoxes]);

  const recipeById = useMemo(() => {
    const map = new Map<string, Recipe>();
    for (const r of recipes) {
      if (!r.deletedAt) {
        map.set(r.id, r);
      }
    }
    return map;
  }, [recipes]);

  const mealsByDate = useMemo(() => {
    const slotOrder: Record<MealSlot, number> = {
      breakfast: 0,
      lunch: 1,
      dinner: 2,
    };
    const visibleSlotSet = new Set<MealSlot>(visibleSlots);
    const map = new Map<string, ScheduledMeal[]>();

    for (const meal of scheduledMeals) {
      if (meal.deletedAt || !visibleSlotSet.has(meal.slot)) continue;
      const arr = map.get(meal.date) || [];
      arr.push(meal);
      map.set(meal.date, arr);
    }

    for (const arr of map.values()) {
      arr.sort((a, b) => (slotOrder[a.slot] ?? 9) - (slotOrder[b.slot] ?? 9));
    }

    return map;
  }, [scheduledMeals, visibleSlots]);

  // Shopping list counts & grouped sections
  const uncheckedShoppingCount = useMemo(
    () => shoppingItems.filter((item) => !item.checked).length,
    [shoppingItems]
  );
  const checkedShoppingCount = useMemo(
    () => shoppingItems.filter((item) => item.checked).length,
    [shoppingItems]
  );

  const groupedShoppingSections = useMemo(() => {
    const order: GroceryCategory[] =
      Array.isArray(aisleOrder) && aisleOrder.length > 0
        ? aisleOrder
        : [...DEFAULT_AISLE_ORDER];
    const byCategory = new Map<string, ShoppingListItem[]>();
    for (const item of shoppingItems) {
      const cat = item.category || 'Household & Other';
      const list = byCategory.get(cat) || [];
      list.push(item);
      byCategory.set(cat, list);
    }

    // Put unchecked items first within each aisle
    for (const list of byCategory.values()) {
      list.sort((a, b) => Number(a.checked) - Number(b.checked));
    }

    const categories: string[] = [];
    const seen = new Set<string>();
    for (const cat of order) {
      if (byCategory.has(cat) && !seen.has(cat)) {
        categories.push(cat);
        seen.add(cat);
      }
    }
    for (const cat of byCategory.keys()) {
      if (!seen.has(cat)) {
        categories.push(cat);
        seen.add(cat);
      }
    }

    return categories.map((category) => ({
      category,
      items: byCategory.get(category) || [],
    }));
  }, [shoppingItems, aisleOrder]);

  const handleScopeChange = (nextScope: WidgetMealScope) => {
    setFallbackScope(nextScope);
    setWeekOffset(0);
    onUpdateConfig?.({ scope: nextScope });
  };

  const handleToggleWeekStartsOn = () => {
    const next: WeekStartDay =
      effectiveWeekStartsOn === 'sunday' ? 'monday' : 'sunday';
    void setWeekStartsOn(next);
    onUpdateConfig?.({ weekStartsOn: next });
  };

  const openScheduleForDay = (
    dateKey: string,
    preferredSlot?: MealSlot,
    initialMode?: 'quick' | 'recipe'
  ) => {
    const existingForDay = mealsByDate.get(dateKey) || [];
    const occupiedSlots = new Set(existingForDay.map((m) => m.slot));
    const chosenSlot =
      preferredSlot ||
      visibleSlots.find((s) => !occupiedSlots.has(s)) ||
      visibleSlots[visibleSlots.length - 1] ||
      'dinner';

    const existingInChosen =
      existingForDay.find((m) => m.slot === chosenSlot) || null;

    setEntryModalState({
      isOpen: true,
      date: dateKey,
      slot: chosenSlot,
      editingMeal: existingInChosen,
      initialMode,
    });
  };

  const handleMealPillClick = (meal: ScheduledMeal) => {
    if (meal.recipeId) {
      const linkedRecipe = recipeById.get(meal.recipeId);
      if (linkedRecipe) {
        setCookingModalState({
          isOpen: true,
          recipe: linkedRecipe,
          scheduledMeal: meal,
        });
        return;
      }
    }

    setEntryModalState({
      isOpen: true,
      date: meal.date,
      slot: meal.slot,
      editingMeal: meal,
    });
  };

  const handleQuickAddShoppingItem = async () => {
    const trimmed = quickShopInput.trim();
    if (!trimmed) return;
    setQuickShopInput('');
    await addShoppingItem(trimmed);
  };

  const handleQuickAddStaple = async (stapleId: string) => {
    await addStapleToShoppingList(stapleId);
    setRecentlyAddedStapleId(stapleId);
    window.setTimeout(() => {
      setRecentlyAddedStapleId((cur) => (cur === stapleId ? null : cur));
    }, 1200);
  };

  // Dedicated Shopping List Sticky Note on the canvas (`isShoppingList: true`)
  const targetListNote = useMemo((): StickyNoteItem | undefined => {
    const isUsableChecklist = (n: StickyNoteItem | undefined): n is StickyNoteItem =>
      Boolean(n && (n.isChecklist || n.isShoppingList || n.freeformPos?.isShoppingList) && !n.deleted_at && !n.archivedAt);
    const isDedicatedShoppingNote = (n: StickyNoteItem): boolean =>
      Boolean(n.isShoppingList || n.freeformPos?.isShoppingList);

    if (config?.listNoteId) {
      const explicit = boardNotes.find((n) => n.id === config.listNoteId);
      if (isUsableChecklist(explicit)) return explicit;
    }

    const pattern = /shopping|grocer|essentials/i;
    return (
      boardNotes.find(
        (n) =>
          isUsableChecklist(n) &&
          isDedicatedShoppingNote(n) &&
          (n.tabId === activeTabId || n.tabId === 'all')
      ) ||
      boardNotes.find((n) => isUsableChecklist(n) && isDedicatedShoppingNote(n)) ||
      boardNotes.find(
        (n) =>
          isUsableChecklist(n) &&
          (n.tabId === activeTabId || n.tabId === 'all') &&
          pattern.test(n.title || '')
      ) ||
      boardNotes.find((n) => isUsableChecklist(n) && pattern.test(n.title || ''))
    );
  }, [boardNotes, config?.listNoteId, activeTabId]);

  // Combined items ready to sync into the canvas Sticky Note (unchecked shopping items + upcoming scheduled recipes)
  const syncableStickyNoteItems = useMemo(() => {
    const out: { key: string; label: string; category?: GroceryCategory }[] = [];
    const seenKeys = new Set<string>();

    for (const item of shoppingItems) {
      if (item.checked) continue;
      const key = item.normalizedKey || normalizeItemNameSingular(item.displayLabel);
      if (key && !seenKeys.has(key)) {
        seenKeys.add(key);
        out.push({ key, label: item.displayLabel, category: item.category });
      }
    }

    if (out.length === 0) {
      const upcomingSpecs: {
        raw: string;
        scaleFactor?: number;
        sourceRecipeId?: string;
        sourceMealId?: string;
      }[] = [];
      for (const day of dayBoxes) {
        if (day.dateKey < todayKey) continue;
        const dayMeals = mealsByDate.get(day.dateKey) || [];
        for (const meal of dayMeals) {
          if (!meal.recipeId) continue;
          const recipe = recipeById.get(meal.recipeId);
          if (!recipe) continue;
          for (const raw of recipe.ingredients) {
            upcomingSpecs.push({
              raw,
              scaleFactor: meal.scaleFactor ?? 1,
              sourceRecipeId: recipe.id,
              sourceMealId: meal.id,
            });
          }
        }
      }
      if (upcomingSpecs.length > 0) {
        const aggregated = aggregateIngredients(upcomingSpecs);
        for (const agg of aggregated) {
          const key = agg.normalizedKey || normalizeItemNameSingular(agg.displayLabel);
          if (key && !seenKeys.has(key)) {
            seenKeys.add(key);
            out.push({ key, label: agg.displayLabel, category: agg.category });
          }
        }
      }
    }

    return out;
  }, [shoppingItems, dayBoxes, todayKey, mealsByDate, recipeById]);

  const handleSendToStickyNote = async () => {
    if (syncableStickyNoteItems.length === 0) return;
    const dashStore = useDashboardStore.getState();
    const makeId = () =>
      `chk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

    const mergeChecklistItems = (
      existingItems: NonNullable<StickyNoteItem['checklistItems']>
    ) => {
      const next = existingItems.map((i) => ({ ...i }));
      let addedOrReopened = 0;

      for (const entry of syncableStickyNoteItems) {
        const entryLower = entry.label.trim().toLowerCase();
        const existing = next.find((i) => {
          const textTrimmed = i.text.trim();
          return (
            textTrimmed.toLowerCase() === entryLower ||
            normalizeItemNameSingular(textTrimmed) === entry.key
          );
        });

        if (existing) {
          if (existing.done) {
            existing.done = false;
            existing.text = entry.label;
            if (entry.category) existing.category = entry.category;
            addedOrReopened += 1;
          } else if (entry.category && !existing.category) {
            existing.category = entry.category;
          }
        } else {
          next.push({
            id: makeId(),
            text: entry.label,
            done: false,
            ...(entry.category ? { category: entry.category } : {}),
          });
          addedOrReopened += 1;
        }
      }

      return { items: next, addedOrReopened };
    };

    const currentNote = targetListNote
      ? dashStore.notes.find((n) => n.id === targetListNote.id)
      : undefined;

    if (
      currentNote &&
      (currentNote.isChecklist || currentNote.isShoppingList || currentNote.freeformPos?.isShoppingList) &&
      !currentNote.deleted_at &&
      !currentNote.archivedAt
    ) {
      const { items, addedOrReopened } = mergeChecklistItems(
        currentNote.checklistItems || []
      );
      await dashStore.updateNote(currentNote.id, {
        isChecklist: true,
        isShoppingList: true,
        checklistItems: items,
        isPinnedToCanvas: true,
      });
      if (config?.listNoteId !== currentNote.id) {
        onUpdateConfig?.({ listNoteId: currentNote.id });
      }
      const noteName = currentNote.title || '🛒 Shopping List';
      setStickyNoteNotice(
        addedOrReopened > 0
          ? `Sent ${addedOrReopened} to ${noteName}`
          : `All items already on ${noteName}`
      );
    } else {
      const newNoteId = `note-shop-${Date.now().toString(36)}`;
      const { items } = mergeChecklistItems([]);
      await dashStore.addNote({
        id: newNoteId,
        tabId: activeTabId,
        title: '🛒 Shopping List',
        content: '',
        isChecklist: true,
        isShoppingList: true,
        checklistItems: items,
        bgColor: '#bbf7d0',
        isPinnedToCanvas: true,
      });
      onUpdateConfig?.({ listNoteId: newNoteId });
      setStickyNoteNotice(`Created 🛒 Shopping List (${items.length} items)`);
    }

    window.setTimeout(() => setStickyNoteNotice(''), 3200);
  };

  const handleCopyForGoogleKeep = async () => {
    const formatted = exportShoppingListForGoogleKeep(keepExportMode);
    if (!formatted) return;

    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard?.writeText
      ) {
        await navigator.clipboard.writeText(formatted);
      } else if (typeof document !== 'undefined') {
        const ta = document.createElement('textarea');
        ta.value = formatted;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
      setCopiedKeepNotice(true);
      window.setTimeout(() => setCopiedKeepNotice(false), 2200);
    } catch {
      // Ignore clipboard permission errors on locked browsers
    }
  };

  return (
    <div
      className={`h-full flex flex-col overflow-hidden select-none p-3 md:p-4 ${
        isLight ? 'text-slate-800' : 'text-slate-100'
      }`}
    >
      {/* Widget Header */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-500/15">
        <div className="flex items-center gap-2 min-w-0">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center border shrink-0 ${
              isLight
                ? 'bg-emerald-100/80 border-emerald-300/70 text-emerald-800'
                : 'bg-emerald-950/45 border-emerald-800/50 text-emerald-300/90'
            }`}
          >
            <Utensils className="w-3.5 h-3.5" />
          </div>
          <h3 className="text-sm font-semibold tracking-tight truncate">
            {title}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Scope Selector */}
          {!isShoppingOpen && (
            <div
              className={`inline-flex items-center p-0.5 rounded-lg border ${
                isLight
                  ? 'bg-stone-200/70 border-stone-300/80'
                  : 'bg-slate-900/75 border-slate-800'
              }`}
              role="group"
              aria-label="Meal planner view scope"
            >
              {SCOPE_OPTIONS.map((opt) => {
                const active = effectiveScope === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    data-no-drag="true"
                    onClick={() => handleScopeChange(opt.id)}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                      active
                        ? isLight
                          ? 'bg-white text-slate-900 border border-stone-300/70 font-semibold'
                          : 'bg-slate-800 text-slate-100 border border-slate-700/70 font-semibold'
                        : isLight
                          ? 'text-slate-600 hover:text-slate-900'
                          : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Recipe Book Quick Launcher */}
          <button
            type="button"
            data-no-drag="true"
            onClick={() =>
              openScheduleForDay(
                effectiveScope === 'tomorrow' ? tomorrowKey : todayKey,
                undefined,
                'recipe'
              )
            }
            title="Open Household Recipe Book"
            className={`min-h-[30px] px-2 rounded-lg border inline-flex items-center gap-1 text-[11px] font-medium transition-colors cursor-pointer ${
              isLight
                ? 'bg-white/80 border-stone-300/80 text-slate-700 hover:bg-stone-100'
                : 'bg-slate-900/75 border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-emerald-500/90" />
            <span className="hidden sm:inline">Recipes</span>
          </button>

          {/* Shopping List Drawer Toggle (Night Mode suppresses any bright badge glow) */}
          <button
            type="button"
            data-no-drag="true"
            onClick={() => setIsShoppingOpen((v) => !v)}
            title="Toggle Grocery Shopping List"
            className={`min-h-[30px] px-2.5 rounded-lg border inline-flex items-center gap-1.5 text-[11px] font-medium transition-colors cursor-pointer ${
              isShoppingOpen
                ? isLight
                  ? 'bg-emerald-700 border-emerald-700 text-white'
                  : 'bg-emerald-900/75 border-emerald-700/70 text-emerald-100'
                : isLight
                  ? 'bg-white/80 border-stone-300/80 text-slate-700 hover:bg-stone-100'
                  : 'bg-slate-900/75 border-slate-800 text-slate-300 hover:bg-slate-800'
            } ${isNightMode ? 'shadow-none ring-0' : ''}`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Groceries</span>
            {uncheckedShoppingCount > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-semibold tabular-nums ${
                  isNightMode
                    ? 'bg-slate-700/80 text-slate-200 shadow-none ring-0'
                    : isShoppingOpen
                      ? 'bg-white/20 text-white'
                      : isLight
                        ? 'bg-amber-200/90 text-amber-950'
                        : 'bg-amber-500/85 text-slate-950'
                }`}
              >
                {uncheckedShoppingCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Full-Week Navigation Sub-Bar */}
      {!isShoppingOpen && effectiveScope === 'full_week' && (
        <div className="shrink-0 flex items-center justify-between gap-2 pt-2 pb-1 text-xs">
          <div className="flex items-center gap-1">
            <button
              type="button"
              data-no-drag="true"
              onClick={() => setWeekOffset((w) => w - 1)}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                isLight
                  ? 'bg-white/80 border-stone-300 text-slate-700 hover:bg-stone-100'
                  : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
              aria-label="Previous week"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              data-no-drag="true"
              onClick={() => setWeekOffset((w) => w + 1)}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                isLight
                  ? 'bg-white/80 border-stone-300 text-slate-700 hover:bg-stone-100'
                  : 'bg-slate-900/70 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
              aria-label="Next week"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <span className="ml-1.5 font-medium opacity-85">
              {weekRangeLabel}
            </span>
            {weekOffset !== 0 && (
              <button
                type="button"
                data-no-drag="true"
                onClick={() => setWeekOffset(0)}
                className={`ml-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-colors cursor-pointer ${
                  isLight
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                    : 'bg-emerald-950/50 border-emerald-800/60 text-emerald-300'
                }`}
              >
                Today
              </button>
            )}
          </div>

          <button
            type="button"
            data-no-drag="true"
            onClick={handleToggleWeekStartsOn}
            title="Switch week start day between Sunday and Monday"
            className={`px-2 py-1 rounded-lg border text-[11px] font-medium transition-colors cursor-pointer ${
              isLight
                ? 'bg-white/80 border-stone-300 text-slate-600 hover:text-slate-900'
                : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Starts:{' '}
            <span className="font-semibold capitalize">
              {effectiveWeekStartsOn === 'monday' ? 'Mon' : 'Sun'}
            </span>
          </button>
        </div>
      )}

      {/* Contained Scrollable Body: Either Shopping List Drawer OR Scope Day Boxes */}
      {isShoppingOpen ? (
        <div
          data-no-drag="true"
          className="flex-1 min-h-0 flex flex-col overflow-hidden pt-2.5 gap-2"
        >
          {/* Quick-Add Grocery Input + Staples Toggle */}
          <div className="shrink-0 flex items-center gap-1.5">
            <input
              type="text"
              placeholder="Add grocery item (e.g., 2 avocados)..."
              value={quickShopInput}
              onChange={(e) => setQuickShopInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleQuickAddShoppingItem();
                }
              }}
              className={`flex-1 min-h-[36px] px-3 rounded-xl border text-xs focus:outline-none ${
                isLight
                  ? 'bg-white border-stone-300 text-slate-900 placeholder-slate-400'
                  : 'bg-slate-950/75 border-slate-800 text-slate-100 placeholder-slate-500'
              }`}
            />
            <button
              type="button"
              onClick={() => void handleQuickAddShoppingItem()}
              disabled={!quickShopInput.trim()}
              className={`min-h-[36px] px-3 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 ${
                isLight
                  ? 'bg-emerald-700 text-white hover:bg-emerald-800'
                  : 'bg-emerald-800 text-emerald-50 hover:bg-emerald-700'
              }`}
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setShowStapleTray((v) => !v)}
              className={`min-h-[36px] px-2.5 rounded-xl border text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer ${
                showStapleTray
                  ? isLight
                    ? 'bg-amber-100 border-amber-300 text-amber-950'
                    : 'bg-amber-950/50 border-amber-700/60 text-amber-200'
                  : isLight
                    ? 'bg-white border-stone-300 text-slate-700'
                    : 'bg-slate-900/75 border-slate-800 text-slate-300'
              }`}
              title="Quick-add household staples"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Staples</span>
            </button>
          </div>

          {/* Collapsible Household Staples Tray */}
          {showStapleTray && staples.length > 0 && (
            <div
              className={`shrink-0 p-2 rounded-xl border flex flex-wrap items-center gap-1.5 max-h-24 overflow-y-auto ${
                isLight
                  ? 'bg-stone-100/90 border-stone-200'
                  : 'bg-slate-950/60 border-slate-800/80'
              }`}
            >
              {staples.map((staple) => {
                const justAdded = recentlyAddedStapleId === staple.id;
                return (
                  <button
                    key={staple.id}
                    type="button"
                    onClick={() => void handleQuickAddStaple(staple.id)}
                    className={`px-2.5 py-1 rounded-lg border text-[11px] font-medium inline-flex items-center gap-1 transition-colors cursor-pointer ${
                      justAdded
                        ? isLight
                          ? 'bg-emerald-100 border-emerald-400 text-emerald-900'
                          : 'bg-emerald-950/70 border-emerald-600 text-emerald-200'
                        : isLight
                          ? 'bg-white border-stone-300/90 text-slate-700 hover:bg-stone-50'
                          : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {justAdded ? (
                      <Check className="w-3 h-3 text-emerald-500" />
                    ) : (
                      <Plus className="w-3 h-3 opacity-65" />
                    )}
                    <span>{staple.name}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Grouped Shopping List Items */}
          <div className="flex-1 min-h-0 overflow-y-auto space-y-2.5 pr-0.5">
            {groupedShoppingSections.length === 0 ? (
              <div
                className={`h-full min-h-[100px] rounded-xl border flex flex-col items-center justify-center p-4 text-center text-xs ${
                  isLight
                    ? 'bg-stone-100/60 border-stone-200/80 text-slate-500'
                    : 'bg-slate-950/40 border-slate-800/60 text-slate-400'
                }`}
              >
                <p>Shopping list is clear.</p>
                <p className="mt-1 opacity-75">
                  Import ingredients from a recipe or tap Staples above.
                </p>
              </div>
            ) : (
              groupedShoppingSections.map((section) => (
                <div key={section.category} className="space-y-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider opacity-60 px-1">
                    {section.category}
                  </div>
                  <div className="space-y-1">
                    {section.items.map((item) => (
                      <div
                        key={item.id}
                        className={`px-2.5 py-1.5 rounded-lg border flex items-center justify-between gap-2 text-xs transition-colors ${
                          item.checked
                            ? isLight
                              ? 'bg-stone-100/60 border-stone-200/60 text-slate-400'
                              : 'bg-slate-950/30 border-slate-800/40 text-slate-500'
                            : isLight
                              ? 'bg-white border-stone-200/90 text-slate-800'
                              : 'bg-slate-900/70 border-slate-800 text-slate-100'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            void toggleShoppingItemChecked(item.id)
                          }
                          className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer"
                        >
                          <span
                            className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                              item.checked
                                ? 'bg-emerald-600/80 border-emerald-500 text-white'
                                : isLight
                                  ? 'border-stone-400'
                                  : 'border-slate-600'
                            }`}
                          >
                            {item.checked && <Check className="w-3 h-3" />}
                          </span>
                          <span
                            className={`truncate ${
                              item.checked ? 'line-through' : 'font-medium'
                            }`}
                          >
                            {item.displayLabel}
                          </span>
                        </button>

                        <button
                          type="button"
                          onClick={() => void removeShoppingItem(item.id)}
                          className="p-1 rounded opacity-40 hover:opacity-100 transition-opacity cursor-pointer"
                          aria-label={`Remove ${item.displayLabel}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Shopping List Footer: Clear Checked + Google Keep Copy */}
          <div className="shrink-0 pt-2 border-t border-slate-500/15 flex flex-wrap items-center justify-between gap-2 text-[11px]">
            <div className="flex items-center gap-1.5">
              {checkedShoppingCount > 0 && (
                <button
                  type="button"
                  onClick={() => void clearCheckedItems()}
                  className={`px-2.5 py-1.5 rounded-lg border inline-flex items-center gap-1 font-medium transition-colors cursor-pointer ${
                    isLight
                      ? 'bg-white border-stone-300 text-slate-600 hover:text-slate-900'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear Checked ({checkedShoppingCount})</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsShoppingOpen(false)}
                className="px-2 py-1.5 rounded-lg opacity-70 hover:opacity-100 font-medium cursor-pointer"
              >
                ← Back to Meals
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={syncableStickyNoteItems.length === 0}
                onClick={() => void handleSendToStickyNote()}
                title={`Send items to ${targetListNote?.title || '🛒 Shopping List'} sticky note on canvas`}
                className={`px-2.5 py-1.5 rounded-lg border font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40 ${
                  stickyNoteNotice
                    ? isLight
                      ? 'bg-emerald-100 border-emerald-400 text-emerald-900'
                      : 'bg-emerald-950/70 border-emerald-600 text-emerald-200'
                    : isLight
                      ? 'bg-amber-50 border-amber-300 text-amber-950 hover:bg-amber-100'
                      : 'bg-amber-950/40 border-amber-700/60 text-amber-200 hover:bg-amber-900/50'
                }`}
              >
                {stickyNoteNotice ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <StickyNote className="w-3.5 h-3.5" />
                )}
                <span>
                  {stickyNoteNotice ||
                    `To ${targetListNote?.title || 'Sticky Note'}`}
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setKeepExportMode((m) =>
                    m === 'checklist' ? 'indented' : 'checklist'
                  )
                }
                title="Switch Google Keep export format"
                className={`px-2 py-1.5 rounded-lg border font-medium cursor-pointer ${
                  isLight
                    ? 'bg-stone-100 border-stone-300 text-slate-600'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                {keepExportMode === 'checklist' ? 'Plain' : '☐ Indented'}
              </button>

              <button
                type="button"
                disabled={uncheckedShoppingCount === 0}
                onClick={() => void handleCopyForGoogleKeep()}
                className={`px-2.5 py-1.5 rounded-lg border font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40 ${
                  copiedKeepNotice
                    ? isLight
                      ? 'bg-emerald-100 border-emerald-400 text-emerald-900'
                      : 'bg-emerald-950/70 border-emerald-600 text-emerald-200'
                    : isLight
                      ? 'bg-white border-stone-300 text-slate-800 hover:bg-stone-100'
                      : 'bg-slate-800 border-slate-700 text-slate-100 hover:bg-slate-700'
                }`}
              >
                {copiedKeepNotice ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedKeepNotice ? 'Copied!' : 'Copy for Keep'}</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* MEAL PLANNER SCOPE BODY */
        <div
          data-no-drag="true"
          className="flex-1 min-h-0 overflow-y-auto pt-2.5 pr-0.5"
        >
          {effectiveScope === 'tomorrow' ? (
            /* SCOPE 1: TOMORROW COMPACT SLOT CARD */
            (() => {
              const tomorrowBox = dayBoxes[0];
              const dayMeals = mealsByDate.get(tomorrowBox.dateKey) || [];
              return (
                <div
                  className={`rounded-2xl border p-3.5 space-y-2.5 ${
                    isLight
                      ? 'bg-white/75 border-stone-200/90'
                      : 'bg-slate-900/45 border-slate-800/80'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <span
                        className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                          isLight
                            ? 'bg-emerald-50 border-emerald-300/70 text-emerald-800'
                            : 'bg-emerald-950/45 border-emerald-800/60 text-emerald-300/90'
                        }`}
                      >
                        Tomorrow
                      </span>
                      <span className="ml-2 text-xs font-semibold opacity-85">
                        {tomorrowBox.weekdayShort}, {tomorrowBox.monthDayLabel}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => openScheduleForDay(tomorrowBox.dateKey)}
                      className={`w-7 h-7 rounded-lg border inline-flex items-center justify-center transition-colors cursor-pointer ${
                        isLight
                          ? 'bg-stone-100 border-stone-300 text-slate-700 hover:bg-stone-200'
                          : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white'
                      }`}
                      title="Plan meal for Tomorrow"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="space-y-2">
                    {visibleSlots.map((slot) => {
                      const meal = dayMeals.find((m) => m.slot === slot);
                      if (!meal) {
                        return (
                          <button
                            key={slot}
                            type="button"
                            onClick={() =>
                              openScheduleForDay(tomorrowBox.dateKey, slot)
                            }
                            className={`w-full min-h-[42px] px-3 py-2 rounded-xl border border-dashed flex items-center justify-between text-xs transition-colors cursor-pointer ${
                              isLight
                                ? 'border-stone-300/80 text-slate-500 hover:bg-stone-100/70 hover:text-slate-700'
                                : 'border-slate-800 text-slate-500 hover:bg-slate-900/60 hover:text-slate-300'
                            }`}
                          >
                            <span className="font-medium">
                              {SLOT_FULL_LABELS[slot]}
                            </span>
                            <span className="inline-flex items-center gap-1 opacity-75">
                              <Plus className="w-3.5 h-3.5" />
                              <span>Plan</span>
                            </span>
                          </button>
                        );
                      }

                      const linkedRecipe = meal.recipeId
                        ? recipeById.get(meal.recipeId)
                        : undefined;
                      const isRecipeLinked = Boolean(linkedRecipe);
                      return (
                        <button
                          key={meal.id}
                          type="button"
                          onClick={() => handleMealPillClick(meal)}
                          className={`w-full min-h-[48px] px-3 py-2 rounded-xl border flex items-center justify-between gap-2.5 text-left transition-colors cursor-pointer ${getSlotPillClasses(
                            meal.slot,
                            isLight
                          )}`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            {linkedRecipe?.imageUrl && (
                              <img
                                src={linkedRecipe.imageUrl}
                                alt=""
                                className="w-8 h-8 rounded-lg object-cover shrink-0 border border-black/10"
                              />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
                                  {SLOT_FULL_LABELS[meal.slot]}
                                </span>
                                {isRecipeLinked && (
                                  <BookOpen className="w-3 h-3 opacity-80 shrink-0" />
                                )}
                                {meal.scaleFactor && meal.scaleFactor !== 1 && (
                                  <span className="text-[10px] font-semibold opacity-75">
                                    {meal.scaleFactor}x
                                  </span>
                                )}
                              </div>
                              <p className="text-xs md:text-sm font-semibold truncate mt-0.5">
                                {meal.title}
                              </p>
                            </div>
                          </div>

                          {showCookAvatar &&
                            (meal.cookProfileId ? (
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEntryModalState({
                                    isOpen: true,
                                    date: meal.date,
                                    slot: meal.slot,
                                    editingMeal: meal,
                                  });
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setEntryModalState({
                                      isOpen: true,
                                      date: meal.date,
                                      slot: meal.slot,
                                      editingMeal: meal,
                                    });
                                  }
                                }}
                                title="Tap to change assigned cook"
                                className="shrink-0 inline-flex items-center"
                              >
                                <ProfileAvatar
                                  profileId={meal.cookProfileId}
                                  size="sm"
                                  showName
                                  showRing={!isNightMode}
                                  className="shrink-0"
                                />
                              </span>
                            ) : (
                              <span
                                role="button"
                                tabIndex={0}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEntryModalState({
                                    isOpen: true,
                                    date: meal.date,
                                    slot: meal.slot,
                                    editingMeal: meal,
                                  });
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setEntryModalState({
                                      isOpen: true,
                                      date: meal.date,
                                      slot: meal.slot,
                                      editingMeal: meal,
                                    });
                                  }
                                }}
                                title="Assign a cook to this meal"
                                className="shrink-0 px-2 py-0.5 rounded-full border border-current/30 text-[10px] font-medium opacity-70 hover:opacity-100 transition-opacity"
                              >
                                + Cook
                              </span>
                            ))}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })()
          ) : (
            /* SCOPE 2 & 3: 3-DAY OUTLOOK OR 7-BOX FULL WEEK PILL BOXES */
            <div
              className={
                effectiveScope === 'three_day'
                  ? 'grid grid-cols-1 gap-2'
                  : 'grid grid-cols-1 sm:grid-cols-2 gap-2'
              }
            >
              {dayBoxes.map((day) => {
                const dayMeals = mealsByDate.get(day.dateKey) || [];
                return (
                  <div
                    key={day.dateKey}
                    className={`rounded-xl border p-2.5 flex flex-col gap-2 transition-colors ${
                      day.isToday
                        ? isLight
                          ? 'bg-emerald-50/55 border-emerald-400/70'
                          : 'bg-emerald-950/20 border-emerald-700/50'
                        : isLight
                          ? 'bg-white/75 border-stone-200/90'
                          : 'bg-slate-900/45 border-slate-800/80'
                    }`}
                  >
                    {/* Day Box Header */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-xs font-semibold">
                          {day.weekdayShort}
                        </span>
                        <span className="text-[11px] opacity-65">
                          {day.monthDayLabel}
                        </span>
                        {day.isToday && (
                          <span
                            className={`px-1.5 py-0.2 rounded-full text-[9px] font-semibold uppercase tracking-wider ${
                              isLight
                                ? 'bg-emerald-200/80 text-emerald-950'
                                : 'bg-emerald-900/70 text-emerald-200'
                            }`}
                          >
                            Today
                          </span>
                        )}
                        {!day.isToday &&
                          day.isTomorrow &&
                          effectiveScope === 'three_day' && (
                            <span className="text-[10px] opacity-65">
                              • Tomorrow
                            </span>
                          )}
                      </div>

                      <button
                        type="button"
                        onClick={() => openScheduleForDay(day.dateKey)}
                        className={`w-6 h-6 rounded-md border inline-flex items-center justify-center transition-colors cursor-pointer shrink-0 ${
                          isLight
                            ? 'bg-stone-100/90 border-stone-300/80 text-slate-600 hover:text-slate-900 hover:bg-stone-200/80'
                            : 'bg-slate-800/70 border-slate-700/70 text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                        }`}
                        title={`Schedule meal for ${day.weekdayShort} ${day.monthDayLabel}`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Populated Meal Pills */}
                    {dayMeals.length === 0 ? (
                      <button
                        type="button"
                        onClick={() => openScheduleForDay(day.dateKey)}
                        className={`w-full py-1.5 px-2.5 rounded-lg border border-dashed text-left text-[11px] transition-colors cursor-pointer ${
                          isLight
                            ? 'border-stone-300/70 text-slate-400 hover:text-slate-600 hover:bg-stone-100/60'
                            : 'border-slate-800/80 text-slate-500 hover:text-slate-300 hover:bg-slate-900/60'
                        }`}
                      >
                        + Tap to plan meals
                      </button>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {dayMeals.map((meal) => {
                          const linkedRecipe = meal.recipeId
                            ? recipeById.get(meal.recipeId)
                            : undefined;
                          const isRecipeLinked = Boolean(linkedRecipe);
                          return (
                            <button
                              key={meal.id}
                              type="button"
                              onClick={() => handleMealPillClick(meal)}
                              className={`max-w-full min-h-[34px] px-2.5 py-1 rounded-lg border inline-flex items-center gap-1.5 text-xs transition-colors cursor-pointer ${getSlotPillClasses(
                                meal.slot,
                                isLight
                              )}`}
                              title={
                                isRecipeLinked
                                  ? `${SLOT_FULL_LABELS[meal.slot]}: ${meal.title} (Tap for Cooking Mode)`
                                  : `${SLOT_FULL_LABELS[meal.slot]}: ${meal.title} (Tap to edit)`
                              }
                            >
                              {showCookAvatar && meal.cookProfileId && (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEntryModalState({
                                      isOpen: true,
                                      date: meal.date,
                                      slot: meal.slot,
                                      editingMeal: meal,
                                    });
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setEntryModalState({
                                        isOpen: true,
                                        date: meal.date,
                                        slot: meal.slot,
                                        editingMeal: meal,
                                      });
                                    }
                                  }}
                                  title="Tap to change assigned cook"
                                  className="shrink-0 inline-flex items-center"
                                >
                                  <ProfileAvatar
                                    profileId={meal.cookProfileId}
                                    size="sm"
                                    showName={effectiveScope === 'three_day'}
                                    showRing={!isNightMode}
                                    className="shrink-0"
                                  />
                                </span>
                              )}
                              <span className="text-[10px] font-semibold uppercase tracking-wide opacity-65 shrink-0">
                                {SLOT_SHORT_LABELS[meal.slot]}
                              </span>
                              {isRecipeLinked && (
                                <BookOpen className="w-3 h-3 opacity-80 shrink-0" />
                              )}
                              <span className="font-medium truncate">
                                {meal.title}
                              </span>
                              {showCookAvatar && !meal.cookProfileId && (
                                <span
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEntryModalState({
                                      isOpen: true,
                                      date: meal.date,
                                      slot: meal.slot,
                                      editingMeal: meal,
                                    });
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setEntryModalState({
                                        isOpen: true,
                                        date: meal.date,
                                        slot: meal.slot,
                                        editingMeal: meal,
                                      });
                                    }
                                  }}
                                  title="Assign a cook to this meal"
                                  className="shrink-0 ml-0.5 px-1.5 py-0.5 rounded-full border border-current/25 text-[10px] font-medium opacity-65 hover:opacity-100 transition-opacity"
                                >
                                  + Cook
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Main View Sticky Note Sync Bar */}
      {!isShoppingOpen &&
        (syncableStickyNoteItems.length > 0 || Boolean(stickyNoteNotice)) && (
          <div
            data-no-drag="true"
            className="shrink-0 pt-2 mt-1 border-t border-slate-500/15 flex items-center justify-between gap-2 text-[11px]"
          >
            {stickyNoteNotice ? (
              <span
                className="font-semibold text-emerald-500 inline-flex items-center gap-1.5"
                role="status"
              >
                <Check className="w-3.5 h-3.5" />
                <span>{stickyNoteNotice}</span>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => void handleSendToStickyNote()}
                className={`px-2.5 py-1.5 rounded-xl border font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isLight
                    ? 'bg-emerald-50/90 border-emerald-300/80 text-emerald-900 hover:bg-emerald-100'
                    : 'bg-emerald-950/45 border-emerald-800/60 text-emerald-200 hover:bg-emerald-900/50'
                }`}
              >
                <StickyNote className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Add {syncableStickyNoteItems.length} item
                  {syncableStickyNoteItems.length === 1 ? '' : 's'} to{' '}
                  {targetListNote?.title || '🛒 Shopping List'} note
                </span>
              </button>
            )}
          </div>
        )}

      {/* Dual-Mode Meal Entry Modal */}
      <MealEntryModal
        isOpen={entryModalState.isOpen}
        date={entryModalState.date}
        initialSlot={entryModalState.slot}
        editingMeal={entryModalState.editingMeal}
        initialMode={entryModalState.initialMode}
        isLight={isLight}
        onClose={() =>
          setEntryModalState((prev) => ({
            ...prev,
            isOpen: false,
            editingMeal: null,
          }))
        }
      />

      {/* Counter-Readable Cooking Mode Modal */}
      <CookingModeModal
        isOpen={cookingModalState.isOpen}
        recipe={cookingModalState.recipe}
        scheduledMeal={
          cookingModalState.scheduledMeal
            ? scheduledMeals.find(
                (m) => m.id === cookingModalState.scheduledMeal?.id
              ) || cookingModalState.scheduledMeal
            : null
        }
        isLight={isLight}
        onClose={() =>
          setCookingModalState({
            isOpen: false,
            recipe: null,
            scheduledMeal: null,
          })
        }
        onEditSlot={(mealToEdit) => {
          setCookingModalState({
            isOpen: false,
            recipe: null,
            scheduledMeal: null,
          });
          setEntryModalState({
            isOpen: true,
            date: mealToEdit.date,
            slot: mealToEdit.slot,
            editingMeal: mealToEdit,
          });
        }}
      />
    </div>
  );
};

export default MealPlannerWidget;
