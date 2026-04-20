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
      if (!household) return {
        total30d: 0, total7d: 0, totalMonth: 0, totalYear: 0,
        byStore: [], byWeek: [], byMonth: [],
      };

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfYear = new Date(now.getFullYear(), 0, 1);
      // Fetch the wider window (year) so we can derive all buckets client-side.
      const earliest = startOfYear < thirtyDaysAgo ? startOfYear : thirtyDaysAgo;

      // Spending = actual purchase events: shopping_trips + completed receipt_scans.
      // price_history is excluded — it's per-unit price logging, not a purchase total.
      const [tripsRes, receiptsRes] = await Promise.all([
        supabase
          .from('shopping_trips')
          .select('id, store_name, total_spent, finished_at')
          .eq('household_id', household.id)
          .gte('finished_at', earliest.toISOString()),
        supabase
          .from('receipt_scans')
          .select('id, store_name, total_amount, created_at, status')
          .eq('household_id', household.id)
          .eq('status', 'completed')
          .gte('created_at', earliest.toISOString()),
      ]);

      if (tripsRes.error) throw tripsRes.error;
      if (receiptsRes.error) throw receiptsRes.error;

      type SpendEntry = { amount: number; store: string; date: Date; weekKey: string; monthKey: string };
      const entries: SpendEntry[] = [];

      const toWeekKey = (d: Date) => {
        const weekStart = new Date(d);
        weekStart.setHours(0, 0, 0, 0);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        return weekStart.toISOString().slice(0, 10);
      };
      const toMonthKey = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      const push = (amt: number, store: string, d: Date) => {
        if (amt <= 0) return;
        entries.push({ amount: amt, store, date: d, weekKey: toWeekKey(d), monthKey: toMonthKey(d) });
      };

      (tripsRes.data || []).forEach((t: any) =>
        push(Number(t.total_spent) || 0, t.store_name || 'Unknown', new Date(t.finished_at))
      );
      (receiptsRes.data || []).forEach((r: any) =>
        push(Number(r.total_amount) || 0, r.store_name || 'Unknown', new Date(r.created_at))
      );

      const sumIn = (from: Date) =>
        entries.filter(e => e.date >= from && e.date <= now).reduce((s, e) => s + e.amount, 0);

      const total7d = sumIn(sevenDaysAgo);
      const total30d = sumIn(thirtyDaysAgo);
      const totalMonth = sumIn(startOfMonth);
      const totalYear = sumIn(startOfYear);

      const storeMap = new Map<string, number>();
      entries.filter(e => e.date >= thirtyDaysAgo).forEach(e => {
        storeMap.set(e.store, (storeMap.get(e.store) || 0) + e.amount);
      });
      const byStore = Array.from(storeMap.entries())
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total);

      const weekMap = new Map<string, number>();
      entries.filter(e => e.date >= thirtyDaysAgo).forEach(e => {
        weekMap.set(e.weekKey, (weekMap.get(e.weekKey) || 0) + e.amount);
      });
      const byWeek = Array.from(weekMap.entries())
        .map(([week, total]) => ({ week, total }))
        .sort((a, b) => a.week.localeCompare(b.week));

      const monthMap = new Map<string, number>();
      entries.filter(e => e.date >= startOfYear).forEach(e => {
        monthMap.set(e.monthKey, (monthMap.get(e.monthKey) || 0) + e.amount);
      });
      const byMonth = Array.from(monthMap.entries())
        .map(([month, total]) => ({ month, total }))
        .sort((a, b) => a.month.localeCompare(b.month));

      return { total30d, total7d, totalMonth, totalYear, byStore, byWeek, byMonth };
    },
    enabled: !!household,
  });
}
