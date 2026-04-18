import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// =============================================================================
// CANONICAL FOOD WEIGHT TABLE — keep in sync with src/config/foodWeights.ts
// All weights are GRAMS for a single piece of the given size.
// =============================================================================
type FoodSize = "small" | "medium" | "large";

interface FoodEntry {
  key: string;
  aliases: string[];
  weights: Record<FoodSize, number>;
  category: string;
  storage: "pantry" | "fridge" | "freezer";
}

const FOOD_WEIGHTS: FoodEntry[] = [
  { key: "chicken_leg",    aliases: ["chicken leg","chicken legs","drumstick","drumsticks","chicken leg piece","leg piece"], weights: { small: 200, medium: 275, large: 350 }, category: "Meat", storage: "fridge" },
  { key: "chicken_thigh",  aliases: ["chicken thigh","chicken thighs","thigh"], weights: { small: 110, medium: 150, large: 200 }, category: "Meat", storage: "fridge" },
  { key: "chicken_breast", aliases: ["chicken breast","chicken breasts","breast fillet"], weights: { small: 150, medium: 200, large: 280 }, category: "Meat", storage: "fridge" },
  { key: "chicken_wing",   aliases: ["chicken wing","chicken wings","wing"], weights: { small: 35,  medium: 50,  large: 70  }, category: "Meat", storage: "fridge" },
  { key: "sausage",        aliases: ["sausage","sausages","banger"], weights: { small: 50, medium: 70, large: 100 }, category: "Meat", storage: "fridge" },
  { key: "bacon_strip",    aliases: ["bacon strip","bacon slice","rasher"], weights: { small: 10, medium: 15, large: 25 }, category: "Meat", storage: "fridge" },
  { key: "fish_fillet",    aliases: ["fish fillet","fish fillets","salmon fillet"], weights: { small: 100, medium: 150, large: 220 }, category: "Meat", storage: "fridge" },
  { key: "egg",            aliases: ["egg","eggs"], weights: { small: 40, medium: 50, large: 65 }, category: "Dairy", storage: "fridge" },
  { key: "cheese_slice",   aliases: ["cheese slice","slice of cheese"], weights: { small: 15, medium: 20, large: 30 }, category: "Dairy", storage: "fridge" },
  { key: "bread_slice",    aliases: ["bread slice","slice of bread","toast"], weights: { small: 25, medium: 30, large: 45 }, category: "Grains", storage: "pantry" },
  { key: "bread_loaf",     aliases: ["loaf","loaf of bread","bread loaf"], weights: { small: 400, medium: 500, large: 800 }, category: "Grains", storage: "pantry" },
  { key: "bread_roll",     aliases: ["roll","bun","bread roll"], weights: { small: 40, medium: 60, large: 90 }, category: "Grains", storage: "pantry" },
  { key: "tortilla",       aliases: ["tortilla","chapati","roti","wrap"], weights: { small: 30, medium: 40, large: 60 }, category: "Grains", storage: "pantry" },
  { key: "apple",          aliases: ["apple","apples"], weights: { small: 130, medium: 180, large: 230 }, category: "Fruits", storage: "fridge" },
  { key: "banana",         aliases: ["banana","bananas"], weights: { small: 90, medium: 120, large: 160 }, category: "Fruits", storage: "pantry" },
  { key: "orange",         aliases: ["orange","oranges"], weights: { small: 130, medium: 180, large: 240 }, category: "Fruits", storage: "fridge" },
  { key: "lemon",          aliases: ["lemon","lemons"], weights: { small: 50, medium: 70, large: 100 }, category: "Fruits", storage: "fridge" },
  { key: "tomato",         aliases: ["tomato","tomatoes"], weights: { small: 90, medium: 150, large: 220 }, category: "Vegetables", storage: "fridge" },
  { key: "onion",          aliases: ["onion","onions"], weights: { small: 90, medium: 150, large: 230 }, category: "Vegetables", storage: "pantry" },
  { key: "potato",         aliases: ["potato","potatoes"], weights: { small: 130, medium: 200, large: 300 }, category: "Vegetables", storage: "pantry" },
  { key: "carrot",         aliases: ["carrot","carrots"], weights: { small: 40, medium: 65, large: 100 }, category: "Vegetables", storage: "fridge" },
  { key: "garlic_clove",   aliases: ["garlic clove","clove of garlic","garlic"], weights: { small: 3, medium: 5, large: 8 }, category: "Vegetables", storage: "pantry" },
];

const CUP_WEIGHTS_G: Record<string, number> = {
  rice: 200, basmati: 200, jasmine: 200, quinoa: 170,
  flour: 125, sugar: 200, "brown sugar": 220,
  oats: 90, lentils: 200, dal: 200, beans: 200,
  pasta: 100, cereal: 30, cornflakes: 30,
};

const CUP_ML = 240, GLASS_ML = 250, TBSP_ML = 15, TSP_ML = 5;

function findFoodEntry(name: string): FoodEntry | null {
  const n = name.trim().toLowerCase();
  for (const e of FOOD_WEIGHTS) {
    if (e.key === n) return e;
    if (e.aliases.some(a => a === n || n.includes(a))) return e;
  }
  return null;
}

function isUnrealisticGrams(grams: number, pieces: number, category?: string): boolean {
  if (!Number.isFinite(grams) || grams <= 0) return true;
  if (pieces >= 1 && grams < 10) return true;
  if (category === "Meat" && pieces >= 1 && grams < 30) return true;
  if (grams > 5000) return true;
  return false;
}

interface InventoryItem { name: string; quantity: number; unit: string; storage_location: string; category: string; }

function findInventoryMatch(name: string, inv: InventoryItem[]): InventoryItem | null {
  const n = name.trim().toLowerCase();
  return inv.find(i => i.name.toLowerCase() === n)
      ?? inv.find(i => i.name.toLowerCase().includes(n) || n.includes(i.name.toLowerCase()))
      ?? null;
}

/** Convert AI-extracted (foodKey, pieces, size, cupAmount, fraction) into a deduction expressed in inventory units. */
function computeDeduction(args: {
  foodKey?: string; pieces?: number; size?: FoodSize;
  cupAmount?: number; cupOfWhat?: string;
  fractionOfContainer?: number; container?: string;
  rawQuantity?: number; rawUnit?: string;
  inventoryItem: InventoryItem | null;
  category?: string;
}): { quantity: number; unit: string; grams: number | null; confidence: "high" | "low"; reason: string } {
  const inv = args.inventoryItem;
  const invUnit = inv?.unit ?? args.rawUnit ?? "pieces";

  // CASE 1: piece-based food via canonical table
  if (args.foodKey && args.pieces && args.pieces > 0) {
    const entry = FOOD_WEIGHTS.find(e => e.key === args.foodKey) ?? findFoodEntry(args.foodKey);
    if (entry) {
      const size = args.size ?? "medium";
      const grams = args.pieces * entry.weights[size];
      const realistic = !isUnrealisticGrams(grams, args.pieces, entry.category);
      const confidence = realistic && args.size ? "high" : (realistic ? "high" : "low");

      // Convert to inventory unit
      if (invUnit === "kg") return { quantity: +(grams / 1000).toFixed(3), unit: "kg", grams, confidence, reason: `${args.pieces} × ${entry.weights[size]}g (${size} ${entry.key})` };
      if (invUnit === "g")  return { quantity: grams, unit: "g", grams, confidence, reason: `${args.pieces} × ${entry.weights[size]}g (${size} ${entry.key})` };
      if (invUnit === "pieces") return { quantity: args.pieces, unit: "pieces", grams, confidence, reason: `${args.pieces} pieces` };
      // Inventory has a non-mass unit (bottles, packs) — fall back to pieces with low confidence
      return { quantity: args.pieces, unit: invUnit, grams, confidence: "low", reason: `pieces→${invUnit} mismatch` };
    }
  }

  // CASE 2: cup measurement of a known dry/liquid good
  if (args.cupAmount && args.cupAmount > 0 && args.cupOfWhat) {
    const what = args.cupOfWhat.toLowerCase();
    const dryGrams = Object.keys(CUP_WEIGHTS_G).find(k => what.includes(k));
    if (dryGrams) {
      const grams = args.cupAmount * CUP_WEIGHTS_G[dryGrams];
      if (invUnit === "kg") return { quantity: +(grams / 1000).toFixed(3), unit: "kg", grams, confidence: "high", reason: `${args.cupAmount} cup × ${CUP_WEIGHTS_G[dryGrams]}g` };
      if (invUnit === "g")  return { quantity: grams, unit: "g", grams, confidence: "high", reason: `${args.cupAmount} cup × ${CUP_WEIGHTS_G[dryGrams]}g` };
    }
    // Liquid default
    const ml = args.cupAmount * CUP_ML;
    if (invUnit === "l")  return { quantity: +(ml / 1000).toFixed(3), unit: "l", grams: null, confidence: "high", reason: `${args.cupAmount} cup × ${CUP_ML}ml` };
    if (invUnit === "ml") return { quantity: ml, unit: "ml", grams: null, confidence: "high", reason: `${args.cupAmount} cup × ${CUP_ML}ml` };
  }

  // CASE 3: fraction of a container (half the bottle)
  if (args.fractionOfContainer && args.fractionOfContainer > 0 && inv) {
    const qty = +(args.fractionOfContainer * inv.quantity).toFixed(3);
    return { quantity: qty, unit: inv.unit, grams: null, confidence: "high", reason: `${args.fractionOfContainer} × current ${inv.quantity} ${inv.unit}` };
  }

  // FALLBACK: trust raw qty/unit if it matches inventory unit
  const qty = args.rawQuantity ?? 1;
  const unit = args.rawUnit ?? invUnit;
  return { quantity: qty, unit, grams: null, confidence: unit === invUnit ? "high" : "low", reason: "raw extraction" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { text, inventoryItems = [], shoppingItems = [] } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const inventorySummary = (inventoryItems as InventoryItem[])
      .map(i => `${i.name} (${i.quantity} ${i.unit}, ${i.storage_location})`).join(", ");
    const shoppingSummary = (shoppingItems as any[])
      .map(i => `${i.name} (${i.quantity} ${i.unit}, status: ${i.status})`).join(", ");

    const foodKeysHint = FOOD_WEIGHTS.map(e => `${e.key} (${e.aliases[0]})`).join(", ");

    const systemPrompt = `You are a pantry-management AI. Your ONLY job is to extract structured pantry actions from natural speech. The server will compute final quantities — do NOT do arithmetic yourself.

Current pantry: ${inventorySummary || "empty"}
Shopping list: ${shoppingSummary || "empty"}

For EACH action you emit, set the matched_inventory_name to the EXACT name from the pantry above when applicable.

For consumption ("I ate / drank / used / finished"), use type "update_quantity" and fill ONE of these extraction modes:

(A) PIECE-BASED FOOD — when user mentions discrete pieces of items in this list:
    ${foodKeysHint}
  → Set: food_key (one of the canonical keys above), pieces (number), size ("small"|"medium"|"large", default "medium" if unstated)

(B) CUP / TBSP / TSP / GLASS measurement — when user says "2 cups of rice", "a glass of milk":
  → Set: cup_amount (number, in cups; treat 1 glass = ~1 cup, 1 tbsp = 1/16 cup, 1 tsp = 1/48 cup), cup_of_what (the food, e.g. "basmati", "milk")

(C) FRACTION OF A CONTAINER — when user says "half the ketchup bottle", "a quarter of the jar":
  → Set: fraction_of_container (e.g. 0.5, 0.25, 0.33), container (e.g. "bottle","jar","pack")

(D) RAW — only when none of A/B/C fit (e.g. "I bought 3 kg chicken"):
  → Set: raw_quantity, raw_unit (one of: pieces, g, kg, ml, l)

Always also set: action_name (display name, capitalized), category (Fruits/Vegetables/Dairy/Grains/Snacks/Drinks/Meat/Spices/Frozen/Sauces/Other), storage_location.

For "add_inventory" / "add_shopping" / "remove_inventory" / "remove_shopping" / "clear_shopping" — use mode (D) RAW with sensible defaults.

EXAMPLES:
- "I ate 2 chicken legs" → mode A: food_key="chicken_leg", pieces=2, size="medium", action_name="Chicken"
- "I had a small chicken breast" → mode A: food_key="chicken_breast", pieces=1, size="small"
- "I ate two cups of basmati rice" → mode B: cup_amount=2, cup_of_what="basmati", action_name="Basmati Rice"
- "I drank a glass of milk" → mode B: cup_amount=1, cup_of_what="milk", action_name="Milk"
- "I used half the ketchup bottle" → mode C: fraction_of_container=0.5, container="bottle", action_name="Ketchup"
- "I bought 3 kg chicken" → type=add_inventory, mode D: raw_quantity=3, raw_unit="kg"

Extract EVERY item mentioned. Never skip food.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        tools: [{
          type: "function",
          function: {
            name: "execute_pantry_actions",
            description: "Execute parsed pantry/shopping actions",
            parameters: {
              type: "object",
              properties: {
                actions: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      type: { type: "string", enum: ["add_inventory","remove_inventory","update_quantity","add_shopping","remove_shopping","clear_shopping"] },
                      action_name: { type: "string" },
                      matched_inventory_name: { type: "string" },
                      category: { type: "string" },
                      storage_location: { type: "string", enum: ["pantry","fridge","freezer"] },
                      // Mode A
                      food_key: { type: "string" },
                      pieces: { type: "number" },
                      size: { type: "string", enum: ["small","medium","large"] },
                      // Mode B
                      cup_amount: { type: "number" },
                      cup_of_what: { type: "string" },
                      // Mode C
                      fraction_of_container: { type: "number" },
                      container: { type: "string" },
                      // Mode D
                      raw_quantity: { type: "number" },
                      raw_unit: { type: "string", enum: ["pieces","g","kg","ml","l","cups","tbsp","tsp","bottles","packs","cans","slices","bars"] },
                    },
                    required: ["type","action_name"],
                  },
                },
              },
              required: ["actions"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "execute_pantry_actions" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded, try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (response.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI processing failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ actions: [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const parsed = JSON.parse(toolCall.function.arguments);
    const rawActions = parsed.actions ?? [];

    // Compute final deductions server-side using the canonical table
    const computed = rawActions.map((a: any) => {
      const isConsumption = a.type === "update_quantity" || a.type === "remove_inventory";
      const matchName = a.matched_inventory_name || a.action_name;
      const invItem = isConsumption ? findInventoryMatch(matchName, inventoryItems) : null;

      const result = computeDeduction({
        foodKey: a.food_key, pieces: a.pieces, size: a.size,
        cupAmount: a.cup_amount, cupOfWhat: a.cup_of_what,
        fractionOfContainer: a.fraction_of_container, container: a.container,
        rawQuantity: a.raw_quantity, rawUnit: a.raw_unit,
        inventoryItem: invItem, category: a.category,
      });

      console.log(`[voice-command] ${a.action_name}: ${result.reason} → ${result.quantity} ${result.unit} (${result.confidence})`, { input: a, inv: invItem });

      return {
        type: a.type,
        name: a.action_name,
        quantity: result.quantity,
        unit: result.unit,
        storage_location: a.storage_location ?? invItem?.storage_location ?? "pantry",
        category: a.category ?? invItem?.category ?? "Other",
        // Confirmation metadata
        grams: result.grams,
        confidence: result.confidence,
        reason: result.reason,
        original_pieces: a.pieces ?? null,
        original_size: a.size ?? null,
        food_key: a.food_key ?? null,
      };
    });

    return new Response(JSON.stringify({ actions: computed }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("voice-command error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
