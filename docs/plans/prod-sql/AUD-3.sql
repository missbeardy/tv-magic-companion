-- AUD-3: split FOR ALL RLS policies (leads / lead_events / events).
-- Copy of supabase/migrations/20260922100000_split_leads_events_rls.sql.
-- `tasks`/`task_items` were dropped 2026-08-11 (20260811032416_drop_tasks_tables.sql)
-- and are not touched here — see the migration file comment for why.

-- ============================================================
-- READ-ONLY VERIFY (run first)
-- ============================================================

-- Confirm the tables this touches still have the single FOR ALL policy today:
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('leads', 'lead_events', 'events')
ORDER BY tablename, policyname;
-- NOTE (22-09-2026 review): prod never had leads_org / lead_events_org /
-- events_org, and this file's policies are ALREADY live on prod. Prod also has
-- 28 legacy permissive policies (names with spaces) that override everything
-- here — AUD-3b.sql removes them. Re-running this file is now harmless but
-- pointless, and must NOT be done after AUD-3b.sql (it would narrow
-- events_update/events_delete back to owner-or-manager).

-- Confirm no event currently relies on a NULL user_id (would fail the new
-- ownership check for both UPDATE and DELETE unless the caller is a manager):
SELECT count(*) AS events_with_null_user_id
FROM public.events
WHERE user_id IS NULL;

-- ============================================================
-- MIGRATION (idempotent: DROP POLICY IF EXISTS, then CREATE POLICY)
-- ============================================================

DROP POLICY IF EXISTS leads_org ON public.leads;
DROP POLICY IF EXISTS leads_select ON public.leads;
DROP POLICY IF EXISTS leads_insert ON public.leads;
DROP POLICY IF EXISTS leads_update ON public.leads;

CREATE POLICY leads_select ON public.leads FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id() AND deleted_at IS NULL);

CREATE POLICY leads_insert ON public.leads FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_user_org_id() AND deleted_at IS NULL);

CREATE POLICY leads_update ON public.leads FOR UPDATE TO authenticated
  USING (org_id = public.current_user_org_id() AND deleted_at IS NULL)
  WITH CHECK (org_id = public.current_user_org_id() AND deleted_at IS NULL);

DROP POLICY IF EXISTS lead_events_org ON public.lead_events;
DROP POLICY IF EXISTS lead_events_select ON public.lead_events;
DROP POLICY IF EXISTS lead_events_insert ON public.lead_events;

CREATE POLICY lead_events_select ON public.lead_events FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

CREATE POLICY lead_events_insert ON public.lead_events FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_user_org_id());

DROP POLICY IF EXISTS events_org ON public.events;
DROP POLICY IF EXISTS events_select ON public.events;
DROP POLICY IF EXISTS events_insert ON public.events;
DROP POLICY IF EXISTS events_update ON public.events;
DROP POLICY IF EXISTS events_delete ON public.events;

CREATE POLICY events_select ON public.events FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

CREATE POLICY events_insert ON public.events FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_user_org_id());

CREATE POLICY events_update ON public.events FOR UPDATE TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('manager', 'platform_admin')
      )
    )
  )
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('manager', 'platform_admin')
      )
    )
  );

CREATE POLICY events_delete ON public.events FOR DELETE TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('manager', 'platform_admin')
      )
    )
  );
