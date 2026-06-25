-- Quote acceptance + e-signature (modular, org-scoped)

CREATE TABLE IF NOT EXISTS public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'accepted', 'declined', 'expired')),
  customer_name text NOT NULL,
  customer_email text,
  customer_phone text,
  service_type text,
  scope text NOT NULL,
  terms text,
  total_amount numeric(12,2) NOT NULL CHECK (total_amount >= 0),
  currency text NOT NULL DEFAULT 'AUD',
  public_token text NOT NULL UNIQUE,
  token_expires_at timestamptz NOT NULL,
  sent_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.quote_signatures (
  quote_id uuid PRIMARY KEY REFERENCES public.quotes(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  signer_name text NOT NULL,
  signer_email text,
  signature_text text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS quotes_org_status_idx
  ON public.quotes(org_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS quotes_lead_idx
  ON public.quotes(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS quotes_token_expires_idx
  ON public.quotes(token_expires_at);
CREATE INDEX IF NOT EXISTS quote_signatures_org_idx
  ON public.quote_signatures(org_id, signed_at DESC);

CREATE OR REPLACE FUNCTION public.ensure_quote_org_matches_lead()
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
    RAISE EXCEPTION 'Quote org_id must match lead org_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quotes_org_guard_trigger ON public.quotes;
CREATE TRIGGER quotes_org_guard_trigger
BEFORE INSERT OR UPDATE ON public.quotes
FOR EACH ROW
EXECUTE FUNCTION public.ensure_quote_org_matches_lead();

ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quotes_select_org ON public.quotes;
CREATE POLICY quotes_select_org ON public.quotes
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

DROP POLICY IF EXISTS quotes_manager_write_org ON public.quotes;
CREATE POLICY quotes_manager_write_org ON public.quotes
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

DROP POLICY IF EXISTS quote_signatures_select_org ON public.quote_signatures;
CREATE POLICY quote_signatures_select_org ON public.quote_signatures
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

DROP POLICY IF EXISTS quote_signatures_manager_write_org ON public.quote_signatures;
CREATE POLICY quote_signatures_manager_write_org ON public.quote_signatures
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
