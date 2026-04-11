import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

declare global {
  interface Window {
    Capacitor?: any;
  }
}

const maskToken = (token: string) =>
  token ? `${token.slice(0, 12)}...${token.slice(-6)}` : 'unknown';

const getNativeEnvironment = () => ({
  hasWindowCapacitor: Boolean(window.Capacitor),
  isNativeFromImport: Capacitor.isNativePlatform(),
  isNativeFromWindow: window.Capacitor?.isNativePlatform?.() ?? false,
  importPlatform: Capacitor.getPlatform(),
  windowPlatform: window.Capacitor?.getPlatform?.() ?? 'unavailable',
});

export function usePushNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    let isActive = true;

    const registerToken = async () => {
      const nativeEnvironment = getNativeEnvironment();
      console.log('[push] registration effect started', {
        contextUserId: user?.id ?? null,
        ...nativeEnvironment,
      });

      if (!user?.id) {
        console.log('[push] token registration waiting for authenticated user');
        return;
      }

      const {
        data: { user: authUser },
        error: authError,
      } = await supabase.auth.getUser();

      console.log('[push] resolved auth user for token registration', {
        contextUserId: user.id,
        authUserId: authUser?.id ?? null,
        authError: authError?.message ?? null,
      });

      const registrationUserId = authUser?.id ?? user.id;

      if (authUser?.id && authUser.id !== user.id) {
        console.warn('[push] auth user id mismatch while registering token', {
          contextUserId: user.id,
          authUserId: authUser.id,
        });
      }

      const isNative = nativeEnvironment.isNativeFromImport || nativeEnvironment.isNativeFromWindow;

      if (!isNative) {
        if ('Notification' in window) {
          console.log('[push] web notification permission state', {
            userId: registrationUserId,
            permission: Notification.permission,
          });

          if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            console.log('[push] web notification permission result', {
              userId: registrationUserId,
              permission,
            });
          }
        } else {
          console.log('[push] browser notifications API unavailable');
        }
        return;
      }

      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');

        await PushNotifications.removeAllListeners();
        console.log('[push] cleared native push listeners', { userId: registrationUserId });

        await PushNotifications.addListener('registration', async (token) => {
          if (!isActive) return;

          const platform = Capacitor.getPlatform();
          const payload = {
            user_id: registrationUserId,
            token: token.value,
            platform,
          };

          console.log('[push] native token received', {
            userId: registrationUserId,
            platform,
            token: token.value,
            tokenPreview: maskToken(token.value),
          });

          console.log('[push] attempting device_tokens upsert', payload);

          const { data: savedToken, error } = await supabase
            .from('device_tokens')
            .upsert(payload, { onConflict: 'user_id,token' })
            .select('id, user_id, platform, created_at')
            .single();

          if (error) {
            console.error('[push] failed to save device token', {
              userId: registrationUserId,
              platform,
              payload: { ...payload, token: maskToken(payload.token) },
              error,
            });
            return;
          }

          console.log('[push] device token saved', {
            savedToken,
            tokenPreview: maskToken(token.value),
          });
        });

        await PushNotifications.addListener('registrationError', (error) => {
          console.error('[push] registration error', error);
        });

        await PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('[push] notification received', notification);
        });

        await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
          console.log('[push] notification action performed', notification);
        });

        const permissionBefore = await PushNotifications.checkPermissions();
        console.log('[push] native notification permission before request', {
          userId: registrationUserId,
          receive: permissionBefore.receive,
        });

        const permission = await PushNotifications.requestPermissions();
        console.log('[push] native notification permission result', {
          userId: registrationUserId,
          receive: permission.receive,
        });

        if (permission.receive !== 'granted') {
          console.warn('[push] native notification permission not granted', {
            userId: registrationUserId,
            receive: permission.receive,
          });
          return;
        }

        console.log('[push] requesting native push registration', {
          userId: registrationUserId,
          platform: Capacitor.getPlatform(),
        });
        await PushNotifications.register();
        console.log('[push] native push registration requested successfully', {
          userId: registrationUserId,
        });
      } catch (error) {
        console.error('[push] push notifications unavailable', error);
      }
    };

    void registerToken();

    return () => {
      isActive = false;
      if (Capacitor.isNativePlatform() || window.Capacitor?.isNativePlatform?.()) {
        import('@capacitor/push-notifications')
          .then(({ PushNotifications }) => PushNotifications.removeAllListeners())
          .catch(() => undefined);
      }
    };
  }, [user?.id]);
}
