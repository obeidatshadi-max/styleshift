-- Company-authored, compliance-approved scenarios: a manager drafts an
-- objection drill for their company, then approves it before reps can see
-- or practice it. Separate from the AI-generated per-doctor drill
-- (generate-scenario) and the static built-in levels — this is content the
-- company itself controls.
create table public.company_scenarios (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  style text not null check (style in ('driver', 'expressive', 'amiable', 'analytical')),
  name text not null,
  crisis text not null,
  q text not null,
  opts jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'approved', 'archived')),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz default now()
);

create index company_scenarios_company_status_idx on public.company_scenarios (company_id, status);

alter table public.company_scenarios enable row level security;

-- All access goes through API routes using the service-role client, but
-- mirror the manager/rep boundaries so direct client reads stay safe if
-- ever added.
create policy "member read approved scenarios" on public.company_scenarios
  for select using (
    status = 'approved'
    and company_id in (select company_id from public.profiles where id = auth.uid())
  );

create policy "manager full access to own company scenarios" on public.company_scenarios
  for all using (
    company_id in (
      select company_id from public.profiles
      where id = auth.uid() and role = 'manager'
    )
  );
