// Top-up credit packs sold via Google Play in-app products (consumables).
// PROFIT-SAFE PRICING — every pack maintains ≥ €0.033 per credit (the minimum
// price floor) so even at the worst per-credit AI cost we keep ≥ 30% margin.
// Smaller packs carry richer margins to fund subsidised heavy users.
//
// IDs MUST match the in-app product IDs created in Google Play Console.

export interface CreditPack {
  id: string;          // Google Play product ID
  credits: number;
  price: string;       // fallback display price (live price comes from Play)
  badge?: string;      // optional ribbon label
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: 'credits_50',   credits: 50,   price: '€2.49' },                      // €0.0498/cr  (~90% margin)
  { id: 'credits_150',  credits: 150,  price: '€5.99', badge: 'Best value' }, // €0.0399/cr  (~88% margin)
  { id: 'credits_400',  credits: 400,  price: '€13.99' },                     // €0.0350/cr  (~86% margin)
  { id: 'credits_1000', credits: 1000, price: '€32.99' },                     // €0.0330/cr  (~85% margin)
];

export const ALL_CREDIT_PACK_IDS = CREDIT_PACKS.map((p) => p.id);

/** Minimum price-per-credit floor enforced across the system (EUR). */
export const MIN_PRICE_PER_CREDIT_EUR = 0.033;

/** Reverse lookup used by the verify edge function and client. */
export const CREDIT_PACK_BY_ID: Record<string, CreditPack> = CREDIT_PACKS.reduce(
  (acc, p) => ({ ...acc, [p.id]: p }),
  {},
);
