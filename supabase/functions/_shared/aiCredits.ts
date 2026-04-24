// Shared AI credit gate for all PantrySync edge functions.
// Charges credits BEFORE calling the AI gateway. Returns 402 if free tier or
// out of credits. Free tier always returns 402 (no AI ever).
//
// Cost reference (target ≥65% net margin):
//   1  = ultra-cheap text   (parse-shopping-items, search-stores, lookup-barcode AI fallback)
//   3  = text reasoning     (smart-chat-reply, voice-command, ai-pantry-assistant)
//   5  = single image       (extract-coupon, scan-product)
//  10  = receipt photo      (scan-receipt, charged per photo)
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export const AI_COST = {
  parseShopping: 1,
  searchStores: 1,
  lookupBarcode: 1,
  smartChatReply: 3,
  voiceCommand: 3,
  pantryAssistant: 3,
  extractCoupon: 10,    // bumped 5→10: image+vision call costs ~€0.037, needs 10 credits to stay profitable
  scanProduct: 10,      // bumped 5→10: same reason — image+vision call
  scanReceiptPerPhoto: 10,
} as const;

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
