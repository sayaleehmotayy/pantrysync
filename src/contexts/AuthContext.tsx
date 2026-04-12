import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";

const ADMIN_EMAIL = "pantrysync9@gmail.com";
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

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
  signUp: (email: string, password: string, displayName: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<SubscriptionState>({
    subscribed: false,
    productId: null,
    subscriptionEnd: null,
    loading: true,
    trial: false,
    householdPro: false,
  });

  // Use a ref to always have the latest user email available
  const userEmailRef = useRef<string | null>(null);

  const checkSubscription = useCallback(async (emailOverride?: string) => {
    const email = emailOverride ?? userEmailRef.current;
    if (email === ADMIN_EMAIL) {
      setSubscription({ subscribed: true, productId: 'admin', subscriptionEnd: null, loading: false, trial: false, householdPro: false });
      return;
    }
    try {
      const { data, error } = await supabase.functions.invoke('check-subscription');
      if (error) throw error;
      setSubscription({
        subscribed: data?.subscribed ?? false,
        productId: data?.product_id ?? null,
        subscriptionEnd: data?.subscription_end ?? null,
        loading: false,
        trial: data?.trial ?? false,
        householdPro: data?.household_pro ?? false,
      });
    } catch {
      setSubscription(prev => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    const { data: { subscription: authSub } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setSession(session);
      setUser(currentUser);
      userEmailRef.current = currentUser?.email ?? null;
      setLoading(false);
      if (currentUser) {
        setTimeout(() => checkSubscription(currentUser.email ?? undefined), 0);
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
        checkSubscription(currentUser.email ?? undefined);
      } else {
        setSubscription(prev => ({ ...prev, loading: false }));
      }
    });

    return () => authSub.unsubscribe();
  }, [checkSubscription]);

  // Periodic check every 60 seconds
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => checkSubscription(), 60000);
    return () => clearInterval(interval);
  }, [user, checkSubscription]);

  const signUp = async (email: string, password: string, displayName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
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
