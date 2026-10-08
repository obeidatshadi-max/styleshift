-- Web-push subscriptions for the daily debrief reminder. One row per device.
-- Owner-only through RLS; the scheduled sender uses the service role.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  tz text not null default 'UTC',
  lang text not null default 'en' check (lang in ('en', 'ar')),
  -- Local date of the last reminder, and the nudge it was about: at most one a day,
  -- and never the same nudge twice (a stale plan must not nag every morning).
  last_sent_on date,
  last_nudge_key text,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_rep on public.push_subscriptions(rep_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
create policy "Own push select" on public.push_subscriptions for select to authenticated using (rep_id = auth.uid());
create policy "Own push insert" on public.push_subscriptions for insert to authenticated with check (rep_id = auth.uid());
create policy "Own push update" on public.push_subscriptions for update to authenticated using (rep_id = auth.uid()) with check (rep_id = auth.uid());
create policy "Own push delete" on public.push_subscriptions for delete to authenticated using (rep_id = auth.uid());
