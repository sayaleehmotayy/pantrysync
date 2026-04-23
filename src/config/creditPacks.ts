// Top-up credit packs sold via Google Play in-app products (consumables).
// Pricing targets ~88% gross margin after Google's 15% cut.
// IDs MUST match the in-app product IDs created in Google Play Console.

export interface CreditPack {
  id: string;          // Google Play product ID
  credits: number;
  price: string;       // fallback display price (live price comes from Play)
  badge?: string;      // optional ribbon label
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: 'credits_50',   credits: 50,   price: '€1.99' },
  { id: 'credits_150',  credits: 150,  price: '€4.99', badge: 'Best value' },
  { id: 'credits_400',  credits: 400,  price: '€11.99' },
  { id: 'credits_1000', credits: 1000, price: '€24.99' },
];

export const ALL_CREDIT_PACK_IDS = CREDIT_PACKS.map((p) => p.id);

/** Reverse lookup used by the verify edge function and client. */
export const CREDIT_PACK_BY_ID: Record<string, CreditPack> = CREDIT_PACKS.reduce(
  (acc, p) => ({ ...acc, [p.id]: p }),
  {},
);
