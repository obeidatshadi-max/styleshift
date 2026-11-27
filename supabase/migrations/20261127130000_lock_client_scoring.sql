-- Stop the browser writing scores, XP and badges (architecture review 2026-11-27, F1).
-- APPLY AFTER the server-scoring code is deployed and working. Before that deploy, the old
-- browser code still writes these rows, and this migration would make its writes fail.
--
-- After this:
--   sessions, xp_events, badges, daily_challenges  - written only by the server (service role)
--   profiles.xp, profiles.last_visit               - changed only by the server
-- Reps still read their own rows exactly as before. Managers' reads are unchanged.
--
-- Rollback: re-create the four dropped insert policies from 001_initial_schema.sql,
--           006_xp_events.sql and 003a_production_baseline_gap.sql, and re-run section 4 of
--           20261106120000_security_hardening.sql to restore the previous trigger body.

drop policy if exists "own sessions insert" on public.sessions;
drop policy if exists "own xp_events insert" on public.xp_events;
drop policy if exists "own badges insert" on public.badges;
drop policy if exists "daily own insert" on public.daily_challenges;

-- Same trigger as 20261106120000_security_hardening (role, company_id, group_id), now also
-- protecting xp and last_visit.
create or replace function public.protect_profile_authority()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if auth.role() in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.company_id is not null or coalesce(new.role, 'rep') <> 'rep' or new.group_id is not null then
        raise exception 'role, company_id and group_id can only be set by the server' using errcode = '42501';
      end if;
      if coalesce(new.xp, 0) <> 0 or new.last_visit is not null then
        raise exception 'xp and last_visit can only be set by the server' using errcode = '42501';
      end if;
    else
      if new.role is distinct from old.role
         or new.company_id is distinct from old.company_id
         or new.group_id is distinct from old.group_id then
        raise exception 'role, company_id and group_id can only be changed by the server' using errcode = '42501';
      end if;
      if new.xp is distinct from old.xp or new.last_visit is distinct from old.last_visit then
        raise exception 'xp and last_visit can only be changed by the server' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;
