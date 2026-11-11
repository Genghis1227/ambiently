export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

export type WidgetMealScope = 'tomorrow' | 'three_day' | 'full_week';

export type DefaultGroceryCategory =
  | 'Produce'
  | 'Meat & Seafood'
  | 'Dairy & Eggs'
  | 'Bakery'
  | 'Pantry & Dry Goods'
  | 'Frozen'
  | 'Beverages'
  | 'Household & Other';

export type GroceryCategory = DefaultGroceryCategory | (string & {});

export const DEFAULT_AISLE_ORDER: DefaultGroceryCategory[] = [
  'Produce',
  'Bakery',
  'Meat & Seafood',
  'Dairy & Eggs',
  'Pantry & Dry Goods',
  'Frozen',
  'Beverages',
  'Household & Other',
];

export type GoogleKeepExportMode = 'checklist' | 'indented';

export type WeekStartDay = 'sunday' | 'monday';

export interface ParsedIngredient {
  quantity: number | null;
  unit: string | null;
  itemName: string;
  notes: string;
  category: GroceryCategory;
  raw?: string;
}

export interface ScrapedRecipePayload {
  title: string;
  image?: string;
  servings?: string;
  prepTime?: string;
  cookTime?: string;
  ingredients: string[];
  instructions: string[];
}

export interface MetadataScrapeResponse {
  title: string;
  imageUrl?: string;
  rawPrice?: number;
  sourceUrl: string;
  siteName?: string;
  recipe?: ScrapedRecipePayload;
}

export interface Recipe {
  id: string;
  title: string;
  sourceUrl?: string;
  imageUrl?: string;
  servings?: string;
  prepTime?: string;
  cookTime?: string;
  ingredients: string[];
  instructions: string[];
  tags: string[];
  notes?: string;
  isFavorite?: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface ScheduledMeal {
  id: string;
  date: string; // "YYYY-MM-DD"
  slot: MealSlot;
  title: string;
  recipeId?: string;
  cookProfileId?: string;
  scaleFactor?: number; // e.g., 0.5, 1, 2 (defaults to 1)
  notes?: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface ShoppingListComponent {
  quantity: number | null;
  unit: string | null;
  notes?: string;
  raw?: string;
  sourceRecipeId?: string;
  sourceMealId?: string;
}

export interface ShoppingListItem {
  id: string;
  normalizedKey: string;
  itemName: string;
  displayLabel: string;
  components: ShoppingListComponent[];
  category: GroceryCategory;
  checked: boolean;
  addedAt: string;
  updatedAt: string;
}

export interface StapleItem {
  id: string;
  name: string;
  defaultQuantity?: number | null;
  defaultUnit?: string | null;
  category: GroceryCategory;
  createdAt: string;
  updatedAt: string;
}

export interface MealPlannerSnapshot {
  id: 'household_meals';
  recipes: Recipe[];
  scheduledMeals: ScheduledMeal[];
  shoppingItems: ShoppingListItem[];
  staples: StapleItem[];
  aisleOrder: GroceryCategory[];
  weekStartsOn: WeekStartDay;
  deletedRecipeIds?: string[];
  deletedScheduledMealIds?: string[];
  deletedShoppingItemIds?: string[];
  deletedStapleIds?: string[];
  updated_at: string;
}

export interface MealWidgetConfig {
  scope?: WidgetMealScope;
  visibleSlots?: MealSlot[];
  showCookAvatar?: boolean;
  /** Optional target checklist Sticky Note ID on the canvas for 1-tap grocery list sync */
  listNoteId?: string;
}
