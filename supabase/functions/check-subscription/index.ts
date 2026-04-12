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

async function checkStripeSubscription(stripe: Stripe, email: string) {
  const customers = await stripe.customers.list({ email, limit: 1 });
  if (customers.data.length === 0) return null;

  const customerId = customers.data[0].id;
  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "active",
    limit: 1,
  });

  if (subscriptions.data.length === 0) {
    // Check for trialing subscriptions too
    const trialSubs = await stripe.subscriptions.list({
      customer: customerId,
      status: "trialing",
      limit: 1,
    });
    if (trialSubs.data.length === 0) return null;
    const sub = trialSubs.data[0];
    return {
      subscribed: true,
      product_id: sub.items.data[0].price.product as string,
      subscription_end: new Date(sub.current_period_end * 1000).toISOString(),
      trial: true,
    };
  }

  const sub = subscriptions.data[0];
  return {
    subscribed: true,
    product_id: sub.items.data[0].price.product as string,
    subscription_end: new Date(sub.current_period_end * 1000).toISOString(),
    trial: false,
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
    if (!authHeader) throw new Error("No authorization header provided");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
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

    // 2. Check if the household OWNER has a subscription (household-based Pro)
    const { data: membership } = await supabaseClient
      .from("household_members")
      .select("household_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();

    if (membership) {
      // Find the household owner (admin)
      const { data: adminMember } = await supabaseClient
        .from("household_members")
        .select("user_id")
        .eq("household_id", membership.household_id)
        .eq("role", "admin")
        .limit(1)
        .maybeSingle();

      if (adminMember && adminMember.user_id !== user.id) {
        // Get admin's email from profiles or auth
        const { data: adminUser } = await supabaseClient.auth.admin.getUserById(adminMember.user_id);
        const adminEmail = adminUser?.user?.email;

        if (adminEmail) {
          logStep("Checking household owner subscription", { adminEmail });
          const ownerSub = await checkStripeSubscription(stripe, adminEmail);
          if (ownerSub) {
            logStep("Household owner has subscription — granting access", ownerSub);
            return new Response(JSON.stringify({
              ...ownerSub,
              household_pro: true,
            }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
              status: 200,
            });
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
