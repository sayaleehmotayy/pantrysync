import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface InventoryItem {
  id: string;
  household_id: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  added_by: string | null;
  updated_at: string;
  expiry_date: string | null;
  storage_location: string;
  min_threshold: number;
}

export function useInventory() {
  const { household } = useHousehold();
  const { user } = useAuth();
  const qc = useQueryClient();

  const logActivity = async (action: string, itemName: string, details?: string) => {
    if (!household || !user) return;
    await supabase.from('activity_log').insert({
      household_id: household.id,
      user_id: user.id,
      action,
      item_name: itemName,
      details,
    });
  };

  const query = useQuery({
    queryKey: ['inventory', household?.id],
    queryFn: async () => {
      if (!household) return [];
      const { data, error } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('household_id', household.id)
        .order('category')
        .order('name');
      if (error) throw error;
      return data as InventoryItem[];
    },
    enabled: !!household,
  });

  const addItem = useMutation({
    mutationFn: async (item: { name: string; quantity: number; unit: string; category: string; expiry_date?: string | null; storage_location?: string; min_threshold?: number }) => {
      if (!household || !user) throw new Error('No household');

      // Try to merge into existing item with same name + unit
      const { data: existing } = await supabase
        .from('inventory_items')
        .select('id, quantity, unit')
        .eq('household_id', household.id)
        .eq('unit', item.unit)
        .ilike('name', item.name)
        .maybeSingle();

      if (existing) {
        const newQty = Number(existing.quantity) + Number(item.quantity);
        const { error } = await supabase
          .from('inventory_items')
          .update({ quantity: newQty })
          .eq('id', existing.id);
        if (error) throw error;
        await logActivity('added', item.name, `+${item.quantity} ${item.unit} (now ${newQty})`);
        return { merged: true };
      }

      const { error } = await supabase.from('inventory_items').insert({
        ...item,
        household_id: household.id,
        added_by: user.id,
      });
      if (error) throw error;
      await logActivity('added', item.name, `${item.quantity} ${item.unit}`);
      return { merged: false };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['activity'] });
      toast.success(res?.merged ? 'Pantry item updated' : 'Item added to pantry');
    },
    onError: (e) => toast.error(e.message),
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, _logDetails, ...updates }: Partial<InventoryItem> & { id: string; _logDetails?: string }) => {
      const { error } = await supabase.from('inventory_items').update(updates).eq('id', id);
      if (error) throw error;
      if (_logDetails && updates.name) {
        await logActivity('updated', updates.name, _logDetails);
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['activity'] }); },
    onError: (e) => toast.error(e.message),
  });

  const deleteItem = useMutation({
    mutationFn: async ({ id, name }: { id: string; name?: string }) => {
      const { error } = await supabase.from('inventory_items').delete().eq('id', id);
      if (error) throw error;
      if (name) await logActivity('removed', name);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['activity'] }); toast.success('Item removed'); },
    onError: (e) => toast.error(e.message),
  });

  const quickUse = useMutation({
    mutationFn: async ({ item, amount, action }: { item: InventoryItem; amount: number; action: string }) => {
      const newQty = Math.max(0, item.quantity - amount);
      const { error } = await supabase.from('inventory_items').update({ quantity: newQty }).eq('id', item.id);
      if (error) throw error;
      await logActivity('used', item.name, `${action} (${item.quantity} → ${newQty} ${item.unit})`);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); qc.invalidateQueries({ queryKey: ['activity'] }); },
    onError: (e) => toast.error(e.message),
  });

  return { ...query, addItem, updateItem, deleteItem, quickUse };
}
