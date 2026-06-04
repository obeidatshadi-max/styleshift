-- Recognition card: rep profile photos.
-- Applied to the live project via MCP on 2026-06-04.

alter table public.profiles add column if not exists avatar_url text;

-- Public storage bucket for avatars (objects are served via public URL).
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Each authenticated user manages only files under a folder named after their uid
-- (path convention: "<uid>/avatar.<ext>"). Read happens via the public object URL,
-- so no broad SELECT policy is added (that would also enable listing the bucket).
drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
