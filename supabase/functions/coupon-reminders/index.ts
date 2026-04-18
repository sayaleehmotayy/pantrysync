import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// ---------- FCM helpers (mirrors send-push-notification) ----------
const encodeBase64Url = (input: ArrayBuffer | Uint8Array | string) => {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input)
    : input instanceof Uint8Array ? input : new Uint8Array(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

async function getAccessToken(sa: Record<string, string>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${encodeBase64Url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now, exp: now + 3600,
  }))}`;
  const pem = sa.private_key.replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "").replace(/\s/g, "");
  const bin = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", bin.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  const signed = `${unsigned}.${encodeBase64Url(sig)}`;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signed }),
  });
  if (!r.ok) throw new Error(`token: ${await r.text()}`);
  return (await r.json()).access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const srk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const saJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON");
    const admin = createClient(url, srk);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);
    const in1Str = new Date(today.getTime() + 86400000).toISOString().slice(0, 10);
    const in2Str = new Date(today.getTime() + 2 * 86400000).toISOString().slice(0, 10);

    // === 1. CLEANUP: hard-delete coupons past delete_after ===
    const nowIso = new Date().toISOString();
    const { data: toDelete } = await admin
      .from("discount_codes")
      .select("id")
      .lt("delete_after", nowIso);
    let deleted = 0;
    if (toDelete && toDelete.length > 0) {
      const { error: delErr } = await admin
        .from("discount_codes").delete().in("id", toDelete.map((r) => r.id));
      if (!delErr) deleted = toDelete.length;
    }

    // === 2. MARK NEWLY EXPIRED: set status=expired, expired_at, delete_after=+24h ===
    const { data: nowExpired } = await admin
      .from("discount_codes")
      .select("id, expiry_date")
      .lt("expiry_date", todayStr)
      .neq("status", "expired");
    let markedExpired = 0;
    if (nowExpired && nowExpired.length > 0) {
      const expiredAt = new Date().toISOString();
      const deleteAfter = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
      for (const r of nowExpired) {
        await admin.from("discount_codes").update({
          status: "expired", expired_at: expiredAt, delete_after: deleteAfter,
        }).eq("id", r.id);
      }
      markedExpired = nowExpired.length;
    }

    // === 3. REMINDERS: query coupons that need reminders ===
    // Fetch any coupon expiring in [today, today+2]
    const { data: upcoming } = await admin
      .from("discount_codes")
      .select("id, household_id, store_name, title, code, expiry_date, reminder_2d_sent, reminder_1d_sent, reminder_0d_sent")
      .gte("expiry_date", todayStr)
      .lte("expiry_date", in2Str)
      .neq("status", "expired");

    let inAppCreated = 0;
    let pushSent = 0;
    const errors: string[] = [];

    let accessToken: string | null = null;
    let projectId: string | null = null;
    if (saJson) {
      try {
        const sa = JSON.parse(saJson);
        accessToken = await getAccessToken(sa);
        projectId = sa.project_id;
      } catch (e) { console.error("[coupon-reminders] FCM init failed", e); }
    }

    for (const c of upcoming || []) {
      let kind: "0d" | "1d" | "2d" | null = null;
      if (c.expiry_date === todayStr && !c.reminder_0d_sent) kind = "0d";
      else if (c.expiry_date === in1Str && !c.reminder_1d_sent) kind = "1d";
      else if (c.expiry_date === in2Str && !c.reminder_2d_sent) kind = "2d";
      if (!kind) continue;

      const label = c.title || c.code || "Coupon";
      const when = kind === "0d" ? "today" : kind === "1d" ? "tomorrow" : "in 2 days";
      const message = `${label} for ${c.store_name} expires ${when}`;

      // Get household members
      const { data: members } = await admin
        .from("household_members").select("user_id").eq("household_id", c.household_id);
      const userIds = (members || []).map((m) => m.user_id);
      if (userIds.length === 0) continue;

      // In-app notifications (sender_id = first member as a system stand-in: use the user themselves)
      const rows = userIds.map((uid) => ({
        user_id: uid,
        sender_id: uid,
        household_id: c.household_id,
        message,
      }));
      const { error: notifErr } = await admin.from("notifications").insert(rows);
      if (!notifErr) inAppCreated += rows.length;
      else errors.push(`notif: ${notifErr.message}`);

      // Push
      if (accessToken && projectId) {
        const { data: tokens } = await admin
          .from("device_tokens").select("token, user_id").in("user_id", userIds);
        for (const t of tokens || []) {
          try {
            const r = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
              method: "POST",
              headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
              body: JSON.stringify({
                message: {
                  token: t.token,
                  notification: { title: `Coupon expires ${when}`, body: message },
                  data: { type: "coupon_expiry", coupon_id: c.id, household_id: c.household_id },
                  android: { priority: "high", notification: { sound: "default", channel_id: "coupons" } },
                  apns: { payload: { aps: { sound: "default" } } },
                },
              }),
            });
            if (r.ok) pushSent += 1;
            else {
              const body = await r.text();
              if (body.includes("NOT_FOUND") || body.includes("UNREGISTERED")) {
                await admin.from("device_tokens").delete().eq("token", t.token);
              }
            }
          } catch (e) { errors.push(String(e)); }
        }
      }

      // Mark reminder sent + update status to expiring_soon
      const update: Record<string, unknown> = { status: "expiring_soon" };
      if (kind === "0d") update.reminder_0d_sent = true;
      if (kind === "1d") update.reminder_1d_sent = true;
      if (kind === "2d") update.reminder_2d_sent = true;
      await admin.from("discount_codes").update(update).eq("id", c.id);
    }

    return json({
      ok: true,
      deleted,
      marked_expired: markedExpired,
      reminders_processed: (upcoming || []).length,
      in_app_created: inAppCreated,
      push_sent: pushSent,
      errors: errors.length ? errors : undefined,
    });
  } catch (e) {
    console.error("[coupon-reminders] error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown" }, 500);
  }
});
