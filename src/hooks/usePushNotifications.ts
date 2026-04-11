import { useEffect, useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

declare global {
  interface Window {
    Capacitor?: any;
  }
}

interface NativeEnvironment {
  hasWindowCapacitor: boolean;
  isNative: boolean;
  importPlatform: string;
  windowPlatform: string;
  backendConfigured: boolean;
}

interface DeviceTokenPayloadPreview {
  user_id: string;
  platform: string;
  tokenPreview: string;
}

interface SavedDeviceTokenRow {
  id: string;
  user_id: string;
  platform: string;
  created_at: string;
}

interface PushNotificationDebugState {
  lastUpdatedAt: string | null;
  environment: NativeEnvironment;
  contextUserId: string | null;
  authUserId: string | null;
  permissionBefore: string | null;
  permissionAfter: string | null;
  registerCalled: boolean;
  registrationEventReceived: boolean;
  registrationError: string | null;
  tokenPreview: string | null;
  tokenLength: number | null;
  saveAttempted: boolean;
  saveSucceeded: boolean;
  saveError: string | null;
  dummySaveAttempted: boolean;
  dummySaveSucceeded: boolean;
  dummySaveError: string | null;
  lastPayload: DeviceTokenPayloadPreview | null;
  lastSavedRow: SavedDeviceTokenRow | null;
  lastAction: string;
}

const maskToken = (token: string) =>
  token ? `${token.slice(0, 12)}...${token.slice(-6)}` : 'unknown';

const stringifyError = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;

  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
};

const getNativeEnvironment = (): NativeEnvironment => {
  const hasWindow = typeof window !== 'undefined';
  const hasWindowCapacitor = hasWindow && Boolean(window.Capacitor);
  const isNativeFromWindow = hasWindow ? window.Capacitor?.isNativePlatform?.() ?? false : false;

  return {
    hasWindowCapacitor,
    isNative: Capacitor.isNativePlatform() || isNativeFromWindow,
    importPlatform: Capacitor.getPlatform(),
    windowPlatform: hasWindow ? window.Capacitor?.getPlatform?.() ?? 'unavailable' : 'unavailable',
    backendConfigured: Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PROJECT_ID),
  };
};

const createInitialPushDebugState = (): PushNotificationDebugState => ({
  lastUpdatedAt: null,
  environment: getNativeEnvironment(),
  contextUserId: null,
  authUserId: null,
  permissionBefore: null,
  permissionAfter: null,
  registerCalled: false,
  registrationEventReceived: false,
  registrationError: null,
  tokenPreview: null,
  tokenLength: null,
  saveAttempted: false,
  saveSucceeded: false,
  saveError: null,
  dummySaveAttempted: false,
  dummySaveSucceeded: false,
  dummySaveError: null,
  lastPayload: null,
  lastSavedRow: null,
  lastAction: 'idle',
});

let pushDebugState = createInitialPushDebugState();
const debugListeners = new Set<() => void>();
let activeRegistrationPromise: Promise<void> | null = null;

const emitPushDebugState = () => {
  debugListeners.forEach((listener) => listener());
};

const updatePushDebugState = (patch: Partial<PushNotificationDebugState>) => {
  pushDebugState = {
    ...pushDebugState,
    ...patch,
    environment: patch.environment ?? pushDebugState.environment,
    lastUpdatedAt: new Date().toISOString(),
  };

  console.log('[push-debug] state update', patch);
  emitPushDebugState();
};

const subscribePushDebugState = (listener: () => void) => {
  debugListeners.add(listener);
  return () => debugListeners.delete(listener);
};

const refreshEnvironment = () => {
  const environment = getNativeEnvironment();
  updatePushDebugState({ environment });
  return environment;
};

const resolveRegistrationUserId = async (contextUserId: string | null) => {
  const {
    data: { user: authUser },
    error: authError,
  } = await supabase.auth.getUser();

  console.log('[push] resolved auth user for token registration', {
    contextUserId,
    authUserId: authUser?.id ?? null,
    authError: authError?.message ?? null,
  });

  if (authUser?.id && contextUserId && authUser.id !== contextUserId) {
    console.warn('[push] auth user id mismatch while registering token', {
      contextUserId,
      authUserId: authUser.id,
    });
  }

  updatePushDebugState({
    contextUserId,
    authUserId: authUser?.id ?? null,
    lastAction: 'resolved authenticated user',
  });

  return authUser?.id ?? contextUserId ?? null;
};

const saveDeviceTokenPayload = async (
  payload: { user_id: string; token: string; platform: string },
  mode: 'real' | 'dummy',
) => {
  const tokenPreview = maskToken(payload.token);
  const description = mode === 'real' ? 'device_tokens upsert' : 'device_tokens dummy insert';

  updatePushDebugState({
    lastPayload: {
      user_id: payload.user_id,
      platform: payload.platform,
      tokenPreview,
    },
    ...(mode === 'real'
      ? {
          saveAttempted: true,
          saveSucceeded: false,
          saveError: null,
        }
      : {
          dummySaveAttempted: true,
          dummySaveSucceeded: false,
          dummySaveError: null,
        }),
    lastAction: `attempting ${description}`,
  });

  console.log(`[push] attempting ${description}`, {
    ...payload,
    tokenPreview,
  });

  const query = mode === 'real'
    ? supabase
        .from('device_tokens')
        .upsert(payload, { onConflict: 'user_id,token' })
        .select('id, user_id, platform, created_at')
        .single()
    : supabase
        .from('device_tokens')
        .insert(payload)
        .select('id, user_id, platform, created_at')
        .single();

  const { data: savedToken, error } = await query;

  if (error) {
    const errorMessage = stringifyError(error);

    console.error('[push] failed to save device token', {
      mode,
      payload: { ...payload, token: tokenPreview },
      error,
    });

    updatePushDebugState(
      mode === 'real'
        ? {
            saveSucceeded: false,
            saveError: errorMessage,
            lastAction: 'device_tokens write failed',
          }
        : {
            dummySaveSucceeded: false,
            dummySaveError: errorMessage,
            lastAction: 'dummy device_tokens write failed',
          },
    );

    return null;
  }

  console.log('[push] device token saved', {
    mode,
    savedToken,
    tokenPreview,
  });

  updatePushDebugState(
    mode === 'real'
      ? {
          saveSucceeded: true,
          saveError: null,
          lastSavedRow: savedToken,
          lastAction: 'device_tokens row saved',
        }
      : {
          dummySaveSucceeded: true,
          dummySaveError: null,
          lastSavedRow: savedToken,
          lastAction: 'dummy device_tokens row saved',
        },
  );

  return savedToken;
};

const runPushTokenRegistration = async ({
  contextUserId,
  source,
}: {
  contextUserId: string | null;
  source: string;
}) => {
  if (activeRegistrationPromise) {
    return activeRegistrationPromise;
  }

  activeRegistrationPromise = (async () => {
    try {
      let tokenEventReceived = false;
      const nativeEnvironment = refreshEnvironment();

      console.log('[push] registration flow started', {
        source,
        contextUserId,
        ...nativeEnvironment,
      });

      updatePushDebugState({
        contextUserId,
        permissionBefore: null,
        permissionAfter: null,
        registerCalled: false,
        registrationEventReceived: false,
        registrationError: null,
        tokenPreview: null,
        tokenLength: null,
        saveAttempted: false,
        saveSucceeded: false,
        saveError: null,
        lastPayload: null,
        lastAction: `${source}: registration started`,
      });

      const registrationUserId = await resolveRegistrationUserId(contextUserId);

      if (!registrationUserId) {
        console.log('[push] token registration waiting for authenticated user');
        updatePushDebugState({
          lastAction: `${source}: waiting for authenticated user`,
        });
        return;
      }

      if (!nativeEnvironment.isNative) {
        if (typeof window !== 'undefined' && 'Notification' in window) {
          console.log('[push] web notification permission state', {
            userId: registrationUserId,
            permission: Notification.permission,
            source,
          });

          updatePushDebugState({
            permissionBefore: Notification.permission,
            permissionAfter: Notification.permission,
            lastAction: `${source}: running on web, native registration skipped`,
          });
        } else {
          console.log('[push] browser notifications API unavailable');
          updatePushDebugState({
            lastAction: `${source}: browser notifications API unavailable`,
          });
        }

        return;
      }

      const { PushNotifications } = await import('@capacitor/push-notifications');

      await PushNotifications.removeAllListeners();
      console.log('[push] cleared native push listeners', {
        userId: registrationUserId,
        source,
      });

      await PushNotifications.addListener('registration', async (token) => {
        tokenEventReceived = true;

        const platform = Capacitor.getPlatform();
        const payload = {
          user_id: registrationUserId,
          token: token.value,
          platform,
        };

        updatePushDebugState({
          registrationEventReceived: true,
          registrationError: null,
          tokenPreview: maskToken(token.value),
          tokenLength: token.value.length,
          lastPayload: {
            user_id: payload.user_id,
            platform: payload.platform,
            tokenPreview: maskToken(token.value),
          },
          lastAction: `${source}: native registration token received`,
        });

        console.log('[push] native token received', {
          userId: registrationUserId,
          platform,
          tokenPreview: maskToken(token.value),
          tokenLength: token.value.length,
          source,
        });

        await saveDeviceTokenPayload(payload, 'real');
      });

      await PushNotifications.addListener('registrationError', (error) => {
        const errorMessage = stringifyError(error);

        console.error('[push] registration error', {
          source,
          error,
        });

        updatePushDebugState({
          registrationEventReceived: false,
          registrationError: errorMessage,
          lastAction: `${source}: registration error`,
        });
      });

      await PushNotifications.addListener('pushNotificationReceived', async (notification) => {
        console.log('[push] foreground notification received', notification);

        // On Android, foreground notifications are suppressed by default.
        // Show a local notification so the user sees a banner.
        try {
          const { LocalNotifications } = await import('@capacitor/local-notifications');
          await LocalNotifications.schedule({
            notifications: [
              {
                title: notification.title || 'PantrySync',
                body: notification.body || '',
                id: Math.floor(Date.now() % 2147483647),
                sound: 'default',
                channelId: 'mentions',
                extra: notification.data,
              },
            ],
          });
          console.log('[push] scheduled local notification for foreground display');
        } catch (localErr) {
          console.warn('[push] local notification fallback failed', localErr);
        }
      });

      await PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        console.log('[push] notification action performed', notification);
      });

      const permissionBefore = await PushNotifications.checkPermissions();
      console.log('[push] native notification permission before request', {
        userId: registrationUserId,
        receive: permissionBefore.receive,
        source,
      });

      updatePushDebugState({
        permissionBefore: permissionBefore.receive,
        lastAction: `${source}: checked notification permission`,
      });

      const permission = await PushNotifications.requestPermissions();
      console.log('[push] native notification permission result', {
        userId: registrationUserId,
        receive: permission.receive,
        source,
      });

      updatePushDebugState({
        permissionAfter: permission.receive,
        lastAction: `${source}: requested notification permission`,
      });

      if (permission.receive !== 'granted') {
        console.warn('[push] native notification permission not granted', {
          userId: registrationUserId,
          receive: permission.receive,
          source,
        });

        updatePushDebugState({
          registerCalled: false,
          lastAction: `${source}: notification permission not granted`,
        });

        return;
      }

      updatePushDebugState({
        registerCalled: true,
        lastAction: `${source}: PushNotifications.register() called`,
      });

      console.log('[push] requesting native push registration', {
        userId: registrationUserId,
        platform: Capacitor.getPlatform(),
        source,
      });

      await PushNotifications.register();

      console.log('[push] native push registration requested successfully', {
        userId: registrationUserId,
        source,
      });

      window.setTimeout(() => {
        if (!tokenEventReceived) {
          console.warn('[push] register() completed but no registration token event fired yet', {
            userId: registrationUserId,
            source,
          });

          updatePushDebugState({
            registrationEventReceived: false,
            lastAction: `${source}: register called but no registration token event fired`,
          });
        }
      }, 6000);
    } catch (error) {
      console.error('[push] push notifications unavailable', error);
      updatePushDebugState({
        registrationError: stringifyError(error),
        lastAction: `${source}: push notifications unavailable`,
      });
    } finally {
      activeRegistrationPromise = null;
    }
  })();

  return activeRegistrationPromise;
};

export async function triggerPushTokenRegistration(contextUserId: string | null = null) {
  await runPushTokenRegistration({ contextUserId, source: 'manual' });
}

export async function saveDummyTokenRow(contextUserId: string | null = null) {
  const environment = refreshEnvironment();
  const registrationUserId = await resolveRegistrationUserId(contextUserId);

  if (!registrationUserId) {
    updatePushDebugState({
      dummySaveAttempted: true,
      dummySaveSucceeded: false,
      dummySaveError: 'No authenticated user available for dummy device token insert',
      lastAction: 'manual: dummy insert blocked',
    });
    return;
  }

  const payload = {
    user_id: registrationUserId,
    token: `debug-${environment.importPlatform}-${Date.now()}`,
    platform: `${environment.importPlatform}-debug`,
  };

  updatePushDebugState({
    dummySaveAttempted: true,
    dummySaveSucceeded: false,
    dummySaveError: null,
    lastPayload: {
      user_id: payload.user_id,
      platform: payload.platform,
      tokenPreview: maskToken(payload.token),
    },
    lastAction: 'manual: saving dummy device_tokens row',
  });

  await saveDeviceTokenPayload(payload, 'dummy');
}

export function usePushNotificationDebug() {
  return useSyncExternalStore(subscribePushDebugState, () => pushDebugState, () => pushDebugState);
}

export function usePushNotifications() {
  const { user } = useAuth();

  useEffect(() => {
    void runPushTokenRegistration({
      contextUserId: user?.id ?? null,
      source: 'effect',
    });

    return () => {
      if (Capacitor.isNativePlatform() || window.Capacitor?.isNativePlatform?.()) {
        import('@capacitor/push-notifications')
          .then(({ PushNotifications }) => PushNotifications.removeAllListeners())
          .catch(() => undefined);
      }
    };
  }, [user?.id]);
}
