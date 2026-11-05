-- Readiness certificates and an append-only audit trail.
--
-- certifications: one row per issued certificate. The criteria and the evidence the rep was judged on
--   are frozen on the row. Once written, only a one-time revocation can change a row (a guard trigger
--   enforces it). rep_id, issued_by and revoked_by are plain uuids with no foreign key on purpose:
--   a foreign key's delete action would UPDATE the row, which the guard forbids, and a certificate
--   (with the rep name copied onto it) must outlive the account it was issued to.
--
-- audit_events: who did what, when, for a company. Nothing can update, delete or truncate it, and the
--   app never gets a write path to it: certificate events are written by a trigger inside the same
--   transaction as the change, so a certificate cannot be issued or revoked without a record.

create table public.certifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  rep_id uuid not null,
  rep_name text not null check (length(btrim(rep_name)) between 1 and 200),
  program_name text not null check (length(btrim(program_name)) between 1 and 120),
  criteria jsonb not null,
  evidence jsonb not null,
  criteria_met boolean not null,
  exception_reason text check (exception_reason is null or length(btrim(exception_reason)) between 1 and 500),
  verify_code text not null unique check (verify_code ~ '^[A-HJKMNP-Z2-9]{12}$'),
  issued_by uuid not null,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text check (revoke_reason is null or length(btrim(revoke_reason)) between 1 and 500),
  -- Issued without meeting the criteria only with a written reason; a revocation always has both parts.
  check (criteria_met or exception_reason is not null),
  check ((revoked_at is null and revoked_by is null and revoke_reason is null)
      or (revoked_at is not null and revoked_by is not null and revoke_reason is not null))
);

create index certifications_company_idx on public.certifications (company_id, issued_at desc);
create index certifications_rep_idx on public.certifications (rep_id);
-- A rep holds at most one live certificate per programme.
create unique index certifications_one_live_per_program
  on public.certifications (rep_id, lower(btrim(program_name))) where revoked_at is null;

alter table public.certifications enable row level security;
revoke all on public.certifications from anon, authenticated;
grant select on public.certifications to authenticated;

-- A rep reads their own certificates; a manager reads their company's. All writes go through the
-- server with the service role, which checks the caller's role itself.
create policy certifications_read on public.certifications for select to authenticated using (
  rep_id = (select auth.uid())
  or exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.company_id = certifications.company_id and p.role = 'manager'
  )
);

create function public.certifications_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.revoked_at is not null then
    raise exception 'A revoked certificate cannot change';
  end if;
  if new.revoked_at is null then
    raise exception 'A certificate can only be revoked, not edited';
  end if;
  if (to_jsonb(new) - array['revoked_at','revoked_by','revoke_reason'])
     is distinct from (to_jsonb(old) - array['revoked_at','revoked_by','revoke_reason']) then
    raise exception 'Only the revocation fields may change';
  end if;
  return new;
end $$;

create trigger certifications_guard_bu before update on public.certifications
  for each row execute function public.certifications_guard();

create table public.audit_events (
  id bigint generated always as identity primary key,
  company_id uuid not null,
  actor_id uuid,
  action text not null check (length(action) between 1 and 80),
  subject_type text not null check (length(subject_type) between 1 and 60),
  subject_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_company_idx on public.audit_events (company_id, id desc);

alter table public.audit_events enable row level security;
revoke all on public.audit_events from anon, authenticated;
grant select on public.audit_events to authenticated;

create policy audit_events_manager_read on public.audit_events for select to authenticated using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.company_id = audit_events.company_id and p.role = 'manager'
  )
);

create function public.audit_events_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_events is append-only';
end $$;

create trigger audit_events_no_change before update or delete on public.audit_events
  for each row execute function public.audit_events_immutable();
create trigger audit_events_no_truncate before truncate on public.audit_events
  for each statement execute function public.audit_events_immutable();

create function public.certifications_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_events (company_id, actor_id, action, subject_type, subject_id, details)
    values (new.company_id, new.issued_by, 'certification.issued', 'certification', new.id::text,
      jsonb_build_object(
        'rep_id', new.rep_id, 'rep_name', new.rep_name, 'program', new.program_name,
        'criteria_met', new.criteria_met, 'exception_reason', new.exception_reason,
        'verify_code', new.verify_code));
  elsif old.revoked_at is null and new.revoked_at is not null then
    insert into public.audit_events (company_id, actor_id, action, subject_type, subject_id, details)
    values (new.company_id, new.revoked_by, 'certification.revoked', 'certification', new.id::text,
      jsonb_build_object(
        'rep_id', new.rep_id, 'rep_name', new.rep_name, 'program', new.program_name,
        'reason', new.revoke_reason, 'verify_code', new.verify_code));
  end if;
  return new;
end $$;

create trigger certifications_audit_ai after insert or update on public.certifications
  for each row execute function public.certifications_audit();
