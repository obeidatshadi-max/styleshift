-- Security hardening found by the Phase A audit (docs/security/production-readiness-audit.md).
-- Corrective and additive: it replaces policies and one function, and touches no data.
-- NOT applied to production by this commit; apply it deliberately, after reading the audit.
--
-- Safe to run on production AND on a database built only from the migration files: every step is
-- idempotent. Production had drifted from the files (its profiles policies use two helper functions that no
-- file creates, among other differences), so step 1 makes the files reproduce what production already has.
--
-- Rollback (forward repair): re-create the dropped policies from the migrations named below and restore the
-- previous protect_profile_authority() from 20261104131000.
--
-- 1. Parity with production. auth_is_manager() and auth_company_id() exist in production (created outside the
--    migration files, as "fix_rls_recursion") and are created here only if missing, so production's own
--    versions are never replaced. Without them the files' "manager profiles read" policy is recursive and
--    every signed-in query on profiles fails.
-- 2. assignment_progress / assignment_replies: the insert policies only checked rep_id, so a rep of one
--    company could write rows against ANOTHER company's assignment id and have them appear on that company's
--    manager's board. They now require the assignment to belong to the rep's own company.
-- 3. conversation_turns: managers could read every rep's raw voice-practice transcript text directly
--    ("manager conversation turns read", 026). Nothing in the app reads them as a manager, and the sharing
--    model makes private practice opt-in. The policy is dropped; reps keep their own access.
-- 4. profiles.group_id: a signed-in user could set it to any group id (and so join a group without its
--    invite code). It is only ever changed by the server (/api/groups, /api/groups/join), so the authority
--    trigger now protects it like role and company_id.
-- 5. companies: the files' "manager insert company" (WITH CHECK (true)) would let any visitor create a company.
--    Production does not have it; it is dropped here so a database built from the files matches production.
-- 6. roleplay_sessions: production has an own-row UPDATE policy (migration "roleplay_sessions_own_update_policy")
--    that no file contains. It is added here, idempotently, for parity.

-- 1
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'auth_company_id' and pronamespace = 'public'::regnamespace) then
    create function public.auth_company_id() returns uuid language sql stable security definer set search_path = public, pg_temp
      as 'select company_id from public.profiles where id = auth.uid()';
  end if;
  if not exists (select 1 from pg_proc where proname = 'auth_is_manager' and pronamespace = 'public'::regnamespace) then
    create function public.auth_is_manager() returns boolean language sql stable security definer set search_path = public, pg_temp
      as 'select exists(select 1 from public.profiles where id = auth.uid() and role = ''manager'')';
  end if;
end $$;

drop policy if exists "manager profiles read" on public.profiles;
create policy "manager profiles read" on public.profiles
  for select using (public.auth_is_manager() and company_id = public.auth_company_id());

-- 2
drop policy if exists "own progress insert" on public.assignment_progress;
create policy "own progress insert" on public.assignment_progress
  for insert with check (
    rep_id = auth.uid()
    and assignment_id in (
      select a.id from public.assignments a
      where a.company_id in (select p.company_id from public.profiles p where p.id = auth.uid())
    )
  );

drop policy if exists "own replies insert" on public.assignment_replies;
create policy "own replies insert" on public.assignment_replies
  for insert with check (
    rep_id = auth.uid()
    and assignment_id in (
      select a.id from public.assignments a
      where a.company_id in (select p.company_id from public.profiles p where p.id = auth.uid())
    )
    and (session_id is null or session_id in (select id from public.roleplay_sessions where rep_id = auth.uid()))
  );

-- 3
drop policy if exists "manager conversation turns read" on public.conversation_turns;

-- 4
create or replace function public.protect_profile_authority()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if auth.role() in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.company_id is not null or coalesce(new.role, 'rep') <> 'rep' or new.group_id is not null then
        raise exception 'role, company_id and group_id can only be set by the server' using errcode = '42501';
      end if;
    elsif new.role is distinct from old.role
       or new.company_id is distinct from old.company_id
       or new.group_id is distinct from old.group_id then
      raise exception 'role, company_id and group_id can only be changed by the server' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- 5
drop policy if exists "manager insert company" on public.companies;
revoke insert on public.companies from anon, authenticated;

-- 6
drop policy if exists "own roleplay sessions update" on public.roleplay_sessions;
create policy "own roleplay sessions update" on public.roleplay_sessions
  for update using (rep_id = auth.uid())
  with check (
    rep_id = auth.uid()
    and (doctor_id is null or doctor_id in (select id from public.doctors where rep_id = auth.uid()))
    and (colleague_id is null or colleague_id in (select id from public.colleagues where rep_id = auth.uid()))
  );
