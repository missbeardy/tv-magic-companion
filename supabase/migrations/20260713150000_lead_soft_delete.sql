-- Soft-delete leads: hide from org members, retain row + audit trail.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delete_reason text;

CREATE INDEX IF NOT EXISTS leads_org_active_idx
  ON public.leads (org_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Org members no longer see soft-deleted leads (platform_admin SELECT policy is unchanged).
DROP POLICY IF EXISTS leads_org ON public.leads;
CREATE POLICY leads_org ON public.leads FOR ALL TO authenticated
  USING (org_id = public.current_user_org_id() AND deleted_at IS NULL)
  WITH CHECK (org_id = public.current_user_org_id() AND deleted_at IS NULL);

-- Soft-delete writes must go through the service-role API.
CREATE OR REPLACE FUNCTION public.prevent_client_lead_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
       OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by
       OR NEW.delete_reason IS DISTINCT FROM OLD.delete_reason THEN
      RAISE EXCEPTION 'Lead removal must use the API'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_client_lead_soft_delete ON public.leads;
CREATE TRIGGER trg_prevent_client_lead_soft_delete
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_client_lead_soft_delete();
