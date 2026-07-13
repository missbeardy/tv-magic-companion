-- Lead AI extraction status for manager visibility and retry.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS extraction_status text NOT NULL DEFAULT 'pending';

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_extraction_status_check;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_extraction_status_check
  CHECK (extraction_status IN ('pending', 'succeeded', 'fallback', 'failed', 'skipped'));

-- Existing rows were already processed before this column existed.
UPDATE public.leads SET extraction_status = 'succeeded' WHERE extraction_status = 'pending';

CREATE INDEX IF NOT EXISTS leads_extraction_status_idx
  ON public.leads (org_id, extraction_status)
  WHERE deleted_at IS NULL;

-- Extraction status writes must go through the service-role API (same pattern as soft-delete).
CREATE OR REPLACE FUNCTION public.prevent_client_lead_extraction_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.extraction_status IS DISTINCT FROM OLD.extraction_status THEN
      RAISE EXCEPTION 'Lead extraction status must use the API'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_client_lead_extraction_status ON public.leads;
CREATE TRIGGER trg_prevent_client_lead_extraction_status
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_lead_extraction_status();
