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
      if (!household) return { total30d: 0, total7d: 0, byStore: [], byWeek: [] };

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      // Fetch both price_history and shopping_trips in parallel
      const [priceRes, tripsRes] = await Promise.all([
        supabase
          .from('price_history')
          .select('*')
          .eq('household_id', household.id)
          .gte('recorded_at', thirtyDaysAgo.toISOString())
          .order('recorded_at', { ascending: true }),
        supabase
          .from('shopping_trips')
          .select('*')
          .eq('household_id', household.id)
          .gte('finished_at', thirtyDaysAgo.toISOString())
          .order('finished_at', { ascending: true }),
      ]);

      if (priceRes.error) throw priceRes.error;
      if (tripsRes.error) throw tripsRes.error;

      const priceRecords = (priceRes.data || []) as PriceRecord[];
      const trips = (tripsRes.data || []) as Array<{
        id: string; store_name: string | null; total_spent: number; finished_at: string;
      }>;

      // Normalize both sources into a unified spending record list
      type SpendEntry = { amount: number; store: string; date: Date; weekKey: string };
      const entries: SpendEntry[] = [];

      priceRecords.forEach(r => {
        const d = new Date(r.recorded_at);
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        entries.push({
          amount: Number(r.price),
          store: r.store_name || 'Unknown',
          date: d,
          weekKey: weekStart.toISOString().slice(0, 10),
        });
      });

      trips.forEach(t => {
        const d = new Date(t.finished_at);
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        entries.push({
          amount: Number(t.total_spent),
          store: t.store_name || 'Unknown',
          date: d,
          weekKey: weekStart.toISOString().slice(0, 10),
        });
      });

      const total30d = entries.reduce((sum, e) => sum + e.amount, 0);
      const total7d = entries
        .filter(e => e.date >= sevenDaysAgo)
        .reduce((sum, e) => sum + e.amount, 0);

      // Group by store
      const storeMap = new Map<string, number>();
      entries.forEach(e => {
        storeMap.set(e.store, (storeMap.get(e.store) || 0) + e.amount);
      });
      const byStore = Array.from(storeMap.entries())
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total);

      // Group by week
      const weekMap = new Map<string, number>();
      entries.forEach(e => {
        weekMap.set(e.weekKey, (weekMap.get(e.weekKey) || 0) + e.amount);
      });
      const byWeek = Array.from(weekMap.entries())
        .map(([week, total]) => ({ week, total }))
        .sort((a, b) => a.week.localeCompare(b.week));

      return { total30d, total7d, byStore, byWeek };
    },
    enabled: !!household,
  });
}
