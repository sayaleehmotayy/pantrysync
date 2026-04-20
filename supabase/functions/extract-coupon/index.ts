import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SYSTEM = `You extract structured information from a photo of a coupon, voucher, discount card, or promotional receipt.
Extract ONLY what is clearly visible. For each field, also rate your confidence as "high", "medium", or "low".
Dates MUST be returned in ISO format (YYYY-MM-DD). If the image shows "Valid until 31/12/24" assume 20YY for 2-digit years.
If a field is not visible or you cannot read it, omit it (do not guess) and set its confidence to "low".`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    const { image_base64 } = await req.json();
    if (!image_base64 || typeof image_base64 !== "string") {
      return json({ error: "image_base64 required" }, 400);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI not configured" }, 500);

    const dataUrl = image_base64.startsWith("data:")
      ? image_base64
      : `data:image/jpeg;base64,${image_base64}`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract coupon details from this image." },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_coupon",
              description: "Return structured coupon information",
              parameters: {
                type: "object",
                properties: {
                  store_name: { type: "string" },
                  title: { type: "string", description: "Short offer title, e.g. '20% off groceries'" },
                  code: { type: "string", description: "Coupon/barcode/voucher code if visible" },
                  discount_text: { type: "string", description: "Discount amount/text, e.g. '20% off' or '$5 off'" },
                  description: { type: "string" },
                  expiry_date: { type: "string", description: "ISO date YYYY-MM-DD" },
                  valid_from: { type: "string", description: "ISO date YYYY-MM-DD" },
                  min_spend: { type: "number" },
                  restrictions: { type: "string", description: "Product/category restrictions" },
                  conditions: { type: "string", description: "Usage conditions: in-store only, online only, one-time use, etc." },
                  confidence: {
                    type: "object",
                    properties: {
                      store_name: { type: "string", enum: ["high", "medium", "low"] },
                      title: { type: "string", enum: ["high", "medium", "low"] },
                      code: { type: "string", enum: ["high", "medium", "low"] },
                      discount_text: { type: "string", enum: ["high", "medium", "low"] },
                      expiry_date: { type: "string", enum: ["high", "medium", "low"] },
                      valid_from: { type: "string", enum: ["high", "medium", "low"] },
                      overall: { type: "string", enum: ["high", "medium", "low"] },
                    },
                    required: ["overall"],
                  },
                },
                required: ["confidence"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_coupon" } },
      }),
    });

    if (!response.ok) {
      const txt = await response.text();
      console.error("[extract-coupon] AI error", response.status, txt);
      if (response.status === 429) return json({ error: "Rate limited, try again shortly" }, 429);
      if (response.status === 402) return json({ error: "AI credits exhausted" }, 402);
      return json({ error: "AI gateway error" }, 500);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) return json({ error: "No extraction returned", extracted: {} }, 200);

    const extracted = JSON.parse(toolCall.function.arguments);
    return json({ extracted });
  } catch (e) {
    console.error("[extract-coupon] error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
