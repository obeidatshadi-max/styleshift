-- Key-message practice. A manager (or a rep, for one customer) writes a key message;
-- the app generates a version for each of the four social styles; the rep practises
-- by writing their own version and getting feedback.
--
-- Privacy: the rep's practice text is private. A manager sees only that a rep
-- finished (key_message_progress, same shape as assignment_progress). Practice
-- text reaches the manager only when the rep ticks "share" on that attempt.
create table public.key_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_by_role text not null check (created_by_role in ('manager', 'rep')),
  rep_ids uuid[],                       -- null = every rep in the company (manager messages only)
  doctor_id uuid references public.doctors(id) on delete set null,  -- rep-created, per customer
  message_text text not null check (char_length(message_text) between 1 and 600),
  mode text not null default 'written' check (mode in ('written', 'verbal')),
  versions jsonb,                       -- { driver, expressive, amiable, analytical }, generated once
  due_date date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.key_message_attempts (
  id uuid primary key default gen_random_uuid(),
  key_message_id uuid not null references public.key_messages(id) on delete cascade,
  rep_id uuid not null references public.profiles(id) on delete cascade,
  style text not null check (style in ('driver', 'expressive', 'amiable', 'analytical')),
  attempt_text text not null check (char_length(attempt_text) between 1 and 1200),
  feedback jsonb,
  shared_with_manager boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.key_message_progress (
  key_message_id uuid not null references public.key_messages(id) on delete cascade,
  rep_id uuid not null references public.profiles(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (key_message_id, rep_id)
);

create index key_messages_company_idx on public.key_messages (company_id, created_at desc);
create index key_message_attempts_rep_idx on public.key_message_attempts (rep_id, created_at desc);

alter table public.key_messages enable row level security;
alter table public.key_message_attempts enable row level security;
alter table public.key_message_progress enable row level security;

-- Managers see every message in their company; a rep sees messages addressed to them or written by them.
create policy "manager read key_messages" on public.key_messages
  for select using (
    company_id in (select company_id from public.profiles where id = auth.uid() and role = 'manager')
  );
create policy "rep read key_messages" on public.key_messages
  for select using (
    company_id in (select company_id from public.profiles where id = auth.uid())
    and (created_by = auth.uid() or rep_ids is null or auth.uid() = any (rep_ids))
  );

create policy "own attempts read" on public.key_message_attempts
  for select using (rep_id = auth.uid());
create policy "manager shared attempts read" on public.key_message_attempts
  for select using (
    shared_with_manager
    and key_message_id in (
      select id from public.key_messages
      where company_id in (select company_id from public.profiles where id = auth.uid() and role = 'manager')
    )
  );

create policy "own progress read" on public.key_message_progress
  for select using (rep_id = auth.uid());
create policy "manager progress read" on public.key_message_progress
  for select using (
    key_message_id in (
      select id from public.key_messages
      where company_id in (select company_id from public.profiles where id = auth.uid() and role = 'manager')
    )
  );
-- All writes go through API routes with the service-role client, which checks role and ownership first.
