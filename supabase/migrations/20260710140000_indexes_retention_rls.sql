-- Performance indexes, RLS tightening, and notification retention.
--
-- Deferred prod application: review and run under supervision. On large tables,
-- prefer CREATE INDEX CONCURRENTLY (must run outside a transaction) instead of
-- the plain CREATE INDEX below, which briefly locks writes.

-- ---------------------------------------------------------------------------
-- Indexes for hot query paths
-- ---------------------------------------------------------------------------

-- NotificationBell unread count: WHERE user_id = ? AND read = false, newest first.
CREATE INDEX IF NOT EXISTS notifications_user_read_created_idx
  ON public.notifications (user_id, read, created_at DESC);

-- tasks are always filtered by org (RLS + board queries) but had no index.
CREATE INDEX IF NOT EXISTS tasks_org_id_idx
  ON public.tasks (org_id);

-- org_phone_numbers lookups resolve inbound DIDs by org.
CREATE INDEX IF NOT EXISTS org_phone_numbers_org_id_idx
  ON public.org_phone_numbers (org_id);

-- expire_overdue_leads cron scans: status='assigned' AND timer_expires_at < now().
CREATE INDEX IF NOT EXISTS leads_assigned_timer_idx
  ON public.leads (timer_expires_at)
  WHERE status = 'assigned';

-- contact-follow-up cron scans: status='contact_attempted' AND
-- last_contact_attempted_at <= cutoff (api/_lib/runContactFollowUpCron.ts).
CREATE INDEX IF NOT EXISTS leads_contact_followup_idx
  ON public.leads (last_contact_attempted_at)
  WHERE status = 'contact_attempted';

-- ---------------------------------------------------------------------------
-- RLS: org_phone_numbers had RLS enabled but no policy, so authenticated
-- clients could read nothing (only the service-role admin client worked).
-- Allow org members to read their own org's phone numbers.
-- ---------------------------------------------------------------------------

ALTER TABLE public.org_phone_numbers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS org_phone_numbers_select ON public.org_phone_numbers;
CREATE POLICY org_phone_numbers_select ON public.org_phone_numbers
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

-- ---------------------------------------------------------------------------
-- RLS: brands_select was USING (true) — every authenticated user could read
-- every brand. Scope it to the caller's own brand (their org's brand_id);
-- platform admins keep full read (needed for the brand-transfer UI). The
-- separate brands_admin policy already governs writes.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS brands_select ON public.brands;
CREATE POLICY brands_select ON public.brands
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR id = (SELECT brand_id FROM public.orgs WHERE id = public.current_user_org_id())
  );

-- ---------------------------------------------------------------------------
-- Retention: prune old notifications. Mirrors the purgeOldWorkflowRuns pattern
-- (api/_lib/workflowRun.ts). Restricted to service_role; wire into the existing
-- opportunistic purge point as a follow-up.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prune_old_notifications(retention_days integer DEFAULT 60)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.notifications
  WHERE created_at < now() - make_interval(days => retention_days);
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_old_notifications(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_old_notifications(integer) TO service_role;
