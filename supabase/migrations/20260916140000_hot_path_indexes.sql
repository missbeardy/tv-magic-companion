-- Hot-path indexes. CREATE INDEX CONCURRENTLY cannot run inside a transaction —
-- apply these statement-by-statement via the Supabase SQL editor / Management API
-- on production, then record the version in schema_migrations by hand (prod is
-- not migration-driven; see supabase/PROD_DRIFT_2026-08-19.md).

-- lead_events are loaded on every card expand, the board badge query, the
-- activity feed and reports. FK columns are not auto-indexed in Postgres.
CREATE INDEX CONCURRENTLY IF NOT EXISTS lead_events_lead_id_created_at_idx
  ON public.lead_events (lead_id, created_at DESC);

-- phoneBelongsToOrg, inbound SMS threading, customer linking.
CREATE INDEX CONCURRENTLY IF NOT EXISTS leads_org_id_phone_idx
  ON public.leads (org_id, phone);

-- Calendar range fetch and booking-reminder sweep.
CREATE INDEX CONCURRENTLY IF NOT EXISTS events_org_id_start_time_idx
  ON public.events (org_id, start_time);

CREATE INDEX CONCURRENTLY IF NOT EXISTS lead_photos_lead_id_idx
  ON public.lead_photos (lead_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS lead_voicemails_lead_id_idx
  ON public.lead_voicemails (lead_id);
