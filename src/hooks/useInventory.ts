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
}

export function useInventory() {
  const { household } = useHousehold();
  const { user } = useAuth();
  const qc = useQueryClient();

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
    mutationFn: async (item: { name: string; quantity: number; unit: string; category: string }) => {
      if (!household || !user) throw new Error('No household');
      const { error } = await supabase.from('inventory_items').insert({
        ...item,
        household_id: household.id,
        added_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); toast.success('Item added to pantry'); },
    onError: (e) => toast.error(e.message),
  });

  const updateItem = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<InventoryItem> & { id: string }) => {
      const { error } = await supabase.from('inventory_items').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); toast.success('Item updated'); },
    onError: (e) => toast.error(e.message),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('inventory_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['inventory'] }); toast.success('Item removed'); },
    onError: (e) => toast.error(e.message),
  });

  return { ...query, addItem, updateItem, deleteItem };
}
