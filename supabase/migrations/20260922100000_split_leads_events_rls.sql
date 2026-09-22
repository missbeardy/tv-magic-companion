-- AUD-3: split FOR ALL RLS policies on leads / lead_events / events into
-- per-action policies, removing blanket DELETE and adding an ownership
-- check on events writes.
--
-- `tasks` / `task_items` are in the original AUD-3 card too, but both tables
-- were dropped in 20260811032416_drop_tasks_tables.sql ("dead feature,
-- slated for removal in dd18") and no longer exist — nothing to change there.
--
-- Confirmed against src/ before writing this:
-- - No client code ever deletes a `leads` row (hard delete was already only
--   reachable via FOR ALL + RLS, never actually used) or updates/deletes a
--   `lead_events` row. Removing those policies removes dead permission surface.
-- - `events` DELETE is used by Calendar.tsx (handleDeleteLeave) and
--   cancelBooking.ts, both already gated client-side by
--   `isManagerRole(profile.role) || event.user_id === profile.id`
--   (src/lib/roles.ts). Calendar.tsx's own fetch also restricts employees to
--   `user_id = profile.id` before they can ever see another user's event.
--   The DB-level check below matches that client gate exactly.
-- - `events` UPDATE is used the same way (EventModal, leadContact.ts,
--   leadAddress.ts) — same ownership pattern, no manager-only path found that
--   isn't already covered by the manager/platform_admin bypass.

-- ============================================================
-- leads: SELECT/INSERT/UPDATE, no DELETE. Soft-delete only (deleted_at),
-- already enforced by trg_prevent_client_lead_soft_delete.
-- ============================================================

DROP POLICY IF EXISTS leads_org ON public.leads;

CREATE POLICY leads_select ON public.leads FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id() AND deleted_at IS NULL);

CREATE POLICY leads_insert ON public.leads FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_user_org_id() AND deleted_at IS NULL);

CREATE POLICY leads_update ON public.leads FOR UPDATE TO authenticated
  USING (org_id = public.current_user_org_id() AND deleted_at IS NULL)
  WITH CHECK (org_id = public.current_user_org_id() AND deleted_at IS NULL);

-- ============================================================
-- lead_events: SELECT + INSERT only. It's an append-only audit trail —
-- no UPDATE, no DELETE for authenticated/anon.
-- ============================================================

DROP POLICY IF EXISTS lead_events_org ON public.lead_events;

CREATE POLICY lead_events_select ON public.lead_events FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

CREATE POLICY lead_events_insert ON public.lead_events FOR INSERT TO authenticated
  WITH CHECK (org_id = public.current_user_org_id());

-- ============================================================
-- events: SELECT/INSERT stay org-scoped (unchanged from today — the client
-- already narrows an employee's own calendar fetch to their own events).
-- UPDATE/DELETE additionally require ownership or manager/platform_admin.
-- ============================================================

DROP POLICY IF EXISTS events_org ON public.events;

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

-- Verify (run as a non-manager employee — should error / affect 0 rows):
--   DELETE FROM public.events WHERE id = '<some other user''s event id>';
--   UPDATE public.events SET title = 'x' WHERE id = '<some other user''s event id>';
-- Verify a normal employee can still cancel/edit their own booking:
--   DELETE FROM public.events WHERE id = '<an event where user_id = auth.uid()>';
