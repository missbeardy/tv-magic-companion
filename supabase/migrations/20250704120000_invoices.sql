-- Email invoicing at job completion (Stripe deferred to backlog)

ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS email_templates jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS invoice_pdf_template_path text,
  ADD COLUMN IF NOT EXISTS invoice_payment_instructions text;

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  quote_id uuid REFERENCES public.quotes(id) ON DELETE SET NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  invoice_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'paid', 'void')),
  total_amount numeric(12,2) NOT NULL CHECK (total_amount >= 0),
  currency text NOT NULL DEFAULT 'AUD',
  customer_name text NOT NULL,
  customer_email text,
  line_items jsonb NOT NULL DEFAULT '[]',
  delivery_method text NOT NULL DEFAULT 'email'
    CHECK (delivery_method IN ('email', 'skipped')),
  pdf_storage_path text,
  sent_at timestamptz,
  paid_at timestamptz,
  paid_via text CHECK (paid_via IS NULL OR paid_via IN ('manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS invoices_org_status_idx
  ON public.invoices(org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS invoices_lead_idx
  ON public.invoices(lead_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.ensure_invoice_org_matches_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lead_org_id uuid;
BEGIN
  SELECT org_id INTO lead_org_id FROM public.leads WHERE id = NEW.lead_id;
  IF lead_org_id IS NULL THEN
    RAISE EXCEPTION 'Lead % not found', NEW.lead_id;
  END IF;
  IF NEW.org_id IS DISTINCT FROM lead_org_id THEN
    RAISE EXCEPTION 'Invoice org_id must match lead org_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invoices_org_guard_trigger ON public.invoices;
CREATE TRIGGER invoices_org_guard_trigger
BEFORE INSERT OR UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.ensure_invoice_org_matches_lead();

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoices_select_org ON public.invoices;
CREATE POLICY invoices_select_org ON public.invoices
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

DROP POLICY IF EXISTS invoices_manager_write_org ON public.invoices;
CREATE POLICY invoices_manager_write_org ON public.invoices
  FOR ALL TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('manager', 'platform_admin')
    )
  )
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('manager', 'platform_admin')
    )
  );

INSERT INTO public.feature_flag_catalog (feature_key, label, description, default_enabled, min_tier, category)
VALUES (
  'one_tap_invoice',
  'One-Tap Invoice Email',
  'Send branded invoice emails at job completion with optional PDF attachment',
  false,
  'pro',
  'sales_job_completion'
)
ON CONFLICT (feature_key) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  default_enabled = EXCLUDED.default_enabled,
  min_tier = EXCLUDED.min_tier,
  category = EXCLUDED.category;

INSERT INTO public.brand_feature_switches (brand_id, feature_key, enabled)
SELECT b.id, 'one_tap_invoice', true
FROM public.brands b
WHERE b.slug = 'fieldbourne'
ON CONFLICT (brand_id, feature_key) DO UPDATE SET enabled = EXCLUDED.enabled;

INSERT INTO public.brand_feature_switches (brand_id, feature_key, enabled)
SELECT b.id, c.feature_key, false
FROM public.brands b
CROSS JOIN public.feature_flag_catalog c
WHERE c.feature_key = 'one_tap_invoice'
  AND b.slug <> 'fieldbourne'
  AND NOT EXISTS (
    SELECT 1 FROM public.brand_feature_switches bfs
    WHERE bfs.brand_id = b.id AND bfs.feature_key = 'one_tap_invoice'
  );
