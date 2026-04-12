// Subscription feature configuration for PantrySync

export const FREE_FEATURES = [
  { key: 'pantry', label: 'Pantry Tracking', description: 'Track all your pantry items' },
  { key: 'shopping', label: 'Shopping List', description: 'Create and manage shopping lists' },
  { key: 'expiry', label: 'Expiry Alerts', description: 'Get notified before items expire' },
  { key: 'household', label: '1 Household', description: 'Manage one household' },
] as const;

export const PRO_FEATURES = [
  { key: 'ai', label: 'AI Assistant', description: 'Smart pantry suggestions and meal planning' },
  { key: 'voice', label: 'Voice Commands', description: 'Hands-free pantry management' },
  { key: 'recipes', label: 'Recipe Suggestions', description: 'AI-powered recipes from your ingredients' },
  { key: 'coupons', label: 'Discount Code Scanner', description: 'Scan and store discount codes' },
  { key: 'chat', label: 'Group Chat', description: 'Chat with household members' },
  { key: 'analytics', label: 'Advanced Analytics', description: 'Detailed usage insights and reports' },
  { key: 'support', label: 'Priority Support', description: 'Get help faster when you need it' },
  { key: 'unlimited_households', label: 'Unlimited Households', description: 'Create and join multiple households' },
] as const;

export const PRO_GATED_ROUTES = ['/ai', '/recipes', '/coupons', '/chat'] as const;

export const STRIPE_CONFIG = {
  monthly: {
    priceId: 'price_1TL9BJAjA7ulr1iaMtf4tEQd',
    productId: 'prod_UJmkcGNlIWvfoh',
    price: '$4.99',
    interval: 'month' as const,
  },
  yearly: {
    priceId: 'price_1TLOC5AjA7ulr1iaKTx0JYLW',
    productId: 'prod_UK2GPSlm6dNKbC',
    price: '$39.99',
    interval: 'year' as const,
  },
  trialDays: 7,
};

export function isProFeature(routeOrKey: string): boolean {
  return PRO_FEATURES.some(f => f.key === routeOrKey) ||
    PRO_GATED_ROUTES.includes(routeOrKey as any);
}
