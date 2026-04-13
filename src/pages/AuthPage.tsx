import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import pantrySyncLogo from '@/assets/pantry-sync-logo.png';

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [verifyEmail, setVerifyEmail] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = isSignUp
      ? await signUp(email, password, displayName)
      : await signIn(email, password);

    if (result.error) {
      const msg = result.error.message;
      if (msg.includes('security purposes') || msg.includes('after')) {
        setError('Please check your email inbox to verify your account before signing in.');
      } else {
        setError(msg);
      }
    } else if (isSignUp) {
      setVerifyEmail(true);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl overflow-hidden mb-4">
            <img src={pantrySyncLogo} alt="PantrySync" className="w-14 h-14 object-cover rounded-2xl" />
          </div>
          <h1 className="text-2xl font-display font-bold text-foreground">PantrySync</h1>
          <p className="text-muted-foreground text-sm mt-1">Keep your household in sync</p>
        </div>

        <Card className="border-border/50 shadow-lg">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">
              {verifyEmail ? 'Check Your Email' : isSignUp ? 'Create Account' : 'Welcome Back'}
            </CardTitle>
            <CardDescription>
              {verifyEmail
                ? 'Verify through email inbox'
                : isSignUp ? 'Sign up to get started' : 'Sign in to your account'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {verifyEmail ? (
              <div className="space-y-4 text-center">
                <p className="text-sm text-muted-foreground">
                  We've sent a verification link to <strong>{email}</strong>. Please check your inbox and click the link to activate your account.
                </p>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => { setVerifyEmail(false); setIsSignUp(false); setError(''); }}
                >
                  Back to Sign In
                </Button>
              </div>
            ) : (
              <>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {isSignUp && (
                    <Input
                      placeholder="Display name"
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      required
                    />
                  )}
                  <Input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                  />
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Password"
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
                  {error && <p className="text-sm text-destructive">{error}</p>}
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
                  </Button>
                </form>
                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => { setIsSignUp(!isSignUp); setError(''); }}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
                  </button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
