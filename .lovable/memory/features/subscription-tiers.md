---
name: Subscription tiers
description: Tiered plans (Duo/Family/Unlimited), member limits, Stripe config, household-based Pro
type: feature
---
## Free Tier
- 1 household member (solo only)
- Pantry tracking, shopping list, expiry alerts

## Pro Tiers (all include 7-day free trial)
| Tier | Monthly | Yearly | Members |
|------|---------|--------|---------|
| Duo | $4.99 | $39.99 | 2 |
| Family | $7.99 | $63.99 | 5 |
| Unlimited | $9.99 | $79.99 | ∞ |

## Stripe Products
- Duo monthly: prod_UJmkcGNlIWvfoh / price_1TL9BJAjA7ulr1iaMtf4tEQd
- Duo yearly: prod_UK2GPSlm6dNKbC / price_1TLOC5AjA7ulr1iaKTx0JYLW
- Family monthly: prod_UK3jUbJSpStHEx / price_1TLPc0AjA7ulr1iaR0FwLhvv
- Family yearly: prod_UK3k0gRfRqH9dl / price_1TLPdIAjA7ulr1iaEPvH2o9Y
- Unlimited monthly: prod_UK3k6GQ1X2Phkl / price_1TLPcxAjA7ulr1iatcyMNX3K
- Unlimited yearly: prod_UK3l7pPFppJ6G2 / price_1TLPdjAjA7ulr1iasVS8Yy2B

## Business Model
- Household-based Pro: owner pays, entire household gets Pro access
- check-subscription checks user's sub first, then household members' subs
- Member limit enforced client-side in HouseholdContext.joinHousehold
- Gated routes: /ai, /recipes, /coupons, /chat
- Admin bypass: pantrysync9@gmail.com
