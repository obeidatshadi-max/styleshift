-- supabase/migrations/033_conversation_reports.sql
--
-- Adds the storage this feature needs without touching the three existing
-- session tables (roleplay_sessions, conversation_turns, agent_sessions):
--
-- transcript_segments: canonical per-turn evidence store for the two flows
--   that don't already have one with real audio offsets (human-partner
--   roleplay's diarized utterances are currently discarded after the
--   aggregate is saved; the new customer-visit flow needs the same thing).
--   conversation_turns and agent_sessions.record.session.transcript remain
--   the source of truth for their own flows — a per-flow adapter reads them
--   directly instead of duplicating them here.
--
-- customer_visits: the new consented real-customer-recording session type.
--
-- conversation_reports: one generated ConversationReport per
-- (session_type, session_id, transcript_version) combination.

create table public.transcript_segments (
  id uuid primary key default gen_random_uuid(),
  session_type text not null check (session_type = any (array['human_partner','customer_visit'])),
  session_id uuid not null,
  rep_id uuid not null references public.profiles(id) on delete cascade,
  transcript_version integer not null default 1,
  segment_index integer not null,
  speaker_role text not null check (speaker_role = any (array['rep','counterpart'])),
  text text not null,
  start_ms integer,
  end_ms integer,
  created_at timestamptz not null default now(),
  unique (session_type, session_id, transcript_version, segment_index)
);

create index transcript_segments_session_idx
  on public.transcript_segments (session_type, session_id, transcript_version);

alter table public.transcript_segments enable row level security;

create policy "own transcript segments read" on public.transcript_segments
  for select using (rep_id = auth.uid());
create policy "own transcript segments insert" on public.transcript_segments
  for insert with check (rep_id = auth.uid());
create policy "own transcript segments delete" on public.transcript_segments
  for delete using (rep_id = auth.uid());

-- No update policy: a transcript version is immutable once written. A
-- speaker correction (Task 13) inserts a NEW transcript_version rather than
-- mutating rows in place, so every report can always cite the exact
-- version it was generated from.

create table public.customer_visits (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  objective text,
  product_context text,
  speaker_label_rep text,
  speaker_label_customer text,
  consent_confirmed_at timestamptz,
  retention_policy text not null default 'discard_after_report'
    check (retention_policy = any (array['discard_after_report','retain_90_days','retain_indefinite'])),
  audio_deleted_at timestamptz,
  status text not null default 'recording'
    check (status = any (array['recording','transcribing','pick_speaker','ready','failed'])),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.customer_visits enable row level security;

create policy "own customer visits read" on public.customer_visits
  for select using (rep_id = auth.uid());
create policy "own customer visits insert" on public.customer_visits
  for insert with check (rep_id = auth.uid());
create policy "own customer visits update" on public.customer_visits
  for update using (rep_id = auth.uid()) with check (rep_id = auth.uid());
create policy "own customer visits delete" on public.customer_visits
  for delete using (rep_id = auth.uid());

-- Deliberately no manager-read policy on customer_visits or its segments —
-- this is consented real-customer data; nothing in the product yet promises
-- manager access to it (same reasoning as agent_sessions, migration 032).

create table public.conversation_reports (
  id uuid primary key default gen_random_uuid(),
  session_type text not null check (session_type = any (array['human_partner','ai_doctor_voice','ai_doctor_text','customer_visit'])),
  session_id uuid not null,
  rep_id uuid not null references public.profiles(id) on delete cascade,
  transcript_version integer not null default 1,
  report_schema_version integer not null default 1,
  scoring_config_version text,
  report jsonb not null,
  status text not null check (status = any (array['complete','partial','failed'])),
  failure_reason text,
  superseded_by uuid references public.conversation_reports(id) on delete set null,
  created_at timestamptz not null default now()
);

create index conversation_reports_session_idx
  on public.conversation_reports (session_type, session_id, created_at desc);

alter table public.conversation_reports enable row level security;

create policy "own conversation reports read" on public.conversation_reports
  for select using (rep_id = auth.uid());
create policy "own conversation reports insert" on public.conversation_reports
  for insert with check (rep_id = auth.uid());
create policy "own conversation reports update" on public.conversation_reports
  for update using (rep_id = auth.uid()) with check (rep_id = auth.uid());
create policy "own conversation reports delete" on public.conversation_reports
  for delete using (rep_id = auth.uid());
