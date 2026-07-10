-- Lock down monthly reporting tables: clients should only READ these tables.
-- All writes flow through SECURITY DEFINER snapshot functions (run as
-- service_role via cron), so the FOR ALL policies granted authenticated users
-- unnecessary direct INSERT/UPDATE/DELETE. Replace them with SELECT-only.

DROP POLICY IF EXISTS monthly_org_reports_org ON public.monthly_org_reports;
CREATE POLICY monthly_org_reports_org ON public.monthly_org_reports
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

DROP POLICY IF EXISTS monthly_agent_reports_org ON public.monthly_agent_reports;
CREATE POLICY monthly_agent_reports_org ON public.monthly_agent_reports
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

-- upsert_monthly_agent_reports was added in 20250702150000 without the REVOKE
-- its sibling SECURITY DEFINER functions received in 20250630120000. Postgres
-- grants EXECUTE to PUBLIC by default, so lock it to service_role like the rest.
REVOKE EXECUTE ON FUNCTION public.upsert_monthly_agent_reports(date, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_monthly_agent_reports(date, uuid) TO service_role;
