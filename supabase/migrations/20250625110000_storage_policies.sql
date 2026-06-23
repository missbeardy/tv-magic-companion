-- SECURITY FIX 5: version-controlled storage.objects RLS policies.
--
-- Previously these were applied by hand in the Supabase Dashboard, so they were
-- not reproducible and could not be reviewed from the repo. This migration
-- defines them as code for the org-assets, avatars, and lead-photos buckets.
--
-- NOTE: storage.objects is owned by supabase_storage_admin. On hosted Supabase
-- the SQL Editor (role `postgres`) can usually run this. If you get
-- "must be owner of table objects", paste the same statements into
-- Dashboard → Storage → <bucket> → Policies (New policy → For full customization).
--
-- Path convention: first folder segment is the owning org_id (and for
-- avatars / lead-photos, optionally the uploader's auth.uid()).

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Helper already exists: public.current_user_org_id() (SECURITY DEFINER).

-- ── org-assets (logos/branding) ────────────────────────────────────────
DROP POLICY IF EXISTS org_assets_public_read ON storage.objects;
CREATE POLICY org_assets_public_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'org-assets');

DROP POLICY IF EXISTS org_assets_authenticated_write ON storage.objects;
CREATE POLICY org_assets_authenticated_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'org-assets'
    AND (storage.foldername(name))[1] = public.current_user_org_id()::text
  );

DROP POLICY IF EXISTS org_assets_authenticated_update ON storage.objects;
CREATE POLICY org_assets_authenticated_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'org-assets'
    AND (storage.foldername(name))[1] = public.current_user_org_id()::text
  )
  WITH CHECK (
    bucket_id = 'org-assets'
    AND (storage.foldername(name))[1] = public.current_user_org_id()::text
  );

DROP POLICY IF EXISTS org_assets_authenticated_delete ON storage.objects;
CREATE POLICY org_assets_authenticated_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'org-assets'
    AND (storage.foldername(name))[1] = public.current_user_org_id()::text
  );

-- ── avatars (user profile pictures) ────────────────────────────────────
DROP POLICY IF EXISTS avatars_public_read ON storage.objects;
CREATE POLICY avatars_public_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS avatars_authenticated_write ON storage.objects;
CREATE POLICY avatars_authenticated_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[1] = public.current_user_org_id()::text
    )
  );

DROP POLICY IF EXISTS avatars_authenticated_update ON storage.objects;
CREATE POLICY avatars_authenticated_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[1] = public.current_user_org_id()::text
    )
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[1] = public.current_user_org_id()::text
    )
  );

DROP POLICY IF EXISTS avatars_authenticated_delete ON storage.objects;
CREATE POLICY avatars_authenticated_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR (storage.foldername(name))[1] = public.current_user_org_id()::text
    )
  );

-- ── lead-photos (job photos + social uploads) ──────────────────────────
DROP POLICY IF EXISTS lead_photos_public_read ON storage.objects;
CREATE POLICY lead_photos_public_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'lead-photos');

DROP POLICY IF EXISTS lead_photos_authenticated_write ON storage.objects;
CREATE POLICY lead_photos_authenticated_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'lead-photos'
    AND (
      (storage.foldername(name))[1] = public.current_user_org_id()::text
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS lead_photos_authenticated_update ON storage.objects;
CREATE POLICY lead_photos_authenticated_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'lead-photos'
    AND (
      (storage.foldername(name))[1] = public.current_user_org_id()::text
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  )
  WITH CHECK (
    bucket_id = 'lead-photos'
    AND (
      (storage.foldername(name))[1] = public.current_user_org_id()::text
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );

DROP POLICY IF EXISTS lead_photos_authenticated_delete ON storage.objects;
CREATE POLICY lead_photos_authenticated_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'lead-photos'
    AND (
      (storage.foldername(name))[1] = public.current_user_org_id()::text
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );
