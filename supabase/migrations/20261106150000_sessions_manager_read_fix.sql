-- Found by the production schema baseline (docs/security/schema-baseline.md), 2026-11-06.
--
-- 1. sessions: production's "manager sessions read" policy only checks that the row's rep is in the caller's
--    company. It never checks that the caller is a manager, so any rep could read every colleague's session rows
--    (level, accuracy, XP, time). The policy was loosened by hand to fix a recursion error (history entry
--    "fix_rls_recursion"). Re-create it on the two helper functions that fix introduced: both are SECURITY DEFINER,
--    so reading profiles inside them does not re-enter profiles' own policies and cannot recurse.
--    The app reads sessions as the signed-in rep (own rows only) or through the server's admin client, so no
--    screen depends on the looser rule.
--
-- 2. The helpers themselves: production's copies do not match the definition in the hardening migration (the
--    function hashes differ), so pin the two settings that matter for a SECURITY DEFINER function: a fixed
--    search_path, and STABLE (they only read). Both statements are idempotent.
--
-- Not applied to production by merging this file; the owner runs it in the SQL editor.

alter function public.auth_company_id() stable set search_path = public, pg_temp;
alter function public.auth_is_manager() stable set search_path = public, pg_temp;

drop policy if exists "manager sessions read" on public.sessions;
create policy "manager sessions read" on public.sessions for select
  using (public.auth_is_manager() and rep_id in (select p.id from public.profiles p where p.company_id = public.auth_company_id()));
