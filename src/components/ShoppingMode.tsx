import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { ShoppingItem } from '@/hooks/useShoppingList';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  ArrowLeft, Check, ShoppingCart, Target, TrendingDown, TrendingUp, Delete, Undo2, Tag, Store, Package,
} from 'lucide-react';
import { type CurrencyInfo, formatCurrency, detectCurrencyFromLocale } from '@/lib/currency';
import { guessCategory } from '@/lib/categorize';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

// Countable units where per-unit pricing makes sense
const COUNTABLE_UNITS = ['pieces', 'tubs', 'bottles', 'cans', 'jars', 'packs', 'packets', 'bags', 'boxes', 'cartons'] as const;
const BULK_UNITS = ['g', 'kg', 'ml', 'l'] as const;
const ALL_UNITS = [...COUNTABLE_UNITS, ...BULK_UNITS];
// Units that typically have a "size per unit" (e.g. 1 tub = 125 g)
const PACKABLE_UNITS = new Set(['tubs', 'bottles', 'cans', 'jars', 'packs', 'packets', 'bags', 'boxes', 'cartons']);

function isCountableUnit(unit: string): boolean {
  return (COUNTABLE_UNITS as readonly string[]).includes(unit.toLowerCase());
}

interface ShoppingModeProps {
  items: ShoppingItem[];
  onMarkBought: (id: string, price: number, quantityFound?: number) => void;
  onExit: () => void;
  currency?: CurrencyInfo;
}

interface TrackedItem {
  id: string;        // local tracking ID (may include _remaining suffix)
  dbId: string;      // original database ID for API calls
  name: string;
  quantity: number;
  unit: string;
  category: string;
  price: number | null;
  quantityFound: number | null;
  boughtUnit?: string;       // unit user selected at the store (may differ from list unit)
  packSize?: number | null;  // e.g. grams per tub
  packSizeUnit?: string;     // e.g. 'g'
}

type EntryStep = 'quantity' | 'unitPrice' | 'confirm';

export default function ShoppingMode({ items, onMarkBought, onExit, currency }: ShoppingModeProps) {
  const curr = currency || detectCurrencyFromLocale();
  const SESSION_KEY = 'pantrysync_shopping_session';
  const { household } = useHousehold();
  const { user } = useAuth();
  const qc = useQueryClient();

  const savedSession = useMemo(() => {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw) as { budget: number | null; storeName: string; trackedItems: TrackedItem[]; startedAt: string };
    } catch {}
    return null;
  }, []);

  const [budget, setBudget] = useState<number | null>(savedSession?.budget ?? null);
  const [budgetInput, setBudgetInput] = useState('');
  const [storeName, setStoreName] = useState(savedSession?.storeName ?? '');
  const [storeInput, setStoreInput] = useState('');
  const [startedAt] = useState(savedSession?.startedAt ?? new Date().toISOString());
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [entryStep, setEntryStep] = useState<EntryStep>('quantity');
  const [quantityInput, setQuantityInput] = useState('');
  const [boughtUnit, setBoughtUnit] = useState<string>('pieces');
  const [packSizeInput, setPackSizeInput] = useState('');
  const [packSizeUnit, setPackSizeUnit] = useState<string>('g');
  const [unitPriceInput, setUnitPriceInput] = useState('');
  const [useSalePrice, setUseSalePrice] = useState(false);
  const [saleTotalInput, setSaleTotalInput] = useState('');
  const [trackedItems, setTrackedItems] = useState<TrackedItem[]>(savedSession?.trackedItems ?? []);
  const [isFinishing, setIsFinishing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const initialized = useRef(!!savedSession);

  const cancelTrip = useCallback(() => {
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    toast.success('Shopping session ended');
    onExit();
  }, [onExit]);

  useEffect(() => {
    const pending = items.filter(i => i.status === 'pending' || i.status === 'not_found');

    if (!initialized.current) {
      initialized.current = true;
      setTrackedItems(pending.map(i => ({
        id: i.id, dbId: i.id, name: i.name, quantity: i.quantity, unit: i.unit, category: i.category, price: null, quantityFound: null,
      })));
      return;
    }

    // Live merge: add any new pending items that aren't already tracked (by dbId)
    setTrackedItems(prev => {
      const trackedDbIds = new Set(prev.map(t => t.dbId));
      const newOnes = pending
        .filter(i => !trackedDbIds.has(i.id))
        .map(i => ({
          id: i.id, dbId: i.id, name: i.name, quantity: i.quantity, unit: i.unit, category: i.category, price: null, quantityFound: null,
        }));
      if (newOnes.length === 0) return prev;
      toast.info(`${newOnes.length} new item${newOnes.length > 1 ? 's' : ''} added to your list`);
      return [...prev, ...newOnes];
    });
  }, [items]);

  useEffect(() => {
    if (budget === null && trackedItems.length === 0) return;
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({ budget, storeName, trackedItems, startedAt }));
    } catch {}
  }, [budget, storeName, trackedItems, startedAt]);

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
  // Use the unit the shopper actually picked at the store, falling back to the list unit
  const effectiveUnit = boughtUnit || activeItem?.unit || 'pieces';
  const countable = isCountableUnit(effectiveUnit);
  const showPackSize = PACKABLE_UNITS.has(effectiveUnit.toLowerCase());

  const qtyFound = quantityInput ? parseFloat(quantityInput) : 0;
  const unitPrice = unitPriceInput ? parseFloat(unitPriceInput) : 0;
  const calculatedTotal = countable ? qtyFound * unitPrice : unitPrice; // bulk: price IS the total
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
    setQuantityInput('');
    setBoughtUnit(item.unit); // default to the list unit
    setPackSizeInput('');
    setPackSizeUnit('g');
    setUnitPriceInput('');
    setUseSalePrice(false);
    setSaleTotalInput('');
  }, [trackedItems]);

  const confirmPurchase = useCallback(() => {
    if (!activeItemId || finalTotal <= 0) return;

    const item = trackedItems.find(i => i.id === activeItemId);
    // Only treat as partial when the bought unit matches the list unit
    const sameUnit = item && item.unit === effectiveUnit;
    const remainingQty = sameUnit && item ? item.quantity - qtyFound : 0;
    const packSizeNum = packSizeInput ? parseFloat(packSizeInput) : null;

    setTrackedItems(prev => {
      let updated = prev.map(i =>
        i.id === activeItemId
          ? {
              ...i,
              price: finalTotal,
              quantityFound: qtyFound,
              boughtUnit: effectiveUnit,
              packSize: showPackSize && packSizeNum && packSizeNum > 0 ? packSizeNum : null,
              packSizeUnit: showPackSize && packSizeNum && packSizeNum > 0 ? packSizeUnit : undefined,
            }
          : i
      );
      // If partial buy in same unit, add a new entry for the remaining quantity
      if (remainingQty > 0 && item) {
        const remainingId = item.id.includes('_remaining') ? item.id : item.id + '_remaining';
        updated = [...updated, {
          id: remainingId,
          dbId: item.dbId,
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
    const dbId = item?.dbId ?? activeItemId;
    onMarkBought(dbId, finalTotal, qtyFound);
    setActiveItemId(null);
    setEntryStep('quantity');
    setQuantityInput('');
    setUnitPriceInput('');
    setPackSizeInput('');
    setUseSalePrice(false);
    setSaleTotalInput('');
  }, [activeItemId, finalTotal, qtyFound, onMarkBought, trackedItems, effectiveUnit, showPackSize, packSizeInput, packSizeUnit]);

  const undoPrice = useCallback((id: string) => {
    setTrackedItems(prev => prev.map(i =>
      i.id === id ? { ...i, price: null, quantityFound: null } : i
    ));
  }, []);

  const finishShopping = useCallback(async () => {
    if (!household || !user) return;
    setIsFinishing(true);
    try {
      // Save trip to DB
      const tripData = {
        household_id: household.id,
        user_id: user.id,
        store_name: storeName || null,
        budget: budget === Infinity ? null : budget,
        total_spent: totalSpent,
        currency: curr.code,
        items_count: pricedItems.length,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
      };

      const { data: trip, error: tripError } = await supabase
        .from('shopping_trips')
        .insert(tripData)
        .select('id')
        .single();

      if (tripError) throw tripError;

      // Save trip items
      if (pricedItems.length > 0 && trip) {
        const tripItems = pricedItems.map(item => {
          const finalUnit = item.boughtUnit || item.unit;
          const qty = item.quantityFound ?? item.quantity;
          return {
            trip_id: trip.id,
            item_name: item.packSize
              ? `${item.name} (${item.packSize} ${item.packSizeUnit}/${finalUnit.replace(/s$/, '')})`
              : item.name,
            quantity_bought: qty,
            unit: finalUnit,
            category: item.category,
            unit_price: item.price && qty && isCountableUnit(finalUnit) ? item.price / qty : null,
            total_price: item.price ?? 0,
          };
        });

        const { error: itemsError } = await supabase
          .from('shopping_trip_items')
          .insert(tripItems);

        if (itemsError) throw itemsError;
      }

      // Commit purchases to pantry + clean up shopping list.
      // Aggregate by dbId + bought unit + pack size so different forms of the
      // same shopping item (e.g. "2 tubs × 125 g" vs "300 g") stay separate in pantry.
      type Bucket = {
        name: string; unit: string; category: string; qtyBought: number;
        originalQty: number; originalUnit: string;
        packSize: number | null; packSizeUnit?: string;
      };
      const boughtKey = (item: typeof pricedItems[number]) => {
        const u = item.boughtUnit || item.unit;
        return `${item.dbId}|${u}|${item.packSize ?? ''}|${item.packSizeUnit ?? ''}`;
      };
      const bucketsByKey = new Map<string, Bucket>();
      const dbIdsTouched = new Map<string, { originalQty: number; consumedInOriginalUnit: number }>();

      for (const item of pricedItems) {
        const qty = item.quantityFound ?? item.quantity;
        if (qty <= 0) continue;
        const finalUnit = item.boughtUnit || item.unit;
        const key = boughtKey(item);
        const existing = bucketsByKey.get(key);
        if (existing) {
          existing.qtyBought += qty;
        } else {
          const originalQty = trackedItems
            .filter(t => t.dbId === item.dbId)
            .reduce((s, t) => s + t.quantity, 0);
          bucketsByKey.set(key, {
            name: item.name,
            unit: finalUnit,
            category: item.category,
            qtyBought: qty,
            originalQty,
            originalUnit: item.unit,
            packSize: item.packSize ?? null,
            packSizeUnit: item.packSizeUnit,
          });
        }

        // Track shopping-list consumption per dbId (only when bought in same unit as list)
        if (finalUnit === item.unit) {
          const t = dbIdsTouched.get(item.dbId);
          const originalQty = trackedItems
            .filter(tt => tt.dbId === item.dbId)
            .reduce((s, tt) => s + tt.quantity, 0);
          if (t) t.consumedInOriginalUnit += qty;
          else dbIdsTouched.set(item.dbId, { originalQty, consumedInOriginalUnit: qty });
        } else {
          // bought in different unit — consider list satisfied
          const originalQty = trackedItems
            .filter(tt => tt.dbId === item.dbId)
            .reduce((s, tt) => s + tt.quantity, 0);
          dbIdsTouched.set(item.dbId, { originalQty, consumedInOriginalUnit: originalQty });
        }
      }

      // Insert/update pantry per bucket — store name with pack-size suffix so
      // "Yogurt (125 g/tub)" stays distinct from bulk "Yogurt".
      for (const bucket of bucketsByKey.values()) {
        const pantryName = bucket.packSize
          ? `${bucket.name} (${bucket.packSize} ${bucket.packSizeUnit}/${bucket.unit.replace(/s$/, '')})`
          : bucket.name;

        const { data: existing } = await supabase
          .from('inventory_items')
          .select('id, quantity')
          .eq('household_id', household.id)
          .ilike('name', pantryName)
          .eq('unit', bucket.unit)
          .maybeSingle();

        if (existing) {
          await supabase.from('inventory_items')
            .update({ quantity: Number(existing.quantity) + bucket.qtyBought })
            .eq('id', existing.id);
        } else {
          await supabase.from('inventory_items').insert({
            household_id: household.id,
            name: pantryName,
            quantity: bucket.qtyBought,
            unit: bucket.unit,
            category: bucket.category && bucket.category !== 'Other' ? bucket.category : guessCategory(bucket.name, 'Other'),
            added_by: user.id,
          });
        }
      }

      // Clean up shopping list per dbId
      for (const [dbId, t] of dbIdsTouched) {
        const remaining = t.originalQty - t.consumedInOriginalUnit;
        if (remaining <= 0) {
          await supabase.from('shopping_list_items').delete().eq('id', dbId);
        } else {
          await supabase.from('shopping_list_items')
            .update({ quantity: remaining, status: 'pending', bought_quantity: 0 })
            .eq('id', dbId);
        }
      }

      qc.invalidateQueries({ queryKey: ['shopping-trips'] });
      qc.invalidateQueries({ queryKey: ['spending_summary'] });
      qc.invalidateQueries({ queryKey: ['shopping'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      clearSession();
      toast.success(`Shopping trip saved! ${pricedItems.length} items added to pantry.`);
      onExit();
    } catch (err: any) {
      console.error('Error finishing shopping:', err);
      toast.error('Failed to save shopping trip');
    } finally {
      setIsFinishing(false);
    }
  }, [household, user, storeName, budget, totalSpent, curr, pricedItems, trackedItems, startedAt, clearSession, onExit, qc]);

  // Budget + store setup screen
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
            <h2 className="font-display font-bold text-lg">Set Up Your Trip</h2>
            <p className="text-sm text-muted-foreground mt-1">Where are you shopping and what's your budget?</p>
          </div>

          {/* Store name input */}
          <div className="w-full max-w-[280px] space-y-1">
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Store className="w-3.5 h-3.5" /> Store name (optional)
            </label>
            <Input
              placeholder="e.g. Walmart, Costco..."
              value={storeInput}
              onChange={e => setStoreInput(e.target.value)}
              className="text-center"
            />
          </div>

          <div className="text-center mt-2">
            <p className="text-xs text-muted-foreground mb-2">Budget</p>
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
            onClick={() => { setBudget(parseFloat(budgetInput)); setStoreName(storeInput); }}
          >
            <ShoppingCart className="w-4 h-4" />
            Start Shopping
          </Button>

          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => { setBudget(Infinity); setStoreName(storeInput); }}>
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
              <p className="text-sm text-muted-foreground mb-2">
                {countable ? 'How many did you find?' : `How much ${effectiveUnit} did you find?`}
              </p>
              <span className="text-5xl font-bold font-display tabular-nums">
                {quantityInput || '0'}
              </span>
              <p className="text-xs text-muted-foreground mt-1">{effectiveUnit}</p>
            </div>

            {/* Unit picker — what did you actually buy it as? */}
            <div className="max-w-[280px] mx-auto space-y-1">
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Package className="w-3.5 h-3.5" /> Bought as
              </label>
              <Select value={boughtUnit} onValueChange={(v) => { setBoughtUnit(v); setPackSizeInput(''); }}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ALL_UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
              {effectiveUnit !== activeItem.unit && (
                <p className="text-[10px] text-muted-foreground">
                  List was in {activeItem.unit} — you'll mark this item as fully bought.
                </p>
              )}
            </div>

            {/* Pack size — only when bought as a packable countable unit */}
            {showPackSize && (
              <div className="max-w-[280px] mx-auto space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Size per {effectiveUnit.replace(/s$/, '')} (optional)
                </label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder={`e.g. 125`}
                    value={packSizeInput}
                    onChange={e => setPackSizeInput(e.target.value)}
                    className="flex-1 h-9"
                  />
                  <Select value={packSizeUnit} onValueChange={setPackSizeUnit}>
                    <SelectTrigger className="w-20 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BULK_UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {packSizeInput && parseFloat(packSizeInput) > 0 && qtyFound > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    = {qtyFound} × {packSizeInput} {packSizeUnit} ({(qtyFound * parseFloat(packSizeInput)).toFixed(0)} {packSizeUnit} total)
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-3 gap-2 max-w-[280px] mx-auto">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', countable ? 'clear' : '.', '0', 'back'].map(key => (
                <button
                  key={key}
                  onClick={() => handleNumpad(key === 'clear' ? 'clear' : key, setQuantityInput, !countable)}
                  className="h-14 rounded-xl bg-muted hover:bg-muted/80 active:scale-95 transition-all font-semibold text-xl flex items-center justify-center"
                >
                  {key === 'back' ? <Delete className="w-5 h-5" /> : key === 'clear' ? 'C' : key}
                </button>
              ))}
            </div>

            <Button
              className="w-full max-w-[280px] mx-auto flex gap-2"
              size="lg"
              disabled={!quantityInput || parseFloat(quantityInput) <= 0}
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
                {countable
                  ? `Price per 1 ${effectiveUnit.replace(/s$/, '')}?`
                  : `Total price for ${qtyFound} ${effectiveUnit}?`}
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

            {countable && unitPrice > 0 && (
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
                {countable ? (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Price per {activeItem.unit.replace(/s$/, '')}</span>
                    <span className="font-medium">{fmt(unitPrice)}</span>
                  </div>
                ) : null}
                <div className="border-t border-border pt-2 flex justify-between">
                  <span className="font-medium">{countable ? 'Calculated total' : 'Total price'}</span>
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
      <div className="flex items-center justify-between">
        <button onClick={() => { onExit(); }} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back (session saved)
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8"
          onClick={() => setConfirmCancel(true)}
        >
          End Trip
        </Button>
      </div>

      {/* Store name badge */}
      {storeName && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground px-1">
          <Store className="w-3.5 h-3.5" /> Shopping at <span className="font-medium text-foreground">{storeName}</span>
        </div>
      )}

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

      {/* Finish Shopping button — always visible when there are priced items */}
      {pricedItems.length > 0 && (
        <Card className="border-primary/30 bg-gradient-to-r from-primary/5 to-primary/10">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total ({pricedItems.length} items)</span>
              <span className="font-bold text-lg">{fmt(totalSpent)}</span>
            </div>
            {budget !== Infinity && remaining !== null && (
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{overBudget ? 'Over budget' : 'Under budget'}</span>
                <span className={overBudget ? 'text-destructive font-medium' : 'text-primary font-medium'}>
                  {fmt(Math.abs(remaining))}
                </span>
              </div>
            )}
            {unpricedItems.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {unpricedItems.length} items still unpriced — they won't be added to pantry
              </p>
            )}
            <Button
              className="w-full gap-2"
              size="lg"
              disabled={isFinishing}
              onClick={finishShopping}
            >
              <ShoppingCart className="w-4 h-4" />
              {isFinishing ? 'Saving...' : 'Finish Shopping'}
            </Button>
          </CardContent>
        </Card>
      )}

      {unpricedItems.length === 0 && pricedItems.length === 0 && trackedItems.length === 0 && (
        <div className="text-center py-6">
          <p className="text-muted-foreground text-sm">No items to shop for</p>
          <Button className="mt-4" variant="outline" onClick={() => { clearSession(); onExit(); }}>
            Go back
          </Button>
        </div>
      )}

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End shopping trip?</AlertDialogTitle>
            <AlertDialogDescription>
              {pricedItems.length > 0
                ? `You have ${pricedItems.length} item(s) in your cart. Ending now will discard them — they won't be saved or added to your pantry.`
                : 'This will end your current shopping session.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Shopping</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={cancelTrip}
            >
              End Trip
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
