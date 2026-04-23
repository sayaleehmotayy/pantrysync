import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useHousehold } from './HouseholdContext';
import { useAuth } from './AuthContext';
import { useQueryClient } from '@tanstack/react-query';
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

interface ReceiptScanContextType {
  scanStatus: ScanStatus;
  photoCount: number;
  errorMessage: string | null;
  items: ReceiptItem[];
  setItems: React.Dispatch<React.SetStateAction<ReceiptItem[]>>;
  coupons: CouponCode[];
  storeName: string | null;
  receiptDate: string | null;
  totalAmount: number | null;
  currency: string;
  submitPhotos: (imageBase64s: string[]) => Promise<void>;
  addSelectedToPantry: (itemsList: ReceiptItem[]) => Promise<void>;
  resetScan: () => void;
  // Track processing start time so animation survives navigation
  processingStartTime: number | null;
}

const ReceiptScanContext = createContext<ReceiptScanContextType | undefined>(undefined);

export function ReceiptScanProvider({ children }: { children: React.ReactNode }) {
  const { household } = useHousehold();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [scanStatus, setScanStatus] = useState<ScanStatus>('idle');
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [photoCount, setPhotoCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [processingStartTime, setProcessingStartTime] = useState<number | null>(null);

  const [items, setItems] = useState<ReceiptItem[]>([]);
  const [coupons, setCoupons] = useState<CouponCode[]>([]);
  const [storeName, setStoreName] = useState<string | null>(null);
  const [receiptDate, setReceiptDate] = useState<string | null>(null);
  const [totalAmount, setTotalAmount] = useState<number | null>(null);
  const [currency, setCurrency] = useState<string>('USD');

  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const submitPhotos = useCallback(async (imageBase64s: string[]) => {
    if (!household) throw new Error('No household');
    setScanStatus('uploading');
    setErrorMessage(null);
    setPhotoCount(imageBase64s.length);
    setProcessingStartTime(Date.now());

    try {
      const { data, error } = await supabase.functions.invoke('scan-receipt', {
        body: { images: imageBase64s, household_id: household.id },
      });
      const { handleAiCreditError } = await import('@/lib/aiErrors');
      if (handleAiCreditError(error, data)) {
        setScanStatus('idle');
        setProcessingStartTime(null);
        return;
      }
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setReceiptId(data.receipt_id);
      setScanStatus('processing');
      toast.success(`Processing ${imageBase64s.length} photo${imageBase64s.length > 1 ? 's' : ''}...`);
    } catch (e: any) {
      setScanStatus('failed');
      setProcessingStartTime(null);
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

      if (error) return;

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
        setProcessingStartTime(null);

        const couponCount = result?.coupon_codes?.length || 0;
        toast.success(
          `Found ${resultItems.length} item${resultItems.length !== 1 ? 's' : ''}${couponCount > 0 ? ` and ${couponCount} coupon${couponCount > 1 ? 's' : ''}` : ''}`
        );

        qc.invalidateQueries({ queryKey: ['receipt-scans'] });
        qc.invalidateQueries({ queryKey: ['receipt-analytics'] });
        if (couponCount > 0) qc.invalidateQueries({ queryKey: ['discount-codes'] });
      } else if (data.status === 'failed') {
        setScanStatus('failed');
        setProcessingStartTime(null);
        setErrorMessage(data.error_message || 'Processing failed');
        toast.error(data.error_message || 'Receipt processing failed');
      }
    };

    poll();
    pollIntervalRef.current = setInterval(poll, 3000);
    return () => { if (pollIntervalRef.current) clearInterval(pollIntervalRef.current); };
  }, [scanStatus, receiptId, qc]);

  const addSelectedToPantry = async (itemsList: ReceiptItem[]) => {
    if (!household || !user) return;
    const selected = itemsList.filter(i => i.selected !== false);
    if (selected.length === 0) { toast.error('No items selected'); return; }

    for (const item of selected) {
      const { data: existing } = await supabase
        .from('inventory_items')
        .select('id, quantity')
        .eq('household_id', household.id)
        .ilike('name', item.name)
        .maybeSingle();

      if (existing) {
        await supabase.from('inventory_items').update({ quantity: existing.quantity + item.quantity }).eq('id', existing.id);
      } else {
        await supabase.from('inventory_items').insert({
          household_id: household.id, name: item.name, quantity: item.quantity,
          unit: item.unit, category: item.category, added_by: user.id,
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
    setProcessingStartTime(null);
    setItems([]);
    setCoupons([]);
    setStoreName(null);
    setReceiptDate(null);
    setTotalAmount(null);
    setCurrency('USD');
  };

  return (
    <ReceiptScanContext.Provider value={{
      scanStatus, photoCount, errorMessage, items, setItems, coupons,
      storeName, receiptDate, totalAmount, currency,
      submitPhotos, addSelectedToPantry, resetScan, processingStartTime,
    }}>
      {children}
    </ReceiptScanContext.Provider>
  );
}

export function useReceiptScanContext() {
  const context = useContext(ReceiptScanContext);
  if (!context) throw new Error('useReceiptScanContext must be used within ReceiptScanProvider');
  return context;
}
