import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2 } from 'lucide-react';
import pantrySyncLogo from '@/assets/pantry-sync-logo.png';

export default function WelcomePage() {
  const navigate = useNavigate();
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    // If hash contains access_token or type=signup, the user just verified
    const hash = window.location.hash;
    if (hash.includes('access_token') || hash.includes('type=signup') || hash.includes('type=magiclink')) {
      setVerified(true);
    } else {
      // Also treat direct visit as verified (they clicked verify link)
      setVerified(true);
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl overflow-hidden mb-4">
            <img src={pantrySyncLogo} alt="PantrySync" className="w-16 h-16 object-cover rounded-2xl" />
          </div>
        </div>

        <Card className="border-border/50 shadow-lg">
          <CardContent className="pt-8 pb-8 text-center space-y-5">
            <div className="flex justify-center">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-primary" />
              </div>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-display font-bold text-foreground">
                Welcome to PantrySync!
              </h1>
              <p className="text-muted-foreground text-sm">
                Your email has been verified successfully. You're all set to start managing your household pantry.
              </p>
            </div>
            <Button
              onClick={() => navigate('/')}
              className="w-full gap-2"
              size="lg"
            >
              Go to App
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}