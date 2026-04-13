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
    const { message, inventory, shopping_list } = await req.json();
    if (!message || typeof message !== "string" || message.length > 2000) {
      return new Response(JSON.stringify({ intent: "chat", reply: null, items: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Build inventory context string
    const inventoryContext = Array.isArray(inventory) && inventory.length > 0
      ? inventory.map((i: any) => `- ${i.name}: ${i.quantity} ${i.unit} (${i.storage_location}, category: ${i.category}${i.expiry_date ? `, expires: ${i.expiry_date}` : ''})`).join("\n")
      : "The pantry is empty.";

    const shoppingContext = Array.isArray(shopping_list) && shopping_list.length > 0
      ? shopping_list.map((i: any) => `- ${i.name}: ${i.quantity} ${i.unit} (${i.status})`).join("\n")
      : "Shopping list is empty.";

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
            content: `You are PantrySync Assistant, a smart helper for a household grocery/pantry app.

You analyze chat messages and determine what the user wants. You have access to the household's current pantry inventory and shopping list.

CURRENT PANTRY INVENTORY:
${inventoryContext}

CURRENT SHOPPING LIST:
${shoppingContext}

YOUR JOB:
1. **Inventory questions** ("do we have X?", "how much X is left?", "is there any X?", "check if we have X"):
   - Check the inventory above and give a clear, friendly answer.
   - If the item exists, say how much is there and where it's stored.
   - If the item doesn't exist, say so and offer to add it to the shopping list.
   - If it's already on the shopping list, mention that too.

2. **Add to shopping list** ("add X", "buy X", "we need X", "get X from the store"):
   - Extract the items to add. Return them in the items array.
   - If the item is already in the pantry with sufficient quantity, mention that and ask if they still want to add it.

3. **General pantry questions** ("what's expiring soon?", "what do we need?", "what's running low?"):
   - Answer based on the inventory data. Items with quantity near 0 or below min_threshold are running low.
   - Items expiring within 3 days should be flagged.

4. **Just casual chat** (greetings, unrelated conversation):
   - Return intent "chat" with no reply. Don't interfere with normal conversation.

Be concise, friendly, and use emojis sparingly. Keep replies under 2-3 sentences. Be helpful, not annoying.

Use the provided tool to return structured data.`,
          },
          { role: "user", content: message },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "analyze_chat_message",
              description: "Analyze a chat message and determine intent, reply, and any items to add",
              parameters: {
                type: "object",
                properties: {
                  intent: {
                    type: "string",
                    enum: ["inventory_check", "add_items", "pantry_info", "chat"],
                    description: "The detected intent of the message",
                  },
                  reply: {
                    type: "string",
                    description: "The reply to show in chat. Null/empty for casual chat.",
                  },
                  items: {
                    type: "array",
                    description: "Items to add to shopping list (only for add_items intent)",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        quantity: { type: "number" },
                        unit: {
                          type: "string",
                          enum: ["pieces", "g", "kg", "ml", "l", "cups", "tbsp", "tsp", "bottles", "packets"],
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
                  suggest_add: {
                    type: "array",
                    description: "Items to suggest adding to shopping list (for inventory_check when item is missing)",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        quantity: { type: "number" },
                        unit: { type: "string" },
                        category: { type: "string" },
                      },
                      required: ["name"],
                      additionalProperties: false,
                    },
                  },
                },
                required: ["intent", "reply", "items"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "analyze_chat_message" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limited" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      console.error("AI error:", response.status, await response.text());
      return new Response(JSON.stringify({ intent: "chat", reply: null, items: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let result = { intent: "chat", reply: null as string | null, items: [] as any[], suggest_add: [] as any[] };

    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        result = {
          intent: parsed.intent || "chat",
          reply: parsed.reply || null,
          items: parsed.items || [],
          suggest_add: parsed.suggest_add || [],
        };
      } catch {
        // ignore parse errors
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("smart-chat-reply error:", e);
    return new Response(JSON.stringify({ intent: "chat", reply: null, items: [], error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
