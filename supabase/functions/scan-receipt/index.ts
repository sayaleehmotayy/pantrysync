import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { chargeCredits, AI_COST, logAiCost } from "../_shared/aiCredits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Process a single photo against the AI
async function processOnePhoto(
  imageBase64: string,
  existingItems: any[],
  lovableApiKey: string,
  userId: string,
): Promise<{ items: any[]; coupon_codes: any[]; store_name: string | null; receipt_date: string | null; total_amount: number | null; currency: string }> {
  const existingItemsContext = existingItems.length > 0
    ? `\n\nITEMS ALREADY EXTRACTED FROM PREVIOUS PHOTOS OF THIS RECEIPT (DO NOT include these again, only extract NEW items not in this list):\n${existingItems.map((i: any) => `- ${i.name} (${i.quantity} ${i.unit}, $${i.total_price})`).join('\n')}`
    : '';

  const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: `You are a receipt scanning AI that extracts ONLY grocery/shopping item data. Be precise with prices and quantities. DO NOT extract coupon or discount codes — coupons are handled by a separate dedicated scanner.

CRITICAL PRIVACY & SECURITY RULES — FOLLOW THESE EXACTLY:
- NEVER extract, return, or acknowledge any payment information (card numbers, last 4 digits, bank details, account numbers, payment method, authorization codes, transaction IDs, terminal IDs, merchant IDs)
- NEVER extract personal information (customer name, phone number, email, loyalty card numbers, membership IDs, addresses)
- NEVER extract employee information (employee card numbers, employee IDs, staff numbers, employee names, employee discount card numbers, staff discount references)
- NEVER extract any financial data beyond individual item prices and the receipt total
- IGNORE all text on the receipt that is not: store name, date, item names, item quantities, item prices, subtotal/total, currency, or coupon/promo codes
- If you see employee discounts, staff discounts, or similar — completely ignore them. Do NOT return the discount amount, employee ID, or any reference to it.
- If you see any sensitive data, DO NOT include it in your response under any circumstances

EXTRACTION RULES:
- For categories, use: Fruits, Vegetables, Dairy, Grains, Snacks, Drinks, Meat, Seafood, Bakery, Frozen, Household, Personal Care, Spices, Other
- For units, infer from context: pieces (default for most items), kg, g, l, ml, lb, oz
- If a quantity isn't clear, default to 1
- Extract ONLY the store name (brand/company name only, no address), date, and total
- Currency should be the 3-letter ISO code (USD, EUR, GBP, etc)
- Clean up item names to be human-readable (e.g., "BNL BNNA" → "Banana")

DO NOT extract coupons, promo codes, discount codes, vouchers, or any promotional offers — these are explicitly out of scope for this scanner.

MULTI-PHOTO DEDUPLICATION:
- This may be one photo of a multi-photo scan of a long receipt
- If items have already been extracted from previous photos, they will be listed below
- ONLY extract items that are NEW and not already in the existing list
- If you see overlapping items from a previous photo, SKIP them${existingItemsContext}`,
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract ONLY NEW grocery/shopping items (skip any already extracted), their prices, store name, date, and total from this receipt section. DO NOT extract coupons, promo codes, payment details, card numbers, personal info, or sensitive data." },
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } },
          ],
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "extract_receipt_data",
            description: "Extract structured receipt data from the image",
            parameters: {
              type: "object",
              properties: {
                store_name: { type: "string", description: "Name of the store" },
                receipt_date: { type: "string", description: "Date on receipt in YYYY-MM-DD format" },
                currency: { type: "string", description: "Currency code (USD, EUR, etc)" },
                total_amount: { type: "number", description: "Total amount on the receipt" },
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      quantity: { type: "number" },
                      unit: { type: "string" },
                      unit_price: { type: "number" },
                      total_price: { type: "number" },
                      category: { type: "string" },
                    },
                    required: ["name", "total_price", "category"],
                  },
                },
              
              },
              required: ["items"],
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "extract_receipt_data" } },
    }),
  });

  if (!aiResponse.ok) {
    const text = await aiResponse.text();
    console.error("[SCAN-RECEIPT] AI error:", aiResponse.status, text);
    throw new Error(`AI processing failed (${aiResponse.status})`);
  }

  const aiData = await aiResponse.json();
  logAiCost({
    userId,
    feature: "scan-receipt",
    creditsCharged: AI_COST.scanReceiptPerPhoto,
    model: "google/gemini-2.5-flash",
    usage: aiData.usage,
    hasImageInput: true,
  });
  const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) throw new Error("AI did not return structured data");

  const receiptData = JSON.parse(toolCall.function.arguments);

  // Sanitize
  const sensitivePatterns = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b|\b\d{4}\s?[*]{4,}\b|card|visa|mastercard|debit|credit|account\s*#|employee\s*(id|#|number|card|discount)|staff\s*(id|#|number|card|discount)|member(ship)?\s*(id|#|number)/i;

  let storeName = typeof receiptData.store_name === 'string' ? receiptData.store_name.substring(0, 100) : null;
  if (storeName && sensitivePatterns.test(storeName)) storeName = null;

  const items = (Array.isArray(receiptData.items) ? receiptData.items : [])
    .map((item: any) => ({
      name: typeof item.name === 'string' ? item.name.substring(0, 200) : 'Unknown Item',
      quantity: typeof item.quantity === 'number' ? item.quantity : 1,
      unit: typeof item.unit === 'string' ? item.unit.substring(0, 20) : 'pieces',
      unit_price: typeof item.unit_price === 'number' ? item.unit_price : null,
      total_price: typeof item.total_price === 'number' ? item.total_price : null,
      category: typeof item.category === 'string' ? item.category.substring(0, 50) : 'Other',
    }))
    .filter((item: any) => !sensitivePatterns.test(item.name));

  return {
    items,
    coupon_codes: [],
    store_name: storeName,
    receipt_date: typeof receiptData.receipt_date === 'string' ? receiptData.receipt_date.substring(0, 10) : null,
    total_amount: typeof receiptData.total_amount === 'number' ? receiptData.total_amount : null,
    currency: typeof receiptData.currency === 'string' ? receiptData.currency.substring(0, 3) : 'USD',
  };
}

// Background processor — processes all photos and updates DB
async function processInBackground(
  receiptId: string,
  images: string[],
  householdId: string,
  userId: string,
  lovableApiKey: string
) {
  const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // Update status to processing
    await adminClient.from('receipt_scans').update({ status: 'processing' }).eq('id', receiptId);

    let allItems: any[] = [];
    let storeName: string | null = null;
    let receiptDate: string | null = null;
    let totalAmount: number | null = null;
    let currency = 'USD';

    for (let i = 0; i < images.length; i++) {
      console.log(`[SCAN-RECEIPT] Processing photo ${i + 1}/${images.length} for receipt ${receiptId}`);
      const result = await processOnePhoto(images[i], allItems, lovableApiKey, userId);

      // Deduplicate items
      const existingNames = new Set(allItems.map(it => it.name.toLowerCase()));
      const newItems = result.items.filter((it: any) => !existingNames.has(it.name.toLowerCase()));
      allItems = [...allItems, ...newItems];

      // Take first non-null metadata
      if (result.store_name && !storeName) storeName = result.store_name;
      if (result.receipt_date && !receiptDate) receiptDate = result.receipt_date;
      if (result.total_amount) totalAmount = result.total_amount;
      if (result.currency) currency = result.currency;
    }

    // Save results to DB (coupon_codes intentionally always empty — handled by dedicated coupon scanner)
    await adminClient.from('receipt_scans').update({
      status: 'completed',
      store_name: storeName,
      receipt_date: receiptDate,
      total_amount: totalAmount,
      currency,
      processing_result: { items: allItems, coupon_codes: [] },
    }).eq('id', receiptId);

    // Save receipt items
    if (allItems.length > 0) {
      await adminClient.from('receipt_items').insert(
        allItems.map(item => ({
          receipt_id: receiptId,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
          total_price: item.total_price,
          category: item.category,
        }))
      );
    }

    console.log(`[SCAN-RECEIPT] Completed receipt ${receiptId}: ${allItems.length} items`);
  } catch (error) {
    console.error(`[SCAN-RECEIPT] Failed receipt ${receiptId}:`, error);
    await adminClient.from('receipt_scans').update({
      status: 'failed',
      error_message: error instanceof Error ? error.message : 'Unknown error',
    }).eq('id', receiptId);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await adminClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Not authenticated");

    const userId = userData.user.id;

    const { images, household_id } = await req.json();
    if (!Array.isArray(images) || images.length === 0 || !household_id) {
      throw new Error("Missing images array or household_id");
    }

    // CRITICAL: Verify the caller is actually a member of this household
    const { data: membership, error: memberError } = await adminClient
      .from('household_members')
      .select('id')
      .eq('household_id', household_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (memberError || !membership) {
      console.error("[SCAN-RECEIPT] Unauthorized household access attempt", { userId, household_id });
      return new Response(
        JSON.stringify({ error: "You are not a member of this household" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    // Charge AI credits up-front for ALL photos. Refuses if free tier or
    // insufficient credits — protects margin since each photo runs vision AI.
    const credit = await chargeCredits(userId, AI_COST.scanReceiptPerPhoto * images.length);
    if (!credit.ok) {
      return new Response(JSON.stringify(credit.body), {
        status: credit.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[SCAN-RECEIPT] Received ${images.length} photos for household ${household_id}`);

    const { data: scan, error: scanError } = await adminClient
      .from('receipt_scans')
      .insert({
        household_id,
        scanned_by: userId,
        status: 'pending',
        photo_count: images.length,
      })
      .select('id')
      .single();

    if (scanError) throw scanError;

    // Dispatch background processing
    EdgeRuntime.waitUntil(
      processInBackground(scan.id, images, household_id, userId, LOVABLE_API_KEY)
    );

    // Return immediately with receipt ID for polling
    return new Response(
      JSON.stringify({ receipt_id: scan.id, status: 'pending', photo_count: images.length }),
      { status: 202, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[SCAN-RECEIPT] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});