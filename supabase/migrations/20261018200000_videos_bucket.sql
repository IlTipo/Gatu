-- Procedimento dal video: cartella privata per i video caricati dall'utente.
-- Il video resta solo il tempo di farlo leggere all'AI, poi la funzione lo cancella.
-- Privata (non pubblica): nessun link aperto; ognuno vede e scrive solo videos/<proprio id>/...
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos', 'videos', false, 52428800, array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'])
on conflict (id) do nothing;

create policy "videos_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "videos_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "videos_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'videos' and (storage.foldername(name))[1] = (select auth.uid())::text);
