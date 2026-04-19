import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Tier → price + member-limit mapping. Must mirror src/config/subscription.ts
const TIERS: Record<string, { monthly: string; yearly: string; memberLimit: number | null }> = {
  duo: {
    monthly: "price_1TO2myAjA7ulr1iap9Qrx9vP",
    yearly: "price_1TO2nQAjA7ulr1iafua2Ozq6",
    memberLimit: 2,
  },
  family: {
    monthly: "price_1TO2nmAjA7ulr1iaBedyATLN",
    yearly: "price_1TO2o8AjA7ulr1iap12N8hwi",
    memberLimit: 5,
  },
  unlimited: {
    monthly: "price_1TO2oRAjA7ulr1iaNFYWH0jA",
    yearly: "price_1TO2ohAjA7ulr1iaiWp60eLC",
    memberLimit: null,
  },
};

const log = (step: string, details?: any) => {
  console.log(`[CHANGE-SUBSCRIPTION] ${step}${details ? ' - ' + JSON.stringify(details) : ''}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Not authenticated");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData.user?.email) throw new Error("Authentication failed");
    const user = userData.user;

    const body = await req.json().catch(() => ({}));
    const tier = body?.tier as string | undefined;
    const interval = (body?.interval === "yearly" ? "yearly" : "monthly") as "monthly" | "yearly";

    if (!tier || !TIERS[tier]) {
      throw new Error(`Invalid tier: ${tier}`);
    }
    const targetPriceId = TIERS[tier][interval];
    const targetMemberLimit = TIERS[tier].memberLimit;

    log("Request", { email: user.email, tier, interval, targetPriceId });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Find customer
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    if (customers.data.length === 0) {
      return new Response(
        JSON.stringify({
          error: "NO_CUSTOMER",
          message: "No subscription found. Use checkout to start a subscription.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }
    const customerId = customers.data[0].id;

    // Find active/trialing sub
    const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 10 });
    const subscription = subs.data.find((s) => s.status === "active" || s.status === "trialing");
    if (!subscription) {
      return new Response(
        JSON.stringify({
          error: "NO_SUBSCRIPTION",
          message: "No active subscription to change. Start a new subscription instead.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
      );
    }

    const currentItem = subscription.items.data[0];
    if (!currentItem) throw new Error("Subscription has no items");

    if (currentItem.price.id === targetPriceId) {
      return new Response(
        JSON.stringify({
          error: "SAME_PLAN",
          message: "You are already on this plan.",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 }
      );
    }

    // ----- DOWNGRADE GUARD -----
    // If the new tier has a member limit, ensure no household this user owns
    // exceeds that limit. We check households where user is admin (creator).
    if (targetMemberLimit !== null) {
      const { data: ownedHouseholds } = await supabaseAdmin
        .from("households")
        .select("id, name")
        .eq("created_by", user.id);

      if (ownedHouseholds && ownedHouseholds.length > 0) {
        for (const hh of ownedHouseholds) {
          const { count } = await supabaseAdmin
            .from("household_members")
            .select("*", { count: "exact", head: true })
            .eq("household_id", hh.id);

          if (count !== null && count > targetMemberLimit) {
            log("Downgrade blocked", { household: hh.name, count, targetMemberLimit });
            return new Response(
              JSON.stringify({
                error: "DOWNGRADE_BLOCKED",
                message: `Your household "${hh.name}" has ${count} members. The ${tier.charAt(0).toUpperCase() + tier.slice(1)} plan only allows ${targetMemberLimit}. Please remove ${count - targetMemberLimit} member(s) before downgrading.`,
              }),
              { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 409 }
            );
          }
        }
      }
    }

    // ----- PERFORM SWAP -----
    // Stripe does not allow changing the currency of an existing subscription.
    // If the current sub uses a different currency than the target price, we
    // must cancel the old subscription and create a fresh one in the new
    // currency. Otherwise we do an in-place prorated swap.
    const currentCurrency = currentItem.price.currency?.toLowerCase();
    const targetPrice = await stripe.prices.retrieve(targetPriceId);
    const targetCurrency = targetPrice.currency?.toLowerCase();
    const currencyMismatch = currentCurrency && targetCurrency && currentCurrency !== targetCurrency;

    let updated: Stripe.Subscription;

    if (currencyMismatch) {
      log("Currency mismatch — routing through Checkout", { currentCurrency, targetCurrency });
      // Stripe can't switch currencies on an existing subscription, and the
      // legacy customer may have no payment method on file (trial sub). Cancel
      // the old sub and send the user to Checkout to enter a card and start
      // the new EUR subscription cleanly.
      await stripe.subscriptions.cancel(subscription.id, { prorate: false });

      const origin = req.headers.get("origin") || "http://localhost:3000";
      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        line_items: [{ price: targetPriceId, quantity: 1 }],
        mode: "subscription",
        success_url: `${origin}/settings?checkout=success`,
        cancel_url: `${origin}/plans?checkout=cancel`,
      });

      return new Response(
        JSON.stringify({ requiresCheckout: true, url: session.url, tier, interval }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    } else {
      const currentAmount = currentItem.price.unit_amount ?? 0;
      const targetAmount = targetPrice.unit_amount ?? 0;
      const isUpgrade = targetAmount > currentAmount;
      const isOnTrial = subscription.status === "trialing" || !!subscription.trial_end;

      // While on trial: swap the plan but PRESERVE the trial. No charge today.
      // When the trial ends, Stripe will invoice the NEW (target) price automatically.
      // Off trial: upgrade → invoice prorated diff now; downgrade → credit next invoice.
      const prorationBehavior: Stripe.SubscriptionUpdateParams.ProrationBehavior = isOnTrial
        ? "none"
        : isUpgrade
          ? "always_invoice"
          : "create_prorations";

      log("In-place swap", { isUpgrade, isOnTrial, prorationBehavior, currentAmount, targetAmount });

      const nowSec = Math.floor(Date.now() / 1000);
      const trialStillValid = isOnTrial && !!subscription.trial_end && subscription.trial_end > nowSec + 60;

      updated = await stripe.subscriptions.update(subscription.id, {
        items: [{ id: currentItem.id, price: targetPriceId }],
        proration_behavior: prorationBehavior,
        // Only re-send trial_end if it's actually still in the future
        trial_end: trialStillValid ? subscription.trial_end! : undefined,
        payment_behavior: !trialStillValid && isUpgrade ? "error_if_incomplete" : "default_incomplete",
      });
    }

    log("Subscription updated", { subId: updated.id, newPrice: targetPriceId, recreated: currencyMismatch });

    // Refresh subscription_cache so the join RPC sees the new product immediately
    const newProductId = typeof updated.items.data[0]?.price?.product === "string"
      ? updated.items.data[0].price.product
      : updated.items.data[0]?.price?.product?.id ?? null;
    const newPriceId = updated.items.data[0]?.price?.id ?? null;
    const cpe = (updated as any).current_period_end;
    const trialEnd = (updated as any).trial_end;

    await supabaseAdmin.from("subscription_cache").upsert(
      {
        user_id: user.id,
        stripe_customer_id: customerId,
        stripe_subscription_id: updated.id,
        status: updated.status,
        product_id: newProductId,
        price_id: newPriceId,
        current_period_end: cpe ? new Date(cpe * 1000).toISOString() : null,
        trial_end: trialEnd ? new Date(trialEnd * 1000).toISOString() : null,
        cancel_at_period_end: (updated as any).cancel_at_period_end ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    return new Response(
      JSON.stringify({
        success: true,
        tier,
        interval,
        productId: newProductId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("ERROR", { message });
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
