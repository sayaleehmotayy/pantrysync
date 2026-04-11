import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

// Unit conversion map to a base unit
const UNIT_TO_BASE: Record<string, { base: string; factor: number }> = {
  g: { base: 'g', factor: 1 },
  kg: { base: 'g', factor: 1000 },
  ml: { base: 'ml', factor: 1 },
  l: { base: 'ml', factor: 1000 },
  pieces: { base: 'pieces', factor: 1 },
  cups: { base: 'cups', factor: 1 },
  tbsp: { base: 'tbsp', factor: 1 },
  tsp: { base: 'tsp', factor: 1 },
};

function convertUnits(qty: number, fromUnit: string, toUnit: string): number | null {
  const from = UNIT_TO_BASE[fromUnit];
  const to = UNIT_TO_BASE[toUnit];
  if (!from || !to || from.base !== to.base) return null; // incompatible units
  return (qty * from.factor) / to.factor;
}

// Pick the best display unit for a quantity
function bestDisplayUnit(qty: number, unit: string): { quantity: number; unit: string } {
  if (unit === 'g' && qty >= 1000) return { quantity: qty / 1000, unit: 'kg' };
  if (unit === 'ml' && qty >= 1000) return { quantity: qty / 1000, unit: 'l' };
  if (unit === 'kg' && qty < 1) return { quantity: qty * 1000, unit: 'g' };
  if (unit === 'l' && qty < 1) return { quantity: qty * 1000, unit: 'ml' };
  return { quantity: qty, unit };
}

export interface ShoppingItem {
  id: string;
  household_id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  requested_by: string | null;
  assigned_to: string | null;
  status: string;
  bought_quantity: number;
  created_at: string;
}

export function useShoppingList() {
  const { household } = useHousehold();
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['shopping', household?.id],
    queryFn: async () => {
      if (!household) return [];
      const { data, error } = await supabase
        .from('shopping_list_items')
        .select('*')
        .eq('household_id', household.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ShoppingItem[];
    },
    enabled: !!household,
  });

  const addItem = useMutation({
    mutationFn: async (item: { name: string; quantity: number; unit: string; category: string }) => {
      if (!household || !user) throw new Error('No household');
      const { error } = await supabase.from('shopping_list_items').insert({
        ...item,
        household_id: household.id,
        requested_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shopping'] }); toast.success('Added to shopping list'); },
    onError: (e) => toast.error(e.message),
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, bought_unit, ...updates }: Partial<ShoppingItem> & { id: string; bought_unit?: string }) => {
      // Fetch fresh item from DB to avoid stale cache issues
      const { data: item } = await supabase
        .from('shopping_list_items')
        .select('*')
        .eq('id', id)
        .maybeSingle();

      // Handle partial buy: add bought qty to pantry, reduce shopping item to remainder
      if (updates.status === 'partial' && household && user && item) {
        let boughtQty = updates.bought_quantity ?? 0;
        const bUnit = bought_unit || item.unit;

        if (boughtQty > 0) {
          // Convert bought quantity to item's unit if different
          let boughtInItemUnit = boughtQty;
          if (bUnit !== item.unit) {
            const converted = convertUnits(boughtQty, bUnit, item.unit);
            if (converted !== null) {
              boughtInItemUnit = converted;
            } else {
              // Incompatible units, just use raw value
              boughtInItemUnit = boughtQty;
            }
          }

          // Add bought quantity to pantry (in bought unit)
          const { data: existing } = await supabase
            .from('inventory_items')
            .select('id, quantity, unit')
            .eq('household_id', household.id)
            .ilike('name', item.name)
            .maybeSingle();

          if (existing) {
            // Convert to existing pantry unit if possible
            let addQty = boughtQty;
            if (existing.unit !== bUnit) {
              const converted = convertUnits(boughtQty, bUnit, existing.unit);
              if (converted !== null) addQty = converted;
            }
            await supabase.from('inventory_items').update({
              quantity: existing.quantity + addQty,
            }).eq('id', existing.id);
          } else {
            await supabase.from('inventory_items').insert({
              household_id: household.id,
              name: item.name,
              quantity: boughtQty,
              unit: bUnit,
              category: item.category,
              added_by: user.id,
            });
          }
          qc.invalidateQueries({ queryKey: ['inventory'] });

          // Update shopping item to remaining quantity
          const remaining = item.quantity - boughtInItemUnit;
          const display = bestDisplayUnit(Math.max(0, remaining), item.unit);

          if (remaining <= 0) {
            await supabase.from('shopping_list_items').delete().eq('id', id);
            toast.success(`Bought all ${item.name} — added to pantry`);
          } else {
            // Update the item with the remaining quantity in the best display unit
            const { error } = await supabase.from('shopping_list_items').update({
              quantity: display.quantity,
              unit: display.unit,
              status: 'pending',
              bought_quantity: 0,
            }).eq('id', id);
            if (error) throw error;
            toast.success(`Bought ${boughtQty} ${bUnit} of ${item.name}, ${display.quantity} ${display.unit} remaining`);
          }
          return;
        }
      }

      // Handle full buy: add to pantry and remove from list
      if (updates.status === 'bought' && household && user && item) {
        const qty = updates.bought_quantity ?? item.quantity;
        if (qty > 0) {
          const { data: existing } = await supabase
            .from('inventory_items')
            .select('id, quantity')
            .eq('household_id', household.id)
            .ilike('name', item.name)
            .maybeSingle();

          if (existing) {
            await supabase.from('inventory_items').update({
              quantity: existing.quantity + qty,
            }).eq('id', existing.id);
          } else {
            await supabase.from('inventory_items').insert({
              household_id: household.id,
              name: item.name,
              quantity: qty,
              unit: item.unit,
              category: item.category,
              added_by: user.id,
            });
          }
          qc.invalidateQueries({ queryKey: ['inventory'] });
        }
        // Remove bought item from shopping list
        await supabase.from('shopping_list_items').delete().eq('id', id);
        toast.success(`${item.name} added to pantry`);
        return;
      }

      // Default update for other status changes
      const { error } = await supabase.from('shopping_list_items').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shopping'] }); },
    onError: (e) => toast.error(e.message),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('shopping_list_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['shopping'] }); toast.success('Item removed'); },
    onError: (e) => toast.error(e.message),
  });

  const updatePantryFromShopping = async (items: ShoppingItem[]) => {
    if (!household || !user) return;

    const boughtItems = items.filter(i => i.status === 'bought' || i.status === 'partial');
    
    for (const item of boughtItems) {
      const qty = item.status === 'bought' ? item.quantity : (item.bought_quantity || 0);
      if (qty <= 0) continue;

      // Check if item exists in pantry
      const { data: existing } = await supabase
        .from('inventory_items')
        .select('id, quantity')
        .eq('household_id', household.id)
        .ilike('name', item.name)
        .maybeSingle();

      if (existing) {
        await supabase.from('inventory_items').update({
          quantity: existing.quantity + qty,
        }).eq('id', existing.id);
      } else {
        await supabase.from('inventory_items').insert({
          household_id: household.id,
          name: item.name,
          quantity: qty,
          unit: item.unit,
          category: item.category,
          added_by: user.id,
        });
      }

      // Remove fully bought items, update partial
      if (item.status === 'bought') {
        await supabase.from('shopping_list_items').delete().eq('id', item.id);
      } else if (item.status === 'partial') {
        const remaining = item.quantity - (item.bought_quantity || 0);
        if (remaining <= 0) {
          await supabase.from('shopping_list_items').delete().eq('id', item.id);
        } else {
          await supabase.from('shopping_list_items').update({
            quantity: remaining,
            status: 'pending',
            bought_quantity: 0,
          }).eq('id', item.id);
        }
      }
    }

    qc.invalidateQueries({ queryKey: ['shopping'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
    toast.success('Pantry updated from shopping list!');
  };

  return { ...query, addItem, updateItem, deleteItem, updatePantryFromShopping };
}
