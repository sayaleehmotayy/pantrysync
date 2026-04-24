import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { chargeCredits, AI_COST, logAiCost } from "../_shared/aiCredits.ts";

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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const credit = await chargeCredits(user.id, AI_COST.parseShopping);
    if (!credit.ok) {
      return new Response(JSON.stringify(credit.body), {
        status: credit.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
        model: "google/gemini-2.5-flash-lite",
        max_tokens: 200,
        messages: [
          {
            role: "system",
            content: `Extract ONLY food/grocery item names from the message. Return just the item names, quantities and categories. Ignore all conversational words.

Examples:
- "I was wondering if we need 6 more apples?" → name:"apples", quantity:6, unit:"pieces"
- "buy 2 bottles of milk and bread" → two items: milk (2 bottles) and bread (1 pieces)  
- "Do we have salt" → name:"salt", quantity:1, unit:"pieces"
- "Hey how are you doing?" → NO items (no food mentioned with intent)
- "Can someone pick up eggs and cheese from the store?" → eggs and cheese

RULES:
- Extract food items even from questions like "do we need X?" or "should I get X?"
- Keep names clean: just the food name, no extra words
- Default quantity 1 and unit "pieces" if not specified
- Return empty array ONLY if no food/grocery items are mentioned at all`,
          },
          { role: "user", content: message },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_shopping_items",
              description: "Extract food items from message",
              parameters: {
                type: "object",
                properties: {
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string", description: "Food item name only, e.g. apples, milk, bread" },
                        quantity: { type: "number" },
                        unit: { 
                          type: "string", 
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
    logAiCost({ userId: user.id, feature: "parse-shopping-items", creditsCharged: AI_COST.parseShopping, model: "google/gemini-2.5-flash-lite", usage: data.usage });
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
