import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// EUR price IDs — must match src/config/subscription.ts
const PRICE_MAP: Record<string, Record<string, string>> = {
  duo: {
    monthly: "price_1TO2myAjA7ulr1iap9Qrx9vP",
    yearly: "price_1TO2nQAjA7ulr1iafua2Ozq6",
  },
  family: {
    monthly: "price_1TO2nmAjA7ulr1iaBedyATLN",
    yearly: "price_1TO2o8AjA7ulr1iap12N8hwi",
  },
  unlimited: {
    monthly: "price_1TO2oRAjA7ulr1iaNFYWH0jA",
    yearly: "price_1TO2ohAjA7ulr1iaiWp60eLC",
  },
};

const log = (step: string, details?: any) => {
  console.log(`[CREATE-CHECKOUT] ${step}${details ? ' - ' + JSON.stringify(details) : ''}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");

    let tier = "duo";
    let interval = "monthly";
    let withTrial = false; // default: NO trial unless explicitly requested
    try {
      const body = await req.json();
      if (body?.tier && PRICE_MAP[body.tier]) tier = body.tier;
      if (body?.interval === "yearly" || body?.plan === "yearly") interval = "yearly";
      if (body?.withTrial === true) withTrial = true;
    } catch {
      // defaults
    }

    const priceId = PRICE_MAP[tier]?.[interval];
    if (!priceId) throw new Error(`Invalid tier/interval: ${tier}/${interval}`);

    log("Starting checkout", { email: user.email, tier, interval, withTrial });

    const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;

      // If customer already has an active/trialing sub, redirect them to portal/plans instead.
      const existing = await stripe.subscriptions.list({
        customer: customerId,
        status: "all",
        limit: 10,
      });
      const active = existing.data.find((s) => s.status === "active" || s.status === "trialing");
      if (active) {
        log("Customer already subscribed — refusing checkout", { subId: active.id, status: active.status });
        return new Response(
          JSON.stringify({
            error: "ALREADY_SUBSCRIBED",
            message: "You already have an active subscription. Use 'Change plan' to switch tiers.",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 }
        );
      }
    }

    const origin = req.headers.get("origin") || "http://localhost:3000";

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${origin}/settings?checkout=success`,
      cancel_url: `${origin}/plans?checkout=cancel`,
    };

    if (withTrial) {
      sessionParams.subscription_data = { trial_period_days: 7 };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("ERROR", { message });
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
