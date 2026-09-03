-- "manager update rep profiles" (002) let a manager UPDATE any row sharing
-- their company_id with no restriction on which columns changed. Since RLS
-- is enforced at the row/table level, not the column level, a manager could
-- call the Supabase client directly (bypassing the app's UI, which never
-- exercised this policy) to set another company member's role to 'manager'
-- (privilege escalation) or move a rep to a different company_id. Neither
-- targets a manager's own row (that's the separate "own profile update"
-- policy) nor is reachable through any current app feature.
--
-- Tighten to what it can actually be used for: a manager may only touch
-- rows that are already reps in their own company, and the result must
-- still be a rep in that same company.
drop policy if exists "manager update rep profiles" on public.profiles;

create policy "manager update rep profiles" on public.profiles
  for update using (
    role = 'rep'
    and company_id in (
      select company_id from public.profiles
      where id = auth.uid() and role = 'manager'
    )
  )
  with check (
    role = 'rep'
    and company_id in (
      select company_id from public.profiles
      where id = auth.uid() and role = 'manager'
    )
  );
