/**
 * Canonical default-weight table for piece-based food items.
 *
 * All weights are in GRAMS for a single piece of the given size.
 * This is the single source of truth used by:
 *   - the voice-command edge function (copied verbatim into supabase/functions/voice-command/index.ts)
 *   - the client-side VoiceCommandBar confirmation dialog
 *   - any future receipt parser / manual entry helpers
 *
 * Add new items here. Use lowercase snake_case keys. Aliases let the AI map
 * spoken phrases ("drumstick", "chicken leg piece") to the canonical key.
 */

export type FoodSize = 'small' | 'medium' | 'large';

export interface FoodWeightEntry {
  /** Canonical key, e.g. "chicken_leg" */
  key: string;
  /** Spoken aliases the AI may emit, lowercased */
  aliases: string[];
  /** Default unit name shown in UI (singular) */
  unitLabel: string;
  /** Weight in grams per piece, by size */
  weights: Record<FoodSize, number>;
  /** Default category for new pantry inserts */
  category: string;
  /** Default storage location */
  storage: 'pantry' | 'fridge' | 'freezer';
}

export const FOOD_WEIGHTS: FoodWeightEntry[] = [
  // --- Meat / Poultry ---
  {
    key: 'chicken_leg',
    aliases: ['chicken leg', 'chicken legs', 'drumstick', 'drumsticks', 'chicken leg piece', 'leg piece'],
    unitLabel: 'leg',
    weights: { small: 200, medium: 275, large: 350 },
    category: 'Meat',
    storage: 'fridge',
  },
  {
    key: 'chicken_thigh',
    aliases: ['chicken thigh', 'chicken thighs', 'thigh'],
    unitLabel: 'thigh',
    weights: { small: 110, medium: 150, large: 200 },
    category: 'Meat',
    storage: 'fridge',
  },
  {
    key: 'chicken_breast',
    aliases: ['chicken breast', 'chicken breasts', 'breast fillet'],
    unitLabel: 'breast',
    weights: { small: 150, medium: 200, large: 280 },
    category: 'Meat',
    storage: 'fridge',
  },
  {
    key: 'chicken_wing',
    aliases: ['chicken wing', 'chicken wings', 'wing'],
    unitLabel: 'wing',
    weights: { small: 35, medium: 50, large: 70 },
    category: 'Meat',
    storage: 'fridge',
  },
  {
    key: 'sausage',
    aliases: ['sausage', 'sausages', 'banger'],
    unitLabel: 'sausage',
    weights: { small: 50, medium: 70, large: 100 },
    category: 'Meat',
    storage: 'fridge',
  },
  {
    key: 'bacon_strip',
    aliases: ['bacon strip', 'bacon slice', 'rasher'],
    unitLabel: 'strip',
    weights: { small: 10, medium: 15, large: 25 },
    category: 'Meat',
    storage: 'fridge',
  },
  {
    key: 'fish_fillet',
    aliases: ['fish fillet', 'fish fillets', 'salmon fillet'],
    unitLabel: 'fillet',
    weights: { small: 100, medium: 150, large: 220 },
    category: 'Meat',
    storage: 'fridge',
  },

  // --- Dairy / Eggs ---
  {
    key: 'egg',
    aliases: ['egg', 'eggs'],
    unitLabel: 'egg',
    weights: { small: 40, medium: 50, large: 65 },
    category: 'Dairy',
    storage: 'fridge',
  },
  {
    key: 'cheese_slice',
    aliases: ['cheese slice', 'slice of cheese'],
    unitLabel: 'slice',
    weights: { small: 15, medium: 20, large: 30 },
    category: 'Dairy',
    storage: 'fridge',
  },

  // --- Bread / Baked ---
  {
    key: 'bread_slice',
    aliases: ['bread slice', 'slice of bread', 'toast'],
    unitLabel: 'slice',
    weights: { small: 25, medium: 30, large: 45 },
    category: 'Grains',
    storage: 'pantry',
  },
  {
    key: 'bread_loaf',
    aliases: ['loaf', 'loaf of bread', 'bread loaf'],
    unitLabel: 'loaf',
    weights: { small: 400, medium: 500, large: 800 },
    category: 'Grains',
    storage: 'pantry',
  },
  {
    key: 'bread_roll',
    aliases: ['roll', 'bun', 'bread roll'],
    unitLabel: 'roll',
    weights: { small: 40, medium: 60, large: 90 },
    category: 'Grains',
    storage: 'pantry',
  },
  {
    key: 'tortilla',
    aliases: ['tortilla', 'chapati', 'roti', 'wrap'],
    unitLabel: 'tortilla',
    weights: { small: 30, medium: 40, large: 60 },
    category: 'Grains',
    storage: 'pantry',
  },

  // --- Fruits / Vegetables (whole pieces) ---
  { key: 'apple', aliases: ['apple', 'apples'], unitLabel: 'apple', weights: { small: 130, medium: 180, large: 230 }, category: 'Fruits', storage: 'fridge' },
  { key: 'banana', aliases: ['banana', 'bananas'], unitLabel: 'banana', weights: { small: 90, medium: 120, large: 160 }, category: 'Fruits', storage: 'pantry' },
  { key: 'orange', aliases: ['orange', 'oranges'], unitLabel: 'orange', weights: { small: 130, medium: 180, large: 240 }, category: 'Fruits', storage: 'fridge' },
  { key: 'lemon', aliases: ['lemon', 'lemons'], unitLabel: 'lemon', weights: { small: 50, medium: 70, large: 100 }, category: 'Fruits', storage: 'fridge' },
  { key: 'tomato', aliases: ['tomato', 'tomatoes'], unitLabel: 'tomato', weights: { small: 90, medium: 150, large: 220 }, category: 'Vegetables', storage: 'fridge' },
  { key: 'onion', aliases: ['onion', 'onions'], unitLabel: 'onion', weights: { small: 90, medium: 150, large: 230 }, category: 'Vegetables', storage: 'pantry' },
  { key: 'potato', aliases: ['potato', 'potatoes'], unitLabel: 'potato', weights: { small: 130, medium: 200, large: 300 }, category: 'Vegetables', storage: 'pantry' },
  { key: 'carrot', aliases: ['carrot', 'carrots'], unitLabel: 'carrot', weights: { small: 40, medium: 65, large: 100 }, category: 'Vegetables', storage: 'fridge' },
  { key: 'garlic_clove', aliases: ['garlic clove', 'clove of garlic', 'garlic'], unitLabel: 'clove', weights: { small: 3, medium: 5, large: 8 }, category: 'Vegetables', storage: 'pantry' },
];

/**
 * Volume / cup conversions (per 1 cup) for items typically measured in cups.
 * Returns grams (for solids) or millilitres (for liquids).
 */
export const CUP_WEIGHTS_GRAMS: Record<string, number> = {
  rice: 200, basmati: 200, jasmine: 200, quinoa: 170,
  flour: 125, sugar: 200, brown_sugar: 220,
  oats: 90, lentils: 200, dal: 200, beans: 200,
  pasta: 100, cereal: 30, cornflakes: 30,
};

export const CUP_VOLUME_ML = 240;
export const GLASS_VOLUME_ML = 250;
export const TBSP_ML = 15;
export const TSP_ML = 5;

/** Find a food entry by alias or canonical key. Case-insensitive. */
export function findFoodEntry(spokenName: string): FoodWeightEntry | null {
  const normalized = spokenName.trim().toLowerCase();
  for (const entry of FOOD_WEIGHTS) {
    if (entry.key === normalized) return entry;
    if (entry.aliases.some(a => a === normalized || normalized.includes(a))) return entry;
  }
  return null;
}

/**
 * Sanity-check a computed gram value for piece-based items.
 * Multi-piece meat items below 10g are clearly wrong (the bug we're fixing).
 */
export function isUnrealisticGrams(grams: number, pieces: number, category?: string): boolean {
  if (!Number.isFinite(grams) || grams <= 0) return true;
  if (pieces >= 1 && grams < 10) return true;            // 0.24 g for 2 chicken legs ⇒ flag
  if (category === 'Meat' && pieces >= 1 && grams < 30) return true;
  if (grams > 5000) return true;                          // > 5 kg for a single voice command ⇒ flag
  return false;
}
