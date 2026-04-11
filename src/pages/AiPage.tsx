import React from 'react';
import { useAiAssistant } from '@/hooks/useAiAssistant';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sparkles, UtensilsCrossed, Leaf, ShoppingCart,
  ArrowLeft, Loader2
} from 'lucide-react';

const features = [
  {
    id: 'meal-planner' as const,
    title: 'Smart Meal Planner',
    description: 'AI generates a weekly meal plan using your pantry items, prioritizing expiring food',
    icon: UtensilsCrossed,
    gradient: 'from-primary/20 to-accent/10',
    iconColor: 'text-primary',
    badge: 'Popular',
  },
  {
    id: 'waste-advisor' as const,
    title: 'Food Waste Advisor',
    description: 'Get waste reduction tips, rescue recipes, and a risk score for your pantry',
    icon: Leaf,
    gradient: 'from-success/20 to-primary/10',
    iconColor: 'text-success',
    badge: 'Eco',
  },
  {
    id: 'smart-shopping' as const,
    title: 'Smart Shopping Assistant',
    description: 'AI predicts what you need to buy based on usage patterns and stock levels',
    icon: ShoppingCart,
    gradient: 'from-info/20 to-primary/10',
    iconColor: 'text-info',
    badge: 'New',
  },
];

function MarkdownContent({ content }: { content: string }) {
  // Simple markdown-like rendering
  const lines = content.split('\n');
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-2" />;
        
        // Headers
        if (trimmed.startsWith('### ')) return <h4 key={i} className="font-display font-bold text-base mt-4 mb-1">{trimmed.slice(4)}</h4>;
        if (trimmed.startsWith('## ')) return <h3 key={i} className="font-display font-bold text-lg mt-5 mb-1.5">{trimmed.slice(3)}</h3>;
        if (trimmed.startsWith('# ')) return <h2 key={i} className="font-display font-bold text-xl mt-6 mb-2">{trimmed.slice(2)}</h2>;
        
        // Bold text
        const boldified = trimmed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        
        // List items
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-primary mt-0.5">•</span>
              <span dangerouslySetInnerHTML={{ __html: boldified.slice(2) }} />
            </div>
          );
        }
        
        // Numbered lists
        const numMatch = trimmed.match(/^(\d+)\.\s/);
        if (numMatch) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-primary font-semibold min-w-[1.25rem]">{numMatch[1]}.</span>
              <span dangerouslySetInnerHTML={{ __html: boldified.slice(numMatch[0].length) }} />
            </div>
          );
        }

        return <p key={i} dangerouslySetInnerHTML={{ __html: boldified }} />;
      })}
    </div>
  );
}

export default function AiPage() {
  const { loading, result, activeFeature, runFeature, setResult, setActiveFeature } = useAiAssistant();

  const handleBack = () => {
    setResult('');
    setActiveFeature(null);
  };

  // Result view
  if (activeFeature && (result || loading)) {
    const feat = features.find(f => f.id === activeFeature)!;
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleBack} className="rounded-xl h-9 w-9">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2">
            <feat.icon className={`w-5 h-5 ${feat.iconColor}`} />
            <h1 className="text-lg font-display font-bold">{feat.title}</h1>
          </div>
          {loading && (
            <Badge variant="secondary" className="ml-auto gap-1 animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" /> Thinking...
            </Badge>
          )}
        </div>

        <Card className="border-border/50">
          <CardContent className="p-4">
            <ScrollArea className="max-h-[calc(100vh-14rem)]">
              {result ? (
                <MarkdownContent content={result} />
              ) : (
                <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <p className="text-sm">Analyzing your pantry...</p>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {!loading && result && (
          <Button onClick={() => runFeature(activeFeature)} variant="outline" className="w-full rounded-xl gap-2">
            <Sparkles className="w-4 h-4" /> Regenerate
          </Button>
        )}
      </div>
    );
  }

  // Feature selection view
  return (
    <div className="space-y-5 animate-fade-in">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/15 via-accent/5 to-info/10 p-5 border border-primary/10">
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-display font-bold">AI Assistant</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Smart tools powered by AI to help manage your pantry, reduce waste, and plan meals
          </p>
        </div>
        <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-primary/10 blur-2xl" />
      </div>

      <div className="space-y-3">
        {features.map(feat => (
          <Card
            key={feat.id}
            className="border-border/50 cursor-pointer hover:shadow-md transition-all duration-200 active:scale-[0.98] overflow-hidden"
            onClick={() => runFeature(feat.id)}
          >
            <CardContent className="p-0">
              <div className={`bg-gradient-to-r ${feat.gradient} p-4`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-card/80 flex items-center justify-center flex-shrink-0">
                      <feat.icon className={`w-5 h-5 ${feat.iconColor}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-display font-bold text-sm">{feat.title}</h3>
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{feat.badge}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{feat.description}</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
