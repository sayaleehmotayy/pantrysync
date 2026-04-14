import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { ShoppingItem } from '@/hooks/useShoppingList';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft, Check, ShoppingCart, Target, TrendingDown, TrendingUp, Delete, Undo2, Tag,
} from 'lucide-react';
import { type CurrencyInfo, formatCurrency, detectCurrencyFromLocale } from '@/lib/currency';

interface ShoppingModeProps {
  items: ShoppingItem[];
  onMarkBought: (id: string, price: number, quantityFound?: number) => void;
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
  quantityFound: number | null;
}

type EntryStep = 'quantity' | 'unitPrice' | 'confirm';

export default function ShoppingMode({ items, onMarkBought, onExit, currency }: ShoppingModeProps) {
  const curr = currency || detectCurrencyFromLocale();
  const SESSION_KEY = 'pantrysync_shopping_session';

  const savedSession = useMemo(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw) as { budget: number | null; trackedItems: TrackedItem[] };
    } catch {}
    return null;
  }, []);

  const [budget, setBudget] = useState<number | null>(savedSession?.budget ?? null);
  const [budgetInput, setBudgetInput] = useState('');
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [entryStep, setEntryStep] = useState<EntryStep>('quantity');
  const [quantityInput, setQuantityInput] = useState('');
  const [unitPriceInput, setUnitPriceInput] = useState('');
  const [useSalePrice, setUseSalePrice] = useState(false);
  const [saleTotalInput, setSaleTotalInput] = useState('');
  const [trackedItems, setTrackedItems] = useState<TrackedItem[]>(savedSession?.trackedItems ?? []);
  const initialized = useRef(!!savedSession);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const pending = items.filter(i => i.status === 'pending' || i.status === 'not_found');
    setTrackedItems(pending.map(i => ({
      id: i.id, name: i.name, quantity: i.quantity, unit: i.unit, category: i.category, price: null, quantityFound: null,
    })));
  }, []);

  useEffect(() => {
    if (budget === null && trackedItems.length === 0) return;
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ budget, trackedItems }));
    } catch {}
  }, [budget, trackedItems]);

  const clearSession = useCallback(() => {
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
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

  const activeItem = activeItemId ? trackedItems.find(i => i.id === activeItemId) : null;

  const qtyFound = quantityInput ? parseInt(quantityInput) : (activeItem?.quantity ?? 0);
  const unitPrice = unitPriceInput ? parseFloat(unitPriceInput) : 0;
  const calculatedTotal = qtyFound * unitPrice;
  const finalTotal = useSalePrice && saleTotalInput ? parseFloat(saleTotalInput) : calculatedTotal;

  const handleNumpad = useCallback((key: string, setter: React.Dispatch<React.SetStateAction<string>>, allowDecimal = true) => {
    setter(prev => {
      if (key === 'clear') return '';
      if (key === 'back') return prev.slice(0, -1);
      if (key === '.') {
        if (!allowDecimal) return prev;
        if (prev.includes('.')) return prev;
        return prev === '' ? '0.' : prev + '.';
      }
      const parts = prev.split('.');
      if (parts.length === 2 && parts[1].length >= 2) return prev;
      if (prev.length >= 8) return prev;
      return prev + key;
    });
  }, []);

  const openItem = useCallback((id: string) => {
    const item = trackedItems.find(i => i.id === id);
    if (!item) return;
    setActiveItemId(id);
    setEntryStep('quantity');
    setQuantityInput(String(item.quantity));
    setUnitPriceInput('');
    setUseSalePrice(false);
    setSaleTotalInput('');
  }, [trackedItems]);

  const confirmPurchase = useCallback(() => {
    if (!activeItemId || finalTotal <= 0) return;

    const item = trackedItems.find(i => i.id === activeItemId);
    const remainingQty = item ? item.quantity - qtyFound : 0;

    setTrackedItems(prev => {
      let updated = prev.map(i =>
        i.id === activeItemId ? { ...i, price: finalTotal, quantityFound: qtyFound } : i
      );
      // If partial buy, add a new entry for the remaining quantity
      if (remainingQty > 0 && item) {
        updated = [...updated, {
          id: item.id + '_remaining',
          name: item.name,
          quantity: remainingQty,
          unit: item.unit,
          category: item.category,
          price: null,
          quantityFound: null,
        }];
      }
      return updated;
    });
    onMarkBought(activeItemId, finalTotal, qtyFound);
    setActiveItemId(null);
    setEntryStep('quantity');
    setQuantityInput('');
    setUnitPriceInput('');
    setUseSalePrice(false);
    setSaleTotalInput('');
  }, [activeItemId, finalTotal, qtyFound, onMarkBought, trackedItems]);

  const undoPrice = useCallback((id: string) => {
    setTrackedItems(prev => prev.map(i =>
      i.id === id ? { ...i, price: null, quantityFound: null } : i
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

  // Active item — multi-step entry
  if (activeItemId && activeItem) {
    return (
      <div className="space-y-4 animate-fade-in">
        <button
          onClick={() => { setActiveItemId(null); setEntryStep('quantity'); }}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="text-center space-y-1">
          <h2 className="font-display font-bold text-lg">{activeItem.name}</h2>
          <p className="text-xs text-muted-foreground">Shopping list: {activeItem.quantity} {activeItem.unit}</p>
        </div>

        {/* Step 1: Quantity found */}
        {entryStep === 'quantity' && (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">How many did you find?</p>
              <span className="text-5xl font-bold font-display tabular-nums">
                {quantityInput || '0'}
              </span>
              <p className="text-xs text-muted-foreground mt-1">{activeItem.unit}</p>
            </div>

            <div className="grid grid-cols-3 gap-2 max-w-[280px] mx-auto">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'].map(key => (
                <button
                  key={key}
                  onClick={() => handleNumpad(key, setQuantityInput, false)}
                  className="h-14 rounded-xl bg-muted hover:bg-muted/80 active:scale-95 transition-all font-semibold text-xl flex items-center justify-center"
                >
                  {key === 'back' ? <Delete className="w-5 h-5" /> : key === 'clear' ? 'C' : key}
                </button>
              ))}
            </div>

            <Button
              className="w-full max-w-[280px] mx-auto flex gap-2"
              size="lg"
              disabled={!quantityInput || parseInt(quantityInput) <= 0}
              onClick={() => setEntryStep('unitPrice')}
            >
              Next — Enter Price
            </Button>
          </div>
        )}

        {/* Step 2: Unit price */}
        {entryStep === 'unitPrice' && (
          <div className="space-y-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">
                Price per 1 {activeItem.unit.replace(/s$/, '')}?
              </p>
              <span className="text-5xl font-bold font-display tabular-nums">
                {curr.symbol}{unitPriceInput || '0.00'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 max-w-[280px] mx-auto">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back'].map(key => (
                <button
                  key={key}
                  onClick={() => handleNumpad(key, setUnitPriceInput)}
                  className="h-14 rounded-xl bg-muted hover:bg-muted/80 active:scale-95 transition-all font-semibold text-xl flex items-center justify-center"
                >
                  {key === 'back' ? <Delete className="w-5 h-5" /> : key}
                </button>
              ))}
            </div>

            {unitPrice > 0 && (
              <div className="text-center text-sm text-muted-foreground">
                {qtyFound} × {fmt(unitPrice)} = <span className="font-bold text-foreground">{fmt(calculatedTotal)}</span>
              </div>
            )}

            <div className="flex gap-2 max-w-[280px] mx-auto">
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={() => setEntryStep('quantity')}
              >
                Back
              </Button>
              <Button
                className="flex-1 gap-2"
                size="lg"
                disabled={!unitPriceInput || unitPrice <= 0}
                onClick={() => setEntryStep('confirm')}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Confirm (with sale override option) */}
        {entryStep === 'confirm' && (
          <div className="space-y-4">
            <Card className="border-primary/30 bg-primary/5">
              <CardContent className="p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Quantity found</span>
                  <span className="font-medium">{qtyFound} {activeItem.unit}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Price per {activeItem.unit.replace(/s$/, '')}</span>
                  <span className="font-medium">{fmt(unitPrice)}</span>
                </div>
                <div className="border-t border-border pt-2 flex justify-between">
                  <span className="font-medium">Calculated total</span>
                  <span className={`font-bold ${useSalePrice ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                    {fmt(calculatedTotal)}
                  </span>
                </div>

                {useSalePrice && (
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-primary flex items-center gap-1">
                      <Tag className="w-3.5 h-3.5" /> Sale price
                    </span>
                    <span className="font-bold text-primary text-lg">{fmt(finalTotal)}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Sale/deal toggle */}
            <div className="max-w-[320px] mx-auto">
              {!useSalePrice ? (
                <button
                  onClick={() => setUseSalePrice(true)}
                  className="w-full flex items-center justify-center gap-2 text-sm text-primary hover:underline py-2"
                >
                  <Tag className="w-4 h-4" /> There's a sale/deal? Enter total instead
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-primary shrink-0" />
                    <p className="text-sm text-muted-foreground">
                      Sale total for {qtyFound} {activeItem.unit}:
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      placeholder={`e.g. ${fmt(calculatedTotal * 0.8).replace(curr.symbol, '')}`}
                      value={saleTotalInput}
                      onChange={(e) => setSaleTotalInput(e.target.value)}
                      className="text-center text-lg font-bold"
                    />
                  </div>
                  <button
                    onClick={() => { setUseSalePrice(false); setSaleTotalInput(''); }}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    Cancel — use calculated price
                  </button>
                </div>
              )}
            </div>

            {budget !== Infinity && remaining !== null && (
              <div className="text-center text-xs text-muted-foreground">
                Budget after: {fmt(remaining - finalTotal)}
              </div>
            )}

            <div className="flex gap-2 max-w-[280px] mx-auto">
              <Button
                variant="outline"
                size="lg"
                className="flex-1"
                onClick={() => setEntryStep('unitPrice')}
              >
                Back
              </Button>
              <Button
                className="flex-1 gap-2"
                size="lg"
                disabled={finalTotal <= 0}
                onClick={confirmPurchase}
              >
                <Check className="w-4 h-4" />
                Confirm {fmt(finalTotal)}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Main shopping mode view
  return (
    <div className="space-y-4 animate-fade-in">
      <button onClick={() => { onExit(); }} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-4 h-4" /> Back to list (session saved)
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

      {unpricedItems.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
            To Buy ({unpricedItems.length})
          </h3>
          {unpricedItems.map(item => (
            <Card
              key={item.id}
              className="border-border/50 shadow-none cursor-pointer hover:border-primary/30 active:scale-[0.99] transition-all"
              onClick={() => openItem(item.id)}
            >
              <CardContent className="p-3 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.quantity} {item.unit} · {item.category}</p>
                </div>
                <Badge variant="secondary" className="text-xs shrink-0">Tap to buy</Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

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
                    <p className="text-xs text-muted-foreground">
                      {item.quantityFound ?? item.quantity} {item.unit}
                    </p>
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
          <Button className="mt-4 gap-2" onClick={() => { clearSession(); onExit(); }}>
            <ShoppingCart className="w-4 h-4" /> Finish Shopping
          </Button>
        </div>
      )}
    </div>
  );
}
