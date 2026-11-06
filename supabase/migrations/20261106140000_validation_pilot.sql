-- Behavioral Validation Pilot storage (docs/validation/*). ADDITIVE ONLY: new tables, one helper pair, no changes
-- to existing tables. NOT applied to production by this commit; apply it deliberately.
-- Rollback: drop the tables below in reverse order, then the two helper functions.
--
-- What the database enforces itself (not only the API):
--  * Assessors are blind to each other: an assessor reads only their own ratings. Nobody sees another assessor's
--    rating until it is submitted, and then only the pilot's administrators and adjudicators do.
--  * Assessors see no rep identity and no baseline/follow-up status: they read validation_assessor_assignments,
--    which holds only the case id, the pilot and the scenario type.
--  * A submitted rating, and its items, can never change. Adjudications are append-only. Originals are never overwritten.
--  * Nobody adjudicates a case they are assigned to rate or have rated, and nobody who adjudicated a case can be
--    assigned to rate it (either order). Someone who is assigned to a case cannot read other raters' ratings of it
--    until they have submitted their own, even if they are also an adjudicator in the same pilot.
--  * An administrator cannot also be an assessor in the same pilot.
--  * Writes need the pilot to be running and the writer to still be a member of it. submitted_at is set by the
--    database, not the client.
--  * An adjudication must cite at least two distinct SUBMITTED ratings of the same case. A claim verdict that cites
--    a report must cite the report of that case.
--  * Erasure stays possible: deleting a rater or adjudicator's account, or a rep's report, blanks the reference
--    (the record stays, without the person) instead of being blocked by the append-only rule.
--  * "Not observable" is stored as an empty score, never as a number. A rating needs a turn reference.
--  * Deleting (a rep withdrawing) is a server or administrator action; a signed-in user cannot delete any of it.
--  * Every pilot carries a data_source label (synthetic, staging or pilot).
-- AI scores are not stored here, so a rater has nothing to see by accident.

create table public.validation_pilots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  data_source text not null check (data_source in ('synthetic', 'staging', 'pilot')),
  rubric_version text not null,
  methodology_version text not null,
  protocol_version text not null,
  status text not null default 'draft' check (status in ('draft', 'running', 'closed')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.validation_pilot_members (
  pilot_id uuid not null references public.validation_pilots(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('administrator', 'assessor', 'adjudicator')),
  calibrated_at timestamptz,
  calibration_kappa numeric check (calibration_kappa is null or calibration_kappa between -1 and 1),
  created_at timestamptz not null default now(),
  primary key (pilot_id, user_id, role)
);

create table public.validation_assignments (
  id uuid primary key default gen_random_uuid(),
  pilot_id uuid not null references public.validation_pilots(id) on delete cascade,
  rep_id uuid not null references public.profiles(id) on delete cascade,
  session_type text not null check (session_type in ('human_partner', 'ai_doctor_voice', 'ai_doctor_text')),
  session_id uuid not null,
  scenario_type text not null check (scenario_type in ('A', 'B', 'C', 'D')),
  scenario_version text not null check (scenario_version in ('v1', 'v2')),
  phase text not null check (phase in ('baseline', 'practice', 'followup')),
  seen_before boolean not null,
  rated boolean not null default true,
  created_at timestamptz not null default now(),
  unique (pilot_id, session_type, session_id)
);
create index validation_assignments_pilot_idx on public.validation_assignments (pilot_id, rep_id);

-- De-identified view of a case for an assessor: no rep, no phase, no seen_before.
create table public.validation_assessor_assignments (
  assignment_id uuid not null references public.validation_assignments(id) on delete cascade,
  assessor_id uuid not null references public.profiles(id) on delete cascade,
  pilot_id uuid not null references public.validation_pilots(id) on delete cascade,
  scenario_type text not null check (scenario_type in ('A', 'B', 'C', 'D')),
  created_at timestamptz not null default now(),
  primary key (assignment_id, assessor_id)
);

create table public.human_ratings (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.validation_assignments(id) on delete cascade,
  rater_id uuid references public.profiles(id) on delete set null,
  rubric_version text not null,
  status text not null default 'draft' check (status in ('draft', 'submitted')),
  unscorable boolean not null default false,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (assignment_id, rater_id),
  check ((status = 'submitted') = (submitted_at is not null))
);

create table public.human_rating_items (
  rating_id uuid not null references public.human_ratings(id) on delete cascade,
  domain text not null check (domain in ('opening', 'questioning', 'active_listening', 'clinical_communication',
    'objection_handling', 'style_adaptation', 'state_adaptation', 'composure', 'closing')),
  observable boolean not null,
  score smallint check (score between 1 and 5),
  turn_refs integer[] not null default '{}',
  note text check (note is null or char_length(note) <= 300),
  uncertain boolean not null default false,
  primary key (rating_id, domain),
  check ((observable and score is not null) or (not observable and score is null)),
  check (not observable or cardinality(turn_refs) >= 1)
);

create table public.rating_adjudications (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.validation_assignments(id) on delete cascade,
  domain text not null check (domain in ('opening', 'questioning', 'active_listening', 'clinical_communication',
    'objection_handling', 'style_adaptation', 'state_adaptation', 'composure', 'closing')),
  adjudicator_id uuid references public.profiles(id) on delete set null,
  score smallint not null check (score between 1 and 5),
  reason text not null check (char_length(reason) between 1 and 300),
  original_rating_ids uuid[] not null check (cardinality(original_rating_ids) >= 2),
  created_at timestamptz not null default now(),
  unique (assignment_id, domain)
);

create table public.claim_adjudications (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.validation_assignments(id) on delete cascade,
  report_id uuid references public.conversation_reports(id) on delete set null,
  claim_ref text not null check (char_length(claim_ref) between 1 and 120),
  certainty text check (certainty is null or certainty in ('stated', 'inferred', 'not_established')),
  verdict text not null check (verdict in ('supported', 'partly_supported', 'unsupported')),
  adjudicator_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (assignment_id, claim_ref, adjudicator_id)
);

-- Helpers. SECURITY DEFINER so a policy can ask "is this person a member?" without reading a table the caller
-- cannot see (and without recursion). They return a boolean or an id only.
create or replace function public.validation_is_member(p_pilot uuid, p_roles text[])
returns boolean language sql stable security definer set search_path = public, pg_temp as
  'select exists (select 1 from public.validation_pilot_members m where m.pilot_id = p_pilot and m.user_id = auth.uid() and m.role = any (p_roles))';

create or replace function public.validation_pilot_of(p_assignment uuid)
returns uuid language sql stable security definer set search_path = public, pg_temp as
  'select a.pilot_id from public.validation_assignments a where a.id = p_assignment';

-- Is the caller assigned to rate this case, or have they rated it? Then they must not adjudicate it.
create or replace function public.validation_has_conflict(p_assignment uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as
  'select exists (select 1 from public.validation_assessor_assignments x where x.assignment_id = p_assignment and x.assessor_id = auth.uid())
       or exists (select 1 from public.human_ratings r where r.assignment_id = p_assignment and r.rater_id = auth.uid())';

-- May the caller see OTHER raters'' submitted ratings of this case? Only if they are not assigned to rate it,
-- or have already submitted their own.
create or replace function public.validation_blind_ok(p_assignment uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as
  'select not exists (select 1 from public.validation_assessor_assignments x where x.assignment_id = p_assignment and x.assessor_id = auth.uid())
       or exists (select 1 from public.human_ratings r where r.assignment_id = p_assignment and r.rater_id = auth.uid() and r.status = ''submitted'')';

create or replace function public.validation_has_adjudicated(p_assignment uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as
  'select exists (select 1 from public.rating_adjudications a where a.assignment_id = p_assignment and a.adjudicator_id = auth.uid())
       or exists (select 1 from public.claim_adjudications c where c.assignment_id = p_assignment and c.adjudicator_id = auth.uid())';

create or replace function public.validation_pilot_running(p_pilot uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as
  'select exists (select 1 from public.validation_pilots p where p.id = p_pilot and p.status = ''running'')';

revoke all on function public.validation_has_conflict(uuid), public.validation_blind_ok(uuid),
  public.validation_has_adjudicated(uuid), public.validation_pilot_running(uuid) from public, anon;
grant execute on function public.validation_has_conflict(uuid), public.validation_blind_ok(uuid),
  public.validation_has_adjudicated(uuid), public.validation_pilot_running(uuid) to authenticated;

revoke all on function public.validation_is_member(uuid, text[]) from public, anon;
revoke all on function public.validation_pilot_of(uuid) from public, anon;
grant execute on function public.validation_is_member(uuid, text[]) to authenticated;
grant execute on function public.validation_pilot_of(uuid) to authenticated;

alter table public.validation_pilots enable row level security;
alter table public.validation_pilot_members enable row level security;
alter table public.validation_assignments enable row level security;
alter table public.validation_assessor_assignments enable row level security;
alter table public.human_ratings enable row level security;
alter table public.human_rating_items enable row level security;
alter table public.rating_adjudications enable row level security;
alter table public.claim_adjudications enable row level security;

-- Privileges: nothing for anon; select for signed-in users (rows are then limited by the policies below);
-- writes only where a policy exists. The server (service role) does everything else.
revoke all on public.validation_pilots, public.validation_pilot_members, public.validation_assignments,
  public.validation_assessor_assignments, public.human_ratings, public.human_rating_items,
  public.rating_adjudications, public.claim_adjudications from anon, authenticated;
grant select on public.validation_pilots, public.validation_pilot_members, public.validation_assignments,
  public.validation_assessor_assignments, public.human_ratings, public.human_rating_items,
  public.rating_adjudications, public.claim_adjudications to authenticated;
grant insert, update on public.human_ratings to authenticated;
grant insert, update, delete on public.human_rating_items to authenticated;
grant insert on public.rating_adjudications, public.claim_adjudications to authenticated;

create policy "members read their pilots" on public.validation_pilots
  for select to authenticated using (public.validation_is_member(id, array['administrator', 'assessor', 'adjudicator']));

create policy "read own membership, administrators read all" on public.validation_pilot_members
  for select to authenticated using (user_id = auth.uid() or public.validation_is_member(pilot_id, array['administrator']));

create policy "rep reads own assignments, administrators read all" on public.validation_assignments
  for select to authenticated using (rep_id = auth.uid() or public.validation_is_member(pilot_id, array['administrator']));

create policy "assessor reads own cases, administrators read all" on public.validation_assessor_assignments
  for select to authenticated using (assessor_id = auth.uid() or public.validation_is_member(pilot_id, array['administrator']));

-- Ratings: a rater reads only their own; others read only SUBMITTED ones, and only administrators and adjudicators.
create policy "read own ratings, or submitted ones as administrator or adjudicator" on public.human_ratings
  for select to authenticated using (
    rater_id = auth.uid()
    or (status = 'submitted'
        and public.validation_is_member(public.validation_pilot_of(assignment_id), array['administrator', 'adjudicator'])
        and public.validation_blind_ok(assignment_id))
  );
create policy "assessor starts a draft rating on an assigned case" on public.human_ratings
  for insert to authenticated with check (
    rater_id = auth.uid() and status = 'draft' and submitted_at is null
    and public.validation_pilot_running(public.validation_pilot_of(assignment_id))
    and public.validation_is_member(public.validation_pilot_of(assignment_id), array['assessor'])
    and exists (select 1 from public.validation_assessor_assignments x where x.assignment_id = human_ratings.assignment_id and x.assessor_id = auth.uid())
    and not public.validation_has_adjudicated(assignment_id)
  );
create policy "assessor edits or submits their own draft" on public.human_ratings
  for update to authenticated
  using (rater_id = auth.uid() and status = 'draft'
    and public.validation_pilot_running(public.validation_pilot_of(assignment_id))
    and public.validation_is_member(public.validation_pilot_of(assignment_id), array['assessor']))
  with check (rater_id = auth.uid()
    and public.validation_pilot_running(public.validation_pilot_of(assignment_id))
    and public.validation_is_member(public.validation_pilot_of(assignment_id), array['assessor']));

create policy "items follow the visibility of their rating" on public.human_rating_items
  for select to authenticated using (exists (select 1 from public.human_ratings r where r.id = rating_id));
create policy "assessor adds items to their own draft" on public.human_rating_items
  for insert to authenticated with check (exists (select 1 from public.human_ratings r where r.id = rating_id and r.rater_id = auth.uid() and r.status = 'draft'
    and public.validation_pilot_running(public.validation_pilot_of(r.assignment_id)) and public.validation_is_member(public.validation_pilot_of(r.assignment_id), array['assessor'])));
create policy "assessor edits items of their own draft" on public.human_rating_items
  for update to authenticated using (exists (select 1 from public.human_ratings r where r.id = rating_id and r.rater_id = auth.uid() and r.status = 'draft'
    and public.validation_pilot_running(public.validation_pilot_of(r.assignment_id)) and public.validation_is_member(public.validation_pilot_of(r.assignment_id), array['assessor'])))
  with check (exists (select 1 from public.human_ratings r where r.id = rating_id and r.rater_id = auth.uid() and r.status = 'draft'
    and public.validation_pilot_running(public.validation_pilot_of(r.assignment_id)) and public.validation_is_member(public.validation_pilot_of(r.assignment_id), array['assessor'])));
create policy "assessor removes items from their own draft" on public.human_rating_items
  for delete to authenticated using (exists (select 1 from public.human_ratings r where r.id = rating_id and r.rater_id = auth.uid() and r.status = 'draft'
    and public.validation_pilot_running(public.validation_pilot_of(r.assignment_id)) and public.validation_is_member(public.validation_pilot_of(r.assignment_id), array['assessor'])));

create policy "administrators and adjudicators read adjudications" on public.rating_adjudications
  for select to authenticated using (
    public.validation_is_member(public.validation_pilot_of(assignment_id), array['administrator', 'adjudicator'])
    and public.validation_blind_ok(assignment_id));
create policy "adjudicator records an adjudication on a case they were not assigned to rate" on public.rating_adjudications
  for insert to authenticated with check (
    adjudicator_id = auth.uid()
    and public.validation_pilot_running(public.validation_pilot_of(assignment_id))
    and public.validation_is_member(public.validation_pilot_of(assignment_id), array['adjudicator'])
    and not public.validation_has_conflict(assignment_id)
  );

create policy "administrators and adjudicators read claim adjudications" on public.claim_adjudications
  for select to authenticated using (
    public.validation_is_member(public.validation_pilot_of(assignment_id), array['administrator', 'adjudicator'])
    and public.validation_blind_ok(assignment_id));
create policy "adjudicator records a claim verdict on a case they were not assigned to rate" on public.claim_adjudications
  for insert to authenticated with check (
    adjudicator_id = auth.uid()
    and public.validation_pilot_running(public.validation_pilot_of(assignment_id))
    and public.validation_is_member(public.validation_pilot_of(assignment_id), array['adjudicator'])
    and not public.validation_has_conflict(assignment_id)
  );

-- Immutability and integrity. These hold for every role, including the service role.

-- A rating keeps its case, rater and rubric version; a submitted one never changes. The one allowed change to a
-- submitted rating is blanking the rater when that person's account is erased. submitted_at is set here, not by the client.
create or replace function public.validation_guard_rating()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'rater_id') = (to_jsonb(old) - 'rater_id') and new.rater_id is null and old.rater_id is not null then
      return new;  -- erasure of the rater's account: the rating stays, without the person
    end if;
    if old.status = 'submitted' then raise exception 'a submitted rating cannot change' using errcode = '42501'; end if;
    if new.assignment_id is distinct from old.assignment_id or new.rater_id is distinct from old.rater_id
       or new.rubric_version is distinct from old.rubric_version or new.created_at is distinct from old.created_at then
      raise exception 'a rating keeps its case, rater, rubric version and creation time' using errcode = '42501';
    end if;
    if new.status = 'submitted' then new.submitted_at := now(); end if;
    return new;
  end if;
  -- DELETE: signed-in users never delete. The server or an administrator does, for example when a rep withdraws.
  if auth.role() in ('authenticated', 'anon') then raise exception 'ratings are removed by the server only' using errcode = '42501'; end if;
  return old;
end;
$$;
create trigger human_ratings_guard before update or delete on public.human_ratings
  for each row execute function public.validation_guard_rating();

create or replace function public.validation_guard_item()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare parent_status text;
begin
  select status into parent_status from public.human_ratings where id = coalesce(new.rating_id, old.rating_id);
  if tg_op = 'DELETE' then
    if parent_status is null then return old; end if;  -- the parent is already gone (cascade)
    if parent_status = 'submitted' and auth.role() in ('authenticated', 'anon') then raise exception 'a submitted rating cannot change' using errcode = '42501'; end if;
    return old;
  end if;
  if parent_status = 'submitted' then raise exception 'a submitted rating cannot change' using errcode = '42501'; end if;
  return new;
end;
$$;
create trigger human_rating_items_guard before insert or update or delete on public.human_rating_items
  for each row execute function public.validation_guard_item();

-- Adjudications are append-only. The only change allowed is blanking a person reference (the adjudicator's
-- erased account) or the report reference (the rep deleted that report), and only to null.
create or replace function public.validation_append_only()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'adjudicator_id' - 'report_id') = (to_jsonb(old) - 'adjudicator_id' - 'report_id')
       and ((to_jsonb(new) ->> 'adjudicator_id') is null or (to_jsonb(new) ->> 'adjudicator_id') is not distinct from (to_jsonb(old) ->> 'adjudicator_id'))
       and ((to_jsonb(new) ->> 'report_id') is null or (to_jsonb(new) ->> 'report_id') is not distinct from (to_jsonb(old) ->> 'report_id')) then
      return new;
    end if;
    raise exception 'adjudications cannot be edited' using errcode = '42501';
  end if;
  if auth.role() in ('authenticated', 'anon') then raise exception 'adjudications are removed by the server only' using errcode = '42501'; end if;
  return old;
end;
$$;
create trigger rating_adjudications_append_only before update or delete on public.rating_adjudications
  for each row execute function public.validation_append_only();
create trigger claim_adjudications_append_only before update or delete on public.claim_adjudications
  for each row execute function public.validation_append_only();

-- An adjudication must cite at least two distinct SUBMITTED ratings of the same case.
create or replace function public.validation_check_adjudication()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare distinct_ids int; matching int;
begin
  select count(distinct x) into distinct_ids from unnest(new.original_rating_ids) x;
  select count(*) into matching from public.human_ratings r
    where r.id = any (new.original_rating_ids) and r.assignment_id = new.assignment_id and r.status = 'submitted';
  if distinct_ids <> cardinality(new.original_rating_ids) or distinct_ids < 2 or matching <> distinct_ids then
    raise exception 'an adjudication must cite at least two distinct submitted ratings of the same case' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger rating_adjudications_check before insert on public.rating_adjudications
  for each row execute function public.validation_check_adjudication();

-- A claim verdict that cites a report must cite the report of that case.
create or replace function public.validation_check_claim()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.report_id is not null and not exists (
    select 1 from public.validation_assignments a join public.conversation_reports c on c.id = new.report_id
    where a.id = new.assignment_id and c.session_type = a.session_type and c.session_id = a.session_id and c.rep_id = a.rep_id
  ) then
    raise exception 'the report does not belong to this case' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger claim_adjudications_check before insert on public.claim_adjudications
  for each row execute function public.validation_check_claim();

-- Separation of duties.
-- 1) An administrator is not also an assessor in the same pilot.
create or replace function public.validation_check_member()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if (new.role = 'assessor' and exists (select 1 from public.validation_pilot_members m where m.pilot_id = new.pilot_id and m.user_id = new.user_id and m.role = 'administrator'))
     or (new.role = 'administrator' and exists (select 1 from public.validation_pilot_members m where m.pilot_id = new.pilot_id and m.user_id = new.user_id and m.role = 'assessor')) then
    raise exception 'an administrator cannot also be an assessor in the same pilot' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger validation_pilot_members_check before insert or update on public.validation_pilot_members
  for each row execute function public.validation_check_member();

-- 2) Nobody who adjudicated a case is assigned to rate it afterwards (the other order is the policy above).
create or replace function public.validation_check_assessor_assignment()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.rating_adjudications a where a.assignment_id = new.assignment_id and a.adjudicator_id = new.assessor_id)
     or exists (select 1 from public.claim_adjudications c where c.assignment_id = new.assignment_id and c.adjudicator_id = new.assessor_id) then
    raise exception 'this person has adjudicated the case and cannot rate it' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger validation_assessor_assignments_check before insert on public.validation_assessor_assignments
  for each row execute function public.validation_check_assessor_assignment();
