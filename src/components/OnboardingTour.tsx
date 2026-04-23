import React, { useState } from 'react';
import { LayoutDashboard, Package, ShoppingCart, ChefHat, Receipt, Sparkles, MessageCircle, Tag, ChevronLeft, ChevronRight, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Slide {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  preview: React.ReactNode;
}

const SLIDES: Slide[] = [
  {
    icon: LayoutDashboard,
    title: 'Welcome to PantrySync',
    description: 'Your household pantry, shopping list and recipes — all synced across the family in real time.',
    preview: (
      <div className="space-y-2">
        <div className="rounded-xl bg-primary/10 p-3 border border-primary/20">
          <p className="text-xs text-muted-foreground">Today</p>
          <p className="font-display font-semibold">Hey there 👋</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-muted p-2"><p className="text-[10px] text-muted-foreground">Pantry</p><p className="font-bold">42 items</p></div>
          <div className="rounded-lg bg-muted p-2"><p className="text-[10px] text-muted-foreground">Shopping</p><p className="font-bold">8 to buy</p></div>
        </div>
      </div>
    ),
  },
  {
    icon: Package,
    title: 'Track your Pantry',
    description: 'Add items, set expiry dates and never lose track of what you already have at home.',
    preview: (
      <div className="space-y-1.5">
        {['Milk', 'Eggs', 'Pasta', 'Tomatoes'].map((item, i) => (
          <div key={item} className="flex items-center justify-between rounded-lg bg-muted px-3 py-2">
            <span className="text-sm font-medium">{item}</span>
            <span className="text-[10px] text-muted-foreground">expires in {i + 2}d</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: ShoppingCart,
    title: 'Shared Shopping List',
    description: 'Build a shopping list with your household. Tick things off as you shop — everyone stays in sync.',
    preview: (
      <div className="space-y-1.5">
        {[['Bread', false], ['Butter', true], ['Coffee', false]].map(([item, done]) => (
          <div key={String(item)} className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
            <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${done ? 'bg-primary border-primary' : 'border-muted-foreground/40'}`}>
              {done && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
            </div>
            <span className={`text-sm ${done ? 'line-through text-muted-foreground' : 'font-medium'}`}>{item}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: Receipt,
    title: 'Scan Receipts',
    description: 'Snap a photo of any receipt and we automatically log your spending and pantry items. (Premium AI feature)',
    preview: (
      <div className="rounded-xl border-2 border-dashed border-primary/40 p-4 text-center bg-primary/5">
        <Receipt className="w-8 h-8 mx-auto text-primary mb-2" />
        <p className="text-xs font-medium">Tap to scan a receipt</p>
        <p className="text-[10px] text-muted-foreground mt-1">Auto-extracts items & totals</p>
      </div>
    ),
  },
  {
    icon: ChefHat,
    title: 'Recipe Suggestions',
    description: 'Get recipe ideas based on what you already have in your pantry. Less waste, more meals.',
    preview: (
      <div className="space-y-2">
        <div className="rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 p-3 border border-primary/20">
          <p className="font-display font-semibold text-sm">Tomato Pasta</p>
          <p className="text-[10px] text-muted-foreground">Uses 4 items from your pantry</p>
        </div>
        <div className="rounded-lg bg-muted p-3">
          <p className="font-display font-semibold text-sm">Veggie Omelette</p>
          <p className="text-[10px] text-muted-foreground">Uses 3 items from your pantry</p>
        </div>
      </div>
    ),
  },
  {
    icon: MessageCircle,
    title: 'Household Chat',
    description: 'Chat with your household, leave notes, and ask the AI assistant to add items by voice or text.',
    preview: (
      <div className="space-y-1.5">
        <div className="flex justify-start"><div className="rounded-2xl rounded-bl-sm bg-muted px-3 py-1.5 text-xs max-w-[80%]">We need milk</div></div>
        <div className="flex justify-end"><div className="rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-3 py-1.5 text-xs max-w-[80%]">Added to shopping ✓</div></div>
      </div>
    ),
  },
  {
    icon: Tag,
    title: 'Coupons & Spending',
    description: 'Track spending over time and store digital coupons. Know exactly where your grocery money goes.',
    preview: (
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-muted p-3"><p className="text-[10px] text-muted-foreground">This month</p><p className="font-display font-bold">€247</p></div>
        <div className="rounded-lg bg-primary/10 p-3"><p className="text-[10px] text-muted-foreground">Coupons</p><p className="font-display font-bold text-primary">3 active</p></div>
      </div>
    ),
  },
  {
    icon: Sparkles,
    title: "You're all set!",
    description: "Start by adding a few items to your pantry, or invite your household from Settings. You can replay this tour anytime from Settings → How to use the app.",
    preview: (
      <div className="rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 p-6 text-center border border-primary/30">
        <Sparkles className="w-10 h-10 mx-auto text-primary mb-2" />
        <p className="font-display font-bold">Let's go!</p>
      </div>
    ),
  },
];

interface OnboardingTourProps {
  open: boolean;
  onClose: () => void;
}

export function OnboardingTour({ open, onClose }: OnboardingTourProps) {
  const [index, setIndex] = useState(0);
  const [touchStart, setTouchStart] = useState<number | null>(null);

  if (!open) return null;

  const slide = SLIDES[index];
  const Icon = slide.icon;
  const isLast = index === SLIDES.length - 1;
  const isFirst = index === 0;

  const next = () => {
    if (isLast) {
      onClose();
      setIndex(0);
    } else {
      setIndex(i => i + 1);
    }
  };
  const prev = () => !isFirst && setIndex(i => i - 1);

  const onTouchStart = (e: React.TouchEvent) => setTouchStart(e.touches[0].clientX);
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const diff = touchStart - e.changedTouches[0].clientX;
    if (diff > 50) next();
    else if (diff < -50) prev();
    setTouchStart(null);
  };

  const handleClose = () => {
    onClose();
    setIndex(0);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background/95 backdrop-blur-md flex flex-col" style={{
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    }}>
      <div className="flex items-center justify-between p-4">
        <span className="text-xs text-muted-foreground font-medium">{index + 1} / {SLIDES.length}</span>
        <button onClick={handleClose} className="p-2 rounded-lg hover:bg-muted transition-colors" aria-label="Skip onboarding">
          <X className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      <div
        className="flex-1 flex flex-col items-center justify-center px-6 overflow-hidden"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <div key={index} className="w-full max-w-sm animate-fade-in">
          <div className="rounded-3xl bg-card border-2 border-border/50 p-6 shadow-xl">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
              <Icon className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-2xl font-display font-bold mb-2">{slide.title}</h2>
            <p className="text-sm text-muted-foreground mb-6">{slide.description}</p>
            <div className="rounded-2xl bg-background/60 p-4 border border-border/50">
              {slide.preview}
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 pb-6 space-y-4">
        <div className="flex items-center justify-center gap-1.5">
          {SLIDES.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${i === index ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/30'}`}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="lg" onClick={prev} disabled={isFirst} className="flex-1">
            <ChevronLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <Button size="lg" onClick={next} className="flex-[2]">
            {isLast ? 'Get started' : 'Next'}
            {!isLast && <ChevronRight className="w-4 h-4 ml-1" />}
          </Button>
        </div>
      </div>
    </div>
  );
}
