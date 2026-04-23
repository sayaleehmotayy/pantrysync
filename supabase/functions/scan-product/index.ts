import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { chargeCredits, AI_COST } from "../_shared/aiCredits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { images } = await req.json();
    if (!images || !Array.isArray(images) || images.length === 0) {
      throw new Error("At least one product image is required");
    }

    const credit = await chargeCredits(user.id, AI_COST.scanProduct);
    if (!credit.ok) {
      return new Response(JSON.stringify(credit.body), {
        status: credit.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build content array with all images
    const content: any[] = [
      {
        type: "text",
        text: `You are an expert product scanner for a pantry management app. Analyze the product image(s) and extract ALL details.

Return a JSON object with EXACTLY these fields:
{
  "name": "Product name (e.g., 'Amul Full Cream Milk')",
  "category": "One of: Fruits, Vegetables, Dairy, Grains, Snacks, Drinks, Meat, Spices, Frozen, Sauces, Other",
  "quantity": number (the amount, e.g., 500),
  "unit": "One of: pieces, g, kg, ml, l, cups, tbsp, tsp, bottles, packets",
  "expiry_date": "YYYY-MM-DD format or null if not visible",
  "storage_location": "One of: pantry, fridge, freezer (best guess based on product type)",
  "brand": "Brand name if visible or null",
  "barcode": "Barcode number if visible or null",
  "ingredients": "Key ingredients if visible or null",
  "nutritional_info": "Brief nutritional summary if visible or null",
  "confidence": number between 0 and 1 indicating how confident you are
}

Rules:
- For quantity/unit: Convert to the most natural unit. E.g., "500ml" → quantity: 500, unit: "ml". "1.5L" → quantity: 1.5, unit: "l". "200g" → quantity: 200, unit: "g".
- For expiry: Look for "Best Before", "BB", "EXP", "Use By", "MFG + shelf life" dates. Convert to YYYY-MM-DD.
- For storage: Dairy/meat/fresh → fridge. Ice cream/frozen items → freezer. Canned/dry goods → pantry.
- If you see both front and back of a product, combine all information.
- If a barcode is visible, read it.
- Be very accurate with the product name — include brand if visible.

IMPORTANT: Return ONLY the JSON object, no markdown, no code blocks, just raw JSON.`,
      },
    ];

    for (const imageData of images) {
      content.push({
        type: "image_url",
        image_url: { url: imageData },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content }],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited — please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up in Settings." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error("AI analysis failed");
    }

    const data = await response.json();
    const rawContent = data.choices?.[0]?.message?.content || "";

    // Parse the JSON from the response (handle potential markdown wrapping)
    let parsed;
    try {
      const jsonStr = rawContent.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("Failed to parse AI response:", rawContent);
      throw new Error("Could not parse product details from image");
    }

    return new Response(JSON.stringify({ product: parsed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("scan-product error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
