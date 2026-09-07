-- Voice-partner question-drill results: one row per completed 2-turn
-- session (ask a question, then respond to the doctor's answer). Unlike
-- voice_partner_sessions there is no outcome/turn_count — the session is
-- always exactly two fixed turns. Rows are self-reported by the client
-- (no server-side session state to validate against) — a future
-- manager-facing view must treat them as practice self-reports, not
-- audited results.
create table public.voice_partner_question_sessions (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete set null,
  style text check (style = any (array['driver','expressive','amiable','analytical'])),
  question_type text not null check (question_type = any (
    array['forbidden_reason','forbidden_indication','effective_challenges','effective_criteria','other']
  )),
  listening_cues_hit text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.voice_partner_question_sessions enable row level security;

create policy "own voice partner question sessions read" on public.voice_partner_question_sessions for select using (rep_id = auth.uid());

create policy "own voice partner question sessions insert" on public.voice_partner_question_sessions for insert with check (
  rep_id = auth.uid()
  and (doctor_id is null or doctor_id in (select id from public.doctors where rep_id = auth.uid()))
);

create policy "manager voice partner question sessions read" on public.voice_partner_question_sessions for select using (
  rep_id in (
    select id from public.profiles
    where company_id in (
      select company_id from public.profiles where id = auth.uid() and role = 'manager'
    )
  )
);
