-- Lets a rep delete their own practice history — the derived scores/metadata
-- rows persisted per session, never the raw audio (already never stored).
-- Governance gap flagged in the Sep-2026 product review: consent copy
-- explained what's recorded, but there was no way for a rep to see or
-- remove their own history afterward.
create policy "own roleplay sessions delete" on public.roleplay_sessions
  for delete using (rep_id = auth.uid());

create policy "own voice partner sessions delete" on public.voice_partner_sessions
  for delete using (rep_id = auth.uid());

create policy "own voice partner opening sessions delete" on public.voice_partner_opening_sessions
  for delete using (rep_id = auth.uid());

create policy "own voice partner question sessions delete" on public.voice_partner_question_sessions
  for delete using (rep_id = auth.uid());

create policy "own voice partner fab sessions delete" on public.voice_partner_fab_sessions
  for delete using (rep_id = auth.uid());

create policy "own voice partner closing sessions delete" on public.voice_partner_closing_sessions
  for delete using (rep_id = auth.uid());
