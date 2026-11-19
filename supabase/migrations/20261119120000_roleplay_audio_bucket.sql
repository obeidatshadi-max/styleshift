-- Private bucket for recording files too large to send through the AssemblyAI proxy
-- (over 4 MB, e.g. a 5-minute phone recording at 128 kbps).
--
-- Flow: the rep's browser uploads to "<uid>/<random>.<ext>". The assemblyai-proxy
-- function (service role) signs a short-lived URL for AssemblyAI to fetch, and deletes
-- the object once the transcript is finished or has failed.
-- Reps can only add (and remove) files in their own folder. No one can read or list
-- the bucket except the service role.

insert into storage.buckets (id, name, public)
values ('roleplay-audio', 'roleplay-audio', false)
on conflict (id) do nothing;

-- 25 MB per file, audio types only (the columns exist on Supabase; the local test
-- database models a smaller storage schema, so set them only where they exist).
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'storage' and table_name = 'buckets' and column_name = 'file_size_limit') then
    execute $q$update storage.buckets set public = false, file_size_limit = 26214400,
      allowed_mime_types = array['audio/*', 'video/webm', 'video/mp4']
      where id = 'roleplay-audio'$q$;
  end if;
end $$;

drop policy if exists "roleplay_audio_insert_own" on storage.objects;
create policy "roleplay_audio_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'roleplay-audio' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "roleplay_audio_delete_own" on storage.objects;
create policy "roleplay_audio_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'roleplay-audio' and (storage.foldername(name))[1] = auth.uid()::text);
