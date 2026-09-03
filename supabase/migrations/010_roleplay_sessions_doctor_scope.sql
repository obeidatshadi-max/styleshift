-- Close authorization gap: a rep could otherwise attach any doctor_id
-- (including one owned by another rep/company) to their own roleplay
-- session. Require doctor_id, when present, to be one of the rep's own
-- doctors.
drop policy "own roleplay sessions insert" on public.roleplay_sessions;
create policy "own roleplay sessions insert" on public.roleplay_sessions for insert with check (
  rep_id = auth.uid()
  and (doctor_id is null or doctor_id in (select id from public.doctors where rep_id = auth.uid()))
);
