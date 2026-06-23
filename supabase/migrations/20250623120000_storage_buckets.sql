-- Storage buckets for dev (run in Supabase SQL Editor).
-- storage.objects policies cannot be created here (table owned by supabase_storage_admin).
-- After this script, add policies via Dashboard → Storage → org-assets → Policies (see PROGRESS.md).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('org-assets', 'org-assets', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  ('avatars', 'avatars', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  ('lead-photos', 'lead-photos', true, 10485760, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;
