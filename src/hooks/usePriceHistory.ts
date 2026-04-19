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

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Spending = actual purchase events: shopping_trips + completed receipt_scans.
      // price_history is excluded — it's per-unit price logging, not a purchase total.
      const [tripsRes, receiptsRes] = await Promise.all([
        supabase
          .from('shopping_trips')
          .select('id, store_name, total_spent, finished_at')
          .eq('household_id', household.id)
          .gte('finished_at', thirtyDaysAgo.toISOString()),
        supabase
          .from('receipt_scans')
          .select('id, store_name, total_amount, created_at, status')
          .eq('household_id', household.id)
          .eq('status', 'completed')
          .gte('created_at', thirtyDaysAgo.toISOString()),
      ]);

      if (tripsRes.error) throw tripsRes.error;
      if (receiptsRes.error) throw receiptsRes.error;

      type SpendEntry = { amount: number; store: string; date: Date; weekKey: string };
      const entries: SpendEntry[] = [];

      const toWeekKey = (d: Date) => {
        const weekStart = new Date(d);
        weekStart.setHours(0, 0, 0, 0);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        return weekStart.toISOString().slice(0, 10);
      };

      (tripsRes.data || []).forEach((t: any) => {
        const amt = Number(t.total_spent) || 0;
        if (amt <= 0) return;
        const d = new Date(t.finished_at);
        entries.push({ amount: amt, store: t.store_name || 'Unknown', date: d, weekKey: toWeekKey(d) });
      });

      (receiptsRes.data || []).forEach((r: any) => {
        const amt = Number(r.total_amount) || 0;
        if (amt <= 0) return;
        const d = new Date(r.created_at);
        entries.push({ amount: amt, store: r.store_name || 'Unknown', date: d, weekKey: toWeekKey(d) });
      });

      const total30d = entries
        .filter(e => e.date >= thirtyDaysAgo && e.date <= now)
        .reduce((sum, e) => sum + e.amount, 0);
      const total7d = entries
        .filter(e => e.date >= sevenDaysAgo && e.date <= now)
        .reduce((sum, e) => sum + e.amount, 0);

      const storeMap = new Map<string, number>();
      entries.forEach(e => {
        storeMap.set(e.store, (storeMap.get(e.store) || 0) + e.amount);
      });
      const byStore = Array.from(storeMap.entries())
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total);

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
