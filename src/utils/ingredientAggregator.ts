import {
  DEFAULT_AISLE_ORDER,
  type GoogleKeepExportMode,
  type GroceryCategory,
  type ParsedIngredient,
  type ShoppingListComponent,
  type ShoppingListItem,
} from '../types/meals';

const UNICODE_FRACTIONS: Record<string, string> = {
  '½': '1/2',
  '⅓': '1/3',
  '⅔': '2/3',
  '¼': '1/4',
  '¾': '3/4',
  '⅕': '1/5',
  '⅖': '2/5',
  '⅗': '3/5',
  '⅘': '4/5',
  '⅙': '1/6',
  '⅚': '5/6',
  '⅛': '1/8',
  '⅜': '3/8',
  '⅝': '5/8',
  '⅞': '7/8',
};

type UnitFamily = 'us_vol' | 'metric_vol' | 'us_wt' | 'metric_wt' | 'discrete';

interface UnitDefinition {
  canonical: string;
  plural: string;
  family: UnitFamily;
  /** Conversion factor to the family's base unit (tsp, ml, oz, g, or 1 for discrete) */
  toBase: number;
}

const CANONICAL_UNITS: Record<string, UnitDefinition> = {
  // US Volume (base = tsp)
  tsp: { canonical: 'tsp', plural: 'tsp', family: 'us_vol', toBase: 1 },
  tbsp: { canonical: 'tbsp', plural: 'tbsp', family: 'us_vol', toBase: 3 },
  'fl oz': { canonical: 'fl oz', plural: 'fl oz', family: 'us_vol', toBase: 6 },
  cup: { canonical: 'cup', plural: 'cups', family: 'us_vol', toBase: 48 },
  pint: { canonical: 'pint', plural: 'pints', family: 'us_vol', toBase: 96 },
  quart: { canonical: 'quart', plural: 'quarts', family: 'us_vol', toBase: 192 },
  gallon: { canonical: 'gallon', plural: 'gallons', family: 'us_vol', toBase: 768 },

  // Metric Volume (base = ml)
  ml: { canonical: 'ml', plural: 'ml', family: 'metric_vol', toBase: 1 },
  l: { canonical: 'l', plural: 'l', family: 'metric_vol', toBase: 1000 },

  // US Weight (base = oz)
  oz: { canonical: 'oz', plural: 'oz', family: 'us_wt', toBase: 1 },
  lb: { canonical: 'lb', plural: 'lbs', family: 'us_wt', toBase: 16 },

  // Metric Weight (base = g)
  g: { canonical: 'g', plural: 'g', family: 'metric_wt', toBase: 1 },
  kg: { canonical: 'kg', plural: 'kg', family: 'metric_wt', toBase: 1000 },

  // Discrete / Size / Packaging units (only sum when canonical unit matches identically)
  clove: { canonical: 'clove', plural: 'cloves', family: 'discrete', toBase: 1 },
  can: { canonical: 'can', plural: 'cans', family: 'discrete', toBase: 1 },
  jar: { canonical: 'jar', plural: 'jars', family: 'discrete', toBase: 1 },
  pkg: { canonical: 'pkg', plural: 'pkgs', family: 'discrete', toBase: 1 },
  bunch: { canonical: 'bunch', plural: 'bunches', family: 'discrete', toBase: 1 },
  head: { canonical: 'head', plural: 'heads', family: 'discrete', toBase: 1 },
  stalk: { canonical: 'stalk', plural: 'stalks', family: 'discrete', toBase: 1 },
  sprig: { canonical: 'sprig', plural: 'sprigs', family: 'discrete', toBase: 1 },
  slice: { canonical: 'slice', plural: 'slices', family: 'discrete', toBase: 1 },
  pinch: { canonical: 'pinch', plural: 'pinches', family: 'discrete', toBase: 1 },
  dash: { canonical: 'dash', plural: 'dashes', family: 'discrete', toBase: 1 },
  stick: { canonical: 'stick', plural: 'sticks', family: 'discrete', toBase: 1 },
  bottle: { canonical: 'bottle', plural: 'bottles', family: 'discrete', toBase: 1 },
  bag: { canonical: 'bag', plural: 'bags', family: 'discrete', toBase: 1 },
  box: { canonical: 'box', plural: 'boxes', family: 'discrete', toBase: 1 },
  small: { canonical: 'small', plural: 'small', family: 'discrete', toBase: 1 },
  medium: { canonical: 'medium', plural: 'medium', family: 'discrete', toBase: 1 },
  large: { canonical: 'large', plural: 'large', family: 'discrete', toBase: 1 },
};

const UNIT_ALIASES_LOWER: Record<string, string> = {
  tsp: 'tsp',
  'tsp.': 'tsp',
  teaspoon: 'tsp',
  teaspoons: 'tsp',
  tbsp: 'tbsp',
  'tbsp.': 'tbsp',
  tbs: 'tbsp',
  'tbs.': 'tbsp',
  tb: 'tbsp',
  tablespoon: 'tbsp',
  tablespoons: 'tbsp',
  'fl oz': 'fl oz',
  'fl. oz.': 'fl oz',
  'fl. oz': 'fl oz',
  'fluid ounce': 'fl oz',
  'fluid ounces': 'fl oz',
  c: 'cup',
  'c.': 'cup',
  cup: 'cup',
  cups: 'cup',
  pt: 'pint',
  'pt.': 'pint',
  pint: 'pint',
  pints: 'pint',
  qt: 'quart',
  'qt.': 'quart',
  quart: 'quart',
  quarts: 'quart',
  gal: 'gallon',
  'gal.': 'gallon',
  gallon: 'gallon',
  gallons: 'gallon',
  ml: 'ml',
  'ml.': 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  l: 'l',
  liter: 'l',
  liters: 'l',
  litre: 'l',
  litres: 'l',
  oz: 'oz',
  'oz.': 'oz',
  ounce: 'oz',
  ounces: 'oz',
  lb: 'lb',
  'lb.': 'lb',
  lbs: 'lb',
  'lbs.': 'lb',
  pound: 'lb',
  pounds: 'lb',
  g: 'g',
  'g.': 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  'kg.': 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  clove: 'clove',
  cloves: 'clove',
  can: 'can',
  cans: 'can',
  jar: 'jar',
  jars: 'jar',
  pkg: 'pkg',
  'pkg.': 'pkg',
  pkgs: 'pkg',
  package: 'pkg',
  packages: 'pkg',
  packet: 'pkg',
  packets: 'pkg',
  bunch: 'bunch',
  bunches: 'bunch',
  head: 'head',
  heads: 'head',
  stalk: 'stalk',
  stalks: 'stalk',
  sprig: 'sprig',
  sprigs: 'sprig',
  slice: 'slice',
  slices: 'slice',
  pinch: 'pinch',
  pinches: 'pinch',
  dash: 'dash',
  dashes: 'dash',
  stick: 'stick',
  sticks: 'stick',
  bottle: 'bottle',
  bottles: 'bottle',
  bag: 'bag',
  bags: 'bag',
  box: 'box',
  boxes: 'box',
  small: 'small',
  medium: 'medium',
  large: 'large',
};

const MULTI_WORD_PREP_PHRASES = [
  'finely chopped',
  'roughly chopped',
  'coarsely chopped',
  'thinly sliced',
  'thickly sliced',
  'finely diced',
  'finely minced',
  'freshly grated',
  'freshly ground',
  'freshly squeezed',
  'at room temperature',
  'room temperature',
  'cut into cubes',
  'cut into bite-size pieces',
  'cut into pieces',
  'halved lengthwise',
  'lightly packed',
  'firmly packed',
  'to taste',
  'for garnish',
  'for serving',
];

const SINGLE_WORD_PREP_TERMS = new Set([
  'chopped',
  'diced',
  'minced',
  'sliced',
  'grated',
  'shredded',
  'crushed',
  'peeled',
  'seeded',
  'cored',
  'halved',
  'quartered',
  'julienned',
  'cubed',
  'melted',
  'softened',
  'sifted',
  'beaten',
  'whisked',
  'divided',
  'rinsed',
  'drained',
  'thawed',
  'trimmed',
  'deveined',
  'pitted',
  'mashed',
  'toasted',
  'packed',
]);

const IRREGULAR_SINGULAR_TO_PLURAL: Record<string, string> = {
  tomato: 'tomatoes',
  potato: 'potatoes',
  avocado: 'avocados',
  leaf: 'leaves',
  loaf: 'loaves',
  half: 'halves',
  berry: 'berries',
  strawberry: 'strawberries',
  blueberry: 'blueberries',
  raspberry: 'raspberries',
  blackberry: 'blackberries',
  cranberry: 'cranberries',
  cherry: 'cherries',
  peach: 'peaches',
  radish: 'radishes',
  bunch: 'bunches',
  box: 'boxes',
};

const IRREGULAR_PLURAL_TO_SINGULAR: Record<string, string> = Object.fromEntries(
  Object.entries(IRREGULAR_SINGULAR_TO_PLURAL).map(([sing, plur]) => [plur, sing])
);

const UNCOUNTABLE_OR_INVARIANT_ENDINGS = new Set([
  'asparagus',
  'hummus',
  'couscous',
  'molasses',
  'lemongrass',
  'quinoa',
  'rice',
  'pasta',
  'milk',
  'butter',
  'flour',
  'sugar',
  'salt',
  'spinach',
  'lettuce',
  'broccoli',
  'celery',
  'garlic',
  'ginger',
  'oats',
  'rolled oats',
]);

/**
 * Replaces Unicode vulgar fractions with ASCII slash equivalents ("1½" -> "1 1/2", "½" -> "1/2").
 */
export function normalizeUnicodeFractions(input: string): string {
  let out = input;
  for (const [glyph, ascii] of Object.entries(UNICODE_FRACTIONS)) {
    if (out.includes(glyph)) {
      // Insert space when attached directly to a leading digit ("1½" -> "1 1/2")
      out = out.replace(new RegExp(`(\\d)${glyph}`, 'g'), `$1 ${ascii}`);
      out = out.replace(new RegExp(glyph, 'g'), ascii);
    }
  }
  return out;
}

function parseSingleNumberOrFraction(token: string): number | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  if (/^\d+\/\d+$/.test(trimmed)) {
    const [num, den] = trimmed.split('/').map(Number);
    if (den && !Number.isNaN(num) && !Number.isNaN(den)) {
      return num / den;
    }
    return null;
  }
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const val = parseFloat(trimmed);
    return Number.isFinite(val) ? val : null;
  }
  return null;
}

/**
 * Extracts a leading numeric/fraction quantity from a normalized ingredient string.
 */
export function extractLeadingQuantity(input: string): {
  quantity: number | null;
  rest: string;
} {
  const s = normalizeUnicodeFractions(input)
    .replace(/^[\s•\-*☐☑✓✔]+/, '')
    .trim();

  if (!s) return { quantity: null, rest: '' };

  // 1. Mixed fraction with space or hyphen: "1 1/2 cups", "1-1/2 cups"
  const mixedMatch = s.match(/^(\d+)(?:\s+|-)\s*(\d+\/\d+)\b\s*(.*)$/);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1], 10);
    const frac = parseSingleNumberOrFraction(mixedMatch[2]);
    if (frac !== null) {
      return { quantity: whole + frac, rest: mixedMatch[3].trim() };
    }
  }

  // 2. Numeric range: "2-3 cloves", "1 to 2 tbsp" -> take upper bound so shopper buys enough
  const rangeMatch = s.match(
    /^(\d+(?:\.\d+)?|\d+\/\d+)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?|\d+\/\d+)\b\s*(.*)$/i
  );
  if (rangeMatch) {
    const hi = parseSingleNumberOrFraction(rangeMatch[2]);
    if (hi !== null) {
      return { quantity: hi, rest: rangeMatch[3].trim() };
    }
  }

  // 3. Simple slash fraction: "1/2 cup"
  const fracMatch = s.match(/^(\d+\/\d+)\b\s*(.*)$/);
  if (fracMatch) {
    const frac = parseSingleNumberOrFraction(fracMatch[1]);
    if (frac !== null) {
      return { quantity: frac, rest: fracMatch[2].trim() };
    }
  }

  // 4. Decimal or integer: "1.5 cups", "2 onions"
  const numMatch = s.match(/^(\d+(?:\.\d+)?)\b\s*(.*)$/);
  if (numMatch) {
    const val = parseSingleNumberOrFraction(numMatch[1]);
    if (val !== null) {
      return { quantity: val, rest: numMatch[2].trim() };
    }
  }

  // 5. Article "a " / "an " before a unit or item ("a pinch of salt", "an onion")
  const articleMatch = s.match(/^(?:a|an)\s+(.+)$/i);
  if (articleMatch) {
    return { quantity: 1, rest: articleMatch[1].trim() };
  }

  return { quantity: null, rest: s };
}

function extractLeadingUnit(input: string): { unit: string | null; rest: string } {
  const s = input.trim();
  if (!s) return { unit: null, rest: '' };

  // Multi-word fluid ounce check first
  const multiWordPatterns: [RegExp, string][] = [
    [/^(?:fl\.?\s*oz\.?|fluid\s+ounces?)\b\s*(?:of\s+)?(.*)$/i, 'fl oz'],
  ];
  for (const [regex, canonical] of multiWordPatterns) {
    const m = s.match(regex);
    if (m && m[1].trim()) {
      return { unit: canonical, rest: m[1].trim() };
    }
  }

  const tokenMatch = s.match(/^([A-Za-z]+\.?)\s+(.*)$/);
  if (!tokenMatch) return { unit: null, rest: s };

  const rawToken = tokenMatch[1];
  const remainderRaw = tokenMatch[2].trim();
  if (!remainderRaw) return { unit: null, rest: s };

  let canonical: string | undefined;
  // Case-sensitive 'T' (Tablespoon) vs 't' (teaspoon)
  if (rawToken === 'T' || rawToken === 'T.') {
    canonical = 'tbsp';
  } else if (rawToken === 't' || rawToken === 't.') {
    canonical = 'tsp';
  } else {
    canonical = UNIT_ALIASES_LOWER[rawToken.toLowerCase()];
  }

  if (!canonical) {
    return { unit: null, rest: s };
  }

  const strippedOf = remainderRaw.replace(/^of\s+/i, '').trim();
  if (!strippedOf) {
    return { unit: null, rest: s };
  }

  return { unit: canonical, rest: strippedOf };
}

/**
 * Singularizes a cleaned ingredient item name for deterministic key matching.
 */
export function singularizeWord(word: string): string {
  const lower = word.toLowerCase().trim();
  if (!lower || UNCOUNTABLE_OR_INVARIANT_ENDINGS.has(lower)) return lower;
  if (IRREGULAR_PLURAL_TO_SINGULAR[lower]) {
    return IRREGULAR_PLURAL_TO_SINGULAR[lower];
  }
  if (lower.endsWith('ies') && lower.length > 4) {
    return `${lower.slice(0, -3)}y`;
  }
  if (lower.endsWith('ves') && lower.length > 4) {
    return `${lower.slice(0, -3)}f`;
  }
  if (
    (lower.endsWith('ches') ||
      lower.endsWith('shes') ||
      lower.endsWith('xes') ||
      lower.endsWith('zes')) &&
    lower.length > 4
  ) {
    return lower.slice(0, -2);
  }
  if (lower.endsWith('oes') && lower.length > 4) {
    return lower.slice(0, -2);
  }
  if (
    lower.endsWith('s') &&
    !lower.endsWith('ss') &&
    !lower.endsWith('us') &&
    !lower.endsWith('is') &&
    lower.length > 2
  ) {
    return lower.slice(0, -1);
  }
  return lower;
}

export function normalizeItemNameSingular(rawItem: string): string {
  const cleaned = rawItem
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
  if (!cleaned) return '';
  if (UNCOUNTABLE_OR_INVARIANT_ENDINGS.has(cleaned)) return cleaned;

  const words = cleaned.split(' ');
  const lastIdx = words.length - 1;
  words[lastIdx] = singularizeWord(words[lastIdx]);
  return words.join(' ');
}

export function pluralizeItemName(singularItem: string): string {
  const cleaned = singularItem.trim();
  if (!cleaned) return cleaned;
  const lower = cleaned.toLowerCase();
  if (UNCOUNTABLE_OR_INVARIANT_ENDINGS.has(lower)) return cleaned;

  const words = cleaned.split(' ');
  const lastIdx = words.length - 1;
  const lastLower = words[lastIdx].toLowerCase();

  let pluralLast: string;
  if (IRREGULAR_SINGULAR_TO_PLURAL[lastLower]) {
    pluralLast = IRREGULAR_SINGULAR_TO_PLURAL[lastLower];
  } else if (/[^aeiou]y$/i.test(lastLower)) {
    pluralLast = `${words[lastIdx].slice(0, -1)}ies`;
  } else if (/(?:ch|sh|x|z|s)$/i.test(lastLower)) {
    pluralLast = `${words[lastIdx]}es`;
  } else {
    pluralLast = `${words[lastIdx]}s`;
  }

  // Preserve leading capitalization if original word had it
  if (words[lastIdx][0] === words[lastIdx][0].toUpperCase()) {
    pluralLast = pluralLast.charAt(0).toUpperCase() + pluralLast.slice(1);
  }
  words[lastIdx] = pluralLast;
  return words.join(' ');
}

function capitalizeFirst(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function extractItemAndPrepNotes(rawRemainder: string): { itemName: string; notes: string } {
  let working = rawRemainder.trim();
  const noteParts: string[] = [];

  // 1. Extract parenthetical notes: "onion (chopped)"
  working = working.replace(/\(([^)]+)\)/g, (_, inner: string) => {
    const trimmed = inner.trim();
    if (trimmed) noteParts.push(trimmed);
    return ' ';
  });
  working = working.replace(/\s+/g, ' ').trim();

  // 2. Split comma notes: "garlic, minced"
  const commaIdx = working.indexOf(',');
  if (commaIdx !== -1) {
    const afterComma = working.slice(commaIdx + 1).trim();
    working = working.slice(0, commaIdx).trim();
    if (afterComma) noteParts.push(afterComma);
  }

  // 3. Extract multi-word prep phrases from item string
  for (const phrase of MULTI_WORD_PREP_PHRASES) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'i');
    if (re.test(working)) {
      const candidate = working.replace(re, ' ').replace(/\s+/g, ' ').trim();
      if (candidate) {
        noteParts.push(phrase);
        working = candidate;
      }
    }
  }

  // 4. Extract single-word prep adjectives ("chopped onion" -> item "onion", note "chopped")
  const tokens = working.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const keptTokens: string[] = [];
    for (const tok of tokens) {
      const lowerTok = tok.toLowerCase().replace(/[^a-z]/g, '');
      if (SINGLE_WORD_PREP_TERMS.has(lowerTok) && keptTokens.length + (tokens.length - keptTokens.length - 1) >= 1) {
        noteParts.push(lowerTok);
      } else {
        keptTokens.push(tok);
      }
    }
    if (keptTokens.length > 0) {
      working = keptTokens.join(' ');
    }
  }

  const normalizedItem = normalizeItemNameSingular(working) || working.toLowerCase();
  const dedupedNotes = Array.from(
    new Set(noteParts.map((n) => n.trim().toLowerCase()).filter(Boolean))
  ).join(', ');

  return {
    itemName: normalizedItem,
    notes: dedupedNotes,
  };
}

/**
 * Auto-categorizes a grocery item into one of Ambiently's 8 default store zones.
 */
export function categorizeIngredient(itemName: string): GroceryCategory {
  const s = itemName.toLowerCase().trim();
  if (!s) return 'Household & Other';

  // 1. Frozen (check before produce/dairy/meat for "frozen peas", "ice cream", etc.)
  if (
    /\b(frozen|ice cream|gelato|sorbet|popsicle|tater tot|waffle)\b/.test(s)
  ) {
    return 'Frozen';
  }

  // 2. Household & Other
  if (
    /\b(paper towel|toilet paper|tissue|dish soap|dishwasher|detergent|bleach|sponge|trash bag|garbage bag|aluminum foil|tin foil|parchment paper|wax paper|plastic wrap|cling wrap|ziploc|napkin|toothpick|skewer|hand soap|cleaner)\b/.test(
      s
    )
  ) {
    return 'Household & Other';
  }

  // 3. Compound Pantry overrides (before "milk", "butter", "tomato", "chicken", "garlic", "apple")
  if (
    /\b(coconut milk|evaporated milk|condensed milk|peanut butter|almond butter|sunflower butter|cocoa butter|apple cider vinegar|balsamic vinegar|white vinegar|rice vinegar|red wine vinegar|tomato paste|tomato sauce|canned tomato|crushed tomato|diced tomato|sun-dried tomato|chicken broth|chicken stock|beef broth|beef stock|vegetable broth|vegetable stock|bone broth|fish sauce|soy sauce|oyster sauce|worcestershire|hot sauce|bbq sauce|pasta sauce|marinara|garlic powder|garlic salt|onion powder|chili powder|curry powder|dried|extract|oil|olive oil|sesame oil|canola oil|vegetable oil|avocado oil|coconut oil)\b/.test(
      s
    )
  ) {
    return 'Pantry & Dry Goods';
  }

  // 4. Beverages (check before "orange", "apple", "lemon")
  if (
    /\b(coffee|espresso|tea|matcha|chai|juice|orange juice|apple juice|cranberry juice|lemonade|limeade|soda|cola|seltzer|sparkling water|mineral water|tonic|kombucha|wine|beer|cider|smoothie|sports drink)\b/.test(
      s
    )
  ) {
    return 'Beverages';
  }

  // 5. Bakery
  if (
    /\b(bread|sourdough|baguette|ciabatta|brioche|bagel|tortilla|pita|naan|flatbread|bun|hamburger bun|hot dog bun|croissant|muffin|english muffin|dinner roll|hoagie|pastry|donut)\b/.test(
      s
    )
  ) {
    return 'Bakery';
  }

  // 6. Meat & Seafood
  if (
    /\b(chicken|turkey|beef|steak|sirloin|ribeye|brisket|chuck|ground beef|ground turkey|ground pork|pork|bacon|pancetta|prosciutto|ham|sausage|chorizo|pepperoni|salami|lamb|veal|duck|salmon|tuna|shrimp|prawn|cod|halibut|tilapia|mahimahi|trout|snapper|crab|lobster|scallop|clam|mussel|anchovy|sardine|fish)\b/.test(
      s
    )
  ) {
    return 'Meat & Seafood';
  }

  // 7. Dairy & Eggs
  if (
    /\b(milk|oat milk|almond milk|soy milk|cream|heavy cream|whipping cream|half and half|half-and-half|sour cream|cream cheese|butter|ghee|egg|cheese|cheddar|mozzarella|parmesan|pecorino|feta|goat cheese|ricotta|provolone|swiss|gruyere|monterey jack|brie|gouda|cotija|queso|yogurt|greek yogurt|kefir|buttermilk|cottage cheese)\b/.test(
      s
    )
  ) {
    return 'Dairy & Eggs';
  }

  // 8. Produce
  if (
    /\b(onion|shallot|scallion|green onion|leek|chive|garlic|ginger|tomato|potato|sweet potato|yam|carrot|celery|pepper|bell pepper|jalapeno|serrano|habanero|poblano|cucumber|zucchini|squash|butternut|pumpkin|eggplant|broccoli|cauliflower|cabbage|bok choy|brussels sprout|spinach|kale|lettuce|romaine|arugula|chard|collard|watercress|mixed green|salad|mushroom|avocado|corn|asparagus|green bean|snap pea|snow pea|pea|artichoke|beet|radish|turnip|parsnip|fennel|apple|banana|orange|mandarin|clementine|grapefruit|lemon|lime|berry|strawberry|blueberry|raspberry|blackberry|cranberry|cherry|grape|peach|plum|nectarine|apricot|pear|mango|pineapple|watermelon|cantaloupe|honeydew|melon|kiwi|pomegranate|fig|date|papaya|cilantro|parsley|basil|mint|rosemary|thyme|sage|dill|oregano|tarragon)\b/.test(
      s
    )
  ) {
    return 'Produce';
  }

  // 9. Pantry & Dry Goods
  if (
    /\b(flour|sugar|brown sugar|powdered sugar|confectioners|honey|maple syrup|agave|molasses|salt|kosher salt|sea salt|black pepper|peppercorn|spice|cumin|paprika|turmeric|coriander|cardamom|cinnamon|nutmeg|allspice|clove|cayenne|red pepper flake|bay leaf|seasoning|vanilla|baking powder|baking soda|yeast|cornstarch|arrowroot|gelatin|cocoa|chocolate|chocolate chip|rice|jasmine rice|basmati|brown rice|arborio|pasta|spaghetti|penne|rigatoni|fettuccine|linguine|macaroni|lasagna|orzo|noodle|ramen|udon|soba|rice noodle|quinoa|barley|farro|bulgur|couscous|oat|oatmeal|granola|cereal|bean|black bean|pinto bean|kidney bean|cannellini|white bean|garbanzo|chickpea|lentil|split pea|tofu|tempeh|nut|almond|walnut|pecan|cashew|pistachio|peanut|pine nut|hazelnut|macadamia|seed|sesame seed|chia|flax|pumpkin seed|sunflower seed|breadcrumb|panko|cracker|chip|tortilla chip|pretzel|popcorn|ketchup|mustard|dijon|mayonnaise|mayo|relish|pickle|capers|olive|salsa|jam|jelly|preserves|syrup)\b/.test(
      s
    )
  ) {
    return 'Pantry & Dry Goods';
  }

  return 'Household & Other';
}

/**
 * Formats a positive numeric quantity cleanly (e.g. 1 -> "1", 1.5 -> "1.5", 0.25 -> "0.25", 0.9999 -> "1").
 */
export function formatQuantity(qty: number): string {
  if (!Number.isFinite(qty) || qty <= 0) return '';
  if (Math.abs(qty - Math.round(qty)) < 1e-4) {
    return String(Math.round(qty));
  }
  const rounded2 = Number(qty.toFixed(2));
  return String(rounded2);
}

export function formatUnitForQuantity(unit: string, qty: number): string {
  const def = CANONICAL_UNITS[unit];
  if (!def) return qty > 1 ? `${unit}s` : unit;
  return qty > 1 ? def.plural : def.canonical;
}

/**
 * Parses a raw ingredient line into structured `{ quantity, unit, itemName, notes, category }`.
 * Applies optional `scaleFactor` (e.g. 0.5, 1, 2) to numeric quantities.
 */
export function parseIngredient(rawLine: string, scaleFactor = 1): ParsedIngredient {
  const rawTrimmed = (rawLine || '').trim();
  if (!rawTrimmed) {
    return {
      quantity: null,
      unit: null,
      itemName: '',
      notes: '',
      category: 'Household & Other',
      raw: rawLine,
    };
  }

  const effectiveScale = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
  const { quantity: baseQty, rest: afterQty } = extractLeadingQuantity(rawTrimmed);
  const { unit, rest: afterUnit } = extractLeadingUnit(afterQty);
  const { itemName, notes } = extractItemAndPrepNotes(afterUnit);

  const scaledQty =
    baseQty !== null ? Number((baseQty * effectiveScale).toFixed(6)) : null;

  return {
    quantity: scaledQty,
    unit,
    itemName: itemName || afterUnit.toLowerCase().trim(),
    notes,
    category: categorizeIngredient(itemName || afterUnit),
    raw: rawTrimmed,
  };
}

interface InternalBucket {
  bucketKey: string;
  family: UnitFamily | 'count' | 'unquantified';
  baseSum: number;
  unitsUsed: Set<string>;
  notesSet: Set<string>;
}

const FAMILY_UNIT_ASCENDING: Record<Exclude<UnitFamily, 'discrete'>, UnitDefinition[]> = {
  us_vol: [
    CANONICAL_UNITS.tsp,
    CANONICAL_UNITS.tbsp,
    CANONICAL_UNITS['fl oz'],
    CANONICAL_UNITS.cup,
    CANONICAL_UNITS.pint,
    CANONICAL_UNITS.quart,
    CANONICAL_UNITS.gallon,
  ],
  metric_vol: [CANONICAL_UNITS.ml, CANONICAL_UNITS.l],
  us_wt: [CANONICAL_UNITS.oz, CANONICAL_UNITS.lb],
  metric_wt: [CANONICAL_UNITS.g, CANONICAL_UNITS.kg],
};

function resolveBucketQuantityAndUnit(bucket: InternalBucket): {
  quantity: number | null;
  unit: string | null;
} {
  if (bucket.family === 'unquantified') {
    return { quantity: null, unit: null };
  }
  if (bucket.family === 'count') {
    return { quantity: bucket.baseSum, unit: null };
  }
  if (bucket.family === 'discrete') {
    const unit = Array.from(bucket.unitsUsed)[0] || null;
    return { quantity: bucket.baseSum, unit };
  }

  // Convertible volume or weight family
  const usedList = Array.from(bucket.unitsUsed)
    .map((u) => CANONICAL_UNITS[u])
    .filter(Boolean);

  if (usedList.length === 1) {
    // Keep the exact unit when all merged lines used the same unit (e.g. "1/2 cup" + "1 cup" -> "1.5 cups")
    const def = usedList[0];
    return {
      quantity: bucket.baseSum / def.toBase,
      unit: def.canonical,
    };
  }

  // Multiple different units within the same convertible family (e.g. "8 oz" + "1 lb", "3 tsp" + "1 tbsp"):
  // Prefer the largest unit among the input units if it yields >= 0.25, otherwise step down cleanly.
  const largestInput = usedList.reduce((max, cur) => (cur.toBase > max.toBase ? cur : max), usedList[0]);
  if (largestInput && bucket.baseSum / largestInput.toBase >= 0.25) {
    return {
      quantity: bucket.baseSum / largestInput.toBase,
      unit: largestInput.canonical,
    };
  }

  const ladder = FAMILY_UNIT_ASCENDING[bucket.family];
  let chosen = ladder[0];
  for (const candidate of ladder) {
    if (bucket.baseSum >= candidate.toBase) {
      chosen = candidate;
    }
  }
  return {
    quantity: bucket.baseSum / chosen.toBase,
    unit: chosen.canonical,
  };
}

/**
 * Builds the human-readable `displayLabel` for a `ShoppingListItem` from its `components`,
 * summing identical/convertible units and losslessly combining incompatible units
 * (e.g. `"Onion (1 large + 1 cup chopped)"`).
 */
export function buildShoppingItemDisplay(
  itemNameSingular: string,
  components: ShoppingListComponent[]
): { displayLabel: string; mergedComponents: ShoppingListComponent[] } {
  const buckets = new Map<string, InternalBucket>();

  for (const comp of components) {
    const qty = comp.quantity;
    const unit = comp.unit ? UNIT_ALIASES_LOWER[comp.unit.toLowerCase()] || comp.unit : null;

    let bucketKey: string;
    let family: InternalBucket['family'];
    let baseDelta = 0;

    if (qty === null || qty === undefined || qty <= 0) {
      bucketKey = 'unquantified';
      family = 'unquantified';
    } else if (!unit) {
      bucketKey = 'count';
      family = 'count';
      baseDelta = qty;
    } else {
      const def = CANONICAL_UNITS[unit];
      if (!def || def.family === 'discrete') {
        bucketKey = `discrete:${unit}`;
        family = 'discrete';
        baseDelta = qty;
      } else {
        bucketKey = def.family;
        family = def.family;
        baseDelta = qty * def.toBase;
      }
    }

    let bucket = buckets.get(bucketKey);
    if (!bucket) {
      bucket = {
        bucketKey,
        family,
        baseSum: 0,
        unitsUsed: new Set<string>(),
        notesSet: new Set<string>(),
      };
      buckets.set(bucketKey, bucket);
    }

    bucket.baseSum += baseDelta;
    if (unit) bucket.unitsUsed.add(unit);
    if (comp.notes) {
      for (const piece of comp.notes.split(',')) {
        const cleanNote = piece.trim();
        if (cleanNote) bucket.notesSet.add(cleanNote);
      }
    }
  }

  const bucketList = Array.from(buckets.values());

  // If there are quantified buckets alongside a pure unquantified duplicate ("Salt" + "1 tsp salt"),
  // fold any notes from unquantified into the quantified bucket when there's only one quantified bucket.
  if (bucketList.length === 2) {
    const unqIdx = bucketList.findIndex((b) => b.family === 'unquantified');
    if (unqIdx !== -1) {
      const other = bucketList[1 - unqIdx];
      const unq = bucketList[unqIdx];
      if (unq.notesSet.size === 0) {
        bucketList.splice(unqIdx, 1);
      } else {
        for (const n of unq.notesSet) other.notesSet.add(n);
        bucketList.splice(unqIdx, 1);
      }
    }
  }

  const mergedComponents: ShoppingListComponent[] = bucketList.map((b) => {
    const { quantity, unit } = resolveBucketQuantityAndUnit(b);
    const notes = Array.from(b.notesSet).join(', ');
    return {
      quantity: quantity !== null ? Number(quantity.toFixed(4)) : null,
      unit,
      ...(notes ? { notes } : {}),
    };
  });

  // Case 1: Single compatible bucket -> e.g. "3 onions", "1.5 cups milk", "1 cup onion (chopped)"
  if (bucketList.length === 1) {
    const b = bucketList[0];
    const { quantity, unit } = resolveBucketQuantityAndUnit(b);
    const notes = Array.from(b.notesSet).join(', ');

    if (quantity === null) {
      const base = capitalizeFirst(itemNameSingular);
      return {
        displayLabel: notes ? `${base} (${notes})` : base,
        mergedComponents,
      };
    }

    const qtyStr = formatQuantity(quantity);
    if (!unit) {
      const displayItem = quantity > 1 ? pluralizeItemName(itemNameSingular) : itemNameSingular;
      const label = `${qtyStr} ${displayItem}`;
      return {
        displayLabel: notes ? `${label} (${notes})` : label,
        mergedComponents,
      };
    }

    const unitStr = formatUnitForQuantity(unit, quantity);
    const label = `${qtyStr} ${unitStr} ${itemNameSingular}`;
    return {
      displayLabel: notes ? `${label} (${notes})` : label,
      mergedComponents,
    };
  }

  // Case 2: Multiple incompatible buckets -> Lossless Mismatched Units!
  // e.g. "Onion (1 large + 1 cup chopped)"
  const parts: string[] = bucketList.map((b) => {
    const { quantity, unit } = resolveBucketQuantityAndUnit(b);
    const notes = Array.from(b.notesSet).join(', ');
    if (quantity === null) {
      return notes || 'as needed';
    }
    const qtyStr = formatQuantity(quantity);
    if (!unit) {
      return notes ? `${qtyStr} ${notes}` : qtyStr;
    }
    const unitStr = formatUnitForQuantity(unit, quantity);
    return notes ? `${qtyStr} ${unitStr} ${notes}` : `${qtyStr} ${unitStr}`;
  });

  const titleName = capitalizeFirst(itemNameSingular);
  return {
    displayLabel: `${titleName} (${parts.join(' + ')})`,
    mergedComponents,
  };
}

export interface IngredientInputSpec {
  raw: string;
  scaleFactor?: number;
  sourceRecipeId?: string;
  sourceMealId?: string;
  categoryOverride?: GroceryCategory;
}

function makeShoppingId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `shop-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `shop-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Aggregates an array of raw ingredient strings (with optional scaleFactor) into normalized `ShoppingListItem[]`.
 */
export function aggregateIngredients(
  inputs: (string | IngredientInputSpec)[],
  defaultScaleFactor = 1
): ShoppingListItem[] {
  return mergeIngredientsIntoShoppingList([], inputs, defaultScaleFactor);
}

/**
 * Merges newly imported ingredients into an existing `ShoppingListItem[]` list.
 * - Unchecked items sharing `normalizedKey` merge losslessly.
 * - Already checked-off items remain untouched so freshly needed quantities create/merge an unchecked item.
 */
export function mergeIngredientsIntoShoppingList(
  existingItems: ShoppingListItem[],
  inputs: (string | IngredientInputSpec)[],
  defaultScaleFactor = 1
): ShoppingListItem[] {
  const nowIso = new Date().toISOString();
  const result: ShoppingListItem[] = existingItems.map((item) => ({
    ...item,
    components: [...item.components],
  }));

  // Map normalizedKey -> index of active UNCHECKED item in `result`
  const uncheckedIndexByKey = new Map<string, number>();
  result.forEach((item, idx) => {
    if (!item.checked) {
      uncheckedIndexByKey.set(item.normalizedKey, idx);
    }
  });

  // Track raw components per normalizedKey so repeated merges stay exact
  const rawComponentsByKey = new Map<string, ShoppingListComponent[]>();
  for (const [key, idx] of uncheckedIndexByKey.entries()) {
    rawComponentsByKey.set(key, [...result[idx].components]);
  }

  for (const entry of inputs) {
    const spec: IngredientInputSpec =
      typeof entry === 'string' ? { raw: entry, scaleFactor: defaultScaleFactor } : entry;
    const scale = spec.scaleFactor ?? defaultScaleFactor;
    const parsed = parseIngredient(spec.raw, scale);
    if (!parsed.itemName) continue;

    const normalizedKey = normalizeItemNameSingular(parsed.itemName);
    if (!normalizedKey) continue;

    const newComp: ShoppingListComponent = {
      quantity: parsed.quantity,
      unit: parsed.unit,
      ...(parsed.notes ? { notes: parsed.notes } : {}),
      raw: parsed.raw,
      ...(spec.sourceRecipeId ? { sourceRecipeId: spec.sourceRecipeId } : {}),
      ...(spec.sourceMealId ? { sourceMealId: spec.sourceMealId } : {}),
    };

    const existingIdx = uncheckedIndexByKey.get(normalizedKey);
    if (existingIdx !== undefined) {
      const compList = rawComponentsByKey.get(normalizedKey) || [];
      compList.push(newComp);
      rawComponentsByKey.set(normalizedKey, compList);

      const { displayLabel, mergedComponents } = buildShoppingItemDisplay(
        normalizedKey,
        compList
      );
      result[existingIdx] = {
        ...result[existingIdx],
        displayLabel,
        components: mergedComponents,
        category: spec.categoryOverride || result[existingIdx].category,
        updatedAt: nowIso,
      };
    } else {
      const compList = [newComp];
      rawComponentsByKey.set(normalizedKey, compList);
      const { displayLabel, mergedComponents } = buildShoppingItemDisplay(
        normalizedKey,
        compList
      );
      const newItem: ShoppingListItem = {
        id: makeShoppingId(),
        normalizedKey,
        itemName: capitalizeFirst(normalizedKey),
        displayLabel,
        components: mergedComponents,
        category: spec.categoryOverride || parsed.category,
        checked: false,
        addedAt: nowIso,
        updatedAt: nowIso,
      };
      const newIdx = result.length;
      result.push(newItem);
      uncheckedIndexByKey.set(normalizedKey, newIdx);
    }
  }

  return result;
}

/**
 * Formats `ShoppingListItem[]` for Google Keep in either:
 * - `'checklist'`: `=== PRODUCE ===` block headers followed by plain item lines (ready for Keep's Show Checkboxes)
 * - `'indented'`: `=== PRODUCE ===` block headers followed by `  ☐ item` lines
 */
export function formatShoppingListForGoogleKeep(
  items: ShoppingListItem[],
  aisleOrder: GroceryCategory[] = DEFAULT_AISLE_ORDER,
  mode: GoogleKeepExportMode = 'checklist',
  options?: { includeChecked?: boolean }
): string {
  const includeChecked = Boolean(options?.includeChecked);
  const filtered = includeChecked ? items : items.filter((item) => !item.checked);
  if (filtered.length === 0) return '';

  const grouped = new Map<string, ShoppingListItem[]>();
  for (const item of filtered) {
    const cat = item.category || 'Household & Other';
    const list = grouped.get(cat) || [];
    list.push(item);
    grouped.set(cat, list);
  }

  const orderedCategories: string[] = [];
  const seen = new Set<string>();
  for (const cat of aisleOrder) {
    if (grouped.has(cat) && !seen.has(cat)) {
      orderedCategories.push(cat);
      seen.add(cat);
    }
  }
  for (const cat of grouped.keys()) {
    if (!seen.has(cat)) {
      orderedCategories.push(cat);
      seen.add(cat);
    }
  }

  const sections: string[] = [];
  for (const cat of orderedCategories) {
    const catItems = grouped.get(cat) || [];
    if (catItems.length === 0) continue;

    const header = `=== ${cat.toUpperCase()} ===`;
    const lines = catItems.map((item) => {
      if (mode === 'indented') {
        const box = item.checked ? '☑' : '☐';
        return `  ${box} ${item.displayLabel}`;
      }
      return item.displayLabel;
    });

    sections.push([header, ...lines].join('\n'));
  }

  return sections.join('\n\n');
}
