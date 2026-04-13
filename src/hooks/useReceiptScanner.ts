import { useState, useEffect, useRef, useCallback } from 'react';
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

export interface CouponCode {
  code: string;
  description: string | null;
}

export type ScanStatus = 'idle' | 'uploading' | 'processing' | 'completed' | 'failed';

export function useReceiptScanner() {
  const { household } = useHousehold();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [photoCount, setPhotoCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Results from completed scan
  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [coupons, setCoupons] = useState<CouponCode[]>([]);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [receiptDate, setReceiptDate] = useState<string | null>(null);
  const [totalAmount, setTotalAmount] = useState<number | null>(null);
  const [currency, setCurrency] = useState<string>('USD');

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Submit all photos for background processing
  const submitPhotos = useCallback(async (imageBase64s: string[]) => {
    if (!household) throw new Error('No household');
    setScanStatus('uploading');
    setErrorMessage(null);
    setPhotoCount(imageBase64s.length);

    try {
      const { data, error } = await supabase.functions.invoke('scan-receipt', {
        body: {
          images: imageBase64s,
          household_id: household.id,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setReceiptId(data.receipt_id);
      setScanStatus('processing');
      toast.success(`Processing ${imageBase64s.length} photo${imageBase64s.length > 1 ? 's' : ''}...`);
    } catch (e: any) {
      setScanStatus('failed');
      setErrorMessage(e.message || 'Failed to upload receipt');
      toast.error(e.message || 'Failed to upload receipt');
      throw e;
    }
  }, [household]);

  // Poll for completion
  useEffect(() => {
    if (scanStatus !== 'processing' || !receiptId) return;

    const poll = async () => {
      const { data, error } = await supabase
        .from('receipt_scans')
        .select('status, processing_result, error_message, store_name, receipt_date, total_amount, currency')
        .eq('id', receiptId)
        .single();

      if (error) {
        console.error('[receipt-poll] error:', error);
        return;
      }

      if (data.status === 'completed') {
        const result = data.processing_result as any;
        const resultItems = (result?.items || []).map((i: any) => ({ ...i, selected: true }));
        setItems(resultItems);
        setCoupons(result?.coupon_codes || []);
        setStoreName(data.store_name);
        setReceiptDate(data.receipt_date);
        setTotalAmount(data.total_amount ? Number(data.total_amount) : null);
        setCurrency(data.currency || 'USD');
        setScanStatus('completed');

        const couponCount = result?.coupon_codes?.length || 0;
        toast.success(
          `Found ${resultItems.length} item${resultItems.length !== 1 ? 's' : ''}${couponCount > 0 ? ` and ${couponCount} coupon${couponCount > 1 ? 's' : ''}` : ''}`
        );

        qc.invalidateQueries({ queryKey: ['receipt-scans'] });
        qc.invalidateQueries({ queryKey: ['receipt-analytics'] });
        if (couponCount > 0) qc.invalidateQueries({ queryKey: ['discount-codes'] });
      } else if (data.status === 'failed') {
        setScanStatus('failed');
        setErrorMessage(data.error_message || 'Processing failed');
        toast.error(data.error_message || 'Receipt processing failed');
      }
    };

    // Poll every 3 seconds
    poll();
    pollIntervalRef.current = setInterval(poll, 3000);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [scanStatus, receiptId, qc]);

  // Add selected items to pantry
  const addSelectedToPantry = async (itemsList: ReceiptItem[]) => {
    if (!household || !user) return;
    const selected = itemsList.filter(i => i.selected !== false);
    if (selected.length === 0) {
      toast.error('No items selected');
      return;
    }

    for (const item of selected) {
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

    qc.invalidateQueries({ queryKey: ['inventory'] });
    toast.success(`${selected.length} items added to pantry!`);
  };

  const resetScan = () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    setScanStatus('idle');
    setReceiptId(null);
    setPhotoCount(0);
    setErrorMessage(null);
    setItems([]);
    setCoupons([]);
    setStoreName(null);
    setReceiptDate(null);
    setTotalAmount(null);
    setCurrency('USD');
  };

  const deleteReceipt = async (id: string) => {
    // Delete receipt items first, then the scan
    await supabase.from('receipt_items').delete().eq('receipt_id', id);
    await supabase.from('receipt_scans').delete().eq('id', id);
    qc.invalidateQueries({ queryKey: ['receipt-scans'] });
    qc.invalidateQueries({ queryKey: ['receipt-analytics'] });
    toast.success('Receipt deleted');
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
        .eq('status', 'completed')
        .order('receipt_date', { ascending: true });

      const { data: receiptItems } = await supabase
        .from('receipt_items')
        .select('*, receipt_scans!inner(household_id)')
        .eq('receipt_scans.household_id', household.id);

      const categorySpending: Record<string, number> = {};
      const storeSpending: Record<string, number> = {};
      const monthlySpending: Record<string, number> = {};

      for (const item of (receiptItems || [])) {
        const cat = item.category || 'Other';
        categorySpending[cat] = (categorySpending[cat] || 0) + (item.total_price || 0);
      }

      for (const scan of (scans || [])) {
        if (scan.store_name && scan.total_amount) {
          storeSpending[scan.store_name] = (storeSpending[scan.store_name] || 0) + scan.total_amount;
        }
        if (scan.receipt_date && scan.total_amount) {
          const month = scan.receipt_date.substring(0, 7);
          monthlySpending[month] = (monthlySpending[month] || 0) + scan.total_amount;
        }
      }

      const totalSpent = (scans || []).reduce((sum, s) => sum + (s.total_amount || 0), 0);

      return {
        totalSpent,
        totalReceipts: (scans || []).length,
        totalItems: (receiptItems || []).length,
        categorySpending,
        storeSpending,
        monthlySpending,
        currency: scans?.[0]?.currency || 'USD',
      };
    },
    enabled: !!household,
  });

  return {
    scanStatus,
    photoCount,
    errorMessage,
    items,
    setItems,
    coupons,
    storeName,
    receiptDate,
    totalAmount,
    currency,
    submitPhotos,
    addSelectedToPantry,
    resetScan,
    deleteReceipt,
    history: historyQuery.data || [],
    analytics: analyticsQuery.data,
    isLoadingHistory: historyQuery.isLoading,
  };
}