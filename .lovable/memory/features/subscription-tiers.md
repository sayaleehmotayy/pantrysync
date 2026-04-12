---
name: Subscription tiers
description: Free vs Pro feature breakdown, Stripe config, household-based Pro model
type: feature
---
## Free Features
- Pantry tracking
- Shopping list
- Expiry alerts
- 1 household

## Pro Features ($4.99/mo or $39.99/yr)
- AI assistant
- Voice commands
- Recipe suggestions
- Discount code scanner
- Group chat
- Advanced analytics
- Priority support
- Unlimited households
- 7-day free trial included

## Business Model
- **Household-based Pro**: Owner pays, entire household gets Pro access
- check-subscription checks user's own sub first, then household owner's sub
- Gated routes: /ai, /recipes, /coupons, /chat

## Stripe Config
- Monthly: prod_UJmkcGNlIWvfoh / price_1TL9BJAjA7ulr1iaMtf4tEQd
- Yearly: prod_UK2GPSlm6dNKbC / price_1TLOC5AjA7ulr1iaKTx0JYLW
- Trial: 7 days
- Admin bypass: pantrysync9@gmail.com
