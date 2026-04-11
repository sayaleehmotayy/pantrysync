import React from 'react';
import { useAiAssistant } from '@/hooks/useAiAssistant';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles, UtensilsCrossed, Leaf, ShoppingCart,
  ArrowLeft, Loader2, ChevronRight
} from 'lucide-react';

const features = [
  {
    id: 'meal-planner' as const,
    title: 'Smart Meal Planner',
    description: 'AI generates a weekly meal plan using your pantry items, prioritizing expiring food',
    icon: UtensilsCrossed,
    gradient: 'from-primary/20 via-primary/5 to-transparent',
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    badge: 'Popular',
    badgeClass: 'bg-primary/10 text-primary border-primary/20',
  },
  {
    id: 'waste-advisor' as const,
    title: 'Food Waste Advisor',
    description: 'Get waste reduction tips, rescue recipes, and a risk score for your pantry',
    icon: Leaf,
    gradient: 'from-success/20 via-success/5 to-transparent',
    iconBg: 'bg-success/10',
    iconColor: 'text-success',
    badge: 'Eco',
    badgeClass: 'bg-success/10 text-success border-success/20',
  },
  {
    id: 'smart-shopping' as const,
    title: 'Smart Shopping Assistant',
    description: 'AI predicts what you need to buy based on usage patterns and stock levels',
    icon: ShoppingCart,
    gradient: 'from-info/20 via-info/5 to-transparent',
    iconBg: 'bg-info/10',
    iconColor: 'text-info',
    badge: 'New',
    badgeClass: 'bg-info/10 text-info border-info/20',
  },
];

function TypingIndicator() {
  return (
    <div className="flex flex-col items-center gap-4 py-16">
      <div className="relative">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center animate-float">
          <Sparkles className="w-7 h-7 text-primary" />
        </div>
        <div className="absolute -inset-2 rounded-3xl bg-primary/5 animate-glow-pulse" />
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-primary animate-typing-dot" />
        <div className="w-2 h-2 rounded-full bg-primary animate-typing-dot" style={{ animationDelay: '0.2s' }} />
        <div className="w-2 h-2 rounded-full bg-primary animate-typing-dot" style={{ animationDelay: '0.4s' }} />
      </div>
      <p className="text-sm text-muted-foreground">Analyzing your pantry…</p>
    </div>
  );
}

function MarkdownContent({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-2" />;

        if (trimmed.startsWith('### ')) return <h4 key={i} className="font-display font-bold text-base mt-4 mb-1">{trimmed.slice(4)}</h4>;
        if (trimmed.startsWith('## ')) return <h3 key={i} className="font-display font-bold text-lg mt-5 mb-1.5">{trimmed.slice(3)}</h3>;
        if (trimmed.startsWith('# ')) return <h2 key={i} className="font-display font-bold text-xl mt-6 mb-2">{trimmed.slice(2)}</h2>;

        const boldified = trimmed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-primary mt-0.5">•</span>
              <span dangerouslySetInnerHTML={{ __html: boldified.slice(2) }} />
            </div>
          );
        }

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
      <div className="space-y-4 animate-fade-in-scale">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="rounded-xl h-9 w-9 transition-transform duration-200 active:scale-90 hover:bg-muted"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg ${feat.iconBg} flex items-center justify-center`}>
              <feat.icon className={`w-4 h-4 ${feat.iconColor}`} />
            </div>
            <h1 className="text-lg font-display font-bold">{feat.title}</h1>
          </div>
          {loading && (
            <Badge variant="secondary" className="ml-auto gap-1.5 animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin" /> Thinking…
            </Badge>
          )}
        </div>

        {/* Content */}
        <Card className="border-border/50 overflow-hidden">
          <div className={`h-1 bg-gradient-to-r ${feat.gradient}`} />
          <CardContent className="p-4 pt-5">
            {result ? (
              <div className="animate-fade-in">
                <MarkdownContent content={result} />
              </div>
            ) : (
              <TypingIndicator />
            )}
          </CardContent>
        </Card>

        {/* Regenerate */}
        {!loading && result && (
          <Button
            onClick={() => runFeature(activeFeature)}
            variant="outline"
            className="w-full rounded-xl gap-2 transition-all duration-200 active:scale-[0.98] hover:shadow-sm"
          >
            <Sparkles className="w-4 h-4" /> Regenerate
          </Button>
        )}
      </div>
    );
  }

  // Feature selection view
  return (
    <div className="space-y-5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/15 via-accent/5 to-info/10 p-5 border border-primary/10 animate-fade-in-scale">
        <div className="relative z-10">
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center animate-float">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-display font-bold">AI Assistant</h1>
              <p className="text-xs text-muted-foreground">Powered by smart AI</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            Smart tools to manage your pantry, reduce waste, and plan meals effortlessly
          </p>
        </div>
        <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-primary/8 blur-2xl animate-glow-pulse" />
        <div className="absolute -left-4 -bottom-4 w-20 h-20 rounded-full bg-accent/10 blur-xl animate-glow-pulse" style={{ animationDelay: '1.5s' }} />
      </div>

      {/* Feature cards with staggered animation */}
      <div className="space-y-3">
        {features.map((feat, index) => (
          <Card
            key={feat.id}
            className="border-border/50 cursor-pointer hover:shadow-lg hover:border-border transition-all duration-300 active:scale-[0.97] overflow-hidden opacity-0 animate-stagger-in group"
            style={{ animationDelay: `${index * 100 + 150}ms` }}
            onClick={() => runFeature(feat.id)}
          >
            <CardContent className="p-0">
              <div className={`bg-gradient-to-r ${feat.gradient} p-4 relative`}>
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-xl ${feat.iconBg} flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110`}>
                    <feat.icon className={`w-5 h-5 ${feat.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="font-display font-bold text-sm">{feat.title}</h3>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 border ${feat.badgeClass}`}>
                        {feat.badge}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{feat.description}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/50 flex-shrink-0 transition-transform duration-300 group-hover:translate-x-1" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
