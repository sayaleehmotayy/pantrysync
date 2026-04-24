import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { chargeCredits, AI_COST, logAiCost, WORST_CASE_COST } from "../_shared/aiCredits.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) throw new Error("Unauthorized");

    const credit = await chargeCredits(user.id, AI_COST.pantryAssistant);
    if (!credit.ok) {
      return new Response(JSON.stringify(credit.body), {
        status: credit.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { feature, householdId } = await req.json();
    if (!householdId || typeof householdId !== 'string') throw new Error("Missing householdId");

    // Verify caller is a member of this household (RLS covers queries below,
    // but explicit check prevents information leakage via error messages)
    const { data: membership } = await supabase
      .from('household_members')
      .select('id')
      .eq('household_id', householdId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership) throw new Error("Not a member of this household");

    // Fetch inventory for context
    const { data: inventory } = await supabase
      .from("inventory_items")
      .select("name, quantity, unit, category, expiry_date, storage_location")
      .eq("household_id", householdId);

    // Fetch recent shopping history
    const { data: shopping } = await supabase
      .from("shopping_list_items")
      .select("name, quantity, unit, category, status, created_at")
      .eq("household_id", householdId)
      .order("created_at", { ascending: false })
      .limit(50);

    const inventoryContext = (inventory || [])
      .map(i => `${i.name}: ${i.quantity} ${i.unit} (${i.category}, expires: ${i.expiry_date || 'N/A'}, stored: ${i.storage_location})`)
      .join("\n");

    const shoppingContext = (shopping || [])
      .map(i => `${i.name}: ${i.quantity} ${i.unit} (${i.category}, status: ${i.status})`)
      .join("\n");

    let systemPrompt = "";
    let userPrompt = "";

    switch (feature) {
      case "meal-planner":
        systemPrompt = `You are a creative meal planning assistant for a household pantry app. 
Generate a practical 7-day meal plan using available ingredients. 
Be creative but practical. Format with clear day headers, meal types (breakfast/lunch/dinner), 
and note which pantry items each meal uses. Include estimated prep times.
Use emoji for visual appeal. If ingredients are limited, suggest simple additions needed.`;
        userPrompt = `Here's what's currently in the pantry:\n${inventoryContext}\n\nCreate a practical 7-day meal plan prioritizing items expiring soonest. Include variety and balance.`;
        break;

      case "waste-advisor":
        systemPrompt = `You are a food waste reduction expert for a household pantry app.
Analyze expiring and available items and provide:
1. 🚨 Urgent items to use immediately (expired or expiring within 3 days)
2. 🍳 Quick recipes using those items (with instructions)
3. 💡 Storage tips to extend shelf life
4. 📊 A waste risk score (1-10) for the current pantry
5. 🧊 Freezing/preserving suggestions for items at risk
Be specific, actionable, and encouraging.`;
        userPrompt = `Current pantry inventory:\n${inventoryContext}\n\nAnalyze food waste risks and provide actionable advice.`;
        break;

      case "smart-shopping":
        systemPrompt = `You are an intelligent shopping assistant for a household pantry app.
Based on the current inventory and recent shopping patterns, provide:
1. 🛒 Predicted shopping list (items likely needed soon based on quantities and usage)
2. 📈 Usage pattern insights (what gets bought most, consumption trends)
3. 💰 Budget tips (bulk buying suggestions, seasonal alternatives)
4. 🔄 Auto-replenish recommendations (items that should always be stocked)
5. 📋 Organized shopping list by store section/category
Be data-driven and practical.`;
        userPrompt = `Current inventory:\n${inventoryContext}\n\nRecent shopping activity:\n${shoppingContext}\n\nGenerate smart shopping predictions and recommendations.`;
        break;

      default:
        throw new Error("Unknown feature: " + feature);
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits in Settings > Workspace > Usage." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    // Streaming response — usage isn't available; log a worst-case estimate so
    // monitoring still tracks this feature. Adjust if real costs drift.
    logAiCost({
      userId: user.id,
      feature: "ai-pantry-assistant",
      creditsCharged: AI_COST.pantryAssistant,
      model: "google/gemini-2.5-flash-lite",
      costEurOverride: WORST_CASE_COST.pantryAssistant,
    });

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-pantry-assistant error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
