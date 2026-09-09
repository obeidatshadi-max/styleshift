-- A rep's opt-in reply to their active coaching assignment: proof of work
-- shared with the manager. Sharing is never automatic — the rep chooses one
-- doctor/colleague roleplay session or writes a note. Submitting a reply
-- also completes the assignment (same effect as a qualifying run).
create table public.assignment_replies (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  rep_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('doctor_session', 'colleague_session', 'note')),
  session_id uuid references public.roleplay_sessions(id) on delete set null,
  note_text text,
  created_at timestamptz not null default now(),
  check (
    (kind = 'note' and note_text is not null and session_id is null)
    or (kind in ('doctor_session', 'colleague_session') and session_id is not null and note_text is null)
  )
);

alter table public.assignment_replies enable row level security;

create policy "own replies read" on public.assignment_replies
  for select using (rep_id = auth.uid());

create policy "own replies insert" on public.assignment_replies
  for insert with check (
    rep_id = auth.uid()
    and (session_id is null or session_id in (select id from public.roleplay_sessions where rep_id = auth.uid()))
  );

create policy "manager replies read" on public.assignment_replies
  for select using (
    assignment_id in (
      select id from public.assignments
      where company_id in (
        select company_id from public.profiles
        where id = auth.uid() and role = 'manager'
      )
    )
  );
