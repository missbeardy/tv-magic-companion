-- Package 5: day-before booking reminder sweep.
-- Adds dedupe column for the reminder sweep, an org timezone for the quiet-hours guard,
-- a tiny global cron heartbeat table, and the new feature switch.

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

ALTER TABLE public.orgs ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Australia/Perth';

CREATE TABLE IF NOT EXISTS public.cron_heartbeats (
  cron_key text PRIMARY KEY,
  last_run_at timestamptz NOT NULL,
  last_result jsonb
);

ALTER TABLE public.cron_heartbeats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cron_heartbeats_platform_admin ON public.cron_heartbeats;
CREATE POLICY cron_heartbeats_platform_admin ON public.cron_heartbeats
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

COMMENT ON TABLE public.cron_heartbeats IS
  'Last-run heartbeat per named cron chain, for operator health visibility (not org-scoped).';

INSERT INTO public.feature_flag_catalog (feature_key, label, description, default_enabled, min_tier, category)
VALUES (
  'booking_reminder_sms',
  'Day-Before Booking Reminder SMS',
  'Automatic SMS reminder sent to the customer roughly 24 hours before a booked appointment',
  false,
  'basic',
  'customer_communication'
)
ON CONFLICT (feature_key) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  min_tier = EXCLUDED.min_tier,
  category = EXCLUDED.category;
