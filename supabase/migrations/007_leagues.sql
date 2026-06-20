-- Curated leagues group teams (companies) for cross-team weekly competition.
-- Managed by the platform owner via SQL/MCP; no self-serve join in v1.
create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- One league per team for now (YAGNI: a join table only if a team must later
-- be in multiple leagues). Nullable: most companies are in no league.
alter table public.companies
  add column league_id uuid references public.leagues(id) on delete set null;

alter table public.leagues enable row level security;
-- Reads go through the service-role admin client (leagues.ts); no select policy
-- needed. Leagues are written by the platform owner via SQL.
