create table public.review_progress (
  slug text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  summary text not null default '',
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  constraint review_progress_items_array check (jsonb_typeof(items) = 'array')
);

alter table public.review_progress enable row level security;

revoke all on table public.review_progress from anon, authenticated;
grant select on table public.review_progress to anon, authenticated;
grant insert, update on table public.review_progress to authenticated;

create policy "review progress public read"
on public.review_progress for select to anon, authenticated using (true);

create policy "review progress owner insert"
on public.review_progress for insert to authenticated
with check ((select auth.uid()) = owner_id);

create policy "review progress owner update"
on public.review_progress for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create index review_progress_owner_id_idx on public.review_progress(owner_id);
