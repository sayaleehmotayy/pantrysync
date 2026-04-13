import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { ShoppingItem } from '@/hooks/useShoppingList';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  ArrowLeft, Check, ShoppingCart, Target, TrendingDown, TrendingUp, Delete, Undo2,
} from 'lucide-react';
import { type CurrencyInfo, formatCurrency, detectCurrencyFromLocale } from '@/lib/currency';

interface ShoppingModeProps {
  items: ShoppingItem[];
  onMarkBought: (id: string, price: number) => void;
  onExit: () => void;
  currency?: CurrencyInfo;
}

interface TrackedItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  price: number | null;
}

export default function ShoppingMode({ items, onMarkBought, onExit, currency }: ShoppingModeProps) {
  const curr = currency || detectCurrencyFromLocale();
  const [budget, setBudget] = useState<number | null>(null);
  const [budgetInput, setBudgetInput] = useState('');
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [priceInput, setPriceInput] = useState('');
  const [trackedItems, setTrackedItems] = useState<TrackedItem[]>([]);

  useEffect(() => {
    const pending = items.filter(i => i.status === 'pending' || i.status === 'not_found');
    setTrackedItems(pending.map(i => ({
      id: i.id, name: i.name, quantity: i.quantity, unit: i.unit, category: i.category, price: null,
    })));
  }, []);

  const totalSpent = useMemo(() =>
    trackedItems.reduce((sum, i) => sum + (i.price || 0), 0), [trackedItems]
  );

  const remaining = budget ? budget - totalSpent : null;
  const overBudget = remaining !== null && remaining < 0;
  const progressPercent = budget ? Math.min((totalSpent / budget) * 100, 100) : 0;

  const unpricedItems = trackedItems.filter(i => i.price === null);
  const pricedItems = trackedItems.filter(i => i.price !== null);

  const fmt = (amount: number) => formatCurrency(amount, curr);

  const handleNumpad = useCallback((key: string) => {
    setPriceInput(prev => {
      if (key === 'clear') return '';
      if (key === 'back') return prev.slice(0, -1);
      if (key === '.') {
        if (prev.includes('.')) return prev;
        return prev === '' ? '0.' : prev + '.';
      }
      const parts = prev.split('.');
      if (parts.length === 2 && parts[1].length >= 2) return prev;
      if (prev.length >= 8) return prev;
      return prev + key;
    });
  }, []);

  const confirmPrice = useCallback(() => {
    if (!activeItemId || !priceInput) return;
    const price = parseFloat(priceInput);
    if (isNaN(price) || price < 0) return;

    setTrackedItems(prev => prev.map(i =>
      i.id === activeItemId ? { ...i, price } : i
    ));
    onMarkBought(activeItemId, price);
    setActiveItemId(null);
    setPriceInput('');
  }, [activeItemId, priceInput, onMarkBought]);

  const undoPrice = useCallback((id: string) => {
    setTrackedItems(prev => prev.map(i =>
      i.id === id ? { ...i, price: null } : i
    ));
  }, []);

  // Budget setup screen
  if (budget === null) {
    return (
      <div className="space-y-6 animate-fade-in">
        <button onClick={onExit} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to list
        </button>

        <div className="flex flex-col items-center py-8 gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Target className="w-8 h-8 text-primary" />
          </div>
          <div className="text-center">
            <h2 className="font-display font-bold text-lg">Set Your Budget</h2>
            <p className="text-sm text-muted-foreground mt-1">How much do you want to spend this trip?</p>
          </div>

          <div className="text-center">
            <span className="text-4xl font-bold font-display">
              {curr.symbol}{budgetInput || '0'}
            </span>
            <span className="text-sm text-muted-foreground ml-2">{curr.code}</span>
          </div>

          <div className="grid grid-cols-3 gap-2 w-full max-w-[280px]">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'].map(key => (
              <button
                key={key}
                onClick={() => {
                  if (key === 'back') {
                    setBudgetInput(prev => prev.slice(0, -1));
                  } else if (key === '.') {
                    setBudgetInput(prev => prev.includes('.') ? prev : (prev || '0') + '.');
                  } else {
                    const parts = budgetInput.split('.');
                    if (parts.length === 2 && parts[1].length >= 2) return;
                    if (budgetInput.length >= 7) return;
                    setBudgetInput(prev => prev + key);
                  }
                }}
                className="h-12 rounded-xl bg-muted hover:bg-muted/80 active:scale-95 transition-all font-semibold text-lg flex items-center justify-center"
              >
                {key === 'back' ? <Delete className="w-5 h-5" /> : key}
              </button>
            ))}
          </div>

          <Button
            className="w-full max-w-[280px] gap-2"
            size="lg"
            disabled={!budgetInput || parseFloat(budgetInput) <= 0}
            onClick={() => setBudget(parseFloat(budgetInput))}
          >
            <ShoppingCart className="w-4 h-4" />
            Start Shopping
          </Button>

          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setBudget(Infinity)}>
            Skip — no budget
          </Button>
        </div>
      </div>
    );
  }

  // Active item — numpad for price entry
  if (activeItemId) {
    const item = trackedItems.find(i => i.id === activeItemId);
    if (!item) return null;

    return (
      <div className="space-y-4 animate-fade-in">
        <button
          onClick={() => { setActiveItemId(null); setPriceInput(''); }}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="text-center space-y-1">
          <p className="text-sm text-muted-foreground">How much for</p>
          <h2 className="font-display font-bold text-lg">{item.name}</h2>
          <p className="text-xs text-muted-foreground">{item.quantity} {item.unit}</p>
        </div>

        <div className="text-center py-4">
          <span className="text-5xl font-bold font-display tabular-nums">
            {curr.symbol}{priceInput || '0.00'}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 max-w-[280px] mx-auto">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'].map(key => (
            <button
              key={key}
              onClick={() => handleNumpad(key === 'back' ? 'back' : key)}
              className="h-14 rounded-xl bg-muted hover:bg-muted/80 active:scale-95 transition-all font-semibold text-xl flex items-center justify-center"
            >
              {key === 'back' ? <Delete className="w-5 h-5" /> : key}
            </button>
          ))}
        </div>

        <Button
          className="w-full max-w-[280px] mx-auto flex gap-2"
          size="lg"
          disabled={!priceInput || parseFloat(priceInput) <= 0}
          onClick={confirmPrice}
        >
          <Check className="w-4 h-4" />
          Confirm {curr.symbol}{priceInput || '0.00'}
        </Button>
      </div>
    );
  }

  // Main shopping mode view
  return (
    <div className="space-y-4 animate-fade-in">
      <button onClick={onExit} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Exit Shopping Mode
      </button>

      {/* Budget tracker */}
      {budget !== Infinity && (
        <Card className={`${overBudget ? 'border-destructive/50 bg-destructive/5' : 'border-primary/30 bg-primary/5'}`}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Spent</p>
                <p className={`text-2xl font-bold font-display ${overBudget ? 'text-destructive' : 'text-foreground'}`}>
                  {fmt(totalSpent)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">{overBudget ? 'Over by' : 'Remaining'}</p>
                <p className={`text-2xl font-bold font-display ${overBudget ? 'text-destructive' : 'text-primary'}`}>
                  {overBudget ? (
                    <span className="flex items-center gap-1">
                      <TrendingUp className="w-5 h-5" />{fmt(Math.abs(remaining!))}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1">
                      <TrendingDown className="w-5 h-5" />{fmt(remaining!)}
                    </span>
                  )}
                </p>
              </div>
            </div>
            <div className="space-y-1">
              <Progress value={progressPercent} className={`h-3 ${overBudget ? '[&>div]:bg-destructive' : ''}`} />
              <p className="text-[10px] text-muted-foreground text-center">
                {fmt(totalSpent)} of {fmt(budget)} budget
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No budget — simple total */}
      {budget === Infinity && totalSpent > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground">Total so far</p>
              <p className="text-2xl font-bold font-display">{fmt(totalSpent)}</p>
            </div>
            <Badge variant="outline" className="text-xs">
              {pricedItems.length}/{trackedItems.length} items
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* Unpriced items */}
      {unpricedItems.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
            To Buy ({unpricedItems.length})
          </h3>
          {unpricedItems.map(item => (
            <Card
              key={item.id}
              className="border-border/50 shadow-none cursor-pointer hover:border-primary/30 active:scale-[0.99] transition-all"
              onClick={() => { setActiveItemId(item.id); setPriceInput(''); }}
            >
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.quantity} {item.unit} · {item.category}</p>
                </div>
                <Badge variant="secondary" className="text-xs shrink-0">Tap to price</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Priced items */}
      {pricedItems.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
            In Cart ({pricedItems.length})
          </h3>
          {pricedItems.map(item => (
            <Card key={item.id} className="border-border/50 shadow-none bg-primary/5">
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <Check className="w-3.5 h-3.5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.quantity} {item.unit}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <p className="font-bold text-sm">{fmt(item.price!)}</p>
                  <button
                    onClick={() => undoPrice(item.id)}
                    className="w-7 h-7 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
                  >
                    <Undo2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* All done */}
      {unpricedItems.length === 0 && trackedItems.length > 0 && (
        <div className="text-center py-6">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
            <Check className="w-6 h-6 text-primary" />
          </div>
          <p className="font-display font-semibold">All items priced!</p>
          <p className="text-sm text-muted-foreground mt-1">
            Total: {fmt(totalSpent)}
            {budget !== Infinity && remaining !== null && (
              overBudget
                ? <span className="text-destructive"> ({fmt(Math.abs(remaining))} over budget)</span>
                : <span className="text-primary"> ({fmt(remaining)} under budget)</span>
            )}
          </p>
          <Button className="mt-4 gap-2" onClick={onExit}>
            <ShoppingCart className="w-4 h-4" /> Finish Shopping
          </Button>
        </div>
      )}
    </div>
  );
}
