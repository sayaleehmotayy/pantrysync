import React, { useMemo, useState } from 'react';
import { useRecipes, matchRecipes, RecipeMatch } from '@/hooks/useRecipes';
import { useInventory } from '@/hooks/useInventory';
import { useShoppingList } from '@/hooks/useShoppingList';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ChefHat, Clock, Users, Plus, Check, X, AlertCircle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

function MatchBadge({ pct }: { pct: number }) {
  const color = pct === 100 ? 'bg-primary/10 text-primary' : pct >= 60 ? 'bg-warning/10 text-warning' : 'bg-destructive/10 text-destructive';
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${color}`}>{pct}% match</span>;
}

export default function RecipesPage() {
  const { data: recipes = [], isLoading: recipesLoading } = useRecipes();
  const { data: inventory = [] } = useInventory();
  const { addItem: addShoppingItem } = useShoppingList();
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeMatch | null>(null);
  const [showMatching, setShowMatching] = useState(false);

  const matched = useMemo(() => {
    if (!showMatching) return null;
    return matchRecipes(recipes, inventory);
  }, [recipes, inventory, showMatching]);

  const displayRecipes = matched || recipes.map(r => ({
    recipe: r,
    ingredients: r.ingredients,
    matches: [],
    matchPercentage: 0,
    possibleServings: 0,
    missingIngredients: [],
    insufficientIngredients: [],
    availableIngredients: [],
  } as RecipeMatch));

  const addMissingToShoppingList = (match: RecipeMatch) => {
    const missing = [...match.missingIngredients, ...match.insufficientIngredients];
    for (const m of missing) {
      const qty = m.status === 'missing' ? m.ingredient.quantity : m.shortage;
      addShoppingItem.mutate({
        name: m.ingredient.name,
        quantity: qty,
        unit: m.ingredient.unit,
        category: 'Other',
      });
    }
    toast.success(`Added ${missing.length} items to shopping list`);
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-display font-bold">Recipes</h1>
        <Button size="sm" variant={showMatching ? 'default' : 'outline'} onClick={() => setShowMatching(!showMatching)}>
          <Sparkles className="w-4 h-4 mr-1" />
          {showMatching ? 'Matching On' : 'Match Pantry'}
        </Button>
      </div>

      {recipesLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">Loading recipes...</div>
      ) : displayRecipes.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
            <ChefHat className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="font-display font-semibold">No recipes yet</h3>
          <p className="text-muted-foreground text-sm mt-1">Recipes will appear here</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {displayRecipes.map(match => (
            <Card key={match.recipe.id} className="border-border/50 shadow-none hover:shadow-sm transition-all cursor-pointer" onClick={() => setSelectedRecipe(match)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-display font-semibold text-sm">{match.recipe.name}</h3>
                    {match.recipe.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{match.recipe.description}</p>
                    )}
                  </div>
                  {showMatching && <MatchBadge pct={match.matchPercentage} />}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-3">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {(match.recipe.prep_time || 0) + (match.recipe.cook_time || 0)}m</span>
                  <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {showMatching && match.possibleServings > 0 ? match.possibleServings : match.recipe.servings} servings</span>
                  <Badge variant="secondary" className="text-[10px] h-5">{match.recipe.difficulty}</Badge>
                  <Badge variant="outline" className="text-[10px] h-5">{match.recipe.category}</Badge>
                </div>
                {showMatching && (match.missingIngredients.length > 0 || match.insufficientIngredients.length > 0) && (
                  <div className="mt-3 pt-3 border-t border-border/50">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
                      {match.missingIngredients.length} missing · {match.insufficientIngredients.length} insufficient
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!selectedRecipe} onOpenChange={open => !open && setSelectedRecipe(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {selectedRecipe && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display">{selectedRecipe.recipe.name}</DialogTitle>
                {selectedRecipe.recipe.description && (
                  <p className="text-sm text-muted-foreground">{selectedRecipe.recipe.description}</p>
                )}
              </DialogHeader>

              <div className="flex items-center gap-4 text-sm text-muted-foreground py-2">
                <span className="flex items-center gap-1"><Clock className="w-4 h-4" /> {(selectedRecipe.recipe.prep_time || 0) + (selectedRecipe.recipe.cook_time || 0)} min</span>
                <span className="flex items-center gap-1"><Users className="w-4 h-4" /> {selectedRecipe.recipe.servings} servings</span>
                <Badge variant="secondary">{selectedRecipe.recipe.difficulty}</Badge>
              </div>

              {showMatching && (
                <div className="flex items-center gap-3 py-2">
                  <MatchBadge pct={selectedRecipe.matchPercentage} />
                  {selectedRecipe.possibleServings > 0 && (
                    <span className="text-sm text-muted-foreground">Can make ~{selectedRecipe.possibleServings} servings</span>
                  )}
                </div>
              )}

              <div>
                <h4 className="font-display font-semibold text-sm mb-2">Ingredients</h4>
                <div className="space-y-1.5">
                  {selectedRecipe.ingredients.map(ing => {
                    const match = selectedRecipe.matches.find(m => m.ingredient.id === ing.id);
                    const icon = !showMatching ? null :
                      match?.status === 'available' ? <Check className="w-3.5 h-3.5 text-primary" /> :
                      match?.status === 'insufficient' ? <AlertCircle className="w-3.5 h-3.5 text-warning" /> :
                      <X className="w-3.5 h-3.5 text-destructive" />;

                    return (
                      <div key={ing.id} className="flex items-center gap-2 text-sm">
                        {icon}
                        <span className={ing.is_optional ? 'text-muted-foreground italic' : ''}>
                          {ing.quantity} {ing.unit} {ing.name}
                          {ing.is_optional && ' (optional)'}
                        </span>
                        {showMatching && match?.status === 'insufficient' && (
                          <span className="text-xs text-warning ml-auto">need {match.shortage} more {ing.unit}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {selectedRecipe.recipe.instructions && selectedRecipe.recipe.instructions.length > 0 && (
                <div>
                  <h4 className="font-display font-semibold text-sm mb-2">Instructions</h4>
                  <ol className="space-y-2">
                    {selectedRecipe.recipe.instructions.map((step, i) => (
                      <li key={i} className="flex gap-3 text-sm">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-semibold">{i + 1}</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {showMatching && (selectedRecipe.missingIngredients.length > 0 || selectedRecipe.insufficientIngredients.length > 0) && (
                <Button className="w-full mt-2" onClick={() => { addMissingToShoppingList(selectedRecipe); setSelectedRecipe(null); }}>
                  <Plus className="w-4 h-4 mr-1" /> Add Missing to Shopping List
                </Button>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
