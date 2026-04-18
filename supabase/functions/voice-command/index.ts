import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const { text, inventoryItems, shoppingItems } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const inventorySummary = (inventoryItems || [])
      .map((i: any) => `${i.name} (${i.quantity} ${i.unit}, ${i.storage_location})`)
      .join(", ");

    const shoppingSummary = (shoppingItems || [])
      .map((i: any) => `${i.name} (${i.quantity} ${i.unit}, status: ${i.status})`)
      .join(", ");

    const systemPrompt = `You are a highly accurate pantry management AI. You receive natural speech about food consumption, purchases, or inventory changes and MUST extract EVERY item mentioned, even from complex conversational sentences.

Current pantry inventory: ${inventorySummary || "empty"}
Current shopping list: ${shoppingSummary || "empty"}

CRITICAL RULES:
1. Extract ALL items from the speech - users may mention many items in one sentence.
2. Match items against the current inventory when possible (use existing names/units).
3. If user consumed/ate/drank/finished/used something, REDUCE or REMOVE it from inventory.
4. If an item exists in inventory, reduce its quantity. If quantity becomes 0 or less, remove it.
5. For consumed items, if the user doesn't specify quantity, assume 1.
6. Infer storage_location intelligently: milk/cheese/yogurt/eggs→fridge, ice cream/frozen items→freezer, bread/rice/pasta/snacks/chocolate→pantry.
7. Parse quantities carefully: "a glass of milk" = 1 glass, "two boxes" = 2 boxes, "some rice" = 1 serving.
8. Handle compound sentences: "I had pizza and a glass of milk" = 2 separate actions.
9. "water" when consumed means bottled water from inventory.
10. When a user says "I ate/had/consumed/drank X", check if X exists in the pantry. If so, use the existing unit and reduce by the appropriate amount. If the item has quantity in pieces, reduce by 1. If in kg/g/l/ml, reduce by a reasonable single serving.
11. **CRITICAL UNIT CONVERSION**: When the user says a quantity in a unit DIFFERENT from the unit stored in inventory, you MUST convert it to the inventory's stored unit before deducting. The "quantity" and "unit" fields you return MUST match the inventory item's existing unit.

   Common conversions (use sensible food-density / portion defaults):

   GRAINS / DRY GOODS (per 1 cup, uncooked):
   - rice / basmati / jasmine / quinoa ≈ 0.2 kg (200 g)
   - flour (all-purpose / wheat) ≈ 0.125 kg (125 g)
   - sugar ≈ 0.2 kg ; brown sugar ≈ 0.22 kg
   - oats / rolled oats ≈ 0.09 kg (90 g)
   - lentils / dal / beans (dry) ≈ 0.2 kg
   - pasta (dry) ≈ 0.1 kg (100 g)
   - cereal / cornflakes ≈ 0.03 kg (30 g)

   LIQUIDS:
   - 1 cup ≈ 0.24 l (240 ml) ; 1 glass ≈ 0.25 l ; 1 mug ≈ 0.3 l
   - 1 tbsp ≈ 15 ml ; 1 tsp ≈ 5 ml
   - 1 standard water bottle ≈ 0.5 l ; 1 large ≈ 1 l or 1.5 l
   - 1 can of soda ≈ 0.33 l

   MEAT / POULTRY / FISH (typical raw piece weight):
   - 1 chicken leg (drumstick) ≈ 0.12 kg (120 g)
   - 1 chicken thigh ≈ 0.15 kg (150 g)
   - 1 whole chicken leg quarter (drumstick + thigh) ≈ 0.3 kg
   - 1 chicken breast ≈ 0.2 kg (200 g)
   - 1 chicken wing ≈ 0.05 kg (50 g)
   - 1 whole chicken ≈ 1.5 kg
   - 1 fish fillet ≈ 0.15 kg ; 1 whole fish ≈ 0.5 kg
   - 1 steak ≈ 0.25 kg ; 1 lamb chop ≈ 0.1 kg
   - 1 sausage ≈ 0.07 kg ; 1 strip of bacon ≈ 0.015 kg

   BREAD / BAKED:
   - 1 slice of bread ≈ 0.03 kg (30 g) ; 1 loaf ≈ 0.5 kg
   - 1 roll / bun ≈ 0.06 kg ; 1 tortilla / chapati ≈ 0.04 kg

   DAIRY / EGGS:
   - 1 egg ≈ 0.05 kg (50 g)
   - 1 slice cheese ≈ 0.02 kg ; 1 stick butter ≈ 0.113 kg
   - 1 cup yogurt ≈ 0.245 kg

   PRODUCE (per 1 piece):
   - 1 apple/orange/onion/tomato (medium) ≈ 0.15 kg
   - 1 banana ≈ 0.12 kg ; 1 potato (medium) ≈ 0.2 kg
   - 1 carrot ≈ 0.06 kg ; 1 clove garlic ≈ 0.005 kg ; 1 lemon ≈ 0.06 kg

   FRACTIONS OF A CONTAINER — when user says "half / quarter / a third of the [bottle/jar/box/pack/bag]":
   - Compute the deduction as fraction × current_inventory_quantity for that item, in the inventory's existing unit.
   - Example: ketchup is "Ketchup (1 bottles, fridge)" with no weight info → return quantity:0.5 unit:"bottles".
   - Example: ketchup is "Ketchup (0.5 l, fridge)" → "half the bottle" → quantity:0.25 unit:"l".
   - Example: rice is "Basmati Rice (54 kg, pantry)" → "half a bag" only applies if user says half a bag — otherwise treat plain consumption normally.

   UNIT IDENTITIES: 1 g = 0.001 kg ; 1 ml = 0.001 l ; 1 kg = 1000 g ; 1 l = 1000 ml.

   WORKED EXAMPLES:
   - Inventory: "Basmati Rice (54 kg, pantry)". User: "I ate 2 cups of basmati rice".
     → 2 × 0.2 = 0.4 kg → { type:"update_quantity", name:"Basmati Rice", quantity:0.4, unit:"kg", storage_location:"pantry", category:"Grains" }
   - Inventory: "Chicken (3 kg, fridge)". User: "I ate two chicken leg pieces".
     → 2 × 0.12 = 0.24 kg → { type:"update_quantity", name:"Chicken", quantity:0.24, unit:"kg", storage_location:"fridge", category:"Meat" }
   - Inventory: "Ketchup (1 bottles, fridge)". User: "I used half the ketchup bottle".
     → 0.5 × 1 = 0.5 → { type:"update_quantity", name:"Ketchup", quantity:0.5, unit:"bottles", storage_location:"fridge", category:"Sauces" }
   - Inventory: "Milk (2 l, fridge)". User: "I drank a glass of milk".
     → 1 × 0.25 = 0.25 l → { type:"update_quantity", name:"Milk", quantity:0.25, unit:"l", storage_location:"fridge", category:"Dairy" }

   NEVER return a unit that differs from the matched inventory item's unit — always convert first using the tables above. If you genuinely have no conversion data, estimate conservatively rather than mismatching units.

Action types:
- "remove_inventory": Remove item entirely (ate all, finished, threw away)
- "update_quantity": Reduce quantity by a specific amount (used some, drank one glass from a bottle)
- "add_inventory": Add new or increase existing item (bought, got, restocked)
- "add_shopping": Add to shopping list (need, running low, out of)
- "remove_shopping": Remove from shopping list
- "clear_shopping": Clear entire shopping list

For each action return:
- "type": action type
- "name": item name (capitalize, match existing inventory name if possible)
- "quantity": number to add/remove/reduce by
- "unit": "pieces", "g", "kg", "ml", "l", "cups", "tbsp", "tsp", "boxes", "packs", "bottles", "cans", "slices", "bars"
- "storage_location": "pantry", "fridge", or "freezer"
- "category": "Fruits", "Vegetables", "Dairy", "Grains", "Snacks", "Drinks", "Meat", "Spices", "Frozen", "Sauces", "Other"

EXAMPLE INPUTS & OUTPUTS:
"I ate a chocolate bar today and drank one glass of milk and water, I then had a pizza" →
4 actions: update_quantity Chocolate Bar -1 bar pantry Snacks, update_quantity Milk -1 cups fridge Dairy, update_quantity Water -1 cups fridge Drinks, update_quantity Pizza -1 slices fridge/freezer Frozen

"I bought 3 kg of chicken, a dozen eggs, and 2 loaves of bread" →
3 actions: add_inventory Chicken 3 kg fridge Meat, add_inventory Eggs 12 pieces fridge Dairy, add_inventory Bread 2 pieces pantry Grains

"We're out of sugar and need more rice and cooking oil" →
3 actions: add_shopping Sugar 1 kg pantry Other, add_shopping Rice 1 kg pantry Grains, add_shopping Cooking Oil 1 bottles pantry Sauces

Always respond with ALL items. Never skip any food/drink mentioned.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: text },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "execute_pantry_actions",
              description: "Execute parsed pantry/shopping actions from user voice command",
              parameters: {
                type: "object",
                properties: {
                  actions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string", enum: ["add_inventory", "remove_inventory", "update_quantity", "add_shopping", "remove_shopping", "clear_shopping"] },
                        name: { type: "string" },
                        quantity: { type: "number" },
                        unit: { type: "string", enum: ["pieces", "g", "kg", "ml", "l", "cups", "tbsp", "tsp", "boxes", "packs", "bottles", "cans", "slices", "bars"] },
                        storage_location: { type: "string", enum: ["pantry", "fridge", "freezer"] },
                        category: { type: "string" },
                      },
                      required: ["type", "name", "quantity", "unit", "storage_location", "category"],
                    },
                  },
                },
                required: ["actions"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "execute_pantry_actions" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add funds in Settings." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI processing failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      const parsed = JSON.parse(toolCall.function.arguments);
      return new Response(JSON.stringify(parsed), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ actions: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("voice-command error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
