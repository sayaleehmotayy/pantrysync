import { useCallback } from 'react';
import { isNative } from '@/lib/platform';

/**
 * Request Camera + Microphone permissions on the native shell.
 * Safe to call on web (no-ops with a `granted` result driven by browser prompts
 * the next time getUserMedia is invoked).
 */
export function useMediaPermissions() {
  const requestCameraAndMic = useCallback(async (): Promise<{
    camera: 'granted' | 'denied' | 'prompt' | 'unsupported';
    microphone: 'granted' | 'denied' | 'prompt' | 'unsupported';
  }> => {
    // Native (Android): use Capacitor Camera plugin for camera, and trigger a
    // getUserMedia call for the mic so Android shows the system prompt.
    if (isNative()) {
      let cameraState: 'granted' | 'denied' | 'prompt' = 'prompt';
      let micState: 'granted' | 'denied' | 'prompt' | 'unsupported' = 'prompt';

      try {
        const { Camera } = await import('@capacitor/camera');
        const res = await Camera.requestPermissions({ permissions: ['camera'] });
        cameraState = (res.camera as any) || 'prompt';
      } catch (e) {
        console.warn('[Permissions] camera request failed', e);
      }

      // Microphone permission on Android via WebView getUserMedia
      try {
        if (navigator.mediaDevices?.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach((t) => t.stop());
          micState = 'granted';
        } else {
          micState = 'unsupported';
        }
      } catch (e: any) {
        console.warn('[Permissions] mic request failed', e);
        micState = 'denied';
      }

      return { camera: cameraState, microphone: micState };
    }

    // Web fallback
    let camera: 'granted' | 'denied' | 'prompt' | 'unsupported' = 'unsupported';
    let microphone: 'granted' | 'denied' | 'prompt' | 'unsupported' = 'unsupported';
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        s.getTracks().forEach((t) => t.stop());
        camera = 'granted';
        microphone = 'granted';
      }
    } catch {
      camera = 'denied';
      microphone = 'denied';
    }
    return { camera, microphone };
  }, []);

  return { requestCameraAndMic };
}
