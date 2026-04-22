import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { isNative } from '@/lib/platform';

/**
 * Wires the Android hardware/gesture back button to the browser history stack
 * so users return to the previous in-app page. On the home route, exits the app.
 */
export function useAndroidBackButton() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isNative()) return;

    let cleanup: (() => void) | undefined;
    let cancelled = false;

    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('backButton', ({ canGoBack }) => {
          // If a modal/dialog is open, close it via Escape so Radix dismisses it.
          const hasOpenOverlay = document.querySelector(
            '[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"], [vaul-drawer][data-state="open"], [data-radix-popper-content-wrapper]'
          );
          if (hasOpenOverlay) {
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            return;
          }

          const atRoot = location.pathname === '/' || location.pathname === '';
          if (canGoBack && !atRoot) {
            navigate(-1);
          } else if (!atRoot) {
            navigate('/');
          } else {
            App.exitApp();
          }
        });

        if (cancelled) {
          handle.remove();
        } else {
          cleanup = () => handle.remove();
        }
      } catch (e) {
        console.warn('[BackButton] setup failed', e);
      }
    })();

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [navigate, location.pathname]);
}
