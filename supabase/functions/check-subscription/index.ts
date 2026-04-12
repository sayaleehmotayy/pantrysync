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

function getSubscriptionEnd(subscription: Stripe.Subscription): string | null {
  const rawEnd = (subscription as Stripe.Subscription & {
    current_period_end?: unknown;
    trial_end?: unknown;
    ended_at?: unknown;
  }).current_period_end
    ?? (subscription as Stripe.Subscription & { trial_end?: unknown }).trial_end
    ?? (subscription as Stripe.Subscription & { ended_at?: unknown }).ended_at;

  return toIsoDate(rawEnd);
}

async function checkStripeSubscription(stripe: Stripe, email: string) {
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
  };
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

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // 1. Check if THIS user has a subscription
    const ownSub = await checkStripeSubscription(stripe, user.email);
    if (ownSub) {
      logStep("User has own subscription", ownSub);
      return new Response(JSON.stringify(ownSub), {
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
              logStep("Household member has subscription — granting access", memberSub);
              return new Response(JSON.stringify({
                ...memberSub,
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
