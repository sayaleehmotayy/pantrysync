import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const storageKey = (userId: string) => `pantrysync.onboarding.completed.${userId}`;
const REPLAY_EVENT = 'pantrysync:onboarding:replay';

export function triggerOnboardingReplay() {
  window.dispatchEvent(new Event(REPLAY_EVENT));
}

export function useOnboarding() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    try {
      const done = localStorage.getItem(storageKey(user.id));
      if (!done) setOpen(true);
    } catch {
      // ignore
    }
  }, [user]);

  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener(REPLAY_EVENT, handler);
    return () => window.removeEventListener(REPLAY_EVENT, handler);
  }, []);

  const close = () => {
    setOpen(false);
    if (user) {
      try {
        localStorage.setItem(storageKey(user.id), '1');
      } catch {
        // ignore
      }
    }
  };

  return { open, close };
}
