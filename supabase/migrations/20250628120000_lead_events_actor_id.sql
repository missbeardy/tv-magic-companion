ALTER TABLE public.lead_events
  ADD COLUMN IF NOT EXISTS payload jsonb,
  ADD COLUMN IF NOT EXISTS actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

UPDATE public.lead_events
SET actor_id = created_by
WHERE actor_id IS NULL
  AND created_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS lead_events_actor_id_idx
  ON public.lead_events(actor_id);

CREATE OR REPLACE FUNCTION public.set_lead_event_actor_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.actor_id IS NULL THEN
    NEW.actor_id := NEW.created_by;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_lead_event_actor_id ON public.lead_events;
CREATE TRIGGER set_lead_event_actor_id
  BEFORE INSERT OR UPDATE ON public.lead_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_lead_event_actor_id();
