-- Coaching assignments: a manager targets one objection category or one level;
-- selected reps (or the whole team) each complete one qualifying run. Only one
-- assignment per company is active at a time (app deactivates the previous one).
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('category', 'level')),
  target_key text not null,
  rep_ids uuid[],            -- null = every rep in the company
  due_date date not null default (current_date + 7),
  active boolean not null default true,
  created_at timestamptz default now()
);

-- One row per rep per assignment, written when the rep finishes the run.
create table public.assignment_progress (
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  rep_id uuid not null references public.profiles(id) on delete cascade,
  completed_at timestamptz default now(),
  primary key (assignment_id, rep_id)
);

alter table public.assignments enable row level security;
alter table public.assignment_progress enable row level security;

-- All access goes through API routes using the service-role client, but mirror
-- the manager/rep boundaries so direct client reads stay safe if ever added.
create policy "member read assignments" on public.assignments
  for select using (
    company_id in (select company_id from public.profiles where id = auth.uid())
  );

create policy "manager write assignments" on public.assignments
  for all using (
    company_id in (
      select company_id from public.profiles
      where id = auth.uid() and role = 'manager'
    )
  );

create policy "own progress read" on public.assignment_progress
  for select using (rep_id = auth.uid());

create policy "own progress insert" on public.assignment_progress
  for insert with check (rep_id = auth.uid());

create policy "manager progress read" on public.assignment_progress
  for select using (
    assignment_id in (
      select id from public.assignments
      where company_id in (
        select company_id from public.profiles
        where id = auth.uid() and role = 'manager'
      )
    )
  );
