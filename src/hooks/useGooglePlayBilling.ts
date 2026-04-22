import { useCallback, useEffect, useRef, useState } from 'react';
import { isNativeAndroid } from '@/lib/platform';
import { supabase } from '@/integrations/supabase/client';
import { ALL_PLAY_PRODUCT_IDS, PLAY_PRODUCT_IDS, type PaidTier, type PlayInterval } from '@/config/playBilling';

// Loaded lazily so the web bundle never imports Capacitor native code paths
type NativePurchases = typeof import('@capgo/native-purchases').NativePurchases;

interface PlayProduct {
  productId: string;
  title?: string;
  description?: string;
  price: string;          // formatted, e.g. "€2.99"
  priceMicros?: number;
  currencyCode?: string;
}

interface UseGooglePlayBillingResult {
  available: boolean;
  ready: boolean;
  loading: boolean;
  products: Record<string, PlayProduct>;
  /** Launch purchase flow for a tier+interval. Returns true if the purchase
   *  was acknowledged by our backend. */
  purchase: (tier: PaidTier, interval: PlayInterval) => Promise<boolean>;
  /** Re-query Play for active entitlements and sync to backend. */
  restore: () => Promise<void>;
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

export function useGooglePlayBilling(): UseGooglePlayBillingResult {
  const available = isNativeAndroid();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<Record<string, PlayProduct>>({});
  const [error, setError] = useState<string | null>(null);
  const initRef = useRef(false);

  // Initialise + fetch product details once on mount (Android only)
  useEffect(() => {
    if (!available || initRef.current) return;
    initRef.current = true;

    (async () => {
      setLoading(true);
      try {
        const plugin = await getPlugin();
        if (!plugin) return;

        // Some plugin versions expose getProducts({productIdentifiers, type})
        const res: any = await (plugin as any).getProducts({
          productIdentifiers: ALL_PLAY_PRODUCT_IDS,
          type: 'subs',
        });

        const list: any[] = res?.products ?? res ?? [];
        const map: Record<string, PlayProduct> = {};
        for (const p of list) {
          const id = p.identifier || p.productId || p.id;
          if (!id) continue;
          map[id] = {
            productId: id,
            title: p.title,
            description: p.description,
            price: p.priceString || p.price || '',
            priceMicros: p.priceMicros,
            currencyCode: p.currencyCode,
          };
        }
        setProducts(map);
        setReady(true);
      } catch (e: any) {
        console.error('[Play Billing] init failed', e);
        setError(e?.message || 'Failed to load Play Billing');
      } finally {
        setLoading(false);
      }
    })();
  }, [available]);

  const purchase = useCallback<UseGooglePlayBillingResult['purchase']>(
    async (tier, interval) => {
      if (!available) {
        setError('Google Play Billing is only available in the Android app.');
        return false;
      }
      const productId = PLAY_PRODUCT_IDS[tier][interval];
      setLoading(true);
      setError(null);
      try {
        const plugin = await getPlugin();
        if (!plugin) throw new Error('Billing plugin unavailable');

        // Launch purchase
        const result: any = await (plugin as any).purchaseProduct({
          productIdentifier: productId,
          productType: 'subs',
        });

        // Plugin returns either a transaction or a subscription object — we
        // only need the purchase token to verify server-side.
        const purchaseToken: string | undefined =
          result?.transaction?.transactionId
          || result?.transactionReceipt
          || result?.purchaseToken
          || result?.transaction?.purchaseToken;

        if (!purchaseToken) {
          throw new Error('No purchase token returned from Play');
        }

        // Verify + acknowledge server-side, then mirror into subscription_cache.
        const { data, error: fnError } = await supabase.functions.invoke('verify-google-purchase', {
          body: { productId, purchaseToken },
        });
        if (fnError) throw fnError;
        if (!data?.ok) throw new Error(data?.message || 'Purchase verification failed');
        return true;
      } catch (e: any) {
        const msg = e?.message || String(e);
        // The plugin throws {code:'USER_CANCELED'} or similar on cancel
        if (/cancel/i.test(msg)) {
          setError(null);
          return false;
        }
        console.error('[Play Billing] purchase failed', e);
        setError(msg);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [available],
  );

  const restore = useCallback(async () => {
    if (!available) return;
    setLoading(true);
    setError(null);
    try {
      const plugin = await getPlugin();
      if (!plugin) return;

      const res: any = await (plugin as any).restorePurchases();
      const purchases: any[] = res?.purchases ?? res ?? [];

      for (const p of purchases) {
        const productId = p.productIdentifier || p.productId;
        const purchaseToken = p.transactionReceipt || p.purchaseToken || p.transaction?.purchaseToken;
        if (!productId || !purchaseToken) continue;
        await supabase.functions.invoke('verify-google-purchase', {
          body: { productId, purchaseToken, restore: true },
        }).catch((e) => console.warn('[Play Billing] restore verify failed', e));
      }
    } catch (e: any) {
      console.error('[Play Billing] restore failed', e);
      setError(e?.message || 'Failed to restore purchases');
    } finally {
      setLoading(false);
    }
  }, [available]);

  return { available, ready, loading, products, purchase, restore, error };
}
