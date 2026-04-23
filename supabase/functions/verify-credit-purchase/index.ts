// supabase/functions/verify-credit-purchase/index.ts
//
// Verifies a Google Play **one-time product** (consumable credit pack) purchase
// token and grants bonus AI credits to the calling user via grant_purchased_credits.
//
// Inputs (JSON body):  { productId: string, purchaseToken: string }
//
// Required runtime secrets:
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//   - GOOGLE_PLAY_PACKAGE_NAME
//   - GOOGLE_PLAY_SERVICE_ACCOUNT_JSON

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Mirror src/config/creditPacks.ts — kept here to avoid cross-import.
const CREDITS_FOR_PRODUCT: Record<string, number> = {
  credits_50: 50,
  credits_150: 150,
  credits_400: 400,
  credits_1000: 1000,
};

const log = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[VERIFY-CREDIT-PURCHASE] ${step}${d}`);
};

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const cleaned = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(cleaned);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/androidpublisher",
    aud: sa.token_uri || "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const encoder = new TextEncoder();
  const headerB64 = base64UrlEncode(encoder.encode(JSON.stringify(header)));
  const claimsB64 = base64UrlEncode(encoder.encode(JSON.stringify(claims)));
  const signingInput = `${headerB64}.${claimsB64}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(signingInput),
  );
  const jwt = `${signingInput}.${base64UrlEncode(new Uint8Array(sigBuf))}`;
  const resp = await fetch(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Google token exchange failed: ${resp.status} ${text}`);
  }
  const json = await resp.json();
  return json.access_token as string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    // 1. Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");
    const userToken = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(userToken);
    if (userErr || !userData.user) throw new Error("Invalid auth");
    const userId = userData.user.id;

    // 2. Validate input
    const body = await req.json().catch(() => ({}));
    const productId: string | undefined = body?.productId;
    const purchaseToken: string | undefined = body?.purchaseToken;
    if (!productId || !purchaseToken) {
      return new Response(JSON.stringify({ ok: false, message: "Missing productId or purchaseToken" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const credits = CREDITS_FOR_PRODUCT[productId];
    if (!credits) {
      return new Response(JSON.stringify({ ok: false, message: `Unknown product ${productId}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Google credentials
    const packageName = Deno.env.get("GOOGLE_PLAY_PACKAGE_NAME");
    const saJson = Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
    if (!packageName || !saJson) {
      throw new Error("GOOGLE_PLAY_PACKAGE_NAME or GOOGLE_PLAY_SERVICE_ACCOUNT_JSON not configured");
    }
    const sa: ServiceAccount = JSON.parse(saJson);

    // 4. Validate the one-time product purchase via Play Developer API
    const accessToken = await getAccessToken(sa);
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/products/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;
    const playRes = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!playRes.ok) {
      const text = await playRes.text();
      log("Google rejected purchase token", { status: playRes.status, body: text.slice(0, 500) });
      return new Response(JSON.stringify({ ok: false, message: `Google rejected purchase: ${playRes.status}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const purchase = await playRes.json();
    log("Play product purchase state", {
      purchaseState: purchase.purchaseState,
      consumptionState: purchase.consumptionState,
      acknowledgementState: purchase.acknowledgementState,
      orderId: purchase.orderId,
    });

    // purchaseState: 0=Purchased, 1=Canceled, 2=Pending
    const state = Number(purchase.purchaseState ?? -1);
    if (state === 2) {
      return new Response(JSON.stringify({ ok: false, pending: true, message: "Purchase pending — please complete payment." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (state !== 0) {
      return new Response(JSON.stringify({ ok: false, message: "Purchase not in a valid state." }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Grant credits (idempotent on purchase_token)
    const { data: grantData, error: grantErr } = await supabaseAdmin.rpc("grant_purchased_credits", {
      _user_id: userId,
      _product_id: productId,
      _credits: credits,
      _purchase_token: purchaseToken,
      _order_id: purchase.orderId ?? null,
      _price_micros: purchase.priceAmountMicros ? Number(purchase.priceAmountMicros) : null,
      _price_currency: purchase.priceCurrencyCode ?? null,
    });
    if (grantErr) {
      log("grant_purchased_credits failed", { error: grantErr.message });
      throw new Error(grantErr.message);
    }

    // 6. Acknowledge + consume so Google lets the user buy again
    const ackRes = await fetch(`${url}:acknowledge`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ developerPayload: userId }),
    });
    if (!ackRes.ok && ackRes.status !== 400) {
      // 400 typically means "already acknowledged" — safe to ignore
      const t = await ackRes.text();
      log("Acknowledge failed (continuing)", { status: ackRes.status, body: t.slice(0, 200) });
    }
    const consumeRes = await fetch(`${url}:consume`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!consumeRes.ok && consumeRes.status !== 400) {
      const t = await consumeRes.text();
      log("Consume failed (continuing)", { status: consumeRes.status, body: t.slice(0, 200) });
    }

    return new Response(JSON.stringify({
      ok: true,
      creditsGranted: credits,
      bonusCredits: grantData?.[0]?.bonus_credits ?? null,
      expiresAt: grantData?.[0]?.expires_at ?? null,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log("ERROR", { message });
    return new Response(JSON.stringify({ ok: false, message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
