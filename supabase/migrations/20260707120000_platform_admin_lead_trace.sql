-- Platform admin read-only access to leads + lead_events for Workflow Runs kanban trace.

DROP POLICY IF EXISTS leads_platform_admin_select ON public.leads;
CREATE POLICY leads_platform_admin_select ON public.leads
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS lead_events_platform_admin_select ON public.lead_events;
CREATE POLICY lead_events_platform_admin_select ON public.lead_events
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());
