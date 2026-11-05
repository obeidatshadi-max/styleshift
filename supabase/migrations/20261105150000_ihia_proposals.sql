-- Phrase proposals from transcript corrections. When a rep fixes a misheard phrase in a saved
-- recording and ticks "share the corrected phrase", only the changed words (what the speech engine
-- wrote, and what the speaker really said) land here. No whole lines, no session id, no names.
-- An IHIA reviewer turns a proposal into a draft library entry or dismisses it. Nothing here
-- reaches the voice agent or the report prompts: only approved ihia_entries do.
create table public.ihia_proposals (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references auth.users(id) on delete cascade,
  heard text not null check (length(btrim(heard)) between 1 and 120),
  meant text not null check (length(btrim(meant)) between 1 and 120),
  status text not null default 'pending' check (status in ('pending','drafted','dismissed')),
  entry_id uuid references public.ihia_entries(id),
  handled_by uuid references auth.users(id),
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create index ihia_proposals_status on public.ihia_proposals (status, created_at desc);

alter table public.ihia_proposals enable row level security;
revoke all on public.ihia_proposals from anon, authenticated;
grant select, insert, update on public.ihia_proposals to authenticated;

-- A rep adds their own pending proposals and can read them back.
create policy ihia_proposals_insert on public.ihia_proposals for insert to authenticated
  with check (rep_id = (select auth.uid()) and status = 'pending' and entry_id is null and handled_by is null and handled_at is null);
create policy ihia_proposals_read on public.ihia_proposals for select to authenticated using (
  rep_id = (select auth.uid())
  or exists (select 1 from public.ihia_reviewers where user_id = (select auth.uid()))
);
-- Only reviewers triage them.
create policy ihia_proposals_update on public.ihia_proposals for update to authenticated using (
  exists (select 1 from public.ihia_reviewers where user_id = (select auth.uid()))
) with check (
  exists (select 1 from public.ihia_reviewers where user_id = (select auth.uid()))
);
