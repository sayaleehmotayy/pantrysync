import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

declare global {
  interface Window {
    Capacitor?: any;
  }
}

export function usePushNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const registerToken = async () => {
      if (window.Capacitor?.isNativePlatform?.()) {
        try {
          const { PushNotifications } = await import('@capacitor/push-notifications');
          
          const permission = await PushNotifications.requestPermissions();
          if (permission.receive !== 'granted') return;

          await PushNotifications.register();

          PushNotifications.addListener('registration', async (token) => {
            const platform = window.Capacitor.getPlatform?.() || 'web';
            await (supabase.from('device_tokens' as any) as any).upsert(
              { user_id: user.id, token: token.value, platform },
              { onConflict: 'user_id,token' }
            );
          });

          PushNotifications.addListener('registrationError', (error) => {
            console.error('Push registration error:', error);
          });

          PushNotifications.addListener('pushNotificationReceived', (notification) => {
            console.log('Push notification received:', notification);
          });

          PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
            console.log('Push notification action:', notification);
          });
        } catch (e) {
          console.log('Push notifications not available:', e);
        }
      } else {
        if ('Notification' in window && Notification.permission === 'default') {
          Notification.requestPermission();
        }
      }
    };

    registerToken();
  }, [user]);
}
