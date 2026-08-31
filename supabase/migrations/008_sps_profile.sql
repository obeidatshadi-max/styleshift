-- SPS onboarding: a rep's dominant sales-style profile, computed once on
-- first play and stored on their existing profiles row. No new RLS policies
-- needed — the existing "own profile update/read" and "manager profiles
-- read" policies from 001_initial_schema.sql already cover the whole row.
alter table public.profiles
  add column if not exists sps_top_key text,
  add column if not exists sps_profile jsonb;
