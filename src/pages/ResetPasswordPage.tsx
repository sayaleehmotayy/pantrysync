import React, { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import pantrySyncLogo from '@/assets/pantry-sync-logo.png';

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
    let handled = false;

    const cleanUrl = () => {
      try {
        window.history.replaceState({}, '', '/reset-password');
      } catch {}
    };

    const handleRecovery = async () => {
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get('token_hash');
      const type = params.get('type');
      const code = params.get('code');
      const hash = window.location.hash;

      // 1) PKCE flow with token_hash + type=recovery
      if (tokenHash && type === 'recovery') {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'recovery',
        });
        if (!error) {
          handled = true;
          setIsRecovery(true);
          cleanUrl();
        } else {
          setError('This reset link has expired or is invalid. Please request a new one.');
        }
        setVerifying(false);
        return;
      }

      // 2) PKCE flow with ?code= — Supabase may auto-exchange via detectSessionInUrl
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
        if (!error) {
          handled = true;
          setIsRecovery(true);
          cleanUrl();
        } else {
          // Auto-exchange may have already consumed the code — check session
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            handled = true;
            setIsRecovery(true);
            cleanUrl();
          } else {
            setError('This reset link has expired or is invalid. Please request a new one.');
          }
        }
        setVerifying(false);
        return;
      }

      // 3) Implicit flow with hash fragment
      if (hash.includes('type=recovery') || hash.includes('access_token=')) {
        handled = true;
        setIsRecovery(true);
        cleanUrl();
        setVerifying(false);
        return;
      }

      // 4) Listen for PASSWORD_RECOVERY event
      const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') {
          handled = true;
          setIsRecovery(true);
          setVerifying(false);
        }
      });

      // 5) Fallback — if a session already exists (auto-exchange already happened)
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        handled = true;
        setIsRecovery(true);
        setVerifying(false);
        return () => subscription.unsubscribe();
      }

      setTimeout(() => {
        if (!handled) setVerifying(false);
      }, 3000);

      return () => subscription.unsubscribe();
    };

    handleRecovery();
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
