-- Ensure lead_events.org_id is always set (required for RLS + reporting + activity feed)

UPDATE public.lead_events e
SET org_id = l.org_id
FROM public.leads l
WHERE e.lead_id = l.id
  AND e.org_id IS NULL
  AND l.org_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_lead_event_org_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS NULL AND NEW.lead_id IS NOT NULL THEN
    SELECT l.org_id
    INTO NEW.org_id
    FROM public.leads l
    WHERE l.id = NEW.lead_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_lead_event_org_id ON public.lead_events;
CREATE TRIGGER set_lead_event_org_id
  BEFORE INSERT OR UPDATE OF lead_id, org_id ON public.lead_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_lead_event_org_id();
