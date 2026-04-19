---
name: Subscription tiers
description: Tiered plans (Duo/Family/Unlimited) in EUR, member limits, Stripe config, household-based Pro
type: feature
---
## Free Tier
- 1 member household (effectively solo)
- Basic pantry tracking, basic shopping list, expiry alerts
- No AI, no chat, no shared household

## Pro Tiers (all include 7-day free trial, billed in EUR)
| Tier | Monthly | Yearly | Members |
|------|---------|--------|---------|
| Duo | €2.99 | €24.99 | 2 |
| Family (Most Popular) | €4.99 | €44.99 | 5 |
| Unlimited | €7.99 | €69.99 | ∞ |

## AI Feature Block (shown identically on all paid tiers)
Title: "AI-Powered Pantry System". Bullets: voice pantry, AI recipes, smart shopping & budget, receipt & discount scanning, real-time household sync & chat. Tagline: "Save time. Reduce waste. Spend smarter."

## Stripe Products (EUR — current)
- Duo monthly: prod_UMmLQfrU8s7K5Z / price_1TO2myAjA7ulr1iap9Qrx9vP
- Duo yearly: prod_UMmMruDBeQbqq2 / price_1TO2nQAjA7ulr1iafua2Ozq6
- Family monthly: prod_UMmMPePoc6w4tV / price_1TO2nmAjA7ulr1iaBedyATLN
- Family yearly: prod_UMmMkbQrw4RvWk / price_1TO2o8AjA7ulr1iap12N8hwi
- Unlimited monthly: prod_UMmNSMB08gx044 / price_1TO2oRAjA7ulr1iaNFYWH0jA
- Unlimited yearly: prod_UMmN3UgAX6Nj4X / price_1TO2ohAjA7ulr1iaiWp60eLC

## Legacy USD Stripe Products (existing subscribers — auto-mapped to tier)
- Duo USD: prod_UJmkcGNlIWvfoh, prod_UK2GPSlm6dNKbC
- Family USD: prod_UK3jUbJSpStHEx, prod_UK3k0gRfRqH9dl
- Unlimited USD: prod_UK3k6GQ1X2Phkl, prod_UK3l7pPFppJ6G2
Both new and legacy product IDs are present in `PRODUCT_TO_TIER` (src/config/subscription.ts) AND in the `join_household_with_invite` SQL function.

## Business Model
- Household-based Pro: admin pays, entire household inherits access
- check-subscription checks user's sub first, then household members' subs
- Member limit enforced server-side via join_household_with_invite RPC
- Gated routes: /ai, /recipes, /coupons, /chat, /receipts
- Admin bypass: pantrysync9@gmail.com
- Default tier shown on upgrade UI: Family (Most Popular)
- Wording: "Choose a plan", "Upgrade this household", "Unlock AI-powered pantry", "Manage household subscription". Never "Upgrade to Pro".
