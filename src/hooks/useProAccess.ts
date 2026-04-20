import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

/**
 * Gate access to Pro-only features. Call `gate(label)` from a click handler:
 * returns `true` if the user is subscribed (proceed), or `false` after
 * redirecting them to /plans with a toast (block).
 */
export function useProAccess() {
  const { subscription } = useAuth();
  const navigate = useNavigate();
  const isPro = !!subscription?.subscribed;

  const gate = (featureLabel: string): boolean => {
    if (isPro) return true;
    toast.info(`${featureLabel} is a Pro feature. Upgrade to unlock.`);
    navigate('/plans');
    return false;
  };

  return { isPro, gate };
}
