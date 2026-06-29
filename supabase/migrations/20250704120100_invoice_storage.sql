-- Private storage for org invoice PDF templates and per-job invoice PDFs

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'org-invoice-templates',
  'org-invoice-templates',
  false,
  10485760,
  ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS org_invoice_templates_select ON storage.objects;
CREATE POLICY org_invoice_templates_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'org-invoice-templates'
    AND (storage.foldername(name))[1] = public.current_user_org_id()::text
  );

DROP POLICY IF EXISTS org_invoice_templates_write ON storage.objects;
CREATE POLICY org_invoice_templates_write ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'org-invoice-templates'
    AND (storage.foldername(name))[1] = public.current_user_org_id()::text
  )
  WITH CHECK (
    bucket_id = 'org-invoice-templates'
    AND (storage.foldername(name))[1] = public.current_user_org_id()::text
  );
