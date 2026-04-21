import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

function toIsoDate(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * 1000).toISOString();
  }

  if (typeof value === "string") {
    const numericValue = Number(value);
    if (value.trim() !== "" && Number.isFinite(numericValue)) {
      return new Date(numericValue * 1000).toISOString();
    }

    const parsedDate = new Date(value);
    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate.toISOString();
    }
  }

  return null;
}

function getProductId(subscription: Stripe.Subscription): string | null {
  const product = subscription.items.data[0]?.price?.product;
  return typeof product === "string" ? product : product?.id ?? null;
}

function getPriceId(subscription: Stripe.Subscription): string | null {
  return subscription.items.data[0]?.price?.id ?? null;
}

function getSubscriptionEnd(subscription: Stripe.Subscription): string | null {
  // Stripe API 2025-08-27.basil moved current_period_end from the subscription
  // to each subscription item. Read item-level first, then fall back to legacy
  // top-level fields for older API versions.
  const item = subscription.items?.data?.[0] as any;
  const rawEnd = item?.current_period_end
    ?? (subscription as any).current_period_end
    ?? (subscription as any).trial_end
    ?? (subscription as any).ended_at;

  return toIsoDate(rawEnd);
}

interface SubscriptionResult {
  subscribed: boolean;
  product_id: string | null;
  subscription_end: string | null;
  trial: boolean;
  // Full Stripe objects for cache seeding
  _subscription?: Stripe.Subscription;
  _customerId?: string;
}

async function checkStripeSubscription(stripe: Stripe, email: string): Promise<SubscriptionResult | null> {
  const customers = await stripe.customers.list({ email, limit: 1 });
  if (customers.data.length === 0) return null;

  const customerId = customers.data[0].id;
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "all",
    limit: 10,
  });

  const subscription = subscriptions.data.find((sub) => sub.status === "active" || sub.status === "trialing");
  if (!subscription) return null;

  const productId = getProductId(subscription);
  const subscriptionEnd = getSubscriptionEnd(subscription);

  logStep("Subscription matched", {
    email,
    status: subscription.status,
    productId,
    subscriptionEnd,
  });

  return {
    subscribed: true,
    product_id: productId,
    subscription_end: subscriptionEnd,
    trial: subscription.status === "trialing",
    _subscription: subscription,
    _customerId: customerId,
  };
}

// Seed subscription_cache so the join_household_with_invite RPC has data
async function seedSubscriptionCache(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  sub: Stripe.Subscription,
  customerId: string,
) {
  const productId = getProductId(sub);
  const priceId = getPriceId(sub);
  const item = sub.items?.data?.[0] as any;
  const currentPeriodEnd = toIsoDate(item?.current_period_end ?? (sub as any).current_period_end);
  const trialEnd = toIsoDate((sub as any).trial_end);
  const cancelAtPeriodEnd = (sub as any).cancel_at_period_end ?? false;

  const { error } = await supabaseAdmin
    .from("subscription_cache")
    .upsert(
      {
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: sub.id,
        status: sub.status,
        product_id: productId,
        price_id: priceId,
        current_period_end: currentPeriodEnd,
        trial_end: trialEnd,
        cancel_at_period_end: cancelAtPeriodEnd,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (error) {
    logStep("Failed to seed subscription_cache", { error: error.message });
  } else {
    logStep("subscription_cache seeded successfully", { userId, productId });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      logStep("No authorization header — returning not subscribed");
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user?.email) {
      logStep("Auth failed — returning not subscribed", { error: userError?.message });
      return new Response(JSON.stringify({ subscribed: false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    const user = userData.user;
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Admin bypass — checked server-side only, never exposed in client bundle
    const ADMIN_EMAIL = Deno.env.get("ADMIN_EMAIL") || "pantrysync9@gmail.com";
    if (user.email === ADMIN_EMAIL) {
      logStep("Admin user detected — granting unlimited access");
      return new Response(JSON.stringify({
        subscribed: true,
        product_id: "admin",
        subscription_end: null,
        trial: false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // 1. Check if THIS user has a subscription
    const ownSub = await checkStripeSubscription(stripe, user.email);
    if (ownSub) {
      logStep("User has own subscription", {
        subscribed: ownSub.subscribed,
        product_id: ownSub.product_id,
        subscription_end: ownSub.subscription_end,
        trial: ownSub.trial,
      });

      // Seed the cache so the join RPC has data for member limits
      if (ownSub._subscription && ownSub._customerId) {
        // Fire and forget — don't block the response
        seedSubscriptionCache(supabaseClient, user.id, ownSub._subscription, ownSub._customerId);
      }

      return new Response(JSON.stringify({
        subscribed: ownSub.subscribed,
        product_id: ownSub.product_id,
        subscription_end: ownSub.subscription_end,
        trial: ownSub.trial,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 2. Check if ANY household member has a subscription (household-based Pro)
    const { data: membership } = await supabaseClient
      .from("household_members")
      .select("household_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (membership) {
      // Get all other members in the household
      const { data: allMembers } = await supabaseClient
        .from("household_members")
        .select("user_id")
        .eq("household_id", membership.household_id)
        .neq("user_id", user.id);

      if (allMembers && allMembers.length > 0) {
        for (const member of allMembers) {
          const { data: memberUser } = await supabaseClient.auth.admin.getUserById(member.user_id);
          const memberEmail = memberUser?.user?.email;

          if (memberEmail) {
            logStep("Checking household member subscription", { memberEmail });
            const memberSub = await checkStripeSubscription(stripe, memberEmail);
            if (memberSub) {
              logStep("Household member has subscription — granting access", {
                subscribed: memberSub.subscribed,
                product_id: memberSub.product_id,
              });

              // Seed cache for the subscribing member too
              if (memberSub._subscription && memberSub._customerId) {
                seedSubscriptionCache(supabaseClient, member.user_id, memberSub._subscription, memberSub._customerId);
              }

              return new Response(JSON.stringify({
                subscribed: memberSub.subscribed,
                product_id: memberSub.product_id,
                subscription_end: memberSub.subscription_end,
                trial: memberSub.trial,
                household_pro: true,
              }), {
                headers: { ...corsHeaders, "Content-Type": "application/json" },
                status: 200,
              });
            }
          }
        }
      }
    }

    logStep("No subscription found (user or household owner)");
    return new Response(JSON.stringify({ subscribed: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
