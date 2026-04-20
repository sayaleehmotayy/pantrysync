import React, { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import pantrySyncLogo from '@/assets/pantry-sync-logo.png';
import { getRecoveryParams } from '@/lib/authRecovery';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const [verifying, setVerifying] = useState(true);

  useEffect(() => {
    let isActive = true;
    let unsubscribe: (() => void) | undefined;

    const cleanUrl = () => {
      try {
        window.history.replaceState({}, '', '/reset-password');
      } catch {}
    };

    const handleRecovery = async () => {
      const { type, code, tokenHash, accessToken, refreshToken } = getRecoveryParams();
      const hasRecoveryParams = Boolean(code || tokenHash || accessToken || type === 'recovery');

      if (hasRecoveryParams && isActive) {
        setIsRecovery(true);
        setError('');
      }

      if (code) {
        await supabase.auth.exchangeCodeForSession(window.location.href).catch(() => {});
      } else if (tokenHash && type === 'recovery') {
        await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' }).catch(() => {});
      } else if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).catch(() => {});
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        if (!isActive) return;
        setIsRecovery(true);
        setVerifying(false);
        cleanUrl();
        return;
      }

      const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
        if (!isActive) return;

        if ((event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && nextSession) {
          setIsRecovery(true);
          setError('');
          setVerifying(false);
          cleanUrl();
        }
      });

      unsubscribe = () => subscription.unsubscribe();

      if (hasRecoveryParams) {
        setVerifying(false);
        return;
      }

      setTimeout(() => {
        if (!isActive) return;
        setVerifying(false);
        setIsRecovery(false);
        setError('This reset link is invalid or has expired.');
      }, 3000);
    };

    handleRecovery();

    return () => {
      isActive = false;
      unsubscribe?.();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    setError('');

    // Defensive: if no session yet, try one more time to exchange the code
    // from the URL before giving up. This avoids "Auth session missing!".
    let { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const { code, tokenHash, accessToken, refreshToken } = getRecoveryParams();
      if (code) {
        await supabase.auth.exchangeCodeForSession(window.location.href).catch(() => {});
      } else if (tokenHash) {
        await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' }).catch(() => {});
      } else if (accessToken && refreshToken) {
        await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).catch(() => {});
      }
      ({ data: { session } } = await supabase.auth.getSession());
    }

    if (!session) {
      setError('Your reset link has expired. Please request a new one.');
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
      // Sign out so the user must log in with the new password (clean UX)
      await supabase.auth.signOut();
      setTimeout(() => {
        window.location.href = '/';
      }, 2000);
    }
    setLoading(false);
  };

  if (verifying) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl overflow-hidden mb-4">
            <img src={pantrySyncLogo} alt="PantrySync" className="w-14 h-14 object-cover rounded-2xl" />
          </div>
          <p className="text-muted-foreground">Verifying reset link...</p>
        </div>
      </div>
    );
  }

  if (!isRecovery) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <div className="w-full max-w-sm text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl overflow-hidden mb-4">
            <img src={pantrySyncLogo} alt="PantrySync" className="w-14 h-14 object-cover rounded-2xl" />
          </div>
          <h1 className="text-xl font-display font-bold text-foreground mb-2">Link Expired</h1>
          <p className="text-muted-foreground mb-4">{error || 'This reset link is invalid or has expired.'}</p>
          <Button onClick={() => navigate('/')} variant="outline">Back to Login</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl overflow-hidden mb-4">
            <img src={pantrySyncLogo} alt="PantrySync" className="w-14 h-14 object-cover rounded-2xl" />
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground">Reset Password</h1>
        </div>

        <Card className="border-border/50 shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">
              {success ? 'Password Updated!' : 'Set New Password'}
            </CardTitle>
            <CardDescription>
              {success ? 'Redirecting you to sign in with your new password...' : 'Enter your new password below'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {success ? (
              <p className="text-sm text-center text-muted-foreground">Your password has been updated successfully. Please sign in.</p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="New password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={6}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Updating...' : 'Update Password'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
