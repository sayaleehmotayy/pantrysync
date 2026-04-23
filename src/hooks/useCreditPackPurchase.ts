import { useCallback, useEffect, useRef, useState } from 'react';
import { isNativeAndroid } from '@/lib/platform';
import { supabase } from '@/integrations/supabase/client';
import { ALL_CREDIT_PACK_IDS } from '@/config/creditPacks';

type NativePurchases = typeof import('@capgo/native-purchases').NativePurchases;

interface PlayProduct {
  productId: string;
  price: string;
  priceMicros?: number;
  currencyCode?: string;
}

interface UseCreditPackPurchaseResult {
  available: boolean;        // running on native Android
  ready: boolean;            // products loaded
  loading: boolean;
  products: Record<string, PlayProduct>;
  purchase: (productId: string) => Promise<{ ok: boolean; credits?: number }>;
  error: string | null;
}

let cachedPlugin: NativePurchases | null = null;
async function getPlugin(): Promise<NativePurchases | null> {
  if (!isNativeAndroid()) return null;
  if (cachedPlugin) return cachedPlugin;
  const mod = await import('@capgo/native-purchases');
  cachedPlugin = mod.NativePurchases;
  return cachedPlugin;
}

export function useCreditPackPurchase(): UseCreditPackPurchaseResult {
  const available = isNativeAndroid();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Record<string, PlayProduct>>({});
  const [error, setError] = useState<string | null>(null);
  const initRef = useRef(false);

  useEffect(() => {
    if (!available || initRef.current) return;
    initRef.current = true;
    (async () => {
      setLoading(true);
      try {
        const plugin = await getPlugin();
        if (!plugin) return;
        const res: any = await (plugin as any).getProducts({
          productIdentifiers: ALL_CREDIT_PACK_IDS,
          type: 'inapp',
        });
        const list: any[] = res?.products ?? res ?? [];
        const map: Record<string, PlayProduct> = {};
        for (const p of list) {
          const id = p.identifier || p.productId || p.id;
          if (!id) continue;
          map[id] = {
            productId: id,
            price: p.priceString || p.price || '',
            priceMicros: p.priceMicros,
            currencyCode: p.currencyCode,
          };
        }
        setProducts(map);
        setReady(true);
      } catch (e: any) {
        console.error('[Credit Packs] init failed', e);
        setError(e?.message || 'Failed to load credit packs');
      } finally {
        setLoading(false);
      }
    })();
  }, [available]);

  const purchase = useCallback<UseCreditPackPurchaseResult['purchase']>(
    async (productId) => {
      if (!available) {
        setError('Top-ups are only available in the Android app.');
        return { ok: false };
      }
      setLoading(true);
      setError(null);
      try {
        const plugin = await getPlugin();
        if (!plugin) throw new Error('Billing plugin unavailable');
        const result: any = await (plugin as any).purchaseProduct({
          productIdentifier: productId,
          productType: 'inapp',
        });
        const purchaseToken: string | undefined =
          result?.transaction?.transactionId
          || result?.transactionReceipt
          || result?.purchaseToken
          || result?.transaction?.purchaseToken;
        if (!purchaseToken) throw new Error('No purchase token returned from Play');

        const { data, error: fnErr } = await supabase.functions.invoke('verify-credit-purchase', {
          body: { productId, purchaseToken },
        });
        if (fnErr) throw fnErr;
        if (!data?.ok) throw new Error(data?.message || 'Purchase verification failed');
        return { ok: true, credits: data.creditsGranted };
      } catch (e: any) {
        const msg = e?.message || String(e);
        if (/cancel/i.test(msg)) {
          setError(null);
          return { ok: false };
        }
        console.error('[Credit Packs] purchase failed', e);
        setError(msg);
        return { ok: false };
      } finally {
        setLoading(false);
      }
    },
    [available],
  );

  return { available, ready, loading, products, purchase, error };
}
