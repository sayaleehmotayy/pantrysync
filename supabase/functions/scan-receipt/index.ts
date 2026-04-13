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
            content: `You are a receipt scanning AI. Extract all items from the receipt image with extreme accuracy.
You MUST use the extract_receipt_data tool to return the structured data. Be precise with prices and quantities.
For categories, use: Fruits, Vegetables, Dairy, Grains, Snacks, Drinks, Meat, Seafood, Bakery, Frozen, Household, Personal Care, Spices, Other.
For units, infer from context: pieces (default for most items), kg, g, l, ml, lb, oz.
If a quantity isn't clear, default to 1.
Extract the store name, date, and total from the receipt header/footer.
Currency should be the 3-letter ISO code (USD, EUR, GBP, etc).`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract all items, prices, store name, date, total, and currency from this receipt." },
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
    console.log("[SCAN-RECEIPT] Extracted:", JSON.stringify(receiptData).slice(0, 200));

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
        store_name: receiptData.store_name || null,
        receipt_date: receiptData.receipt_date || null,
        total_amount: receiptData.total_amount || null,
        currency: receiptData.currency || "USD",
      })
      .select("id")
      .single();

    if (scanError) {
      console.error("[SCAN-RECEIPT] DB error:", scanError);
      throw new Error("Failed to save receipt");
    }

    // Save receipt items
    if (receiptData.items?.length > 0) {
      const itemsToInsert = receiptData.items.map((item: any) => ({
        receipt_id: scan.id,
        name: item.name,
        quantity: item.quantity || 1,
        unit: item.unit || "pieces",
        unit_price: item.unit_price || null,
        total_price: item.total_price || null,
        category: item.category || "Other",
      }));

      const { error: itemsError } = await serviceClient
        .from("receipt_items")
        .insert(itemsToInsert);

      if (itemsError) console.error("[SCAN-RECEIPT] Items error:", itemsError);
    }

    return new Response(
      JSON.stringify({
        receipt_id: scan.id,
        store_name: receiptData.store_name,
        receipt_date: receiptData.receipt_date,
        total_amount: receiptData.total_amount,
        currency: receiptData.currency,
        items: receiptData.items || [],
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
