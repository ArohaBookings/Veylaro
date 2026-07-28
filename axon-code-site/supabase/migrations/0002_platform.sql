-- Veylaro platform tables: remote app config, user profiles, referrals.
-- Run once in the Supabase SQL editor (or `supabase db push`).
-- Safe to re-run.

/* ------------------------------------------------------------------
   1. app_config — one row, the live switches Leo flips from Mission
      Control. The app and site read it at runtime; no redeploy needed.
   ------------------------------------------------------------------ */
create table if not exists public.app_config (
  id                 int primary key default 1,
  downloads_enabled  boolean not null default false,
  latest_app_version text    not null default '1.0.0',
  latest_model_tag   text    not null default 'laro-med',
  update_notes       text    not null default '',
  launch_month_on    boolean not null default true,
  updated_at         timestamptz not null default now(),
  constraint app_config_single_row check (id = 1)
);

insert into public.app_config (id) values (1) on conflict (id) do nothing;

alter table public.app_config enable row level security;

-- everyone may READ the switches (the app needs them before login)
drop policy if exists "anyone reads config" on public.app_config;
create policy "anyone reads config"
  on public.app_config for select to anon, authenticated using (true);

-- only the owner may change them
drop policy if exists "admin writes config" on public.app_config;
create policy "admin writes config"
  on public.app_config for update to authenticated
  using ( (auth.jwt() ->> 'email') = 'leoanthonybons@gmail.com' )
  with check ( (auth.jwt() ->> 'email') = 'leoanthonybons@gmail.com' );

/* ------------------------------------------------------------------
   2. profiles — one row per signed-up user. Plan + weekly usage live
      here so the desktop app and the website agree.
   ------------------------------------------------------------------ */
create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text not null,
  plan           text not null default 'free',
  billing_state  text not null default 'active',
  period_end     timestamptz,
  launch_trial_until timestamptz,
  weekly_used    int  not null default 0,
  week_key       text not null default '',
  referral_code  text unique,
  referred_by    text,
  referrals_used int  not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- a user sees and edits only their own row
drop policy if exists "own profile read" on public.profiles;
create policy "own profile read"
  on public.profiles for select to authenticated
  using ( auth.uid() = id or (auth.jwt() ->> 'email') = 'leoanthonybons@gmail.com' );

drop policy if exists "own profile write" on public.profiles;
create policy "own profile write"
  on public.profiles for update to authenticated
  using ( auth.uid() = id ) with check ( auth.uid() = id );

drop policy if exists "own profile insert" on public.profiles;
create policy "own profile insert"
  on public.profiles for insert to authenticated with check ( auth.uid() = id );

-- admin may reset weekly counters for everyone
drop policy if exists "admin resets usage" on public.profiles;
create policy "admin resets usage"
  on public.profiles for update to authenticated
  using ( (auth.jwt() ->> 'email') = 'leoanthonybons@gmail.com' )
  with check ( (auth.jwt() ->> 'email') = 'leoanthonybons@gmail.com' );

/* auto-create a profile (with a referral code) on signup */
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, referral_code, launch_trial_until)
  values (
    new.id,
    new.email,
    'LARO-' || upper(substr(md5(new.id::text), 1, 6)),
    now() + interval '30 days'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

/* ------------------------------------------------------------------
   3. referrals — who invited whom. Max 5 enforced in the app and here.
   ------------------------------------------------------------------ */
create table if not exists public.referrals (
  id            uuid primary key default gen_random_uuid(),
  referrer_code text not null,
  referred_email text not null,
  rewarded      boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (referrer_code, referred_email)
);

alter table public.referrals enable row level security;

drop policy if exists "anyone records a referral" on public.referrals;
create policy "anyone records a referral"
  on public.referrals for insert to anon, authenticated with check (true);

drop policy if exists "admin reads referrals" on public.referrals;
create policy "admin reads referrals"
  on public.referrals for select to authenticated
  using ( (auth.jwt() ->> 'email') = 'leoanthonybons@gmail.com' );
