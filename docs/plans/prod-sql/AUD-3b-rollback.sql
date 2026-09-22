-- ROLLBACK for AUD-3b.sql — restores prod's RLS policies on leads / lead_events /
-- events / orgs / profiles exactly as they were live on 22-09-2026 (generated from a
-- read-only pg_policies export taken before AUD-3b was applied).
-- Idempotent: every CREATE is preceded by DROP IF EXISTS. Run as one batch.
-- Only use this if AUD-3b locks out a real workflow — it reopens every hole AUD-3b closed.

-- events_update / events_delete back to owner-or-manager (pre-AUD-3b form)
DROP POLICY IF EXISTS events_delete ON public.events;
DROP POLICY IF EXISTS events_update ON public.events;
CREATE POLICY events_delete ON public.events AS PERMISSIVE FOR DELETE TO authenticated
  USING (((org_id = current_user_org_id()) AND ((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['manager'::text, 'platform_admin'::text]))))))));

CREATE POLICY events_update ON public.events AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((org_id = current_user_org_id()) AND ((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['manager'::text, 'platform_admin'::text]))))))))
  WITH CHECK (((org_id = current_user_org_id()) AND ((user_id = auth.uid()) OR (EXISTS ( SELECT 1
   FROM profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['manager'::text, 'platform_admin'::text]))))))));

-- events (legacy)
DROP POLICY IF EXISTS "Employees can delete their own events" ON public.events;
CREATE POLICY "Employees can delete their own events" ON public.events AS PERMISSIVE FOR DELETE TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Employees can insert their own events" ON public.events;
CREATE POLICY "Employees can insert their own events" ON public.events AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Employees can update their own events" ON public.events;
CREATE POLICY "Employees can update their own events" ON public.events AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Employees can view their own events" ON public.events;
CREATE POLICY "Employees can view their own events" ON public.events AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = user_id));

DROP POLICY IF EXISTS "Managers can delete all events" ON public.events;
CREATE POLICY "Managers can delete all events" ON public.events AS PERMISSIVE FOR DELETE TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'manager'::text)))));

DROP POLICY IF EXISTS "Managers can insert events" ON public.events;
CREATE POLICY "Managers can insert events" ON public.events AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'manager'::text)))));

DROP POLICY IF EXISTS "Managers can update all events" ON public.events;
CREATE POLICY "Managers can update all events" ON public.events AS PERMISSIVE FOR UPDATE TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'manager'::text)))));

DROP POLICY IF EXISTS "Managers can view all events" ON public.events;
CREATE POLICY "Managers can view all events" ON public.events AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'manager'::text)))));

DROP POLICY IF EXISTS "Users can view events from their org" ON public.events;
CREATE POLICY "Users can view events from their org" ON public.events AS PERMISSIVE FOR ALL TO public
  USING ((org_id = ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

-- lead_events (legacy)
DROP POLICY IF EXISTS "Anyone can insert lead events" ON public.lead_events;
CREATE POLICY "Anyone can insert lead events" ON public.lead_events AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((auth.uid() IS NOT NULL));

DROP POLICY IF EXISTS "Employees see their own lead events" ON public.lead_events;
CREATE POLICY "Employees see their own lead events" ON public.lead_events AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM leads
  WHERE ((leads.id = lead_events.lead_id) AND (leads.assigned_to = auth.uid())))));

DROP POLICY IF EXISTS "Managers see all lead events" ON public.lead_events;
CREATE POLICY "Managers see all lead events" ON public.lead_events AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'manager'::text)))));

DROP POLICY IF EXISTS "employees_read_events" ON public.lead_events;
CREATE POLICY "employees_read_events" ON public.lead_events AS PERMISSIVE FOR SELECT TO public
  USING ((EXISTS ( SELECT 1
   FROM leads
  WHERE ((leads.id = lead_events.lead_id) AND (leads.assigned_to = auth.uid())))));

DROP POLICY IF EXISTS "managers_all_events" ON public.lead_events;
CREATE POLICY "managers_all_events" ON public.lead_events AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'manager'::text)))));

-- leads (legacy)
DROP POLICY IF EXISTS "Allow webhook inserts to leads" ON public.leads;
CREATE POLICY "Allow webhook inserts to leads" ON public.leads AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (true);

DROP POLICY IF EXISTS "Employees can self-assign leads" ON public.leads;
CREATE POLICY "Employees can self-assign leads" ON public.leads AS PERMISSIVE FOR UPDATE TO public
  USING (((status = 'unassigned'::text) AND (EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'employee'::text))))));

DROP POLICY IF EXISTS "Employees can update their own leads" ON public.leads;
CREATE POLICY "Employees can update their own leads" ON public.leads AS PERMISSIVE FOR UPDATE TO public
  USING ((assigned_to = auth.uid()));

DROP POLICY IF EXISTS "Employees can view relevant leads" ON public.leads;
CREATE POLICY "Employees can view relevant leads" ON public.leads AS PERMISSIVE FOR SELECT TO public
  USING (((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'employee'::text)))) AND ((status = 'unassigned'::text) OR (assigned_to = auth.uid()))));

DROP POLICY IF EXISTS "Managers can insert leads" ON public.leads;
CREATE POLICY "Managers can insert leads" ON public.leads AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'manager'::text)))));

DROP POLICY IF EXISTS "Managers have full access to leads" ON public.leads;
CREATE POLICY "Managers have full access to leads" ON public.leads AS PERMISSIVE FOR ALL TO public
  USING ((EXISTS ( SELECT 1
   FROM profiles
  WHERE ((profiles.id = auth.uid()) AND (profiles.role = 'manager'::text)))));

DROP POLICY IF EXISTS "Users can view leads from their org" ON public.leads;
CREATE POLICY "Users can view leads from their org" ON public.leads AS PERMISSIVE FOR ALL TO public
  USING ((org_id = ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

-- orgs (legacy)
DROP POLICY IF EXISTS "Users can update their own org" ON public.orgs;
CREATE POLICY "Users can update their own org" ON public.orgs AS PERMISSIVE FOR UPDATE TO public
  USING ((id = ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

DROP POLICY IF EXISTS "Users can view their own org" ON public.orgs;
CREATE POLICY "Users can view their own org" ON public.orgs AS PERMISSIVE FOR SELECT TO public
  USING ((id = ( SELECT profiles.org_id
   FROM profiles
  WHERE (profiles.id = auth.uid()))));

-- profiles (legacy)
DROP POLICY IF EXISTS "Anyone authenticated can view all profiles" ON public.profiles;
CREATE POLICY "Anyone authenticated can view all profiles" ON public.profiles AS PERMISSIVE FOR SELECT TO public
  USING ((auth.role() = 'authenticated'::text));

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = id));

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles AS PERMISSIVE FOR UPDATE TO public
  USING ((auth.uid() = id));

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = id));

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles AS PERMISSIVE FOR SELECT TO public
  USING ((auth.uid() = id));
