-- P0: Lock lead-photos bucket — private bucket + org-scoped authenticated read.
-- Replaces world-readable public SELECT with tenant-isolated access.
-- Legacy uploads under {user_id}/... remain readable via profiles-in-org clause.

UPDATE storage.buckets SET public = false WHERE id = 'lead-photos';

DROP POLICY IF EXISTS lead_photos_public_read ON storage.objects;

CREATE POLICY lead_photos_authenticated_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'lead-photos'
    AND (
      (storage.foldername(name))[1] = public.current_user_org_id()::text
      OR (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.profiles
        WHERE org_id = public.current_user_org_id()
      )
      OR public.is_platform_admin()
    )
  );

ALTER TABLE public.lead_photos ALTER COLUMN public_url DROP NOT NULL;
