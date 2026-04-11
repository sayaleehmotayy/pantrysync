import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

declare global {
  interface Window {
    Capacitor?: any;
  }
}

const maskToken = (token: string) =>
  token ? `${token.slice(0, 12)}...${token.slice(-6)}` : 'unknown';

export function usePushNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user?.id) return;

    let isActive = true;

    const registerToken = async () => {
      const isNative = window.Capacitor?.isNativePlatform?.() ?? false;
      console.log('[push] initializing push registration', { userId: user.id, isNative });

      if (!isNative) {
        if ('Notification' in window) {
          console.log('[push] web notification permission state', {
            userId: user.id,
            permission: Notification.permission,
          });

          if (Notification.permission === 'default') {
            const permission = await Notification.requestPermission();
            console.log('[push] web notification permission result', {
              userId: user.id,
              permission,
            });
          }
        }
        return;
      }

      try {
        const { PushNotifications } = await import('@capacitor/push-notifications');

        await PushNotifications.removeAllListeners();

        await PushNotifications.addListener('registration', async (token) => {
          if (!isActive) return;

          const platform = window.Capacitor?.getPlatform?.() || 'native';
          console.log('[push] native token received', {
            userId: user.id,
            platform,
            token: maskToken(token.value),
          });

          const { error } = await supabase.from('device_tokens').upsert(
            {
              user_id: user.id,
              token: token.value,
              platform,
            },
            { onConflict: 'user_id,token' }
          );

          if (error) {
            console.error('[push] failed to save device token', {
              userId: user.id,
              platform,
              error,
            });
            return;
          }

          console.log('[push] device token saved', {
            userId: user.id,
            platform,
            token: maskToken(token.value),
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

        const permission = await PushNotifications.requestPermissions();
        console.log('[push] native notification permission result', {
          userId: user.id,
          receive: permission.receive,
        });

        if (permission.receive !== 'granted') {
          console.warn('[push] native notification permission not granted', {
            userId: user.id,
            receive: permission.receive,
          });
          return;
        }

        console.log('[push] requesting native push registration', { userId: user.id });
        await PushNotifications.register();
      } catch (error) {
        console.error('[push] push notifications unavailable', error);
      }
    };

    void registerToken();

    return () => {
      isActive = false;
      if (window.Capacitor?.isNativePlatform?.()) {
        import('@capacitor/push-notifications')
          .then(({ PushNotifications }) => PushNotifications.removeAllListeners())
          .catch(() => undefined);
      }
    };
  }, [user?.id]);
}
