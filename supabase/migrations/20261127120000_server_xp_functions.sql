-- Server-side XP (architecture review 2026-11-27, F1 + F3). APPLY BEFORE deploying the code
-- that calls these functions. Additive only: nothing existing changes, so it is safe to run first.
--
-- Until now the browser computed XP and wrote profiles.xp = (its cached xp) + gain. A rep could
-- write any number, and two quick gains could overwrite each other. These functions add XP in
-- one statement on the server, and write the matching xp_events ledger row in the same
-- transaction, so the lifetime total and the champion ledger cannot drift apart.
--
-- Only the service role may call them (the app's API routes). Signed-in users cannot.
--
-- Rollback: drop function public.award_xp(uuid, integer, text);
--           drop function public.record_visit(uuid, date, integer);
--           alter table public.xp_events drop constraint if exists xp_events_amount_range;

create or replace function public.award_xp(p_rep uuid, p_amount integer, p_source text)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare new_total integer;
begin
  if p_amount is null or p_amount < 0 or p_amount > 1000 then
    raise exception 'award_xp: amount out of range' using errcode = '22023';
  end if;
  update public.profiles set xp = coalesce(xp, 0) + p_amount where id = p_rep returning xp into new_total;
  if new_total is null then
    raise exception 'award_xp: no profile' using errcode = 'P0002';
  end if;
  -- p_source null = lifetime XP only, no ledger row (the daily-visit bonus was never in the ledger).
  if p_source is not null and p_amount > 0 then
    insert into public.xp_events (rep_id, amount, source) values (p_rep, p_amount, p_source);
  end if;
  return new_total;
end;
$$;

-- First visit of a new day: stamps last_visit and adds the visit bonus once. Returns the XP
-- added (0 when the rep already visited today or this is their first visit ever).
create or replace function public.record_visit(p_rep uuid, p_today date, p_bonus integer)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare previous date; added integer := 0;
begin
  select last_visit into previous from public.profiles where id = p_rep for update;
  if not found or previous = p_today then
    return 0;
  end if;
  if previous is not null then
    added := greatest(0, least(p_bonus, 1000));
  end if;
  update public.profiles set last_visit = p_today, xp = coalesce(xp, 0) + added where id = p_rep;
  return added;
end;
$$;

revoke all on function public.award_xp(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.record_visit(uuid, date, integer) from public, anon, authenticated;
grant execute on function public.award_xp(uuid, integer, text) to service_role;
grant execute on function public.record_visit(uuid, date, integer) to service_role;

-- Ledger amounts are small positive gains. NOT VALID: existing rows are not re-checked.
alter table public.xp_events drop constraint if exists xp_events_amount_range;
alter table public.xp_events add constraint xp_events_amount_range check (amount between 0 and 1000) not valid;
