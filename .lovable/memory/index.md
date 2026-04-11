# Project Memory

## Core
PantrySync: household grocery/pantry management app. Mobile-first, green/beige palette.
DM Sans body, Plus Jakarta Sans headings. Supabase backend via Lovable Cloud.
Bottom nav on mobile (5 items: Home, Pantry, Shop, Recipes, Chat). Sidebar on desktop adds Expiry, Activity, Settings.
Capacitor configured for native iOS/Android builds.
Stripe Pro subscription at $4.99/mo gates AI, recipes, chat, coupons.

## Memories
- [Design tokens](mem://design/tokens) — Color palette, typography, CSS variables
- [DB schema](mem://features/db-schema) — Tables: households, inventory_items (with expiry_date, storage_location, min_threshold), shopping_list_items, chat_messages, recipes, recipe_ingredients, activity_log, profiles
- [Activity logging](mem://features/activity-log) — All inventory actions logged to activity_log table with real-time subscription
- [Subscription tiers](mem://features/subscription-tiers) — Free vs Pro feature breakdown and Stripe config
