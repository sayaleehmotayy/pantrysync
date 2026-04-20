import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function categorize(categories: string | undefined, productName: string): string {
  const text = `${categories || ""} ${productName}`.toLowerCase();
  if (/fruit|berry|apple|banana|mango|orange|grape|melon/.test(text)) return "Fruits";
  if (/vegetable|carrot|potato|onion|tomato|lettuce|broccoli/.test(text)) return "Vegetables";
  if (/dairy|milk|cheese|yogurt|butter|cream|curd/.test(text)) return "Dairy";
  if (/grain|cereal|rice|wheat|bread|flour|pasta|noodle|oat/.test(text)) return "Grains";
  if (/snack|chip|biscuit|cookie|cracker|popcorn|chocolate|candy/.test(text)) return "Snacks";
  if (/drink|beverage|juice|soda|water|tea|coffee|beer|wine/.test(text)) return "Drinks";
  if (/meat|chicken|beef|pork|fish|seafood|lamb|turkey|sausage/.test(text)) return "Meat";
  if (/spice|herb|pepper|salt|cinnamon|cumin|turmeric|oregano/.test(text)) return "Spices";
  if (/frozen|ice cream/.test(text)) return "Frozen";
  if (/sauce|ketchup|mayo|mustard|dressing|vinegar|soy/.test(text)) return "Sauces";
  return "Other";
}

function guessStorage(category: string): string {
  if (["Dairy", "Meat", "Vegetables", "Fruits"].includes(category)) return "fridge";
  if (category === "Frozen") return "freezer";
  return "pantry";
}

async function aiLookup(barcode: string): Promise<any | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) return null;

  try {
    const prompt = `You are a product database assistant. The user scanned barcode "${barcode}". Using your broad knowledge of consumer products from across the internet, identify what product this barcode most likely belongs to.

Return ONLY a JSON object (no markdown, no code fences) with these fields:
{
  "name": "Full product name including brand (e.g. 'Coca-Cola Classic 330ml Can')",
  "brand": "Brand name or null",
  "category": "One of: Fruits, Vegetables, Dairy, Grains, Snacks, Drinks, Meat, Spices, Frozen, Sauces, Other",
  "quantity": number (e.g. 330),
  "unit": "One of: pieces, g, kg, ml, l, bottles, packets",
  "storage_location": "One of: pantry, fridge, freezer",
  "ingredients": "Brief ingredients list or null",
  "nutritional_info": "Brief nutrition summary or null",
  "found": true if you are reasonably confident this barcode matches a real product, false otherwise
}

If you cannot identify the product with reasonable confidence, return {"found": false}.`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      console.warn("AI lookup failed:", res.status);
      return null;
    }

    const data = await res.json();
    const raw = data.choices?.[0]?.message?.content || "";
    const jsonStr = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    const parsed = JSON.parse(jsonStr);

    if (!parsed.found || !parsed.name) return null;

    return {
      name: parsed.name,
      category: parsed.category || "Other",
      quantity: Number(parsed.quantity) || 1,
      unit: parsed.unit || "pieces",
      storage_location: parsed.storage_location || "pantry",
      brand: parsed.brand || null,
      barcode,
      image_url: null,
      ingredients: parsed.ingredients || null,
      nutritional_info: parsed.nutritional_info || null,
    };
  } catch (err) {
    console.error("aiLookup error:", err);
    return null;
  }
}

function parseQuantity(product: any): { quantity: number; unit: string } {
  const qStr = product.quantity || product.product_quantity || "";
  // Try to parse "500 ml", "1.5 L", "200g" etc.
  const match = qStr.match?.(/([\d.]+)\s*(g|kg|ml|l|cl|oz|lb|pieces?|pack|sachets?)/i);
  if (match) {
    let qty = parseFloat(match[1]);
    let unit = match[2].toLowerCase();
    if (unit === "cl") { qty *= 10; unit = "ml"; }
    if (unit === "oz") { qty *= 28.35; unit = "g"; }
    if (unit === "lb") { qty *= 0.4536; unit = "kg"; }
    if (unit === "pack" || unit === "sachet" || unit === "sachets") unit = "packets";
    if (unit === "piece") unit = "pieces";
    return { quantity: Math.round(qty * 100) / 100, unit };
  }
  return { quantity: 1, unit: "pieces" };
}

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

    const { barcode } = await req.json();
    if (!barcode || typeof barcode !== "string") {
      return new Response(JSON.stringify({ error: "Barcode is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Query Open Food Facts API
    let response: Response;
    try {
      response = await fetch(
        `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
        { headers: { "User-Agent": "PantrySync/1.0 (contact@pantrysync.app)" } }
      );
    } catch (err) {
      console.error("OpenFoodFacts fetch failed:", err);
      return new Response(JSON.stringify({ found: false, barcode, error: "Product database unreachable" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // 404 = unknown barcode; any other non-OK = treat as not found rather than crashing
    if (!response.ok) {
      console.warn(`OpenFoodFacts returned ${response.status} for barcode ${barcode}`);
      await response.body?.cancel();
      return new Response(JSON.stringify({ found: false, barcode }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const data = await response.json();

    if (data.status !== 1 || !data.product) {
      // Fallback: ask Lovable AI to identify the product from the barcode using its web knowledge
      const aiResult = await aiLookup(barcode);
      if (aiResult) {
        return new Response(JSON.stringify({ found: true, product: aiResult, source: "ai" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }
      return new Response(JSON.stringify({ found: false, barcode }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const p = data.product;
    const name = p.product_name || p.product_name_en || p.generic_name || "Unknown Product";
    const brand = p.brands || null;
    const fullName = brand && !name.toLowerCase().includes(brand.toLowerCase())
      ? `${brand} ${name}`
      : name;

    const category = categorize(p.categories, name);
    const { quantity, unit } = parseQuantity(p);
    const storage = guessStorage(category);

    const result = {
      found: true,
      product: {
        name: fullName,
        category,
        quantity,
        unit,
        storage_location: storage,
        brand: brand,
        barcode,
        image_url: p.image_front_small_url || p.image_url || null,
        ingredients: p.ingredients_text_en || p.ingredients_text || null,
        nutritional_info: p.nutriments
          ? `Energy: ${p.nutriments["energy-kcal_100g"] || "?"}kcal/100g, Fat: ${p.nutriments.fat_100g || "?"}g, Carbs: ${p.nutriments.carbohydrates_100g || "?"}g, Protein: ${p.nutriments.proteins_100g || "?"}g`
          : null,
      },
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("lookup-barcode error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
