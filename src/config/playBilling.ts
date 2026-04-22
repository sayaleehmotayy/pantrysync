// Google Play Billing product IDs.
// These MUST exactly match the subscription product IDs created in Google Play Console.
// See docs/PLAY_BILLING_SETUP.md for setup instructions.

import type { TierKey } from './subscription';

export type PlayInterval = 'monthly' | 'yearly';
export type PaidTier = Exclude<TierKey, 'free'>;

export const PLAY_PRODUCT_IDS: Record<PaidTier, Record<PlayInterval, string>> = {
  duo: {
    monthly: 'duo_monthly',
    yearly: 'duo_yearly',
  },
  family: {
    monthly: 'family_monthly',
    yearly: 'family_yearly',
  },
  unlimited: {
    monthly: 'unlimited_monthly',
    yearly: 'unlimited_yearly',
  },
};

export const ALL_PLAY_PRODUCT_IDS: string[] = Object.values(PLAY_PRODUCT_IDS).flatMap((t) =>
  Object.values(t),
);

/** Reverse map: Play product ID -> tier */
export const PLAY_PRODUCT_TO_TIER: Record<string, PaidTier> = Object.entries(
  PLAY_PRODUCT_IDS,
).reduce<Record<string, PaidTier>>((acc, [tier, intervals]) => {
  for (const id of Object.values(intervals)) acc[id] = tier as PaidTier;
  return acc;
}, {});

/** Sentinel used as `subscription_cache.stripe_customer_id` for Play purchasers. */
export const PLAY_CUSTOMER_SENTINEL = 'google_play';
