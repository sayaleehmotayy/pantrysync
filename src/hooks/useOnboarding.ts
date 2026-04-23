import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const storageKey = (userId: string) => `pantrysync.onboarding.completed.${userId}`;

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

  const replay = () => setOpen(true);

  return { open, close, replay };
}
