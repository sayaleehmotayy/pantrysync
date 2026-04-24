// Shared AI credit gate for all PantrySync edge functions.
// Charges credits BEFORE calling the AI gateway. Returns 402 if free tier or
// out of credits. Free tier always returns 402 (no AI ever).
//
// PROFIT-SAFE PRICING — every action priced so worst-case AI cost ≤ ~50% of
// revenue at the minimum top-up price (€0.033/credit). Formula:
//   credits = ceil(worst_case_cost × safety_multiplier(2) / €0.033)
// Then floored to the spec band: text 2–3, voice/chat 5–8, scans 10–15.
//
// Worst-case cost reference (Lovable AI Gateway max + 30% headroom):
//   cheap text  ≤ €0.0006   → 2 credits  (≥97% margin)
//   reasoning   ≤ €0.0030   → 5 credits  (≥98% margin)
//   image call  ≤ €0.0500   → 12 credits (~75% margin)
//   receipt+pro ≤ €0.0700   → 15 credits (~74% margin)
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export const AI_COST = {
  // Tier 1 — cheap text (Flash-Lite)
  parseShopping: 2,
  searchStores: 2,
  lookupBarcode: 2,
  // Tier 2 — reasoning (Flash)
  smartChatReply: 5,
  voiceCommand: 5,
  pantryAssistant: 5,
  // Tier 3 — image vision (Flash + image)
  extractCoupon: 12,
  scanProduct: 12,
  // Tier 4 — Pro + image (most expensive)
  scanReceiptPerPhoto: 15,
} as const;

/** Worst-case AI gateway cost per action (EUR). Used by ai_cost_log monitor. */
export const WORST_CASE_COST: Record<keyof typeof AI_COST, number> = {
  parseShopping: 0.0006,
  searchStores: 0.0006,
  lookupBarcode: 0.0006,
  smartChatReply: 0.0030,
  voiceCommand: 0.0030,
  pantryAssistant: 0.0030,
  extractCoupon: 0.0500,
  scanProduct: 0.0500,
  scanReceiptPerPhoto: 0.0700,
};

export interface CreditCheckResult {
  ok: boolean;
  status?: number;
  body?: Record<string, unknown>;
  remaining?: number;
  tier?: string;
  allowance?: number;
}

/**
 * Atomically consume `cost` AI credits for `userId`. Uses a service-role client
 * so the RPC is allowed to write. Returns ok=false with a ready-to-return
 * 402 body when the user is on free tier or out of credits.
 */
export async function chargeCredits(
  userId: string,
  cost: number,
): Promise<CreditCheckResult> {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    console.error("[aiCredits] SUPABASE_SERVICE_ROLE_KEY missing — cannot charge credits");
    return {
      ok: false,
      status: 500,
      body: { error: "Credit system not configured" },
    };
  }
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await admin.rpc("consume_ai_credits", {
    _user_id: userId,
    _cost: cost,
  });
  if (error) {
    console.error("[aiCredits] consume_ai_credits error:", error);
    return {
      ok: false,
      status: 500,
      body: { error: "Credit check failed" },
    };
  }
  // RPC returns SETOF; supabase-js gives an array.
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.success !== true) {
    const tier = row?.tier ?? "free";
    const remaining = row?.credits_remaining ?? 0;
    const allowance = row?.monthly_allowance ?? 0;
    if (tier === "free" || allowance === 0) {
      return {
        ok: false,
        status: 402,
        body: {
          error: "AI features are only available on paid plans. Upgrade to use this feature.",
          code: "free_tier_blocked",
          tier,
        },
      };
    }
    return {
      ok: false,
      status: 402,
      body: {
        error: `You've used all ${allowance} AI credits this month. They reset on the 1st, or upgrade your plan for more.`,
        code: "out_of_credits",
        tier,
        credits_remaining: remaining,
        monthly_allowance: allowance,
      },
    };
  }
  return {
    ok: true,
    remaining: row.credits_remaining,
    tier: row.tier,
    allowance: row.monthly_allowance,
  };
}
