import { supabase } from '@/integrations/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface PriceRecord {
  id: string;
  inventory_item_id: string;
  household_id: string;
  price: number;
  currency: string;
  store_name: string | null;
  recorded_at: string;
  recorded_by: string | null;
}

export function usePriceHistory(itemId?: string) {
  const { household } = useHousehold();
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['price_history', household?.id, itemId],
    queryFn: async () => {
      if (!household) return [];
      let q = supabase
        .from('price_history')
        .select('*')
        .eq('household_id', household.id)
        .order('recorded_at', { ascending: false });

      if (itemId) {
        q = q.eq('inventory_item_id', itemId);
      }

      const { data, error } = await q.limit(200);
      if (error) throw error;
      return (data || []) as PriceRecord[];
    },
    enabled: !!household,
  });

  const addPrice = useMutation({
    mutationFn: async (record: {
      inventory_item_id: string;
      price: number;
      currency?: string;
      store_name?: string;
    }) => {
      if (!household || !user) throw new Error('No household');

      // Insert price history
      const { error: priceError } = await supabase.from('price_history').insert({
        ...record,
        household_id: household.id,
        recorded_by: user.id,
        currency: record.currency || 'USD',
      });
      if (priceError) throw priceError;

      // Update last_price on inventory item
      const { error: updateError } = await supabase
        .from('inventory_items')
        .update({
          last_price: record.price,
          last_store: record.store_name || null,
        } as any)
        .eq('id', record.inventory_item_id);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price_history'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('Price recorded');
    },
    onError: (e) => toast.error(e.message),
  });

  return { ...query, addPrice };
}

export function useSpendingSummary() {
  const { household } = useHousehold();

  return useQuery({
    queryKey: ['spending_summary', household?.id],
    queryFn: async () => {
      if (!household) return { total30d: 0, total7d: 0, byStore: [], byMonth: [] };

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data, error } = await supabase
        .from('price_history')
        .select('*')
        .eq('household_id', household.id)
        .gte('recorded_at', thirtyDaysAgo.toISOString())
        .order('recorded_at', { ascending: true });

      if (error) throw error;
      const records = (data || []) as PriceRecord[];

      const total30d = records.reduce((sum, r) => sum + Number(r.price), 0);
      const total7d = records
        .filter(r => new Date(r.recorded_at) >= sevenDaysAgo)
        .reduce((sum, r) => sum + Number(r.price), 0);

      // Group by store
      const storeMap = new Map<string, number>();
      records.forEach(r => {
        const store = r.store_name || 'Unknown';
        storeMap.set(store, (storeMap.get(store) || 0) + Number(r.price));
      });
      const byStore = Array.from(storeMap.entries())
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total);

      // Group by week
      const weekMap = new Map<string, number>();
      records.forEach(r => {
        const d = new Date(r.recorded_at);
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        const key = weekStart.toISOString().slice(0, 10);
        weekMap.set(key, (weekMap.get(key) || 0) + Number(r.price));
      });
      const byWeek = Array.from(weekMap.entries())
        .map(([week, total]) => ({ week, total }))
        .sort((a, b) => a.week.localeCompare(b.week));

      return { total30d, total7d, byStore, byWeek };
    },
    enabled: !!household,
  });
}
