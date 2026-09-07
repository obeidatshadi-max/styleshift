-- Voice-partner objection-handling results: one row per completed AI voice
-- roleplay session (won or escalated — sessions that never resolve are never
-- persisted). Turns themselves stay stateless/unpersisted; only the final
-- objection type faced, CLEAR steps demonstrated, and verdict are stored.
-- Rows here are self-reported by the client (no server-side session state to
-- validate against) — a future manager-facing view must treat them as
-- practice self-reports, not audited results.
create table public.voice_partner_sessions (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete set null,
  style text check (style = any (array['driver','expressive','amiable','analytical'])),
  objection_type text not null check (objection_type = any (
    array['wrong_info','doubt','true_objection','indifference','false_objection']
  )),
  outcome text not null check (outcome = any (array['won','escalated'])),
  clear_steps_hit text[] not null default '{}',
  turn_count integer not null,
  created_at timestamptz not null default now()
);

alter table public.voice_partner_sessions enable row level security;

create policy "own voice partner sessions read" on public.voice_partner_sessions for select using (rep_id = auth.uid());

create policy "own voice partner sessions insert" on public.voice_partner_sessions for insert with check (
  rep_id = auth.uid()
  and (doctor_id is null or doctor_id in (select id from public.doctors where rep_id = auth.uid()))
);

create policy "manager voice partner sessions read" on public.voice_partner_sessions for select using (
  rep_id in (
    select id from public.profiles
    where company_id in (
      select company_id from public.profiles where id = auth.uid() and role = 'manager'
    )
  )
);
