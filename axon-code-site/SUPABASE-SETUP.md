# Supabase setup — Veylaro

Backend: Supabase project `ockumizfxvzdkcjgmqcl`
(`src/lib/supabase.ts` holds the URL + publishable key — safe to ship).

## 1. Admin login — DONE, ready now ✅

Your Veylaro admin account is live and **pre-confirmed** (no email click needed):

- **URL:** https://veylaroai.com/#/admin
- **Email:** leoanthonybons@gmail.com
- **Password:** the one you chose

Just go there and sign in. (The Supabase project is *owned* by
support@arohacalls.com; the Veylaro admin *login* is leoanthonybons@gmail.com —
they're independent. Only that email is allowed through the gate, set in
`src/lib/supabase.ts` → `SUPER_ADMINS`.)

## 2. The `interest` table — one migration left

Register-interest emails currently queue safely in each visitor's browser
(nothing is lost). To store them in the cloud and see them in Mission Control,
run the migration once — any of:

- **SQL Editor:** paste [`supabase/migrations/0001_interest.sql`](supabase/migrations/0001_interest.sql) → Run.
- **CLI:** `supabase db push` (needs the DB password).
- **MCP:** authorize the project MCP (`.mcp.json` is already set) via `/mcp`, then Claude applies it.

Creating a table needs a database-level credential (DB password or a Management
API token) that the publishable/secret API keys don't grant — that's why this
one step is manual. RLS in the migration: anyone may submit an email; only
leoanthonybons@gmail.com can read or delete the list.

## Notes
- Publishable key in the repo = public client key, safe.
- **Never commit the secret key** (`sb_secret_…`) — it's server-only and isn't in any file.
- Email confirmation stays ON for anyone who signs up later — good for security.
