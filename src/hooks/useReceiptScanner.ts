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

export interface CouponCode {
  code: string;
  description: string | null;
}

export interface ScanResult {
  receipt_id?: string;
  store_name: string | null;
  receipt_date: string | null;
  total_amount: number | null;
  currency: string;
  items: ReceiptItem[];
  coupon_codes: CouponCode[];
}

export function useReceiptScanner() {
  const { household } = useHousehold();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [photoCount, setPhotoCount] = useState(0);

  // Accumulated state across multiple photos
  const [accumulatedItems, setAccumulatedItems] = useState<ReceiptItem[]>([]);
  const [accumulatedCoupons, setAccumulatedCoupons] = useState<CouponCode[]>([]);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [receiptDate, setReceiptDate] = useState<string | null>(null);
  const [totalAmount, setTotalAmount] = useState<number | null>(null);
  const [currency, setCurrency] = useState<string>('USD');
  const [scanActive, setScanActive] = useState(false);

  const scanReceiptPhoto = async (imageBase64: string) => {
    if (!household) throw new Error('No household');
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke('scan-receipt', {
        body: {
          image_base64: imageBase64,
          household_id: household.id,
          existing_items: accumulatedItems.map(i => ({
            name: i.name,
            quantity: i.quantity,
            unit: i.unit,
            total_price: i.total_price,
          })),
        },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      // Merge new items (AI already deduplicates, but double-check client-side)
      const existingNames = new Set(accumulatedItems.map(i => i.name.toLowerCase()));
      const newItems = (data.items || [])
        .filter((item: any) => !existingNames.has(item.name.toLowerCase()))
        .map((item: any) => ({ ...item, selected: true }));

      // Merge coupons (deduplicate by code)
      const existingCodes = new Set(accumulatedCoupons.map(c => c.code.toLowerCase()));
      const newCoupons = (data.coupon_codes || [])
        .filter((c: any) => !existingCodes.has(c.code.toLowerCase()));

      setAccumulatedItems(prev => [...prev, ...newItems]);
      setAccumulatedCoupons(prev => [...prev, ...newCoupons]);

      // Update metadata (take first non-null values, or update total)
      if (data.store_name && !storeName) setStoreName(data.store_name);
      if (data.receipt_date && !receiptDate) setReceiptDate(data.receipt_date);
      if (data.total_amount) setTotalAmount(data.total_amount); // Always take latest total
      if (data.currency) setCurrency(data.currency);

      setPhotoCount(prev => prev + 1);
      setScanActive(true);

      const msg = newItems.length > 0
        ? `Found ${newItems.length} new item${newItems.length > 1 ? 's' : ''}${newCoupons.length > 0 ? ` and ${newCoupons.length} coupon${newCoupons.length > 1 ? 's' : ''}` : ''}`
        : 'No new items found in this section';
      toast.success(msg);

      return { newItems, newCoupons };
    } catch (e: any) {
      toast.error(e.message || 'Failed to scan receipt');
      throw e;
    } finally {
      setScanning(false);
    }
  };

  const finalizeScan = async () => {
    if (!household || !user) return;

    // Save receipt scan to DB
    const { data: scan, error: scanError } = await supabase
      .from('receipt_scans')
      .insert({
        household_id: household.id,
        scanned_by: user.id,
        store_name: storeName,
        receipt_date: receiptDate,
        total_amount: totalAmount,
        currency,
      })
      .select('id')
      .single();

    if (scanError) throw scanError;

    // Save receipt items
    if (accumulatedItems.length > 0) {
      await supabase.from('receipt_items').insert(
        accumulatedItems.map(item => ({
          receipt_id: scan!.id,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
          total_price: item.total_price,
          category: item.category,
        }))
      );
    }

    // Auto-add coupons to discount_codes table
    if (accumulatedCoupons.length > 0 && storeName) {
      for (const coupon of accumulatedCoupons) {
        // Check if this code already exists for this store in this household
        const { data: existing } = await supabase
          .from('discount_codes')
          .select('id')
          .eq('household_id', household.id)
          .ilike('store_name', storeName)
          .eq('code', coupon.code)
          .maybeSingle();

        if (!existing) {
          await supabase.from('discount_codes').insert({
            household_id: household.id,
            store_name: storeName,
            code: coupon.code,
            description: coupon.description || `Found on receipt from ${storeName}`,
            added_by: user.id,
          });
        }
      }
      qc.invalidateQueries({ queryKey: ['discount-codes'] });
      toast.success(`${accumulatedCoupons.length} coupon${accumulatedCoupons.length > 1 ? 's' : ''} added to Coupons for ${storeName}!`);
    }

    qc.invalidateQueries({ queryKey: ['receipt-scans'] });
    qc.invalidateQueries({ queryKey: ['receipt-analytics'] });

    return scan!.id;
  };

  const addSelectedToPantry = async (items: ReceiptItem[]) => {
    if (!household || !user) return;
    const selected = items.filter(i => i.selected !== false);
    if (selected.length === 0) {
      toast.error('No items selected');
      return;
    }

    // First finalize the scan to save to DB
    await finalizeScan();

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
    setAccumulatedItems([]);
    setAccumulatedCoupons([]);
    setStoreName(null);
    setReceiptDate(null);
    setTotalAmount(null);
    setCurrency('USD');
    setPhotoCount(0);
    setScanActive(false);
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
          const month = scan.receipt_date.substring(0, 7);
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
    scanActive,
    photoCount,
    accumulatedItems,
    setAccumulatedItems,
    accumulatedCoupons,
    storeName,
    receiptDate,
    totalAmount,
    currency,
    scanReceiptPhoto,
    addSelectedToPantry,
    resetScan,
    history: historyQuery.data || [],
    analytics: analyticsQuery.data,
    isLoadingHistory: historyQuery.isLoading,
  };
}
