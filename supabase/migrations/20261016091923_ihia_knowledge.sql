-- Global, explicitly reviewed linguistic knowledge. No patient data or transcripts.
-- Filename matches the version recorded by the authorized hosted migration.
create table public.ihia_reviewers (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.ihia_reviewers enable row level security;
revoke all on public.ihia_reviewers from anon, authenticated;
grant select on public.ihia_reviewers to authenticated;
create policy ihia_reviewer_self on public.ihia_reviewers for select to authenticated
  using (user_id = (select auth.uid()));

create table public.ihia_entries (
  id uuid primary key default gen_random_uuid(),
  expression text not null check (length(expression) between 1 and 120),
  literal_meaning text not null check (length(literal_meaning) between 1 and 800),
  contextual_meaning text not null check (length(contextual_meaning) between 1 and 800),
  region text not null check (region in ('baghdad','basra','mosul','najaf','iraq')),
  specialty text not null check (length(specialty) between 1 and 800),
  kind text not null check (kind in ('dialect','medical','pharmacy','workflow')),
  uncertainty text not null check (length(uncertainty) between 1 and 800),
  source_reference text not null check (length(source_reference) between 1 and 800),
  status text not null default 'draft' check (status in ('draft','approved','rejected')),
  version integer not null default 1,
  created_by uuid not null references auth.users(id),
  reviewed_by uuid references auth.users(id),
  review_note text not null default '' check (length(review_note) <= 800),
  updated_at timestamptz not null default now()
);
create index ihia_approved on public.ihia_entries (status, id);
alter table public.ihia_entries enable row level security;
revoke all on public.ihia_entries from anon, authenticated;
grant select, insert, update on public.ihia_entries to authenticated;
create policy ihia_read on public.ihia_entries for select to authenticated using (
  status = 'approved' or exists (select 1 from public.ihia_reviewers where user_id = (select auth.uid()))
);
create policy ihia_insert on public.ihia_entries for insert to authenticated with check (
  created_by = (select auth.uid()) and status = 'draft'
  and exists (select 1 from public.ihia_reviewers where user_id = (select auth.uid()))
);
create policy ihia_update on public.ihia_entries for update to authenticated using (
  exists (select 1 from public.ihia_reviewers where user_id = (select auth.uid()))
) with check (
  exists (select 1 from public.ihia_reviewers where user_id = (select auth.uid()))
);

create table public.ihia_history (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.ihia_entries(id),
  version integer not null,
  actor_id uuid not null references auth.users(id),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique(entry_id, version)
);
alter table public.ihia_history enable row level security;
revoke all on public.ihia_history from anon, authenticated;
grant select on public.ihia_history to authenticated;
create policy ihia_history_review on public.ihia_history for select to authenticated using (
  exists (select 1 from public.ihia_reviewers where user_id = (select auth.uid()))
);

create schema if not exists ihia_private;
revoke all on schema ihia_private from public;
-- Privileged only to append immutable audit records, never exposed as an RPC.
create function ihia_private.audit_entry() returns trigger language plpgsql security definer
  set search_path = '' as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.ihia_reviewers where user_id = auth.uid()
  ) then raise exception 'IHIA reviewer required'; end if;
  if TG_OP = 'INSERT' then
    if NEW.status <> 'draft' then raise exception 'New entries must be draft'; end if;
    NEW.version := 1;
    NEW.created_by := auth.uid();
    NEW.reviewed_by := null;
  else
    NEW.id := OLD.id;
    NEW.created_by := OLD.created_by;
    NEW.version := OLD.version + 1;
    if (to_jsonb(NEW) - array['status','version','reviewed_by','review_note','updated_at'])
      is distinct from (to_jsonb(OLD) - array['status','version','reviewed_by','review_note','updated_at']) then
      NEW.status := 'draft'; -- Every correction needs fresh approval, including direct REST edits.
    end if;
    if NEW.status in ('approved', 'rejected') then
      if length(btrim(NEW.review_note)) = 0 then raise exception 'Review reason required'; end if;
      NEW.reviewed_by := auth.uid();
    else NEW.reviewed_by := null;
    end if;
  end if;
  NEW.updated_at := now();
  return NEW;
end;
$$;
revoke all on function ihia_private.audit_entry() from public;
create function ihia_private.save_history() returns trigger language plpgsql security definer
  set search_path = '' as $$
begin
  if auth.uid() is null or not exists (select 1 from public.ihia_reviewers where user_id = auth.uid())
    then raise exception 'IHIA reviewer required'; end if;
  insert into public.ihia_history(entry_id, version, actor_id, snapshot)
    values (NEW.id, NEW.version, auth.uid(), to_jsonb(NEW));
  return NEW;
end;
$$;
revoke all on function ihia_private.save_history() from public;
create trigger ihia_validate before insert or update on public.ihia_entries
  for each row execute function ihia_private.audit_entry();
create trigger ihia_audit after insert or update on public.ihia_entries
  for each row execute function ihia_private.save_history();
