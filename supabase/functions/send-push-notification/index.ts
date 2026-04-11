import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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

const maskToken = (token: string) =>
  token ? `${token.slice(0, 12)}...${token.slice(-6)}` : "unknown";

const encodeBase64Url = (input: ArrayBuffer | Uint8Array | string) => {
  const bytes =
    typeof input === "string"
      ? new TextEncoder().encode(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

async function getAccessToken(serviceAccount: Record<string, string>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const unsignedToken = `${encodeBase64Url(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  )}.${encodeBase64Url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  )}`;

  const pemContents = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");

  const binaryKey = Uint8Array.from(atob(pemContents), (char) => char.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedToken),
  );

  const signedToken = `${unsignedToken}.${encodeBase64Url(signature)}`;
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: signedToken,
    }),
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
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const mentionedUserIds = Array.from(
      new Set(
        Array.isArray(payload.mentioned_user_ids)
          ? payload.mentioned_user_ids.filter((value: unknown): value is string => typeof value === "string" && value.length > 0)
          : [],
      ),
    );
    const senderName = typeof payload.sender_name === "string" ? payload.sender_name.trim() : "";
    const message = typeof payload.message === "string" ? payload.message.trim() : "";
    const householdId = typeof payload.household_id === "string" ? payload.household_id : "";
    const chatMessageId = typeof payload.chat_message_id === "string" ? payload.chat_message_id : null;
    const senderId = typeof payload.sender_id === "string" ? payload.sender_id : "";

    if (mentionedUserIds.length === 0 || !senderName || !message || !householdId || !senderId) {
      return json({ error: "Missing required fields" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey || !serviceAccountJson) {
      throw new Error("Missing backend environment configuration for push notifications");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing authorization header" }, 401);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();

    if (authError || !user) {
      console.error("[push] auth validation failed", authError);
      return json({ error: "Unauthorized" }, 401);
    }

    if (user.id !== senderId) {
      console.error("[push] sender mismatch", { authenticatedUserId: user.id, senderId });
      return json({ error: "Sender mismatch" }, 403);
    }

    const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);
    const serviceAccount = JSON.parse(serviceAccountJson);
    const projectId = serviceAccount.project_id;

    console.log("[push] received mention notification request", {
      senderId,
      senderName,
      householdId,
      chatMessageId,
      mentionedUserIds,
      messagePreview: message.slice(0, 120),
    });

    const { data: memberRows, error: memberError } = await adminClient
      .from("household_members")
      .select("user_id")
      .eq("household_id", householdId)
      .in("user_id", [senderId, ...mentionedUserIds]);

    if (memberError) {
      console.error("[push] failed to validate household membership", memberError);
      throw new Error("Failed to validate household membership");
    }

    const memberIds = new Set((memberRows ?? []).map((row) => row.user_id));
    if (!memberIds.has(senderId)) {
      return json({ error: "Sender is not part of this household" }, 403);
    }

    const validMentionedUserIds = mentionedUserIds.filter(
      (mentionedUserId) => mentionedUserId !== senderId && memberIds.has(mentionedUserId),
    );

    console.log("[push] validated household members for mention", {
      validMentionedUserIds,
      invalidMentionedUserIds: mentionedUserIds.filter((mentionedUserId) => !validMentionedUserIds.includes(mentionedUserId)),
    });

    if (validMentionedUserIds.length === 0) {
      return json({ sent: 0, total: 0, message: "No valid mentioned household members" });
    }

    const notificationRows = validMentionedUserIds.map((mentionedUserId: string) => ({
      user_id: mentionedUserId,
      sender_id: senderId,
      household_id: householdId,
      message: `${senderName}: ${message}`,
      chat_message_id: chatMessageId,
    }));

    const { error: notificationError } = await adminClient.from("notifications").insert(notificationRows);
    if (notificationError) {
      console.error("[push] failed to store notification rows", notificationError);
      throw new Error("Failed to store notification records");
    }

    console.log("[push] stored notification rows", {
      count: notificationRows.length,
      chatMessageId,
    });

    const { data: tokens, error: tokensError } = await adminClient
      .from("device_tokens")
      .select("token, user_id, platform")
      .in("user_id", validMentionedUserIds);

    if (tokensError) {
      console.error("[push] failed to fetch device tokens", tokensError);
      throw new Error("Failed to fetch device tokens");
    }

    console.log("[push] resolved device tokens", {
      requestedRecipients: validMentionedUserIds,
      tokenCount: tokens?.length ?? 0,
      tokenMappings: (tokens ?? []).map((tokenRecord) => ({
        userId: tokenRecord.user_id,
        platform: tokenRecord.platform,
        token: maskToken(tokenRecord.token),
      })),
    });

    if (!tokens || tokens.length === 0) {
      return json({ sent: 0, total: 0, message: "No device tokens found for mentioned users" });
    }

    const accessToken = await getAccessToken(serviceAccount);

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
                  title: `${senderName} mentioned you`,
                  body: message.length > 100 ? `${message.slice(0, 100)}...` : message,
                },
                data: {
                  type: "mention",
                  household_id: householdId,
                  chat_message_id: chatMessageId ?? "",
                  sender_id: senderId,
                },
                android: {
                  priority: "high",
                  notification: {
                    sound: "default",
                    channel_id: "default",
                  },
                },
                apns: {
                  payload: {
                    aps: { sound: "default", badge: 1 },
                  },
                },
              },
            }),
          },
        );

        const responseBody = await fcmResponse.text();

        if (fcmResponse.ok) {
          sent += 1;
          console.log("[push] fcm accepted push", {
            userId: tokenRecord.user_id,
            platform: tokenRecord.platform,
            token: maskToken(tokenRecord.token),
            response: responseBody,
          });
        } else {
          console.error("[push] fcm rejected push", {
            userId: tokenRecord.user_id,
            platform: tokenRecord.platform,
            token: maskToken(tokenRecord.token),
            status: fcmResponse.status,
            response: responseBody,
          });

          if (responseBody.includes("NOT_FOUND") || responseBody.includes("UNREGISTERED")) {
            const { error: deleteError } = await adminClient
              .from("device_tokens")
              .delete()
              .eq("token", tokenRecord.token);

            if (deleteError) {
              console.error("[push] failed to remove invalid token", deleteError);
            } else {
              console.log("[push] removed invalid token", {
                userId: tokenRecord.user_id,
                token: maskToken(tokenRecord.token),
              });
            }
          }

          errors.push(responseBody);
        }
      } catch (error) {
        console.error("[push] unexpected FCM send error", error);
        errors.push(error instanceof Error ? error.message : "Unknown error");
      }
    }

    return json({
      sent,
      total: tokens.length,
      valid_recipient_count: validMentionedUserIds.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error("send-push-notification error:", error);
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
