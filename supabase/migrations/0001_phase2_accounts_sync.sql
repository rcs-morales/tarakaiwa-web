-- Phase 2 — Accounts & sync
-- Additive migration: the project already has a `bug_reports` table and a
-- `bug-screenshots` storage bucket (used by src/bugReporter.js). Nothing here
-- touches them. Safe to run once against the existing Supabase project.
--
-- Tables:
--   profiles         — one row per auth user (auto-created on signup)
--   user_settings    — synced settings blob (jsonb), one row per user
--   decks            — imported Q&A databases
--   session_results  — a completed practice run's score + per-question results
--   api_usage        — per-day quota counters (service-role only; Phase 3 proxy)
--
-- RLS: every user-facing table is locked to `auth.uid() = user_id`.
-- api_usage intentionally has RLS enabled with NO policies, so neither the anon
-- nor the authenticated key can read/write it — only the service-role key
-- (used by the Phase 3 Pages Functions) bypasses RLS.

-- ─────────────────────────────────────────────
-- profiles
-- ─────────────────────────────────────────────
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Auto-provision a profile row whenever a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────
-- user_settings
-- ─────────────────────────────────────────────
create table if not exists public.user_settings (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  settings   jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "user_settings_all_own" on public.user_settings;
create policy "user_settings_all_own" on public.user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────
-- decks
-- ─────────────────────────────────────────────
create table if not exists public.decks (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text,
  jlpt_level text,
  qa         jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.decks enable row level security;

drop policy if exists "decks_all_own" on public.decks;
create policy "decks_all_own" on public.decks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists decks_user_updated_idx
  on public.decks (user_id, updated_at desc);

-- ─────────────────────────────────────────────
-- session_results
-- ─────────────────────────────────────────────
create table if not exists public.session_results (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  deck_id    uuid references public.decks (id) on delete set null,
  jlpt_level text,
  score      int,
  total      int,
  results    jsonb,
  created_at timestamptz not null default now()
);

alter table public.session_results enable row level security;

drop policy if exists "session_results_select_own" on public.session_results;
create policy "session_results_select_own" on public.session_results
  for select using (auth.uid() = user_id);

drop policy if exists "session_results_insert_own" on public.session_results;
create policy "session_results_insert_own" on public.session_results
  for insert with check (auth.uid() = user_id);

create index if not exists session_results_user_idx
  on public.session_results (user_id, created_at desc);

-- ─────────────────────────────────────────────
-- api_usage  (service-role only — Phase 3)
-- ─────────────────────────────────────────────
create table if not exists public.api_usage (
  user_id         uuid not null references auth.users (id) on delete cascade,
  day             date not null default current_date,
  chat_requests   int not null default 0,
  whisper_seconds numeric not null default 0,
  primary key (user_id, day)
);

alter table public.api_usage enable row level security;
-- No policies on purpose: RLS with zero policies denies all anon/authenticated
-- access. Only the service-role key (Phase 3 Pages Functions) can read/write.
