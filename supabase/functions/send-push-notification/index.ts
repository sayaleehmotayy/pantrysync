import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Google OAuth2 token exchange for FCM v1 API
async function getAccessToken(serviceAccount: any): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));

  const unsignedToken = `${header}.${payload}`;

  // Import the private key and sign the JWT
  const pemContents = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\n/g, "");
  
  const binaryKey = Uint8Array.from(atob(pemContents), (c) => c.charCodeAt(0));
  
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const signedToken = `${unsignedToken}.${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;

  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${signedToken}`,
  });

  if (!tokenResponse.ok) {
    const errText = await tokenResponse.text();
    throw new Error(`Failed to get access token: ${errText}`);
  }

  const tokenData = await tokenResponse.json();
  return tokenData.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { mentioned_user_ids, sender_name, message, household_id, chat_message_id, sender_id } = await req.json();

    if (!mentioned_user_ids?.length || !message || !household_id || !sender_id) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
    if (!serviceAccountJson) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON not configured");
    }

    const serviceAccount = JSON.parse(serviceAccountJson);
    const projectId = serviceAccount.project_id;

    // Get device tokens for mentioned users
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: tokens, error: tokensError } = await supabase
      .from("device_tokens")
      .select("token, user_id")
      .in("user_id", mentioned_user_ids);

    if (tokensError) {
      console.error("Error fetching tokens:", tokensError);
      throw new Error("Failed to fetch device tokens");
    }

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "No device tokens found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create notification records
    const notifications = mentioned_user_ids.map((userId: string) => ({
      user_id: userId,
      sender_id,
      household_id,
      message: `${sender_name}: ${message}`,
      chat_message_id,
    }));

    // Use sender_id for the insert since RLS checks auth.uid() = sender_id
    // We use service role key so RLS is bypassed
    await supabase.from("notifications").insert(notifications);

    // Get FCM access token
    const accessToken = await getAccessToken(serviceAccount);

    // Send FCM messages
    let sent = 0;
    const errors: string[] = [];

    for (const tokenRecord of tokens) {
      try {
        const fcmResponse = await fetch(
          `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: {
                token: tokenRecord.token,
                notification: {
                  title: `${sender_name} mentioned you`,
                  body: message.length > 100 ? message.slice(0, 100) + "..." : message,
                },
                data: {
                  type: "mention",
                  household_id,
                  chat_message_id: chat_message_id || "",
                },
                android: {
                  priority: "high",
                  notification: { sound: "default" },
                },
                apns: {
                  payload: {
                    aps: { sound: "default", badge: 1 },
                  },
                },
              },
            }),
          }
        );

        if (fcmResponse.ok) {
          sent++;
        } else {
          const errBody = await fcmResponse.text();
          console.error(`FCM send failed for token ${tokenRecord.token.slice(0, 10)}...:`, errBody);
          
          // Remove invalid tokens
          if (errBody.includes("NOT_FOUND") || errBody.includes("UNREGISTERED")) {
            await supabase.from("device_tokens").delete().eq("token", tokenRecord.token);
          }
          errors.push(errBody);
        }
      } catch (e) {
        console.error("FCM send error:", e);
        errors.push(e instanceof Error ? e.message : "Unknown error");
      }
    }

    return new Response(JSON.stringify({ sent, total: tokens.length, errors: errors.length > 0 ? errors : undefined }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("send-push-notification error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
