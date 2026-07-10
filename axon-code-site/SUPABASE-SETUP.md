# Supabase setup — Veylaro

The site is wired to the Supabase project `ockumizfxvzdkcjgmqcl`
(`src/lib/supabase.ts`, publishable key — safe to ship). Two things finish it.

## 1. Log into Mission Control (you're 1 click away)

Your admin account is already created:
- **Email:** support@arohacalls.com
- **Password:** the one you chose

**Check the support@arohacalls.com inbox for the "Confirm your signup" email
from Supabase and click the link.** Then go to `https://veylaroai.com/#/admin`
and sign in. That's it — no dashboard work needed for login.

(Only `support@arohacalls.com` is allowed through the gate — the list lives in
`src/lib/supabase.ts` → `SUPER_ADMINS`.)

## 2. Create the `interest` table (one time)

Until this runs, register-interest emails queue safely in each visitor's
browser and the admin panel shows "table not found" — nothing is lost.

**Easiest:** Supabase dashboard → **SQL Editor** → paste the contents of
[`supabase/migrations/0001_interest.sql`](supabase/migrations/0001_interest.sql)
→ **Run**. Done.

**Or via the MCP:** the project MCP is registered in `.mcp.json`
(`https://mcp.supabase.com/mcp?project_ref=ockumizfxvzdkcjgmqcl`). Authorize it
once (`/mcp` in an interactive Claude session) and Claude can apply the
migration for you with `apply_migration`.

The migration also turns on row-level security: anyone may submit an email,
only `support@arohacalls.com` can read or delete the list.

## Notes
- The publishable key in `src/lib/supabase.ts` is the public client key — safe in the repo.
- Never commit the **service_role** key; it isn't needed for anything above.
- Email confirmation is on (Supabase default) — good, it keeps the admin login secure.
