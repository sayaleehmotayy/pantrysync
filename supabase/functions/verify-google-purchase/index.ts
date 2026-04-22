// supabase/functions/verify-google-purchase/index.ts
//
// Verifies a Google Play subscription purchase token by calling the Google Play
// Developer API, acknowledges it if needed, and mirrors the entitlement into
// public.subscription_cache so the existing check-subscription / RLS flow grants Pro access.
//
// Inputs (JSON body):
//   { productId: string, purchaseToken: string, restore?: boolean }
//
// Required runtime secrets:
//   - SUPABASE_URL
//   - SUPABASE_SERVICE_ROLE_KEY
//   - GOOGLE_PLAY_PACKAGE_NAME           (e.g. "com.pantrysync.app")
//   - GOOGLE_PLAY_SERVICE_ACCOUNT_JSON   (full JSON of the service account)

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const PLAY_CUSTOMER_SENTINEL = "google_play";

const log = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[VERIFY-GOOGLE-PURCHASE] ${step}${detailsStr}`);
};

// ────────────────────────────────────────────────────────────────────────────
// Google OAuth: exchange a service-account key for an access token.
// We sign a JWT (RS256) with the SA private key and POST it to Google's token URL.
// ────────────────────────────────────────────────────────────────────────────

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

// ────────────────────────────────────────────────────────────────────────────
// Main handler
// ────────────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    // 1. Authenticate caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData.user) throw new Error("Invalid auth");
    const userId = userData.user.id;

    // 2. Validate input
    const body = await req.json().catch(() => ({}));
    const productId: string | undefined = body?.productId;
    const purchaseToken: string | undefined = body?.purchaseToken;
    const isRestore: boolean = !!body?.restore;
    if (!productId || !purchaseToken) {
      return new Response(JSON.stringify({ ok: false, message: "Missing productId or purchaseToken" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Load Google credentials
    const packageName = Deno.env.get("GOOGLE_PLAY_PACKAGE_NAME");
    const saJson = Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
    if (!packageName || !saJson) {
      throw new Error("GOOGLE_PLAY_PACKAGE_NAME or GOOGLE_PLAY_SERVICE_ACCOUNT_JSON not configured");
    }
    const sa: ServiceAccount = JSON.parse(saJson);

    // 4. Ask Google for the subscription state
    const accessToken = await getAccessToken(sa);
    const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(packageName)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}`;
    const playRes = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!playRes.ok) {
      const text = await playRes.text();
      log("Google API rejected token", { status: playRes.status, body: text.slice(0, 500) });
      return new Response(JSON.stringify({ ok: false, message: `Google rejected purchase: ${playRes.status}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sub = await playRes.json();
    log("Google subscription state", {
      paymentState: sub.paymentState,
      acknowledgementState: sub.acknowledgementState,
      expiryTimeMillis: sub.expiryTimeMillis,
      autoRenewing: sub.autoRenewing,
    });

    // 5. Decide if active. paymentState: 0=pending, 1=received, 2=free trial, 3=pending deferred upgrade
    const expiryMs = Number(sub.expiryTimeMillis ?? 0);
    const now = Date.now();
    const paymentState = Number(sub.paymentState ?? -1);
    const isPending = paymentState === 0;
    const isActive = expiryMs > now && (paymentState === 1 || paymentState === 2 || paymentState === 3);
    const isTrial = paymentState === 2;

    if (isPending) {
      return new Response(JSON.stringify({ ok: false, pending: true, message: "Purchase is pending — please complete payment." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!isActive) {
      // Mirror an inactive state so cache doesn't grant access
      await supabaseAdmin
        .from("subscription_cache")
        .upsert({
          user_id: userId,
          stripe_customer_id: PLAY_CUSTOMER_SENTINEL,
          stripe_subscription_id: purchaseToken.slice(0, 64),
          status: "inactive",
          product_id: productId,
          price_id: productId,
          current_period_end: expiryMs ? new Date(expiryMs).toISOString() : null,
          trial_end: null,
          cancel_at_period_end: !sub.autoRenewing,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
      return new Response(JSON.stringify({ ok: false, message: "Subscription is not active." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 6. Acknowledge if not yet acknowledged (required by Play within 3 days)
    if (Number(sub.acknowledgementState) === 0 && !isRestore) {
      const ackUrl = `${url}:acknowledge`;
      const ackRes = await fetch(ackUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ developerPayload: userId }),
      });
      if (!ackRes.ok) {
        const text = await ackRes.text();
        log("Acknowledge failed (continuing)", { status: ackRes.status, body: text.slice(0, 300) });
      } else {
        log("Acknowledged purchase");
      }
    }

    // 7. Mirror into subscription_cache so check-subscription / household RLS work unchanged
    const upsertRes = await supabaseAdmin
      .from("subscription_cache")
      .upsert({
        user_id: userId,
        stripe_customer_id: PLAY_CUSTOMER_SENTINEL,
        stripe_subscription_id: purchaseToken.slice(0, 64),
        status: isTrial ? "trialing" : "active",
        product_id: productId,
        price_id: productId,
        current_period_end: new Date(expiryMs).toISOString(),
        trial_end: isTrial ? new Date(expiryMs).toISOString() : null,
        cancel_at_period_end: !sub.autoRenewing,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    if (upsertRes.error) {
      log("subscription_cache upsert failed", { error: upsertRes.error.message });
    }

    return new Response(JSON.stringify({
      ok: true,
      active: true,
      productId,
      trial: isTrial,
      expiresAt: new Date(expiryMs).toISOString(),
      autoRenewing: !!sub.autoRenewing,
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
