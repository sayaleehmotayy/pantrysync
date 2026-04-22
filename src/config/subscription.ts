// Subscription feature configuration for PantrySync
// All paid plans are billed in EUR. AI capabilities are bundled identically
// across Duo / Family / Unlimited — only the household member limit changes.

export const FREE_FEATURES = [
  { key: 'pantry', label: 'Basic pantry tracking' },
  { key: 'shopping', label: 'Basic shopping list' },
  { key: 'expiry', label: 'Expiry alerts' },
] as const;

/** Single AI value-prop block shown identically on every paid tier. */
export const AI_FEATURE_BLOCK = {
  title: 'AI-Powered Pantry System',
  tagline: 'Save time. Reduce waste. Spend smarter.',
  bullets: [
    'Voice-controlled pantry updates',
    'AI recipe suggestions from your ingredients',
    'Smart shopping & budget tracking',
    'Receipt & discount scanning',
    'Real-time household sync & chat',
  ],
} as const;

/** Locked teasers shown to Free users. */
export const LOCKED_TEASERS = [
  '🔒 Voice pantry updates',
  '🔒 AI recipes',
  '🔒 Receipt scanner',
  '🔒 Smart budget tracking',
] as const;

export const PRO_GATED_ROUTES = ['/ai', '/recipes', '/coupons', '/chat', '/receipts'] as const;

export type TierKey = 'free' | 'duo' | 'family' | 'unlimited';

export interface TierConfig {
  key: TierKey;
  label: string;
  memberLimit: number | null; // null = unlimited
  monthly: { priceId: string; productId: string; price: string; amount: number };
  yearly: { priceId: string; productId: string; price: string; amount: number };
}

export const CURRENCY_SYMBOL = '€';

export const TIERS: Record<Exclude<TierKey, 'free'>, TierConfig> = {
  duo: {
    key: 'duo',
    label: 'Duo',
    memberLimit: 2,
    monthly: {
      priceId: 'price_1TO2myAjA7ulr1iap9Qrx9vP',
      productId: 'prod_UMmLQfrU8s7K5Z',
      price: '€2.99',
      amount: 2.99,
    },
    yearly: {
      priceId: 'price_1TO2nQAjA7ulr1iafua2Ozq6',
      productId: 'prod_UMmMruDBeQbqq2',
      price: '€24.99',
      amount: 24.99,
    },
  },
  family: {
    key: 'family',
    label: 'Family',
    memberLimit: 5,
    monthly: {
      priceId: 'price_1TO2nmAjA7ulr1iaBedyATLN',
      productId: 'prod_UMmMPePoc6w4tV',
      price: '€4.99',
      amount: 4.99,
    },
    yearly: {
      priceId: 'price_1TO2o8AjA7ulr1iap12N8hwi',
      productId: 'prod_UMmMkbQrw4RvWk',
      price: '€44.99',
      amount: 44.99,
    },
  },
  unlimited: {
    key: 'unlimited',
    label: 'Unlimited',
    memberLimit: null,
    monthly: {
      priceId: 'price_1TO2oRAjA7ulr1iaNFYWH0jA',
      productId: 'prod_UMmNSMB08gx044',
      price: '€7.99',
      amount: 7.99,
    },
    yearly: {
      priceId: 'price_1TO2ohAjA7ulr1iaiWp60eLC',
      productId: 'prod_UMmN3UgAX6Nj4X',
      price: '€69.99',
      amount: 69.99,
    },
  },
};

export const FREE_MEMBER_LIMIT = 1;
export const TRIAL_DAYS = 7;

/** Legacy USD product IDs from the old single-tier "Pro" plan. Mapped so existing
 *  subscribers keep their access without re-checkout. */
export const LEGACY_PRODUCT_TO_TIER: Record<string, TierKey> = {
  // Old Duo (kept name, mapped to Duo)
  'prod_UJmkcGNlIWvfoh': 'duo',
  'prod_UK2GPSlm6dNKbC': 'duo',
  // Old Family
  'prod_UK3jUbJSpStHEx': 'family',
  'prod_UK3k0gRfRqH9dl': 'family',
  // Old Unlimited
  'prod_UK3k6GQ1X2Phkl': 'unlimited',
  'prod_UK3l7pPFppJ6G2': 'unlimited',
};

/** Google Play product IDs (Android billing) mapped to their tier. These match
 *  the IDs created in Google Play Console (see docs/PLAY_BILLING_SETUP.md). */
export const PLAY_PRODUCT_TO_TIER: Record<string, TierKey> = {
  duo_monthly: 'duo',
  duo_yearly: 'duo',
  family_monthly: 'family',
  family_yearly: 'family',
  unlimited_monthly: 'unlimited',
  unlimited_yearly: 'unlimited',
};

/** All product IDs (new EUR Stripe + legacy USD Stripe + Google Play) mapped to their tier */
export const PRODUCT_TO_TIER: Record<string, TierKey> = {
  ...LEGACY_PRODUCT_TO_TIER,
  ...PLAY_PRODUCT_TO_TIER,
};
for (const tier of Object.values(TIERS)) {
  PRODUCT_TO_TIER[tier.monthly.productId] = tier.key;
  PRODUCT_TO_TIER[tier.yearly.productId] = tier.key;
}

export function getTierByProductId(productId: string | null): TierKey {
  if (!productId) return 'free';
  if (productId === 'admin') return 'unlimited'; // admin bypass
  return PRODUCT_TO_TIER[productId] ?? 'free';
}

export function getMemberLimit(tier: TierKey): number | null {
  if (tier === 'free') return FREE_MEMBER_LIMIT;
  return TIERS[tier].memberLimit;
}

export function isProFeature(routeOrKey: string): boolean {
  return PRO_GATED_ROUTES.includes(routeOrKey as any);
}

/** Returns the smallest tier whose member limit is >= the given count, or
 *  'unlimited' if none. Used to suggest upgrade targets. */
export function suggestTierForMembers(memberCount: number): Exclude<TierKey, 'free'> {
  const order: Array<Exclude<TierKey, 'free'>> = ['duo', 'family', 'unlimited'];
  for (const key of order) {
    const limit = TIERS[key].memberLimit;
    if (limit === null || memberCount <= limit) return key;
  }
  return 'unlimited';
}

// Legacy compat — referenced by older imports
export const PRO_FEATURES = AI_FEATURE_BLOCK.bullets.map((label, i) => ({
  key: `ai-${i}`,
  label,
  description: '',
}));
export const STRIPE_CONFIG = {
  monthly: TIERS.duo.monthly,
  yearly: TIERS.duo.yearly,
  trialDays: TRIAL_DAYS,
};
