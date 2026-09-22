-- AUD-3b: drop the legacy permissive RLS policies so AUD-3's per-action
-- policies actually govern leads / lead_events / events / orgs / profiles.
-- Copy of supabase/migrations/20260922140000_drop_legacy_permissive_policies.sql
-- (see that file's header for what each legacy policy exposed).
--
-- ORDER: after AUD-C1.sql, and after the release branch is deployed (it ships the
-- cancelBooking.ts guard that stops a non-manager silently half-cancelling a
-- shared booking once events_delete is ownership-scoped). Do NOT re-run AUD-3.sql
-- after this file — it would recreate the narrower events_update/events_delete
-- without the lead-assignee clause added here.
--
-- Visible effect for TV Magic users: soft-deleted leads stop showing to clients
-- (the API's restore flow is service-role, unaffected); nothing else they can do
-- today changes. Everything else removed is cross-org, anon, or hard-delete access.

-- ============================================================
-- READ-ONLY VERIFY (run first)
-- ============================================================
-- 1. Replacement policies must all be present (the migration's guard re-checks this
--    and aborts before dropping anything if one is missing). Expect 11 rows.
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND (tablename, policyname) IN (
    ('leads', 'leads_select'), ('leads', 'leads_insert'), ('leads', 'leads_update'),
    ('lead_events', 'lead_events_select'), ('lead_events', 'lead_events_insert'),
    ('events', 'events_select'), ('events', 'events_insert'),
    ('orgs', 'orgs_select_own'), ('orgs', 'orgs_update_manager'),
    ('profiles', 'profiles_select'), ('profiles', 'profiles_update_self')
  )
ORDER BY 1, 2;

-- 2. The legacy set this removes. Expect 28 rows on prod as of 22-09-2026.
SELECT tablename, policyname, cmd, roles::text
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('leads', 'lead_events', 'events', 'orgs', 'profiles')
  AND (policyname ~ ' ' OR policyname IN ('managers_all_events', 'employees_read_events'))
ORDER BY 1, 2;

-- 3. No live lead is created with the anon key (every source should be a
--    service-role path or a signed-in user; checked 22-09-2026 for the last 60 days).
SELECT source, lead_source, count(*), max(created_at)
FROM public.leads
WHERE created_at > now() - interval '60 days'
GROUP BY 1, 2
ORDER BY 3 DESC;

-- ============================================================
-- MIGRATION (idempotent: guard, DROP POLICY IF EXISTS, DROP-then-CREATE)
-- Run as one statement batch — the SQL editor wraps it in a single transaction,
-- so a failure anywhere leaves every existing policy in place.
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

DROP POLICY IF EXISTS "Allow webhook inserts to leads" ON public.leads;
DROP POLICY IF EXISTS "Employees can self-assign leads" ON public.leads;
DROP POLICY IF EXISTS "Employees can update their own leads" ON public.leads;
DROP POLICY IF EXISTS "Employees can view relevant leads" ON public.leads;
DROP POLICY IF EXISTS "Managers can insert leads" ON public.leads;
DROP POLICY IF EXISTS "Managers have full access to leads" ON public.leads;
DROP POLICY IF EXISTS "Users can view leads from their org" ON public.leads;

DROP POLICY IF EXISTS "Anyone can insert lead events" ON public.lead_events;
DROP POLICY IF EXISTS "Employees see their own lead events" ON public.lead_events;
DROP POLICY IF EXISTS "Managers see all lead events" ON public.lead_events;
DROP POLICY IF EXISTS employees_read_events ON public.lead_events;
DROP POLICY IF EXISTS managers_all_events ON public.lead_events;

DROP POLICY IF EXISTS "Employees can delete their own events" ON public.events;
DROP POLICY IF EXISTS "Employees can insert their own events" ON public.events;
DROP POLICY IF EXISTS "Employees can update their own events" ON public.events;
DROP POLICY IF EXISTS "Employees can view their own events" ON public.events;
DROP POLICY IF EXISTS "Managers can delete all events" ON public.events;
DROP POLICY IF EXISTS "Managers can insert events" ON public.events;
DROP POLICY IF EXISTS "Managers can update all events" ON public.events;
DROP POLICY IF EXISTS "Managers can view all events" ON public.events;
DROP POLICY IF EXISTS "Users can view events from their org" ON public.events;

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

DROP POLICY IF EXISTS "Users can update their own org" ON public.orgs;
DROP POLICY IF EXISTS "Users can view their own org" ON public.orgs;

DROP POLICY IF EXISTS "Anyone authenticated can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;

-- ============================================================
-- AFTER: re-run query 2 — expect 0 rows. Then smoke-test in the app as the Demo
-- Employee: leads board loads, a lead can be claimed and moved, calendar loads,
-- own booking can be edited; and as the manager: settings save, calendar edits.
-- ============================================================
