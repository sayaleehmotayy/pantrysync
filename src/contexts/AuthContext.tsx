import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";


import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { isRecoveryUrl } from '@/lib/authRecovery';

interface SubscriptionState {
  subscribed: boolean;
  productId: string | null;
  subscriptionEnd: string | null;
  loading: boolean;
  trial: boolean;
  householdPro: boolean;
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  subscription: SubscriptionState;
  checkSubscription: () => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: Error | null; alreadyExists?: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const createSubscriptionState = (overrides: Partial<SubscriptionState> = {}): SubscriptionState => ({
  subscribed: false,
  productId: null,
  subscriptionEnd: null,
  loading: false,
  trial: false,
  householdPro: false,
  ...overrides,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionState>(createSubscriptionState({ loading: true }));

  const isRecoveryFlow = useCallback(() => {
    if (typeof window === 'undefined') return false;

    return isRecoveryUrl(window.location);
  }, []);

  // Use a ref to always have the latest user email available
  const userEmailRef = useRef<string | null>(null);

  const clearAuthState = useCallback(async () => {
    await supabase.auth.signOut({ scope: 'local' });
    setSession(null);
    setUser(null);
    userEmailRef.current = null;
    setSubscription(createSubscriptionState());
  }, []);

  const checkSubscription = useCallback(async (emailOverride?: string) => {
    const email = emailOverride ?? userEmailRef.current;
    // Admin bypass is now handled server-side in check-subscription edge function

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;
    if (!accessToken) {
      setSubscription(createSubscriptionState());
      return;
    }

    const { data: authData, error: authError } = await supabase.auth.getUser();
    const authUser = authData.user;
    if (authError || !authUser?.email) {
      await clearAuthState();
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('check-subscription', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (error) throw error;
      setSubscription({
        subscribed: data?.subscribed ?? false,
        productId: data?.product_id ?? null,
        subscriptionEnd: data?.subscription_end ?? null,
        loading: false,
        trial: data?.trial ?? false,
        householdPro: data?.household_pro ?? false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('Auth session missing')) {
        await clearAuthState();
        return;
      }
      setSubscription(prev => ({ ...prev, loading: false }));
    }
  }, [clearAuthState]);

  useEffect(() => {
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((event, session) => {
      const currentUser = session?.user ?? null;
      setSession(session);
      setUser(currentUser);
      userEmailRef.current = currentUser?.email ?? null;
      setLoading(false);
      if (currentUser) {
        if (event === 'PASSWORD_RECOVERY' || isRecoveryFlow()) {
          setSubscription(prev => ({ ...prev, loading: false }));
        } else {
          setTimeout(() => checkSubscription(currentUser.email ?? undefined), 0);
        }
      } else {
        setSubscription({ subscribed: false, productId: null, subscriptionEnd: null, loading: false, trial: false, householdPro: false });
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setSession(session);
      setUser(currentUser);
      userEmailRef.current = currentUser?.email ?? null;
      setLoading(false);
      if (currentUser) {
        if (isRecoveryFlow()) {
          setSubscription(prev => ({ ...prev, loading: false }));
        } else {
          checkSubscription(currentUser.email ?? undefined);
        }
      } else {
        setSubscription(prev => ({ ...prev, loading: false }));
      }
    });

    return () => authSub.unsubscribe();
  }, [checkSubscription, isRecoveryFlow]);

  // Periodic check every 60 seconds
  useEffect(() => {
    if (!user || isRecoveryFlow()) return;
    const interval = setInterval(() => checkSubscription(), 60000);
    return () => clearInterval(interval);
  }, [user, checkSubscription, isRecoveryFlow]);

  const signUp = async (email: string, password: string, displayName: string): Promise<{ error: Error | null; alreadyExists?: boolean }> => {
    const currentOrigin = window.location.origin;
    const authOrigin = currentOrigin.includes('lovableproject.com') || currentOrigin.includes('id-preview--')
      ? 'https://pantrysync.lovable.app'
      : currentOrigin;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
        emailRedirectTo: `${authOrigin}/welcome`,
      },
    });

    // Detect "fake" signup for existing user: Supabase returns a user with empty identities
    if (!error && data?.user && data.user.identities && data.user.identities.length === 0) {
      return { error: null, alreadyExists: true };
    }

    return { error: error as Error | null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  // Expose checkSubscription without args for external use
  const publicCheckSubscription = useCallback(async () => {
    await checkSubscription();
  }, [checkSubscription]);

  return (
    <AuthContext.Provider value={{ session, user, loading, subscription, checkSubscription: publicCheckSubscription, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
