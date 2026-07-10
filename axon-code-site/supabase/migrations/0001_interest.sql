-- Veylaro — register-interest capture
-- Run this once (SQL editor, or `supabase db push`, or the Supabase MCP).

create table if not exists public.interest (
  id         uuid primary key default gen_random_uuid(),
  email      text not null check (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' and char_length(email) < 200),
  source     text,
  ua         text,
  created_at timestamptz not null default now()
);

-- one row per email — a repeat signup is a no-op, not a duplicate
create unique index if not exists interest_email_key on public.interest (lower(email));

alter table public.interest enable row level security;

-- anyone (anon) may register interest — insert only, validated by the check above
drop policy if exists "anon can register interest" on public.interest;
create policy "anon can register interest"
  on public.interest for insert
  to anon, authenticated
  with check (true);

-- only the super admin may read the list
drop policy if exists "admin reads interest" on public.interest;
create policy "admin reads interest"
  on public.interest for select
  to authenticated
  using ( (auth.jwt() ->> 'email') = 'support@arohacalls.com' );

-- only the super admin may delete
drop policy if exists "admin deletes interest" on public.interest;
create policy "admin deletes interest"
  on public.interest for delete
  to authenticated
  using ( (auth.jwt() ->> 'email') = 'support@arohacalls.com' );
