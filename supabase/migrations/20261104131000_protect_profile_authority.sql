-- Close a privilege-escalation hole: "own profile update" (001) lets a signed-in user UPDATE their
-- own profile row with no limit on columns, and "own profile insert" lets them INSERT it. Through
-- the Supabase client they could therefore set role = 'manager' and any company_id, and every
-- manager check and manager RLS policy in the app (assignments, team stats, shared items,
-- coaching follow-ups) would trust it.
--
-- Fix: a trigger that rejects a change to role or company_id when the request comes from a
-- signed-in user or anonymous caller. The service-role key (used by every legitimate flow:
-- /api/onboarding, /api/invite, /api/rep-join, /api/manager-signup) and the SQL editor are not
-- affected, because auth.role() is neither 'authenticated' nor 'anon' for them.
-- Client-side updates the app does make (xp, last_visit, avatar_url, sps_*, group_id) are untouched.
--
-- Rollback: drop trigger profiles_protect_authority on public.profiles;
--           drop function public.protect_profile_authority();

create or replace function public.protect_profile_authority()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if auth.role() in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.company_id is not null or coalesce(new.role, 'rep') <> 'rep' then
        raise exception 'role and company_id can only be set by the server' using errcode = '42501';
      end if;
    elsif new.role is distinct from old.role or new.company_id is distinct from old.company_id then
      raise exception 'role and company_id can only be changed by the server' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_authority on public.profiles;
create trigger profiles_protect_authority
  before insert or update on public.profiles
  for each row execute function public.protect_profile_authority();
