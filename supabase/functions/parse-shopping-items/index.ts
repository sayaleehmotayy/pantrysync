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
    const { message } = await req.json();
    if (!message || typeof message !== "string" || message.length > 2000) {
      return new Response(JSON.stringify({ items: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content: `You are a smart shopping list parser for a household pantry app.

Given a chat message, extract grocery/shopping items the user wants to add.
Only extract items when the message clearly indicates adding to a shopping list (e.g. "add X to the list", "buy X", "we need X", "get X from the store", "add X to shopping list").
If the message is just casual conversation with no shopping intent, return NO items.

IMPORTANT RULES:
1. **Extract the correct unit**: If the user says "500 milliliters" or "500ml", set quantity to 500 and unit to "ml". If they say "2 kg", set quantity to 2 and unit to "kg". If they say "3 bottles", set quantity to 3 and unit to "bottles". Default to "pieces" only if no unit is mentioned.
2. **Smart serving estimation**: If the user says something like "enough ketchup to serve 40 people" or "enough rice for 10 people", estimate a realistic quantity and unit based on common serving sizes. For example:
   - "enough ketchup for 40 people" → ~2 bottles (500ml each) → name: "ketchup", quantity: 2, unit: "bottles"
   - "enough rice for 10 people" → ~2 kg → name: "rice", quantity: 2, unit: "kg"
   - "enough milk for 20 people" → ~4 liters → name: "milk", quantity: 4, unit: "l"
   Use practical, store-buyable quantities and common packaging sizes.
3. **Keep item names clean and singular**: "chocolate ice cream" not "chocolate ice cream 500 milliliters". The quantity and unit should be separate fields.

Use the provided tool to return structured data.`,
          },
          { role: "user", content: message },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_shopping_items",
              description: "Extract shopping items from a message with proper quantity, unit, and category",
              parameters: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Clean product name e.g. apples, milk, bread (no quantities or units in the name)" },
                        quantity: { type: "number", description: "Numeric quantity e.g. 500 for 500ml, 2 for 2 bottles, 1 if unspecified" },
                        unit: { 
                          type: "string", 
                          description: "Unit of measurement",
                          enum: ["pieces", "g", "kg", "ml", "l", "cups", "tbsp", "tsp", "bottles", "packets"]
                        },
                        category: {
                          type: "string",
                          enum: ["Fruits", "Vegetables", "Dairy", "Grains", "Snacks", "Drinks", "Meat", "Spices", "Frozen", "Sauces", "Other"],
                        },
                      },
                      required: ["name", "quantity", "unit", "category"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["items"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_shopping_items" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited, please try again later." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("AI error:", response.status, await response.text());
      return new Response(JSON.stringify({ items: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let items: any[] = [];

    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        items = parsed.items || [];
      } catch {
        items = [];
      }
    }

    return new Response(JSON.stringify({ items }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-shopping-items error:", e);
    return new Response(JSON.stringify({ items: [], error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
