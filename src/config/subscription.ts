// Subscription feature configuration for PantrySync

export const FREE_FEATURES = [
  { key: 'pantry', label: 'Pantry Tracking', description: 'Track all your pantry items' },
  { key: 'shopping', label: 'Shopping List', description: 'Create and manage shopping lists' },
  { key: 'expiry', label: 'Expiry Alerts', description: 'Get notified before items expire' },
] as const;

export const PRO_FEATURES = [
  { key: 'ai', label: 'AI Assistant', description: 'Smart pantry suggestions and meal planning' },
  { key: 'voice', label: 'Voice Commands', description: 'Hands-free pantry management' },
  { key: 'recipes', label: 'Recipe Suggestions', description: 'AI-powered recipes from your ingredients' },
  { key: 'receipts', label: 'Receipt Scanner', description: 'AI-powered receipt scanning with spending insights' },
  { key: 'coupons', label: 'Discount Code Scanner', description: 'Scan and store discount codes' },
  { key: 'chat', label: 'Group Chat', description: 'Chat with household members' },
  { key: 'analytics', label: 'Advanced Analytics', description: 'Detailed usage insights and reports' },
  { key: 'support', label: 'Priority Support', description: 'Get help faster when you need it' },
] as const;

export const PRO_GATED_ROUTES = ['/ai', '/recipes', '/coupons', '/chat', '/receipts'] as const;

export type TierKey = 'free' | 'duo' | 'family' | 'unlimited';

export interface TierConfig {
  key: TierKey;
  label: string;
  memberLimit: number | null; // null = unlimited
  monthly: { priceId: string; productId: string; price: string };
  yearly: { priceId: string; productId: string; price: string };
}

export const TIERS: Record<Exclude<TierKey, 'free'>, TierConfig> = {
  duo: {
    key: 'duo',
    label: 'Duo',
    memberLimit: 2,
    monthly: {
      priceId: 'price_1TL9BJAjA7ulr1iaMtf4tEQd',
      productId: 'prod_UJmkcGNlIWvfoh',
      price: '$4.99',
    },
    yearly: {
      priceId: 'price_1TLOC5AjA7ulr1iaKTx0JYLW',
      productId: 'prod_UK2GPSlm6dNKbC',
      price: '$39.99',
    },
  },
  family: {
    key: 'family',
    label: 'Family',
    memberLimit: 5,
    monthly: {
      priceId: 'price_1TLPc0AjA7ulr1iaR0FwLhvv',
      productId: 'prod_UK3jUbJSpStHEx',
      price: '$7.99',
    },
    yearly: {
      priceId: 'price_1TLPdIAjA7ulr1iaEPvH2o9Y',
      productId: 'prod_UK3k0gRfRqH9dl',
      price: '$63.99',
    },
  },
  unlimited: {
    key: 'unlimited',
    label: 'Unlimited',
    memberLimit: null,
    monthly: {
      priceId: 'price_1TLPcxAjA7ulr1iatcyMNX3K',
      productId: 'prod_UK3k6GQ1X2Phkl',
      price: '$9.99',
    },
    yearly: {
      priceId: 'price_1TLPdjAjA7ulr1iasVS8Yy2B',
      productId: 'prod_UK3l7pPFppJ6G2',
      price: '$79.99',
    },
  },
};

export const FREE_MEMBER_LIMIT = 1;
export const TRIAL_DAYS = 7;

/** All product IDs mapped to their tier */
export const PRODUCT_TO_TIER: Record<string, TierKey> = {};
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
  return PRO_FEATURES.some(f => f.key === routeOrKey) ||
    PRO_GATED_ROUTES.includes(routeOrKey as any);
}

// Legacy compat
export const STRIPE_CONFIG = {
  monthly: TIERS.duo.monthly,
  yearly: TIERS.duo.yearly,
  trialDays: TRIAL_DAYS,
};
