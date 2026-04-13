import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useHousehold } from '@/contexts/HouseholdContext';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

export interface ReceiptItem {
  name: string;
  quantity: number;
  unit: string;
  unit_price: number | null;
  total_price: number | null;
  category: string;
  selected?: boolean;
}

export interface ScanResult {
  receipt_id: string;
  store_name: string | null;
  receipt_date: string | null;
  total_amount: number | null;
  currency: string;
  items: ReceiptItem[];
}

export function useReceiptScanner() {
  const { household } = useHousehold();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);

  const scanReceipt = async (imageBase64: string) => {
    if (!household) throw new Error('No household');
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('scan-receipt', {
        body: { image_base64: imageBase64, household_id: household.id },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      const result: ScanResult = {
        ...data,
        items: (data.items || []).map((item: any) => ({ ...item, selected: true })),
      };
      setScanResult(result);
      return result;
    } catch (e: any) {
      toast.error(e.message || 'Failed to scan receipt');
      throw e;
    } finally {
      setScanning(false);
    }
  };

  const addSelectedToPantry = async (items: ReceiptItem[]) => {
    if (!household || !user) return;
    const selected = items.filter(i => i.selected !== false);
    if (selected.length === 0) {
      toast.error('No items selected');
      return;
    }

    for (const item of selected) {
      // Check if item exists in pantry
      const { data: existing } = await supabase
        .from('inventory_items')
        .select('id, quantity')
        .eq('household_id', household.id)
        .ilike('name', item.name)
        .maybeSingle();

      if (existing) {
        await supabase.from('inventory_items').update({
          quantity: existing.quantity + item.quantity,
        }).eq('id', existing.id);
      } else {
        await supabase.from('inventory_items').insert({
          household_id: household.id,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
          added_by: user.id,
        });
      }
    }

    // Mark items as added in receipt_items
    if (scanResult?.receipt_id) {
      const { data: receiptItems } = await supabase
        .from('receipt_items')
        .select('id, name')
        .eq('receipt_id', scanResult.receipt_id);

      if (receiptItems) {
        const selectedNames = new Set(selected.map(s => s.name.toLowerCase()));
        const idsToUpdate = receiptItems
          .filter(ri => selectedNames.has(ri.name.toLowerCase()))
          .map(ri => ri.id);

        if (idsToUpdate.length > 0) {
          await supabase.from('receipt_items').update({ added_to_pantry: true }).in('id', idsToUpdate);
        }
      }
    }

    qc.invalidateQueries({ queryKey: ['inventory'] });
    toast.success(`${selected.length} items added to pantry!`);
  };

  // Fetch receipt history
  const historyQuery = useQuery({
    queryKey: ['receipt-scans', household?.id],
    queryFn: async () => {
      if (!household) return [];
      const { data, error } = await supabase
        .from('receipt_scans')
        .select('*')
        .eq('household_id', household.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    enabled: !!household,
  });

  // Spending analytics
  const analyticsQuery = useQuery({
    queryKey: ['receipt-analytics', household?.id],
    queryFn: async () => {
      if (!household) return null;

      const { data: scans } = await supabase
        .from('receipt_scans')
        .select('id, store_name, receipt_date, total_amount, currency')
        .eq('household_id', household.id)
        .order('receipt_date', { ascending: true });

      const { data: items } = await supabase
        .from('receipt_items')
        .select('*, receipt_scans!inner(household_id)')
        .eq('receipt_scans.household_id', household.id);

      // Category spending
      const categorySpending: Record<string, number> = {};
      const storeSpending: Record<string, number> = {};
      const monthlySpending: Record<string, number> = {};

      for (const item of (items || [])) {
        const cat = item.category || 'Other';
        categorySpending[cat] = (categorySpending[cat] || 0) + (item.total_price || 0);
      }

      for (const scan of (scans || [])) {
        if (scan.store_name && scan.total_amount) {
          storeSpending[scan.store_name] = (storeSpending[scan.store_name] || 0) + scan.total_amount;
        }
        if (scan.receipt_date && scan.total_amount) {
          const month = scan.receipt_date.substring(0, 7); // YYYY-MM
          monthlySpending[month] = (monthlySpending[month] || 0) + scan.total_amount;
        }
      }

      const totalSpent = (scans || []).reduce((sum, s) => sum + (s.total_amount || 0), 0);
      const totalReceipts = (scans || []).length;

      return {
        totalSpent,
        totalReceipts,
        totalItems: (items || []).length,
        categorySpending,
        storeSpending,
        monthlySpending,
        currency: scans?.[0]?.currency || 'USD',
      };
    },
    enabled: !!household,
  });

  return {
    scanning,
    scanResult,
    setScanResult,
    scanReceipt,
    addSelectedToPantry,
    history: historyQuery.data || [],
    analytics: analyticsQuery.data,
    isLoadingHistory: historyQuery.isLoading,
  };
}
