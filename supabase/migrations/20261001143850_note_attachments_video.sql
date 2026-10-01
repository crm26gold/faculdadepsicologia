-- Additive: short videos join images and audio in private note attachments (same 25 MB limit).
update storage.buckets
set allowed_mime_types = array['image/jpeg','image/png','image/webp','image/gif','audio/mpeg','audio/mp4','audio/x-m4a','audio/wav','audio/x-wav','audio/ogg','audio/webm','video/mp4','video/webm','video/quicktime']
where id = 'note-attachments';
