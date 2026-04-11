import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

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
    mutationFn: async ({ id, ...updates }: Partial<ShoppingItem> & { id: string }) => {
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
