import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useHousehold } from '@/contexts/HouseholdContext';
import { InventoryItem } from './useInventory';

export interface Recipe {
  id: string;
  name: string;
  description: string | null;
  prep_time: number | null;
  cook_time: number | null;
  difficulty: string | null;
  servings: number | null;
  category: string | null;
  image_url: string | null;
  instructions: string[] | null;
}

export interface RecipeIngredient {
  id: string;
  recipe_id: string;
  name: string;
  quantity: number;
  unit: string;
  is_optional: boolean | null;
}

export interface IngredientMatch {
  ingredient: RecipeIngredient;
  status: 'available' | 'missing' | 'insufficient';
  pantryQuantity: number;
  shortage: number;
}

export interface RecipeMatch {
  recipe: Recipe;
  ingredients: RecipeIngredient[];
  matches: IngredientMatch[];
  matchPercentage: number;
  possibleServings: number;
  missingIngredients: IngredientMatch[];
  insufficientIngredients: IngredientMatch[];
  availableIngredients: IngredientMatch[];
}

function normalizeUnit(unit: string): { normalized: string; factor: number } {
  const u = unit.toLowerCase().trim();
  if (['kg', 'kilogram', 'kilograms'].includes(u)) return { normalized: 'g', factor: 1000 };
  if (['l', 'litre', 'litres', 'liter', 'liters'].includes(u)) return { normalized: 'ml', factor: 1000 };
  if (['g', 'gram', 'grams'].includes(u)) return { normalized: 'g', factor: 1 };
  if (['ml', 'millilitre', 'millilitres'].includes(u)) return { normalized: 'ml', factor: 1 };
  if (['piece', 'pieces', 'pcs'].includes(u)) return { normalized: 'pieces', factor: 1 };
  if (['tbsp', 'tablespoon', 'tablespoons'].includes(u)) return { normalized: 'ml', factor: 15 };
  if (['tsp', 'teaspoon', 'teaspoons'].includes(u)) return { normalized: 'ml', factor: 5 };
  if (['cup', 'cups'].includes(u)) return { normalized: 'ml', factor: 240 };
  return { normalized: u, factor: 1 };
}

function normalizeQuantity(qty: number, unit: string): { quantity: number; unit: string } {
  const { normalized, factor } = normalizeUnit(unit);
  return { quantity: qty * factor, unit: normalized };
}

export function matchRecipes(recipes: (Recipe & { ingredients: RecipeIngredient[] })[], inventory: InventoryItem[]): RecipeMatch[] {
  const inventoryMap = new Map<string, { quantity: number; unit: string }>();
  
  for (const item of inventory) {
    const key = item.name.toLowerCase().trim();
    const norm = normalizeQuantity(item.quantity, item.unit);
    const existing = inventoryMap.get(key);
    if (existing && existing.unit === norm.unit) {
      existing.quantity += norm.quantity;
    } else {
      inventoryMap.set(key, { ...norm });
    }
  }

  return recipes.map(recipe => {
    const requiredIngredients = recipe.ingredients.filter(i => !i.is_optional);
    const matches: IngredientMatch[] = recipe.ingredients.map(ingredient => {
      const key = ingredient.name.toLowerCase().trim();
      const pantryItem = inventoryMap.get(key);
      const requiredNorm = normalizeQuantity(ingredient.quantity, ingredient.unit);

      if (!pantryItem) {
        return {
          ingredient,
          status: 'missing' as const,
          pantryQuantity: 0,
          shortage: requiredNorm.quantity,
        };
      }

      const pantryNorm = pantryItem;
      if (pantryNorm.unit !== requiredNorm.unit) {
        // Incompatible units — treat as missing
        return {
          ingredient,
          status: 'missing' as const,
          pantryQuantity: 0,
          shortage: ingredient.quantity,
        };
      }

      if (pantryNorm.quantity >= requiredNorm.quantity) {
        return {
          ingredient,
          status: 'available' as const,
          pantryQuantity: pantryNorm.quantity,
          shortage: 0,
        };
      }

      return {
        ingredient,
        status: 'insufficient' as const,
        pantryQuantity: pantryNorm.quantity,
        shortage: requiredNorm.quantity - pantryNorm.quantity,
      };
    });

    const availableCount = matches.filter(m => m.status === 'available' && !m.ingredient.is_optional).length;
    const totalRequired = requiredIngredients.length;
    const matchPercentage = totalRequired > 0 ? Math.round((availableCount / totalRequired) * 100) : 100;

    // Calculate possible servings based on limiting ingredient
    let possibleServings = recipe.servings || 2;
    const baseServings = recipe.servings || 2;

    for (const match of matches) {
      if (match.ingredient.is_optional) continue;
      if (match.status === 'missing') { possibleServings = 0; break; }
      
      const requiredNorm = normalizeQuantity(match.ingredient.quantity, match.ingredient.unit);
      if (requiredNorm.quantity > 0 && match.pantryQuantity > 0) {
        const ratio = match.pantryQuantity / requiredNorm.quantity;
        const servingsFromThis = Math.floor(ratio * baseServings);
        possibleServings = Math.min(possibleServings, servingsFromThis);
      }
    }

    return {
      recipe,
      ingredients: recipe.ingredients,
      matches,
      matchPercentage,
      possibleServings: Math.max(0, possibleServings),
      missingIngredients: matches.filter(m => m.status === 'missing'),
      insufficientIngredients: matches.filter(m => m.status === 'insufficient'),
      availableIngredients: matches.filter(m => m.status === 'available'),
    };
  }).sort((a, b) => b.matchPercentage - a.matchPercentage);
}

export function useRecipes() {
  return useQuery({
    queryKey: ['recipes'],
    queryFn: async () => {
      const { data: recipes, error } = await supabase
        .from('recipes')
        .select('*')
        .order('name');
      if (error) throw error;

      const { data: ingredients, error: ingError } = await supabase
        .from('recipe_ingredients')
        .select('*');
      if (ingError) throw ingError;

      return (recipes || []).map(r => ({
        ...r,
        ingredients: (ingredients || []).filter(i => i.recipe_id === r.id),
      })) as (Recipe & { ingredients: RecipeIngredient[] })[];
    },
  });
}
