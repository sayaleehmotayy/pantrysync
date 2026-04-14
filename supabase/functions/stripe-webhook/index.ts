import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2025-08-27.basil",
  });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const signature = req.headers.get("stripe-signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

  if (!signature || !webhookSecret) {
    logStep("Missing signature or webhook secret");
    return new Response("Missing signature", { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    logStep("Signature verification failed", { error: (err as Error).message });
    return new Response("Invalid signature", { status: 400 });
  }

  logStep("Event received", { type: event.type, id: event.id });

  const relevantEvents = [
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "customer.subscription.trial_will_end",
  ];

  if (!relevantEvents.includes(event.type)) {
    logStep("Ignoring irrelevant event type");
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }

  const subscription = event.data.object as Stripe.Subscription;
  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;

  // Look up the customer email from Stripe
  const customer = await stripe.customers.retrieve(customerId);
  if (!customer || (customer as Stripe.DeletedCustomer).deleted) {
    logStep("Customer deleted or not found", { customerId });
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }

  const email = (customer as Stripe.Customer).email;
  if (!email) {
    logStep("Customer has no email", { customerId });
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }

  // Find Supabase user by email
  const { data: usersData, error: userErr } = await supabase.auth.admin.listUsers();
  if (userErr) {
    logStep("Failed to list users", { error: userErr.message });
    return new Response("Internal error", { status: 500 });
  }

  const user = usersData.users.find((u) => u.email === email);
  if (!user) {
    logStep("No Supabase user found for email", { email });
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }

  const userId = user.id;

  // Extract subscription details
  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.id ?? null;
  const product = item?.price?.product;
  const productId = typeof product === "string" ? product : product?.id ?? null;

  const currentPeriodEnd = typeof (subscription as any).current_period_end === "number"
    ? new Date((subscription as any).current_period_end * 1000).toISOString()
    : null;

  const trialEnd = typeof (subscription as any).trial_end === "number"
    ? new Date((subscription as any).trial_end * 1000).toISOString()
    : null;

  const cancelAtPeriodEnd = (subscription as any).cancel_at_period_end ?? false;

  // Map Stripe status
  let status = subscription.status; // active, trialing, canceled, past_due, unpaid, incomplete, etc.

  logStep("Upserting subscription_cache", {
    userId,
    email,
    status,
    productId,
    priceId,
    currentPeriodEnd,
    cancelAtPeriodEnd,
  });

  // Upsert into subscription_cache (using service role — bypasses RLS)
  const { error: upsertErr } = await supabase
    .from("subscription_cache")
    .upsert(
      {
        user_id: userId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscription.id,
        status,
        product_id: productId,
        price_id: priceId,
        current_period_end: currentPeriodEnd,
        trial_end: trialEnd,
        cancel_at_period_end: cancelAtPeriodEnd,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (upsertErr) {
    logStep("Upsert failed", { error: upsertErr.message });
    return new Response("DB error", { status: 500 });
  }

  logStep("subscription_cache updated successfully");
  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
