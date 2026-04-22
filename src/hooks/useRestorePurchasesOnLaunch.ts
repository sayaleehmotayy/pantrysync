import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useGooglePlayBilling } from './useGooglePlayBilling';
import { isNativeAndroid } from '@/lib/platform';

/**
 * On Android app launch (once per signed-in session), ask Google Play for any
 * existing entitlements and re-verify them server-side. This re-grants Pro to
 * users who reinstalled the app, switched devices, or whose cache expired.
 */
export function useRestorePurchasesOnLaunch() {
  const { user, checkSubscription } = useAuth();
  const billing = useGooglePlayBilling();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!isNativeAndroid()) return;
    if (!user) return;
    if (!billing.available || !billing.ready) return;
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      try {
        await billing.restore();
        await checkSubscription();
      } catch (err) {
        console.warn('[restore-on-launch] failed', err);
      }
    })();
  }, [user, billing.available, billing.ready, billing, checkSubscription]);
}
