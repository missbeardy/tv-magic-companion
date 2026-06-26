CREATE INDEX IF NOT EXISTS lead_events_org_created_at_idx
  ON public.lead_events (org_id, created_at DESC);
