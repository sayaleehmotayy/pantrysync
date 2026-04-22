import { Capacitor } from '@capacitor/core';

/** True when running inside the Capacitor Android shell. */
export function isNativeAndroid(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}

/** True when running inside any native (Android/iOS) shell. */
export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}
