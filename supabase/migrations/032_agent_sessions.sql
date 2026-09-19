-- Multi-agent text simulation: one row per simulation. `record` holds the whole
-- orchestrator record (shared session incl. transcript, observations, scores,
-- coaching, workflow phase, step trace, final report) as one JSON document —
-- the orchestrator reads and writes it as a unit, and every field inside is
-- derived practice data (no audio is involved).
--
-- `id` is the simulation/session id. `phase` is duplicated out of the JSON so
-- unfinished simulations can be found without parsing every document.
create table public.agent_sessions (
  id uuid primary key,
  rep_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete set null,
  phase text not null check (phase = any (array['in_roleplay','ended','analyzed','scored','reported'])),
  record jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index agent_sessions_rep_idx on public.agent_sessions (rep_id, created_at desc);

alter table public.agent_sessions enable row level security;

-- A rep only ever sees and changes their own simulations. Deliberately no
-- manager read policy: the record holds the full transcript, and nothing in
-- the product yet promises managers access to text simulations.
create policy "own agent sessions read" on public.agent_sessions
  for select using (rep_id = auth.uid());

create policy "own agent sessions insert" on public.agent_sessions
  for insert with check (rep_id = auth.uid());

create policy "own agent sessions update" on public.agent_sessions
  for update using (rep_id = auth.uid()) with check (rep_id = auth.uid());

-- Same governance as the other practice-history tables (see 022).
create policy "own agent sessions delete" on public.agent_sessions
  for delete using (rep_id = auth.uid());
