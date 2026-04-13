import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user) throw new Error("Not authenticated");

    const { image_base64, household_id, existing_items } = await req.json();
    if (!image_base64 || !household_id) throw new Error("Missing image_base64 or household_id");

    // SECURITY: We never log, store, or transmit the receipt image beyond this function call.
    console.log("[SCAN-RECEIPT] Processing receipt photo for household:", household_id);

    // Build context about already-extracted items so AI can skip duplicates
    const existingItemsContext = Array.isArray(existing_items) && existing_items.length > 0
      ? `\n\nITEMS ALREADY EXTRACTED FROM PREVIOUS PHOTOS OF THIS RECEIPT (DO NOT include these again, only extract NEW items not in this list):\n${existing_items.map((i: any) => `- ${i.name} (${i.quantity} ${i.unit}, $${i.total_price})`).join('\n')}`
      : '';

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content: `You are a receipt scanning AI that extracts ONLY grocery/shopping item data and coupon/discount codes. Be precise with prices and quantities.

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

COUPON/DISCOUNT CODE RULES:
- Look for any promotional codes, coupon codes, discount codes, voucher codes, or promo references on the receipt
- These may appear as: "PROMO:", "COUPON:", "CODE:", "VOUCHER:", "DISCOUNT CODE:", or similar labels
- They may also appear as alphanumeric codes near discount line items
- Extract the code text and any description of what the coupon is for
- Do NOT confuse transaction IDs, receipt numbers, or barcodes with coupon codes
- Only extract codes that are clearly promotional/discount codes

MULTI-PHOTO DEDUPLICATION:
- This may be one photo of a multi-photo scan of a long receipt
- If items have already been extracted from previous photos, they will be listed below
- ONLY extract items that are NEW and not already in the existing list
- If you see overlapping items from a previous photo, SKIP them${existingItemsContext}`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract ONLY NEW grocery/shopping items (skip any already extracted), their prices, store name, date, total, and any coupon/promo codes from this receipt section. DO NOT extract any payment details, card numbers, personal info, or sensitive data." },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image_base64}` } },
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
                        name: { type: "string", description: "Item name, cleaned up and capitalized properly" },
                        quantity: { type: "number", description: "Quantity purchased" },
                        unit: { type: "string", description: "Unit of measurement" },
                        unit_price: { type: "number", description: "Price per unit" },
                        total_price: { type: "number", description: "Total price for this line item" },
                        category: { type: "string", description: "Food/product category" },
                      },
                      required: ["name", "total_price", "category"],
                    },
                  },
                  coupon_codes: {
                    type: "array",
                    description: "Any coupon, promo, or discount codes found on the receipt",
                    items: {
                      type: "object",
                      properties: {
                        code: { type: "string", description: "The coupon/promo code text" },
                        description: { type: "string", description: "What the coupon is for, if mentioned" },
                      },
                      required: ["code"],
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
      const status = aiResponse.status;
      const text = await aiResponse.text();
      console.error("[SCAN-RECEIPT] AI error:", status, text);
      if (status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI processing failed");
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI did not return structured data");

    const receiptData = JSON.parse(toolCall.function.arguments);

    // SECURITY: Sanitize AI output
    const sanitizedData = {
      store_name: typeof receiptData.store_name === 'string' ? receiptData.store_name.substring(0, 100) : null,
      receipt_date: typeof receiptData.receipt_date === 'string' ? receiptData.receipt_date.substring(0, 10) : null,
      currency: typeof receiptData.currency === 'string' ? receiptData.currency.substring(0, 3) : 'USD',
      total_amount: typeof receiptData.total_amount === 'number' ? receiptData.total_amount : null,
      items: Array.isArray(receiptData.items) ? receiptData.items.map((item: any) => ({
        name: typeof item.name === 'string' ? item.name.substring(0, 200) : 'Unknown Item',
        quantity: typeof item.quantity === 'number' ? item.quantity : 1,
        unit: typeof item.unit === 'string' ? item.unit.substring(0, 20) : 'pieces',
        unit_price: typeof item.unit_price === 'number' ? item.unit_price : null,
        total_price: typeof item.total_price === 'number' ? item.total_price : null,
        category: typeof item.category === 'string' ? item.category.substring(0, 50) : 'Other',
      })) : [],
      coupon_codes: Array.isArray(receiptData.coupon_codes) ? receiptData.coupon_codes
        .filter((c: any) => typeof c.code === 'string' && c.code.trim().length > 0)
        .map((c: any) => ({
          code: c.code.substring(0, 100).trim(),
          description: typeof c.description === 'string' ? c.description.substring(0, 500) : null,
        })) : [],
    };

    // SECURITY: Detect and reject if AI accidentally included card/bank data
    const sensitivePatterns = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b|\b\d{4}\s?[*]{4,}\b|card|visa|mastercard|debit|credit|account\s*#|employee\s*(id|#|number|card|discount)|staff\s*(id|#|number|card|discount)|member(ship)?\s*(id|#|number)/i;
    if (sanitizedData.store_name && sensitivePatterns.test(sanitizedData.store_name)) {
      sanitizedData.store_name = null;
    }
    // Sanitize coupon codes — reject any that look like card/employee numbers
    sanitizedData.coupon_codes = sanitizedData.coupon_codes.filter(
      (c: any) => !sensitivePatterns.test(c.code) && !sensitivePatterns.test(c.description || '')
    );
    // Sanitize item names — strip any that reference employee/staff discounts
    sanitizedData.items = sanitizedData.items.filter(
      (item: any) => !sensitivePatterns.test(item.name)
    );

    console.log("[SCAN-RECEIPT] Extracted items:", sanitizedData.items.length, "coupons:", sanitizedData.coupon_codes.length);

    // Return extracted data WITHOUT saving to DB yet (the client accumulates multi-photo results
    // and saves once the user confirms they're done scanning)
    return new Response(
      JSON.stringify({
        store_name: sanitizedData.store_name,
        receipt_date: sanitizedData.receipt_date,
        total_amount: sanitizedData.total_amount,
        currency: sanitizedData.currency,
        items: sanitizedData.items,
        coupon_codes: sanitizedData.coupon_codes,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error) {
    console.error("[SCAN-RECEIPT] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
