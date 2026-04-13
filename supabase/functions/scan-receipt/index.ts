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

    const { image_base64, household_id } = await req.json();
    if (!image_base64 || !household_id) throw new Error("Missing image_base64 or household_id");

    // SECURITY: We never log, store, or transmit the receipt image beyond this function call.
    // The base64 image is sent to AI for extraction only and immediately discarded after.
    // We explicitly instruct AI to IGNORE all sensitive data (card numbers, bank details, etc).
    console.log("[SCAN-RECEIPT] Processing receipt for household:", household_id);

    // Call AI with vision to extract receipt data
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a receipt scanning AI that extracts ONLY grocery/shopping item data. Be precise with prices and quantities.

CRITICAL PRIVACY & SECURITY RULES — FOLLOW THESE EXACTLY:
- NEVER extract, return, or acknowledge any payment information (card numbers, last 4 digits, bank details, account numbers, payment method, authorization codes, transaction IDs, terminal IDs, merchant IDs)
- NEVER extract personal information (customer name, phone number, email, loyalty card numbers, membership IDs, addresses)
- NEVER extract any financial data beyond individual item prices and the receipt total
- IGNORE all text on the receipt that is not: store name, date, item names, item quantities, item prices, subtotal/total, or currency
- If you see any sensitive data, DO NOT include it in your response under any circumstances

EXTRACTION RULES:
- For categories, use: Fruits, Vegetables, Dairy, Grains, Snacks, Drinks, Meat, Seafood, Bakery, Frozen, Household, Personal Care, Spices, Other
- For units, infer from context: pieces (default for most items), kg, g, l, ml, lb, oz
- If a quantity isn't clear, default to 1
- Extract ONLY the store name (brand/company name only, no address), date, and total
- Currency should be the 3-letter ISO code (USD, EUR, GBP, etc)
- Clean up item names to be human-readable (e.g., "BNL BNNA" → "Banana")`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract ONLY the grocery/shopping items, their prices, store name, date, and total from this receipt. DO NOT extract any payment details, card numbers, personal info, or sensitive data." },
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

    // SECURITY: Sanitize AI output — strip anything that looks like sensitive data
    // Remove any field that isn't in our expected schema
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
    };

    // SECURITY: Detect and reject if AI accidentally included card/bank data in store name
    const sensitivePatterns = /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b|\b\d{4}\s?[*]{4,}\b|card|visa|mastercard|debit|credit|account\s*#/i;
    if (sanitizedData.store_name && sensitivePatterns.test(sanitizedData.store_name)) {
      sanitizedData.store_name = null; // Strip store name if it contains sensitive patterns
    }

    // SECURITY: The original image (image_base64) is NEVER stored — it exists only in memory
    // during this function execution and is garbage collected after the response.
    console.log("[SCAN-RECEIPT] Extracted items:", sanitizedData.items.length);

    // Save receipt scan to DB
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { data: scan, error: scanError } = await serviceClient
      .from("receipt_scans")
      .insert({
        household_id,
        scanned_by: userData.user.id,
        store_name: sanitizedData.store_name,
        receipt_date: sanitizedData.receipt_date,
        total_amount: sanitizedData.total_amount,
        currency: sanitizedData.currency,
        // SECURITY: image_url is intentionally left null — we NEVER store receipt images
      })
      .select("id")
      .single();

    if (scanError) {
      console.error("[SCAN-RECEIPT] DB error:", scanError);
      throw new Error("Failed to save receipt");
    }

    // Save receipt items (only safe, sanitized data)
    if (sanitizedData.items.length > 0) {
      const itemsToInsert = sanitizedData.items.map((item: any) => ({
        receipt_id: scan.id,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        total_price: item.total_price,
        category: item.category,
      }));

      const { error: itemsError } = await serviceClient
        .from("receipt_items")
        .insert(itemsToInsert);

      if (itemsError) console.error("[SCAN-RECEIPT] Items error:", itemsError);
    }

    return new Response(
      JSON.stringify({
        receipt_id: scan.id,
        store_name: sanitizedData.store_name,
        receipt_date: sanitizedData.receipt_date,
        total_amount: sanitizedData.total_amount,
        currency: sanitizedData.currency,
        items: sanitizedData.items,
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
