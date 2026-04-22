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

export interface SpendEntry {
  amount: number;
  store: string;
  date: string; // ISO string for safe serialization
}

export function useSpendingSummary() {
  const { household } = useHousehold();

  return useQuery({
    queryKey: ['spending_summary', household?.id],
    queryFn: async () => {
      const empty = {
        total30d: 0, total7d: 0, totalMonth: 0, totalYear: 0,
        byStore: [] as { name: string; total: number }[],
        byWeek: [] as { week: string; total: number }[],
        byMonth: [] as { month: string; total: number }[],
        entries: [] as SpendEntry[],
      };
      if (!household) return empty;

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfYear = new Date(now.getFullYear(), 0, 1);

      // Spending = actual purchase events: shopping_trips + completed receipt_scans.
      // Fetch ALL entries for this household so users can browse past years/months.
      const [tripsRes, receiptsRes] = await Promise.all([
        supabase
          .from('shopping_trips')
          .select('id, store_name, total_spent, finished_at')
          .eq('household_id', household.id),
        supabase
          .from('receipt_scans')
          .select('id, store_name, total_amount, created_at, status')
          .eq('household_id', household.id)
          .eq('status', 'completed'),
      ]);

      if (tripsRes.error) throw tripsRes.error;
      if (receiptsRes.error) throw receiptsRes.error;

      const entries: SpendEntry[] = [];

      const push = (amt: number, store: string, d: Date) => {
        if (amt <= 0 || isNaN(d.getTime())) return;
        entries.push({ amount: amt, store, date: d.toISOString() });
      };

      (tripsRes.data || []).forEach((t: any) =>
        push(Number(t.total_spent) || 0, t.store_name || 'Unknown', new Date(t.finished_at))
      );
      (receiptsRes.data || []).forEach((r: any) =>
        push(Number(r.total_amount) || 0, r.store_name || 'Unknown', new Date(r.created_at))
      );

      const toWeekKey = (d: Date) => {
        const weekStart = new Date(d);
        weekStart.setHours(0, 0, 0, 0);
        const day = weekStart.getDay();
        const diffToMonday = (day + 6) % 7;
        weekStart.setDate(weekStart.getDate() - diffToMonday);
        const y = weekStart.getFullYear();
        const m = String(weekStart.getMonth() + 1).padStart(2, '0');
        const dd = String(weekStart.getDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
      };
      const toMonthKey = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      const sumIn = (from: Date) =>
        entries.filter(e => {
          const d = new Date(e.date);
          return d >= from && d <= now;
        }).reduce((s, e) => s + e.amount, 0);

      const total7d = sumIn(sevenDaysAgo);
      const total30d = sumIn(thirtyDaysAgo);
      const totalMonth = sumIn(startOfMonth);
      const totalYear = sumIn(startOfYear);

      const storeMap = new Map<string, number>();
      entries.filter(e => new Date(e.date) >= thirtyDaysAgo).forEach(e => {
        storeMap.set(e.store, (storeMap.get(e.store) || 0) + e.amount);
      });
      const byStore = Array.from(storeMap.entries())
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total);

      const weekMap = new Map<string, number>();
      entries.filter(e => new Date(e.date) >= thirtyDaysAgo).forEach(e => {
        weekMap.set(toWeekKey(new Date(e.date)), (weekMap.get(toWeekKey(new Date(e.date))) || 0) + e.amount);
      });
      const byWeek = Array.from(weekMap.entries())
        .map(([week, total]) => ({ week, total }))
        .sort((a, b) => a.week.localeCompare(b.week));

      const monthMap = new Map<string, number>();
      entries.filter(e => new Date(e.date) >= startOfYear).forEach(e => {
        monthMap.set(toMonthKey(new Date(e.date)), (monthMap.get(toMonthKey(new Date(e.date))) || 0) + e.amount);
      });
      const byMonth = Array.from(monthMap.entries())
        .map(([month, total]) => ({ month, total }))
        .sort((a, b) => a.month.localeCompare(b.month));

      return { total30d, total7d, totalMonth, totalYear, byStore, byWeek, byMonth, entries };
    },
    enabled: !!household,
  });
}
