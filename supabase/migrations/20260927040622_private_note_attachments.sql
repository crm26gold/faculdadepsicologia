-- Additive: never rewrites or deletes personal_workspaces.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('note-attachments', 'note-attachments', false, 26214400,
  array['image/jpeg','image/png','image/webp','image/gif','audio/mpeg','audio/mp4','audio/x-m4a','audio/wav','audio/x-wav','audio/ogg','audio/webm']);

create policy "Master reads own note attachments" on storage.objects
for select to authenticated using (
  bucket_id = 'note-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.app_owner where user_id = (select auth.uid()))
);
create policy "Master uploads own note attachments" on storage.objects
for insert to authenticated with check (
  bucket_id = 'note-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.app_owner where user_id = (select auth.uid()))
);
-- No UPDATE/DELETE: uploads have unique immutable keys. Removing a document
-- block does not silently erase a file referenced by an older backup.
