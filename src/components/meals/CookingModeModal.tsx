import type React from 'react';
import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Clock,
  Users,
  ChefHat,
  Check,
  Sun,
  ExternalLink,
  Edit3,
  RotateCcw,
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import type { Recipe, ScheduledMeal } from '../../types/meals';
import { useMealStore } from '../../stores/useMealStore';
import { useProfileStore } from '../../stores/useProfileStore';
import {
  parseIngredient,
  formatQuantity,
  formatUnitForQuantity,
  pluralizeItemName,
} from '../../utils/ingredientAggregator';
import { ProfileAvatar } from '../common/ProfileAvatar';

export interface CookingModeModalProps {
  isOpen: boolean;
  recipe: Recipe | null;
  scheduledMeal?: ScheduledMeal | null;
  isLight?: boolean;
  onClose: () => void;
  onEditSlot?: (meal: ScheduledMeal) => void;
}

interface WakeLockSentinelLike {
  released?: boolean;
  release: () => Promise<void>;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

type WakeLockStatus = 'unsupported' | 'requesting' | 'active' | 'paused';

const SCALE_OPTIONS: readonly number[] = [0.5, 1, 2];

function isWakeLockSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'wakeLock' in navigator &&
    typeof navigator.wakeLock?.request === 'function'
  );
}

interface ScaledIngredientDisplay {
  quantityLabel: string | null;
  itemLabel: string;
  notesLabel: string;
}

function parseIngredientLine(
  line: string,
  scaleFactor: number
): ScaledIngredientDisplay {
  const trimmed = line.trim();
  if (!trimmed) {
    return { quantityLabel: null, itemLabel: '', notesLabel: '' };
  }

  const parsed = parseIngredient(trimmed, scaleFactor);
  if (parsed.quantity === null) {
    return {
      quantityLabel: null,
      itemLabel: trimmed,
      notesLabel: '',
    };
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

interface CookingModeContentProps {
  recipe: Recipe;
  scheduledMeal?: ScheduledMeal | null;
  isLight: boolean;
  onClose: () => void;
  onEditSlot?: (meal: ScheduledMeal) => void;
}

const CookingModeContent: React.FC<CookingModeContentProps> = ({
  recipe,
  scheduledMeal,
  isLight,
  onClose,
  onEditSlot,
}) => {
  const updateScheduledMeal = useMealStore((s) => s.updateScheduledMeal);
  const importRecipeIngredients = useMealStore((s) => s.importRecipeIngredients);
  const profiles = useProfileStore((s) => s.profiles);
  const isProfileStoreInitialized = useProfileStore((s) => s.isInitialized);

  useEffect(() => {
    if (!isProfileStoreInitialized) {
      void useProfileStore.getState().initProfileStore();
    }
  }, [isProfileStoreInitialized]);

  const [scaleFactor, setScaleFactor] = useState<number>(() => {
    const initial = scheduledMeal?.scaleFactor;
    return typeof initial === 'number' && initial > 0 ? initial : 1;
  });
  const [checkedIngredients, setCheckedIngredients] = useState<Set<number>>(
    () => new Set()
  );
  const [activeStepIdx, setActiveStepIdx] = useState<number>(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(
    () => new Set()
  );
  const [imgFailed, setImgFailed] = useState<boolean>(false);
  const [addedToShopNotice, setAddedToShopNotice] = useState<boolean>(false);

  const sentinelRef = useRef<WakeLockSentinelLike | null>(null);
  const [wakeLockStatus, setWakeLockStatus] = useState<WakeLockStatus>(() =>
    isWakeLockSupported() ? 'requesting' : 'unsupported'
  );

  // Escape key closes full-screen cooking mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Screen Wake Lock lifecycle: request on mount, re-acquire on visibilitychange, release on unmount
  useEffect(() => {
    if (
      typeof navigator === 'undefined' ||
      !('wakeLock' in navigator) ||
      typeof navigator.wakeLock?.request !== 'function'
    ) {
      return;
    }

    let cancelled = false;

    const handleSentinelRelease = () => {
      if (!cancelled) {
        setWakeLockStatus('paused');
      }
    };

    const releaseCurrentSentinel = async () => {
      const current = sentinelRef.current;
      sentinelRef.current = null;
      if (!current) return;
      current.removeEventListener?.('release', handleSentinelRelease);
      try {
        if (!current.released) {
          await current.release();
        }
      } catch {
        // Ignore WakeLock release errors on backgrounded or unsupported contexts
      }
    };

    const acquireWakeLock = async () => {
      await Promise.resolve();
      if (cancelled) return;
      if (
        typeof navigator === 'undefined' ||
        !('wakeLock' in navigator) ||
        typeof navigator.wakeLock?.request !== 'function'
      ) {
        return;
      }
      if (
        typeof document !== 'undefined' &&
        document.visibilityState !== 'visible'
      ) {
        return;
      }

      try {
        await releaseCurrentSentinel();
        const sentinel = (await navigator.wakeLock.request(
          'screen'
        )) as unknown as WakeLockSentinelLike;
        if (cancelled) {
          try {
            await sentinel.release();
          } catch {
            // Ignore post-unmount release errors
          }
          return;
        }
        sentinelRef.current = sentinel;
        sentinel.addEventListener?.('release', handleSentinelRelease);
        setWakeLockStatus('active');
      } catch {
        if (!cancelled) {
          setWakeLockStatus('paused');
        }
      }
    };

    void acquireWakeLock();

    const handleVisibilityChange = () => {
      if (
        typeof document !== 'undefined' &&
        document.visibilityState === 'visible' &&
        !cancelled
      ) {
        void acquireWakeLock();
      }
    };

    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      cancelled = true;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
      void releaseCurrentSentinel();
    };
  }, []);

  const scaledIngredients = useMemo(
    () =>
      recipe.ingredients.map((rawLine) =>
        parseIngredientLine(rawLine, scaleFactor)
      ),
    [recipe.ingredients, scaleFactor]
  );

  const handleScaleChange = (nextScale: number) => {
    setScaleFactor(nextScale);
    if (scheduledMeal?.id) {
      void updateScheduledMeal(scheduledMeal.id, { scaleFactor: nextScale });
    }
  };

  const toggleIngredient = (idx: number) => {
    setCheckedIngredients((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const handleStepTap = (idx: number) => {
    if (activeStepIdx === idx) {
      setCompletedSteps((prev) => {
        const next = new Set(prev);
        if (next.has(idx)) {
          next.delete(idx);
        } else {
          next.add(idx);
          if (idx + 1 < recipe.instructions.length) {
            setActiveStepIdx(idx + 1);
          }
        }
        return next;
      });
    } else {
      setActiveStepIdx(idx);
    }
  };

  const handleCompleteCurrentAndAdvance = () => {
    if (recipe.instructions.length === 0) return;
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      next.add(activeStepIdx);
      return next;
    });
    if (activeStepIdx + 1 < recipe.instructions.length) {
      setActiveStepIdx(activeStepIdx + 1);
    }
  };

  const handleSendMissingToShoppingList = async () => {
    const uncheckedIndices = recipe.ingredients
      .map((_, idx) => idx)
      .filter((idx) => !checkedIngredients.has(idx));
    if (uncheckedIndices.length === 0) return;

    await importRecipeIngredients(recipe.id, {
      selectedIndices: uncheckedIndices,
      scaleFactor,
      sourceMealId: scheduledMeal?.id,
    });
    setAddedToShopNotice(true);
    window.setTimeout(() => setAddedToShopNotice(false), 2400);
  };

  const safeSourceUrl = useMemo(() => {
    if (!recipe.sourceUrl) return null;
    try {
      const parsed = new URL(recipe.sourceUrl);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.toString();
      }
    } catch {
      // Ignore malformed URLs
    }
    return null;
  }, [recipe.sourceUrl]);

  const prepCompletedCount = checkedIngredients.size;
  const totalIngredientsCount = recipe.ingredients.length;
  const totalSteps = recipe.instructions.length;

  return (
    <div
      className={`fixed inset-0 z-[80] flex flex-col overflow-hidden select-none ${
        isLight
          ? 'bg-stone-50/98 text-slate-800 backdrop-blur-md'
          : 'bg-slate-950/98 text-slate-100 backdrop-blur-md'
      }`}
      role="dialog"
      aria-modal="true"
      aria-label={`Cooking Mode: ${recipe.title}`}
    >
      {/* Top Counter Header */}
      <header
        className={`shrink-0 px-4 py-3 md:px-6 md:py-4 border-b flex flex-wrap items-center justify-between gap-3 ${
          isLight
            ? 'bg-stone-100/90 border-stone-200/90'
            : 'bg-slate-900/80 border-slate-800/80'
        }`}
      >
        {/* Left: Thumbnail + Title + Metadata */}
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          {recipe.imageUrl && !imgFailed ? (
            <img
              src={recipe.imageUrl}
              alt={recipe.title}
              onError={() => setImgFailed(true)}
              className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl object-cover shrink-0 border ${
                isLight ? 'border-stone-300/80' : 'border-slate-700/70'
              }`}
            />
          ) : (
            <div
              className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl shrink-0 flex items-center justify-center border ${
                isLight
                  ? 'bg-emerald-100/70 border-emerald-300/60 text-emerald-800'
                  : 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300/90'
              }`}
            >
              <ChefHat className="w-7 h-7" />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl md:text-2xl font-semibold tracking-tight truncate">
                {recipe.title}
              </h2>
              {safeSourceUrl && (
                <a
                  href={safeSourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border transition-colors ${
                    isLight
                      ? 'bg-white border-stone-300 text-slate-600 hover:text-slate-900'
                      : 'bg-slate-800/70 border-slate-700/70 text-slate-300 hover:text-white'
                  }`}
                  title="Open original recipe webpage"
                >
                  <span>Source</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>

            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs md:text-sm">
              {scheduledMeal && (
                <div className="inline-flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider opacity-65">
                    Cook:
                  </span>
                  {profiles
                    .filter((p) => !p.deletedAt)
                    .map((profile) => {
                      const isAssigned =
                        scheduledMeal.cookProfileId === profile.id;
                      return (
                        <button
                          key={profile.id}
                          type="button"
                          onClick={() =>
                            void updateScheduledMeal(scheduledMeal.id, {
                              cookProfileId: isAssigned
                                ? undefined
                                : profile.id,
                            })
                          }
                          title={
                            isAssigned
                              ? `${profile.name} is cooking (tap to unassign)`
                              : `Assign ${profile.name} as cook`
                          }
                          className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-xs font-medium transition-colors cursor-pointer ${
                            isAssigned
                              ? isLight
                                ? 'bg-emerald-100 border-emerald-500 text-emerald-950 font-semibold'
                                : 'bg-emerald-950/60 border-emerald-600/80 text-emerald-100 font-semibold'
                              : isLight
                                ? 'bg-white/80 border-stone-300/80 text-slate-600 hover:bg-stone-100'
                                : 'bg-slate-800/60 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <ProfileAvatar
                            profile={profile}
                            size="xs"
                            showRing={isAssigned}
                          />
                          <span>{profile.name}</span>
                        </button>
                      );
                    })}
                </div>
              )}

              {recipe.servings && (
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${
                    isLight
                      ? 'bg-stone-200/70 border-stone-300/80 text-slate-700'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-300'
                  }`}
                >
                  <Users className="w-3.5 h-3.5 opacity-75" />
                  <span>{recipe.servings}</span>
                </span>
              )}

              {recipe.prepTime && (
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${
                    isLight
                      ? 'bg-stone-200/70 border-stone-300/80 text-slate-700'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-300'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 opacity-75" />
                  <span>Prep {recipe.prepTime}</span>
                </span>
              )}

              {recipe.cookTime && (
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${
                    isLight
                      ? 'bg-stone-200/70 border-stone-300/80 text-slate-700'
                      : 'bg-slate-800/60 border-slate-700/60 text-slate-300'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 opacity-75" />
                  <span>Cook {recipe.cookTime}</span>
                </span>
              )}

              {recipe.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className={`px-2 py-0.5 rounded-full text-xs font-medium border ${
                    isLight
                      ? 'bg-emerald-50 border-emerald-300/60 text-emerald-800'
                      : 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300/90'
                  }`}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Scale Switcher, Wake Lock Badge, Edit Slot & Close */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Scale 0.5x / 1x / 2x Switcher */}
          <div
            className={`inline-flex items-center p-1 rounded-xl border ${
              isLight
                ? 'bg-stone-200/80 border-stone-300/80'
                : 'bg-slate-950/80 border-slate-800'
            }`}
            role="group"
            aria-label="Recipe scale multiplier"
          >
            {SCALE_OPTIONS.map((opt) => {
              const active = Math.abs(scaleFactor - opt) < 0.01;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => handleScaleChange(opt)}
                  className={`min-h-[40px] px-3 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                    active
                      ? isLight
                        ? 'bg-white text-emerald-900 border border-stone-300/80'
                        : 'bg-emerald-900/60 text-emerald-100 border border-emerald-700/60'
                      : isLight
                        ? 'text-slate-600 hover:text-slate-900'
                        : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt}x
                </button>
              );
            })}
          </div>

          {/* Wake Lock Status Indicator */}
          <div
            className={`min-h-[42px] px-3 rounded-xl border inline-flex items-center gap-1.5 text-xs font-medium ${
              wakeLockStatus === 'active'
                ? isLight
                  ? 'bg-emerald-50/90 border-emerald-300/70 text-emerald-800'
                  : 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300/90'
                : isLight
                  ? 'bg-stone-200/70 border-stone-300/70 text-slate-600'
                  : 'bg-slate-800/60 border-slate-700/60 text-slate-400'
            }`}
            title={
              wakeLockStatus === 'active'
                ? 'Screen Wake Lock is active — display will stay awake while cooking'
                : wakeLockStatus === 'unsupported'
                  ? 'Screen Wake Lock is not supported by this browser'
                  : 'Screen Wake Lock is paused'
            }
          >
            <Sun
              className={`w-4 h-4 ${
                wakeLockStatus === 'active' ? 'text-emerald-500' : 'opacity-60'
              }`}
            />
            <span className="hidden sm:inline">
              {wakeLockStatus === 'active'
                ? 'Screen Awake'
                : wakeLockStatus === 'unsupported'
                  ? 'Wake Lock N/A'
                  : 'Wake Ready'}
            </span>
          </div>

          {/* Optional Edit Slot Switcher */}
          {scheduledMeal && onEditSlot && (
            <button
              type="button"
              onClick={() => onEditSlot(scheduledMeal)}
              className={`min-h-[44px] px-3.5 rounded-xl border inline-flex items-center gap-2 text-sm font-medium transition-colors cursor-pointer ${
                isLight
                  ? 'bg-white border-stone-300 text-slate-700 hover:bg-stone-100'
                  : 'bg-slate-800/80 border-slate-700/70 text-slate-200 hover:bg-slate-800'
              }`}
            >
              <Edit3 className="w-4 h-4" />
              <span>Edit Slot</span>
            </button>
          )}

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className={`min-h-[44px] min-w-[44px] px-3 rounded-xl border inline-flex items-center justify-center gap-1.5 text-sm font-semibold transition-colors cursor-pointer ${
              isLight
                ? 'bg-stone-200/90 border-stone-300 text-slate-800 hover:bg-stone-300/80'
                : 'bg-slate-800/90 border-slate-700 text-slate-100 hover:bg-slate-700'
            }`}
            aria-label="Close Cooking Mode"
          >
            <X className="w-5 h-5" />
            <span className="hidden md:inline">Done</span>
          </button>
        </div>
      </header>

      {/* Two-Column Counter Body */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-12 overflow-y-auto lg:overflow-hidden">
        {/* Left Column: Interactive Prep Ingredients */}
        <section
          className={`lg:col-span-5 lg:h-full lg:overflow-y-auto p-4 md:p-6 border-b lg:border-b-0 lg:border-r ${
            isLight
              ? 'border-stone-200/90 bg-stone-100/40'
              : 'border-slate-800/80 bg-slate-900/35'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-base md:text-lg font-semibold tracking-tight">
                Prep Ingredients
              </h3>
              <p
                className={`text-xs ${
                  isLight ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                {prepCompletedCount} of {totalIngredientsCount} prepped
                {scaleFactor !== 1 ? ` • Scaled to ${scaleFactor}x` : ''}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {prepCompletedCount > 0 && (
                <button
                  type="button"
                  onClick={() => setCheckedIngredients(new Set())}
                  className={`min-h-[38px] px-2.5 rounded-lg text-xs font-medium inline-flex items-center gap-1 border transition-colors cursor-pointer ${
                    isLight
                      ? 'bg-white border-stone-300 text-slate-600 hover:text-slate-900'
                      : 'bg-slate-800/70 border-slate-700/70 text-slate-300 hover:text-white'
                  }`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset</span>
                </button>
              )}

              {totalIngredientsCount > prepCompletedCount && (
                <button
                  type="button"
                  onClick={() => void handleSendMissingToShoppingList()}
                  className={`min-h-[38px] px-2.5 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 border transition-colors cursor-pointer ${
                    addedToShopNotice
                      ? isLight
                        ? 'bg-emerald-100 border-emerald-300 text-emerald-900'
                        : 'bg-emerald-950/60 border-emerald-700/60 text-emerald-200'
                      : isLight
                        ? 'bg-white border-stone-300 text-slate-700 hover:bg-stone-100'
                        : 'bg-slate-800/70 border-slate-700/70 text-slate-300 hover:bg-slate-800'
                  }`}
                  title="Add unchecked ingredients to Shopping List"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  <span>{addedToShopNotice ? 'Added!' : 'To List'}</span>
                </button>
              )}
            </div>
          </div>

          {scaledIngredients.length === 0 ? (
            <div
              className={`rounded-2xl border p-6 text-center text-sm ${
                isLight
                  ? 'border-stone-200 bg-white/70 text-slate-500'
                  : 'border-slate-800/80 bg-slate-900/40 text-slate-400'
              }`}
            >
              No ingredients listed for this recipe.
            </div>
          ) : (
            <ul className="space-y-2">
              {scaledIngredients.map((ing, idx) => {
                const isChecked = checkedIngredients.has(idx);
                return (
                  <li key={`${idx}-${recipe.ingredients[idx]}`}>
                    <button
                      type="button"
                      onClick={() => toggleIngredient(idx)}
                      className={`w-full min-h-[50px] px-3.5 py-2.5 rounded-xl border text-left flex items-center gap-3 transition-colors cursor-pointer ${
                        isChecked
                          ? isLight
                            ? 'bg-stone-200/50 border-stone-200 text-slate-400'
                            : 'bg-slate-900/30 border-slate-800/50 text-slate-500'
                          : isLight
                            ? 'bg-white border-stone-200/90 hover:border-emerald-400/60 text-slate-800'
                            : 'bg-slate-900/75 border-slate-800 hover:border-slate-700 text-slate-100'
                      }`}
                    >
                      <span
                        className={`w-6 h-6 rounded-lg shrink-0 flex items-center justify-center border transition-colors ${
                          isChecked
                            ? 'bg-emerald-600/85 border-emerald-500/80 text-white'
                            : isLight
                              ? 'border-stone-300 bg-stone-50'
                              : 'border-slate-600 bg-slate-950/60'
                        }`}
                      >
                        {isChecked && <Check className="w-4 h-4 stroke-[2.5]" />}
                      </span>

                      <div
                        className={`flex-1 min-w-0 text-base md:text-lg leading-snug ${
                          isChecked ? 'line-through opacity-65' : ''
                        }`}
                      >
                        {ing.quantityLabel && (
                          <span
                            className={`font-semibold tabular-nums mr-2 ${
                              isChecked
                                ? ''
                                : isLight
                                  ? 'text-emerald-800'
                                  : 'text-emerald-300/95'
                            }`}
                          >
                            {ing.quantityLabel}
                          </span>
                        )}
                        <span className="font-medium">{ing.itemLabel}</span>
                        {ing.notesLabel && (
                          <span
                            className={`ml-1.5 text-sm ${
                              isLight ? 'text-slate-500' : 'text-slate-400'
                            }`}
                          >
                            ({ing.notesLabel})
                          </span>
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Right Column: Counter-Readable Step-by-Step Instructions */}
        <section className="lg:col-span-7 lg:h-full lg:overflow-y-auto p-4 md:p-6 lg:p-8 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div>
              <h3 className="text-base md:text-lg font-semibold tracking-tight">
                Directions
              </h3>
              <p
                className={`text-xs ${
                  isLight ? 'text-slate-500' : 'text-slate-400'
                }`}
              >
                Tap any step to focus or check off from across the counter
              </p>
            </div>

            {totalSteps > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={activeStepIdx <= 0}
                  onClick={() =>
                    setActiveStepIdx((prev) => Math.max(0, prev - 1))
                  }
                  className={`min-h-[42px] min-w-[42px] px-2.5 rounded-xl border inline-flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                    isLight
                      ? 'bg-white border-stone-300 text-slate-700 hover:bg-stone-100'
                      : 'bg-slate-800/75 border-slate-700/70 text-slate-200 hover:bg-slate-800'
                  }`}
                  aria-label="Previous step"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span
                  className={`text-xs font-semibold tabular-nums px-2 ${
                    isLight ? 'text-slate-600' : 'text-slate-300'
                  }`}
                >
                  Step {Math.min(activeStepIdx + 1, totalSteps)} / {totalSteps}
                </span>
                <button
                  type="button"
                  onClick={handleCompleteCurrentAndAdvance}
                  className={`min-h-[42px] px-3.5 rounded-xl border inline-flex items-center gap-1.5 text-xs md:text-sm font-semibold transition-colors cursor-pointer ${
                    isLight
                      ? 'bg-emerald-700 text-white border-emerald-800 hover:bg-emerald-800'
                      : 'bg-emerald-800/80 text-emerald-50 border-emerald-700/80 hover:bg-emerald-700/80'
                  }`}
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {activeStepIdx + 1 < totalSteps ? 'Next Step' : 'Finish'}
                  </span>
                  {activeStepIdx + 1 < totalSteps && (
                    <ChevronRight className="w-4 h-4" />
                  )}
                </button>
              </div>
            )}
          </div>

          {totalSteps === 0 ? (
            <div
              className={`rounded-2xl border p-8 text-center text-base ${
                isLight
                  ? 'border-stone-200 bg-white/70 text-slate-500'
                  : 'border-slate-800/80 bg-slate-900/40 text-slate-400'
              }`}
            >
              No step-by-step instructions saved for this recipe yet.
              {recipe.notes && (
                <p className="mt-3 text-left whitespace-pre-wrap text-slate-300">
                  {recipe.notes}
                </p>
              )}
            </div>
          ) : (
            <ol className="space-y-3.5 pb-6">
              {recipe.instructions.map((stepText, idx) => {
                const isActive = activeStepIdx === idx;
                const isDone = completedSteps.has(idx);

                return (
                  <li key={`${idx}-${stepText.slice(0, 24)}`}>
                    <button
                      type="button"
                      onClick={() => handleStepTap(idx)}
                      className={`w-full text-left p-4 md:p-5 rounded-2xl border transition-all cursor-pointer flex items-start gap-4 ${
                        isActive
                          ? isLight
                            ? 'bg-white border-emerald-500/70 ring-1 ring-emerald-500/30 text-slate-900'
                            : 'bg-slate-900/95 border-emerald-600/60 ring-1 ring-emerald-500/25 text-white'
                          : isDone
                            ? isLight
                              ? 'bg-stone-200/45 border-stone-200 text-slate-500'
                              : 'bg-slate-900/30 border-slate-800/50 text-slate-400'
                            : isLight
                              ? 'bg-white/75 border-stone-200/90 hover:border-stone-300 text-slate-700'
                              : 'bg-slate-900/50 border-slate-800/80 hover:border-slate-700 text-slate-200'
                      }`}
                    >
                      <span
                        className={`w-9 h-9 md:w-10 md:h-10 rounded-xl shrink-0 flex items-center justify-center text-sm md:text-base font-bold tabular-nums border ${
                          isDone
                            ? 'bg-emerald-600/85 border-emerald-500 text-white'
                            : isActive
                              ? isLight
                                ? 'bg-emerald-100 border-emerald-400 text-emerald-900'
                                : 'bg-emerald-900/70 border-emerald-600 text-emerald-100'
                              : isLight
                                ? 'bg-stone-100 border-stone-300 text-slate-600'
                                : 'bg-slate-800 border-slate-700 text-slate-400'
                        }`}
                      >
                        {isDone ? <Check className="w-5 h-5" /> : idx + 1}
                      </span>

                      <p
                        className={`flex-1 text-lg md:text-xl lg:text-[22px] leading-relaxed ${
                          isActive ? 'font-medium' : ''
                        } ${isDone && !isActive ? 'line-through opacity-75' : ''}`}
                      >
                        {stepText}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ol>
          )}

          {recipe.notes && totalSteps > 0 && (
            <div
              className={`mt-2 p-4 rounded-2xl border text-sm md:text-base ${
                isLight
                  ? 'bg-amber-50/70 border-amber-200/80 text-slate-700'
                  : 'bg-slate-900/60 border-slate-800 text-slate-300'
              }`}
            >
              <p className="text-xs font-semibold uppercase tracking-wider opacity-70 mb-1">
                Cook Notes
              </p>
              <p className="whitespace-pre-wrap">{recipe.notes}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

export const CookingModeModal: React.FC<CookingModeModalProps> = ({
  isOpen,
  recipe,
  scheduledMeal,
  isLight = false,
  onClose,
  onEditSlot,
}) => {
  if (!isOpen || !recipe) return null;

  const modalKey = `${recipe.id}-${scheduledMeal?.id ?? 'standalone'}-${scheduledMeal?.scaleFactor ?? 1}`;
  const content = (
    <CookingModeContent
      key={modalKey}
      recipe={recipe}
      scheduledMeal={scheduledMeal}
      isLight={isLight}
      onClose={onClose}
      onEditSlot={onEditSlot}
    />
  );

  if (typeof document !== 'undefined') {
    return createPortal(content, document.body);
  }
  return content;
};

export default CookingModeModal;
