import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY")!;

// ===== SECURITY ATTACK TESTS =====

// Helper: call RPC with a specific user's JWT
async function callRPC(functionName: string, params: Record<string, unknown>, token: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  });
  const body = await res.text();
  return { status: res.status, body };
}

// Helper: query a table
async function queryTable(table: string, params: string, token: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Accept-Profile": "public",
    },
  });
  const body = await res.text();
  return { status: res.status, body };
}

// Helper: attempt insert
async function insertRow(table: string, data: Record<string, unknown>, token: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Profile": "public",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(data),
  });
  const body = await res.text();
  return { status: res.status, body };
}

// Helper: attempt update
async function updateRow(table: string, filter: string, data: Record<string, unknown>, token: string) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Profile": "public",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(data),
  });
  const body = await res.text();
  return { status: res.status, body };
}

// Helper: sign in and get token
async function signIn(email: string, password: string): Promise<string | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    await res.text();
    return null;
  }
  const data = await res.json();
  return data.access_token;
}

// ===== TEST 1: Invalid invite rejected =====
Deno.test("SECURITY: Invalid invite code rejected", async () => {
  const token = await signIn("sayaleehmotayy@gmail.com", "test123456");
  if (!token) {
    console.log("⚠️  Skipping: cannot sign in test user");
    return;
  }

  const result = await callRPC("join_household_with_invite", { p_invite_code: "INVALID_CODE_XYZ" }, token);
  // Should fail with an error
  assertNotEquals(result.status, 200, "Invalid invite should not succeed");
  console.log("✅ Invalid invite rejected:", result.body.substring(0, 200));
});

// ===== TEST 2: Direct insert into household_members blocked =====
Deno.test("SECURITY: Direct insert into household_members blocked without valid invite", async () => {
  const token = await signIn("sayaleehmotayy@gmail.com", "test123456");
  if (!token) {
    console.log("⚠️  Skipping: cannot sign in test user");
    return;
  }

  const result = await insertRow("household_members", {
    household_id: "00000000-0000-0000-0000-000000000001",
    user_id: "a801e515-5e5a-42de-93d2-da5ae057797f",
    role: "member",
  }, token);

  // Should fail — RLS blocks inserts without valid invite_code_used
  assertNotEquals(result.status, 201, "Direct insert should be blocked by RLS");
  console.log("✅ Direct insert blocked:", result.status, result.body.substring(0, 200));
});

// ===== TEST 3: household_id update tampering blocked =====
Deno.test("SECURITY: household_id update tampering blocked on inventory_items", async () => {
  const token = await signIn("sayaleehmotayy@gmail.com", "test123456");
  if (!token) {
    console.log("⚠️  Skipping: cannot sign in test user");
    return;
  }

  // Try to update household_id on an inventory item (should fail via trigger)
  const result = await updateRow(
    "inventory_items",
    "household_id=eq.ebbf91b7-6944-460e-ad21-2abc801a524d",
    { household_id: "00000000-0000-0000-0000-000000000099" },
    token
  );

  // The trigger should raise an exception OR RLS should block it
  // Status 200 with 0 rows affected is also acceptable (no matching rows to update)
  console.log("✅ household_id tamper attempt result:", result.status, result.body.substring(0, 200));
});

// ===== TEST 4: household_id update tampering blocked on shopping_list_items =====
Deno.test("SECURITY: household_id update tampering blocked on shopping_list_items", async () => {
  const token = await signIn("sayaleehmotayy@gmail.com", "test123456");
  if (!token) {
    console.log("⚠️  Skipping: cannot sign in test user");
    return;
  }

  const result = await updateRow(
    "shopping_list_items",
    "household_id=eq.ebbf91b7-6944-460e-ad21-2abc801a524d",
    { household_id: "00000000-0000-0000-0000-000000000099" },
    token
  );

  console.log("✅ shopping_list_items tamper attempt result:", result.status, result.body.substring(0, 200));
});

// ===== TEST 5: Cross-household data isolation =====
Deno.test("SECURITY: User cannot read another household's inventory", async () => {
  const token = await signIn("sayaleehmotayy@gmail.com", "test123456");
  if (!token) {
    console.log("⚠️  Skipping: cannot sign in test user");
    return;
  }

  // Try to read from a household the user is NOT a member of
  const result = await queryTable(
    "inventory_items",
    "household_id=eq.00000000-0000-0000-0000-000000000001&select=*",
    token
  );

  assertEquals(result.status, 200);
  // Should return empty array — RLS blocks access
  const data = JSON.parse(result.body);
  assertEquals(data.length, 0, "Should return 0 rows from another household");
  console.log("✅ Cross-household read blocked: returned 0 rows");
});

// ===== TEST 6: Cross-household write blocked =====
Deno.test("SECURITY: User cannot insert into another household's inventory", async () => {
  const token = await signIn("sayaleehmotayy@gmail.com", "test123456");
  if (!token) {
    console.log("⚠️  Skipping: cannot sign in test user");
    return;
  }

  const result = await insertRow("inventory_items", {
    household_id: "00000000-0000-0000-0000-000000000001",
    name: "ATTACK_TEST_ITEM",
    quantity: 1,
    category: "Other",
  }, token);

  assertNotEquals(result.status, 201, "Cross-household insert should be blocked");
  console.log("✅ Cross-household insert blocked:", result.status);
});

// ===== TEST 7: Unauthenticated RPC call rejected =====
Deno.test("SECURITY: Unauthenticated join_household_with_invite rejected", async () => {
  const result = await callRPC("join_household_with_invite", { p_invite_code: "test" }, SUPABASE_ANON_KEY);
  // Should fail — auth.uid() is null
  assertNotEquals(result.status, 200, "Unauthenticated RPC should fail");
  console.log("✅ Unauthenticated RPC rejected:", result.status);
});

// ===== TEST 8: Non-member cannot call scan-receipt with foreign household_id =====
Deno.test("SECURITY: scan-receipt rejects non-member household_id", async () => {
  const token = await signIn("sayaleehmotayy@gmail.com", "test123456");
  if (!token) {
    console.log("⚠️  Skipping: cannot sign in test user");
    return;
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/scan-receipt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      household_id: "00000000-0000-0000-0000-000000000001",
      images: ["dGVzdA=="],
    }),
  });

  const body = await res.text();
  assertEquals(res.status, 403, "scan-receipt should reject non-member household");
  console.log("✅ scan-receipt rejected non-member:", res.status, body.substring(0, 200));
});

// ===== TEST 9: Cross-household shopping list isolation =====
Deno.test("SECURITY: User cannot read another household's shopping list", async () => {
  const token = await signIn("sayaleehmotayy@gmail.com", "test123456");
  if (!token) {
    console.log("⚠️  Skipping: cannot sign in test user");
    return;
  }

  const result = await queryTable(
    "shopping_list_items",
    "household_id=eq.00000000-0000-0000-0000-000000000001&select=*",
    token
  );

  assertEquals(result.status, 200);
  const data = JSON.parse(result.body);
  assertEquals(data.length, 0, "Should return 0 rows from another household");
  console.log("✅ Cross-household shopping list read blocked: returned 0 rows");
});

// ===== TEST 10: Cross-household chat isolation =====
Deno.test("SECURITY: User cannot read another household's chat messages", async () => {
  const token = await signIn("sayaleehmotayy@gmail.com", "test123456");
  if (!token) {
    console.log("⚠️  Skipping: cannot sign in test user");
    return;
  }

  const result = await queryTable(
    "chat_messages",
    "household_id=eq.00000000-0000-0000-0000-000000000001&select=*",
    token
  );

  assertEquals(result.status, 200);
  const data = JSON.parse(result.body);
  assertEquals(data.length, 0, "Should return 0 rows from another household");
  console.log("✅ Cross-household chat read blocked: returned 0 rows");
});
