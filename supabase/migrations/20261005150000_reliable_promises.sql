-- Promise approvals are tasks, not fresh contacts. Preserve existing rows and their history.
alter table public.doctor_visits add column if not exists is_contact boolean not null default true;
update public.doctor_visits set is_contact = false where note = 'From a coach debrief';
alter table public.doctor_visits add column if not exists contact_at timestamptz default now();
update public.doctor_visits set contact_at = created_at where is_contact and contact_at is distinct from created_at;

-- Serialize approval for one owner/doctor. RLS remains active (SECURITY INVOKER).
create or replace function public.add_doctor_promise(p_doctor_id uuid, p_text text)
returns uuid language plpgsql security invoker set search_path = public, pg_temp as $$
declare result_id uuid;
begin
  if auth.uid() is null or p_text is null or length(trim(p_text)) not between 1 and 300 then
    raise exception 'Invalid promise' using errcode = '22023';
  end if;
  if not exists (select 1 from public.doctors where id = p_doctor_id and rep_id = auth.uid()) then
    raise exception 'Doctor not owned' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_doctor_id::text, 0));
  select id into result_id from public.doctor_visits
    where rep_id = auth.uid() and doctor_id = p_doctor_id
      and promise_made = trim(p_text) and promise_done_at is null
    order by created_at limit 1;
  if result_id is null then
    insert into public.doctor_visits (rep_id, doctor_id, source, promise_made, note, is_contact, contact_at)
      values (auth.uid(), p_doctor_id, 'manual', trim(p_text), 'From a coach debrief', false, null)
      returning id into result_id;
  end if;
  return result_id;
end;
$$;
revoke all on function public.add_doctor_promise(uuid, text) from public, anon;
grant execute on function public.add_doctor_promise(uuid, text) to authenticated;
