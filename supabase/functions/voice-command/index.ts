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

    const systemPrompt = `You are a smart pantry assistant. Parse the user's voice command about their food/groceries and return structured actions.

Current pantry items: ${inventorySummary || "empty"}
Current shopping list: ${shoppingSummary || "empty"}

Return a JSON array of actions. Each action has:
- "type": one of "add_inventory", "remove_inventory", "update_quantity", "add_shopping", "remove_shopping", "clear_shopping"
- "name": item name (string)
- "quantity": number
- "unit": one of "pieces", "g", "kg", "ml", "l", "cups", "tbsp", "tsp", "boxes", "packs", "bottles", "cans"
- "storage_location": one of "pantry", "fridge", "freezer" (decide intelligently based on the item if not specified - e.g. ice cream→freezer, milk→fridge, rice→pantry)
- "category": one of "Fruits", "Vegetables", "Dairy", "Grains", "Snacks", "Drinks", "Meat", "Spices", "Frozen", "Sauces", "Other"

Examples:
- "I finished the pizza" → [{"type":"remove_inventory","name":"Pizza","quantity":1,"unit":"pieces","storage_location":"freezer","category":"Frozen"}]
- "I bought 2 boxes of ice cream" → [{"type":"add_inventory","name":"Ice Cream","quantity":2,"unit":"boxes","storage_location":"freezer","category":"Frozen"}]
- "We need more milk" → [{"type":"add_shopping","name":"Milk","quantity":1,"unit":"l","storage_location":"fridge","category":"Dairy"}]
- "I used 500g of rice" → [{"type":"update_quantity","name":"Rice","quantity":500,"unit":"g","storage_location":"pantry","category":"Grains"}]
- "Remove milk from the shopping list" → [{"type":"remove_shopping","name":"Milk","quantity":0,"unit":"pieces","storage_location":"fridge","category":"Dairy"}]
- "Delete sugar from pantry" → [{"type":"remove_inventory","name":"Sugar","quantity":0,"unit":"kg","storage_location":"pantry","category":"Other"}]
- "Clear the shopping list" → [{"type":"clear_shopping","name":"all","quantity":0,"unit":"pieces","storage_location":"pantry","category":"Other"}]
- "Take out the eggs from the fridge" → [{"type":"remove_inventory","name":"Eggs","quantity":0,"unit":"pieces","storage_location":"fridge","category":"Dairy"}]

If a user says they "finished", "ate", or "threw away" something, use "remove_inventory".
If they say "delete" or "remove" something from the pantry/fridge/freezer, use "remove_inventory" with quantity 0 (meaning remove entirely).
If they say they "bought" or "got" something, use "add_inventory".
If they say they "used" some amount, use "update_quantity" (to reduce by that amount).
If they say they "need" something, use "add_shopping".
If they say "remove" or "delete" something from the shopping list, use "remove_shopping".
If they say "clear the shopping list" or "empty the shopping list", use "clear_shopping".

Always respond with ONLY the JSON array, no other text.`;

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
                        type: { type: "string", enum: ["add_inventory", "remove_inventory", "update_quantity", "add_shopping"] },
                        name: { type: "string" },
                        quantity: { type: "number" },
                        unit: { type: "string" },
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
