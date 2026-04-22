# Google Play Billing — Setup Guide

PantrySync uses **Google Play Billing** for all in-app subscriptions on Android.
This guide walks you through configuring the Play Console and the backend so
purchases are unlocked end-to-end.

---

## 1. Create the subscription products in Play Console

1. Open [Google Play Console](https://play.google.com/console) → your app.
2. **Monetize → Products → Subscriptions** → **Create subscription**.
3. Create the following six **Subscription products** (the `Product ID` must
   match exactly — they are wired into the app code):

   | Product ID          | Tier      | Billing period | Suggested price (EUR) |
   |---------------------|-----------|----------------|-----------------------|
   | `duo_monthly`       | Duo       | Monthly        | €2.99                 |
   | `duo_yearly`        | Duo       | Yearly         | €24.99                |
   | `family_monthly`    | Family    | Monthly        | €4.99                 |
   | `family_yearly`     | Family    | Yearly         | €44.99                |
   | `unlimited_monthly` | Unlimited | Monthly        | €7.99                 |
   | `unlimited_yearly`  | Unlimited | Yearly         | €69.99                |

4. For each product:
   - **Name / Description**: short marketing copy (shown by Play UI).
   - **Base plan**: 1 month or 1 year (matching the period above).
   - **Free trial offer (optional but recommended)**: add a 7-day free trial
     offer to the base plan so new subscribers get a trial automatically.
   - **Activate** the product.
5. Set a price in your home country, then click **Set prices for other
   countries** → **Auto-convert** so all markets get a localised price.

> **Note:** Play product IDs are immutable. Spell them exactly as above —
> the app, edge function, and `join_household_with_invite` SQL function all
> reference these IDs.

---

## 2. Upload an app build with Play Billing

Play only returns product details once your APK/AAB has the
`com.android.vending.BILLING` permission and is uploaded to **Internal testing**
(or higher). The plugin (`@capgo/native-purchases`) adds this permission
automatically when you run:

```bash
npx cap sync android
cd android && ./gradlew bundleRelease
```

Upload the resulting `app-release.aab` to **Testing → Internal testing** and add
your test account's email under **Testers**.

---

## 3. Create a service account for server-side verification

Play purchases must be verified server-side (Google policy + so users can't
spoof a token to unlock Pro for free).

1. In [Google Cloud Console](https://console.cloud.google.com), select the
   project linked to your Play Console.
2. **IAM & Admin → Service Accounts → Create service account**.
   - Name: `pantrysync-play-verifier`
   - Role: leave blank for now (we grant Play permissions in step 4).
3. Open the service account → **Keys → Add key → Create new key → JSON**.
   Download the JSON file. **Keep it secret.**

---

## 4. Grant the service account access to Play

1. Open **Play Console → Users and permissions → Invite new users**.
2. Email = the service account's `client_email` (from the JSON, ends with
   `@<project>.iam.gserviceaccount.com`).
3. Click **Account permissions** → grant:
   - **View app information and download bulk reports**
   - **View financial data, orders, and cancellation survey responses**
   - **Manage orders and subscriptions**
4. Save. It can take ~24 hours for permissions to propagate.

---

## 5. Configure backend secrets in Lovable Cloud

In your Lovable project, open **Cloud → Edge Functions → Secrets** and add:

| Secret name                          | Value                                                        |
|--------------------------------------|--------------------------------------------------------------|
| `GOOGLE_PLAY_PACKAGE_NAME`           | `com.pantrysync.app`                                         |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`   | The **entire** contents of the service-account JSON file     |

The `verify-google-purchase` edge function reads both of these to:

1. Sign a JWT with the service account's private key.
2. Exchange the JWT for an OAuth access token.
3. Call `androidpublisher.purchases.subscriptions.get` to verify the purchase.
4. Acknowledge the purchase (required within 3 days of purchase).
5. Mirror the entitlement into `subscription_cache` so the rest of the app
   (RLS, household member limits, `check-subscription`) treats it as Pro.

---

## 6. How entitlements flow

```
Android app                Edge Function              Database
───────────                 ─────────────              ────────
purchaseProduct() ────────► verify-google-purchase
                             │
                             ├─► Google Play Dev API (verify + acknowledge)
                             │
                             └─► subscription_cache.upsert
                                  - stripe_customer_id = "google_play"  ← sentinel
                                  - product_id         = "family_yearly"
                                  - status             = "active" | "trialing"
                                  - current_period_end = expiry
```

`check-subscription` looks at `subscription_cache` first and treats the
`google_play` sentinel as a valid Pro entitlement (no Stripe call needed).

The `join_household_with_invite` SQL function also recognises the Play product
IDs (`duo_monthly`, `family_yearly`, etc.) when computing member limits.

---

## 7. Legacy Stripe subscribers

Existing customers who subscribed via Stripe before the Android-only switch
keep full Pro access automatically — `check-subscription` still queries Stripe
by email and grants entitlement.

The Android UI shows them a **"Legacy subscription active"** banner and hides
all in-app purchase / management actions, in line with Play's policy that no
alternate billing flow may be presented inside the Android app.

---

## 8. Testing checklist

- [ ] App installed from Play Internal Testing (not sideloaded — sideloads
      can't see Play products).
- [ ] Test account is listed under **License testing** in Play Console.
- [ ] All 6 product IDs are **Active** in Play Console.
- [ ] `GOOGLE_PLAY_PACKAGE_NAME` and `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`
      secrets are set in Lovable Cloud.
- [ ] After buying a test subscription, `subscription_cache` has a row with
      `stripe_customer_id = 'google_play'` and `status = 'active'`.
- [ ] App shows the "Pro" badge and gated routes (Recipes, AI, Chat, etc.)
      become accessible.
- [ ] **Restore purchases** button on `/plans` re-syncs entitlement after
      reinstall.

---

## 9. Production review

Before promoting to production:

1. Confirm **no Stripe checkout / card form** is reachable inside the Android app.
2. Confirm the only subscription path on Android is `purchaseProduct()` →
   Play sheet.
3. Submit for review with a test account credential so reviewers can buy a
   subscription in the sandbox.
