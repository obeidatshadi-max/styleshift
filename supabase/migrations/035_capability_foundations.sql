-- Capability foundations (Phase 1): storage for configurable simulation
-- scenarios, product knowledge packs and company methodologies.
--
-- ADDITIVE ONLY: four new tables, no existing table, column, constraint or
-- policy is touched, and nothing reads these tables until Phase 2 ships.
-- Rollback (safe, nothing depends on them):
--   drop table public.sim_scenario_assignments, public.sim_scenarios,
--              public.knowledge_packs, public.methodologies;
--
-- Each `config` column holds the validated JSON document described by the
-- matching validator in src/schemas/* (scenario, knowledge, methodology).
-- `schema_version` lets a later validator change migrate old rows instead of
-- breaking them. The database does not re-validate the JSON; the API layer
-- must run the validator before every write.

-- ── Simulation scenarios (AI Doctor configs; NOT the MCQ company_scenarios) ──
create table public.sim_scenarios (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  config jsonb not null,
  schema_version int not null default 1,
  status text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index sim_scenarios_company_status_idx on public.sim_scenarios (company_id, status);

-- null assignee_rep_id = the whole company (managers' "team"); otherwise one rep.
create table public.sim_scenario_assignments (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.sim_scenarios(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  assignee_rep_id uuid references public.profiles(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id) on delete cascade,
  due_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index sim_scenario_assignments_unique_idx
  on public.sim_scenario_assignments (scenario_id, coalesce(assignee_rep_id, '00000000-0000-0000-0000-000000000000'::uuid));
create index sim_scenario_assignments_rep_idx on public.sim_scenario_assignments (assignee_rep_id);

-- ── Knowledge packs (clinical / approved content) ──
create table public.knowledge_packs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  product_name text not null,
  config jsonb not null,
  schema_version int not null default 1,
  status text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index knowledge_packs_company_status_idx on public.knowledge_packs (company_id, status);

-- ── Methodologies (company terminology over the shared behavior ontology) ──
create table public.methodologies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  config jsonb not null,
  schema_version int not null default 1,
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- At most one active methodology per company.
create unique index methodologies_one_active_idx on public.methodologies (company_id) where status = 'active';

alter table public.sim_scenarios enable row level security;
alter table public.sim_scenario_assignments enable row level security;
alter table public.knowledge_packs enable row level security;
alter table public.methodologies enable row level security;

-- Managers: full access inside their own company only.
create policy "manager full access sim_scenarios" on public.sim_scenarios
  for all
  using (company_id in (select company_id from public.profiles where id = auth.uid() and role = 'manager'))
  with check (company_id in (select company_id from public.profiles where id = auth.uid() and role = 'manager'));

create policy "manager full access sim_scenario_assignments" on public.sim_scenario_assignments
  for all
  using (company_id in (select company_id from public.profiles where id = auth.uid() and role = 'manager'))
  with check (company_id in (select company_id from public.profiles where id = auth.uid() and role = 'manager'));

create policy "manager full access knowledge_packs" on public.knowledge_packs
  for all
  using (company_id in (select company_id from public.profiles where id = auth.uid() and role = 'manager'))
  with check (company_id in (select company_id from public.profiles where id = auth.uid() and role = 'manager'));

create policy "manager full access methodologies" on public.methodologies
  for all
  using (company_id in (select company_id from public.profiles where id = auth.uid() and role = 'manager'))
  with check (company_id in (select company_id from public.profiles where id = auth.uid() and role = 'manager'));

-- Reps: read only what they may practice.
create policy "rep reads approved assigned sim_scenarios" on public.sim_scenarios
  for select using (
    status = 'approved'
    and company_id in (select company_id from public.profiles where id = auth.uid())
    and id in (
      select scenario_id from public.sim_scenario_assignments
      where assignee_rep_id = auth.uid() or assignee_rep_id is null
    )
  );

create policy "rep reads own sim_scenario_assignments" on public.sim_scenario_assignments
  for select using (
    company_id in (select company_id from public.profiles where id = auth.uid())
    and (assignee_rep_id = auth.uid() or assignee_rep_id is null)
  );

create policy "member reads active methodology" on public.methodologies
  for select using (
    status = 'active'
    and company_id in (select company_id from public.profiles where id = auth.uid())
  );

-- knowledge_packs: deliberately NO rep policy. A pack holds internal coaching
-- notes and unreleased messaging; prompts are built server-side with the
-- service-role client through selectForPrompt(), which filters by audience.
