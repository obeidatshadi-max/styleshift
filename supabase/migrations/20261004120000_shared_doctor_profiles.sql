-- Manager-authored doctor personas shared into reps' existing AI Doctor flow.
-- The source profile is company-owned; each assignment creates a rep-owned
-- copy in `doctors` so all current simulation ownership checks still apply.
create table public.company_doctor_profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  profile jsonb not null check (jsonb_typeof(profile) = 'object'),
  source_notes text not null default '',
  created_at timestamptz not null default now()
);

create index company_doctor_profiles_company_created_idx
  on public.company_doctor_profiles(company_id, created_at desc);

create table public.company_doctor_assignments (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.company_doctor_profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  rep_id uuid not null references public.profiles(id) on delete cascade,
  rep_doctor_id uuid not null references public.doctors(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, rep_id),
  unique (rep_doctor_id)
);

create index company_doctor_assignments_rep_idx
  on public.company_doctor_assignments(rep_id, created_at desc);

alter table public.company_doctor_profiles enable row level security;
alter table public.company_doctor_assignments enable row level security;

-- Managers may read the source profiles in their company. Mutations use the
-- authenticated API plus service role, which validates manager role/company.
create policy "company managers read doctor profiles" on public.company_doctor_profiles
  for select to authenticated using (
    company_id in (select company_id from public.profiles where id = auth.uid() and role = 'manager')
  );

create policy "owners and managers read doctor assignments" on public.company_doctor_assignments
  for select to authenticated using (
    rep_id = auth.uid()
    or company_id in (select company_id from public.profiles where id = auth.uid() and role = 'manager')
  );

revoke all on public.company_doctor_profiles from anon, authenticated;
grant select on public.company_doctor_profiles to authenticated;
revoke all on public.company_doctor_assignments from anon, authenticated;
grant select on public.company_doctor_assignments to authenticated;

-- The debrief remains private to its rep but now retains the doctor context.
alter table public.coach_debriefs
  add column doctor_id uuid references public.doctors(id) on delete set null,
  add column doctor_name text;

create index coach_debriefs_rep_doctor_created_idx
  on public.coach_debriefs(rep_id, doctor_id, created_at desc);
