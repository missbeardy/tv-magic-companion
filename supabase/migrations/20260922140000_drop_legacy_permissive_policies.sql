-- Finish AUD-3: drop the legacy permissive policies that make the per-action
-- policies from 20260922100000 meaningless.
--
-- Postgres ORs every PERMISSIVE policy for a command. Prod still carries a set of
-- hand-made dashboard policies (TO public, never in this repo) alongside the
-- migration-managed ones, and they grant far more than the split policies do:
--
--   leads        "Allow webhook inserts to leads"  INSERT WITH CHECK (true) — anon key
--                                                   could insert a lead into any org
--                "Managers have full access to leads" ALL, role check only — cross-tenant
--                "Employees can view relevant leads" / "Employees can self-assign leads"
--                                                   — unassigned leads of every org
--                "Users can view leads from their org" ALL — any member can hard-DELETE
--   lead_events  "managers_all_events" ALL (cross-tenant, and UPDATE/DELETE of the audit
--                trail), "Anyone can insert lead events" (any lead, any org)
--   events       "Users can view events from their org" ALL — defeats events_update /
--                events_delete ownership; "Managers can … all events" — cross-tenant
--   orgs         "Users can update their own org" — any employee can edit org settings
--   profiles     "Anyone authenticated can view all profiles" — cross-tenant PII
--
-- What replaces them (all already present, checked by the guard below):
--   leads        leads_select / leads_insert / leads_update (org-scoped, live rows only),
--                leads_platform_admin_select
--   lead_events  lead_events_select / lead_events_insert, lead_events_platform_admin_select
--   events       events_select / events_insert, events_update / events_delete (below)
--   orgs         orgs_select_own, orgs_update_manager, orgs_platform_*
--   profiles     profiles_select, profiles_update_self, profiles_platform_admin_select
--
-- Checked before writing this: every lead-creating path is service-role (inbound SMS,
-- voicemail, email, Messenger/Botpress, visualiser) or a signed-in user (manual /
-- Calendar Booking). No edge function or external caller inserts leads with the anon
-- key, so dropping the anon INSERT policy breaks nothing. The client only ever
-- INSERTs lead_events, never updates/deletes them, and never hard-deletes a lead.

-- ============================================================
-- Guard: refuse to drop anything if a replacement policy is missing — dropping
-- the legacy set without them would lock every user out of these tables.
-- ============================================================
DO $$
DECLARE
  missing text;
BEGIN
  SELECT string_agg(req.tbl || '.' || req.pol, ', ')
  INTO missing
  FROM (VALUES
    ('leads', 'leads_select'), ('leads', 'leads_insert'), ('leads', 'leads_update'),
    ('lead_events', 'lead_events_select'), ('lead_events', 'lead_events_insert'),
    ('events', 'events_select'), ('events', 'events_insert'),
    ('orgs', 'orgs_select_own'), ('orgs', 'orgs_update_manager'),
    ('profiles', 'profiles_select'), ('profiles', 'profiles_update_self')
  ) AS req(tbl, pol)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.tablename = req.tbl AND p.policyname = req.pol
  );

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'Replacement policies missing, not dropping legacy policies: %', missing;
  END IF;
END
$$;

-- ============================================================
-- leads
-- ============================================================
DROP POLICY IF EXISTS "Allow webhook inserts to leads" ON public.leads;
DROP POLICY IF EXISTS "Employees can self-assign leads" ON public.leads;
DROP POLICY IF EXISTS "Employees can update their own leads" ON public.leads;
DROP POLICY IF EXISTS "Employees can view relevant leads" ON public.leads;
DROP POLICY IF EXISTS "Managers can insert leads" ON public.leads;
DROP POLICY IF EXISTS "Managers have full access to leads" ON public.leads;
DROP POLICY IF EXISTS "Users can view leads from their org" ON public.leads;

-- ============================================================
-- lead_events
-- ============================================================
DROP POLICY IF EXISTS "Anyone can insert lead events" ON public.lead_events;
DROP POLICY IF EXISTS "Employees see their own lead events" ON public.lead_events;
DROP POLICY IF EXISTS "Managers see all lead events" ON public.lead_events;
DROP POLICY IF EXISTS employees_read_events ON public.lead_events;
DROP POLICY IF EXISTS managers_all_events ON public.lead_events;

-- ============================================================
-- events
-- ============================================================
DROP POLICY IF EXISTS "Employees can delete their own events" ON public.events;
DROP POLICY IF EXISTS "Employees can insert their own events" ON public.events;
DROP POLICY IF EXISTS "Employees can update their own events" ON public.events;
DROP POLICY IF EXISTS "Employees can view their own events" ON public.events;
DROP POLICY IF EXISTS "Managers can delete all events" ON public.events;
DROP POLICY IF EXISTS "Managers can insert events" ON public.events;
DROP POLICY IF EXISTS "Managers can update all events" ON public.events;
DROP POLICY IF EXISTS "Managers can view all events" ON public.events;
DROP POLICY IF EXISTS "Users can view events from their org" ON public.events;

-- events_update / events_delete (20260922100000) only allowed the event's own
-- user or a manager. leadContact.ts / leadAddress.ts update every future event on
-- a lead when its contact details change, so the lead's assigned technician must
-- be able to write events on that lead even when a manager created them under
-- another user — otherwise those updates silently match 0 rows.
DROP POLICY IF EXISTS events_update ON public.events;
DROP POLICY IF EXISTS events_delete ON public.events;

CREATE POLICY events_update ON public.events FOR UPDATE TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = auth.uid() AND p.role IN ('manager', 'platform_admin')
      )
      OR (
        lead_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = events.lead_id AND l.assigned_to = auth.uid())
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
      OR (
        lead_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = events.lead_id AND l.assigned_to = auth.uid())
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
      OR (
        lead_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.leads l WHERE l.id = events.lead_id AND l.assigned_to = auth.uid())
      )
    )
  );

-- ============================================================
-- orgs / profiles
-- ============================================================
DROP POLICY IF EXISTS "Users can update their own org" ON public.orgs;
DROP POLICY IF EXISTS "Users can view their own org" ON public.orgs;

DROP POLICY IF EXISTS "Anyone authenticated can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- Verify: expect only migration-managed policy names (no spaces, no "Managers …").
--   SELECT tablename, policyname, cmd, roles FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN ('leads', 'lead_events', 'events', 'orgs', 'profiles')
--   ORDER BY tablename, policyname;
