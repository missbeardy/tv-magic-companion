-- Phase 3 (DB): monthly reporting snapshots + kanban cleanup support.
-- Safe to re-run where practical.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS hidden_from_kanban_at timestamptz;

CREATE INDEX IF NOT EXISTS leads_org_status_hidden_idx
  ON public.leads (org_id, status, hidden_from_kanban_at);

CREATE TABLE IF NOT EXISTS public.monthly_org_reports (
  id                                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                                 uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  month_start                            date NOT NULL,
  month_end                              date NOT NULL,
  leads_received                         integer NOT NULL DEFAULT 0,
  assignments                            integer NOT NULL DEFAULT 0,
  unassigned                             integer NOT NULL DEFAULT 0,
  contact_attempts                       integer NOT NULL DEFAULT 0,
  bookings                               integer NOT NULL DEFAULT 0,
  completed                              integer NOT NULL DEFAULT 0,
  lost                                   integer NOT NULL DEFAULT 0,
  expired                                integer NOT NULL DEFAULT 0,
  booking_cancelled                      integer NOT NULL DEFAULT 0,
  review_requests                        integer NOT NULL DEFAULT 0,
  assigned_to_contacted_numerator        integer NOT NULL DEFAULT 0,
  assigned_to_contacted_denominator      integer NOT NULL DEFAULT 0,
  assigned_to_contacted_rate             numeric,
  contacted_to_booked_numerator          integer NOT NULL DEFAULT 0,
  contacted_to_booked_denominator        integer NOT NULL DEFAULT 0,
  contacted_to_booked_rate               numeric,
  booked_to_completed_numerator          integer NOT NULL DEFAULT 0,
  booked_to_completed_denominator        integer NOT NULL DEFAULT 0,
  booked_to_completed_rate               numeric,
  avg_hours_to_first_contact             numeric,
  avg_hours_to_booking                   numeric,
  first_contact_samples                  integer NOT NULL DEFAULT 0,
  booking_samples                        integer NOT NULL DEFAULT 0,
  source_breakdown                       jsonb NOT NULL DEFAULT '[]'::jsonb,
  snapshot_generated_at                  timestamptz NOT NULL DEFAULT now(),
  created_at                             timestamptz NOT NULL DEFAULT now(),
  updated_at                             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT monthly_org_reports_org_month_unique UNIQUE (org_id, month_start),
  CONSTRAINT monthly_org_reports_month_start_check
    CHECK (month_start = date_trunc('month', month_start::timestamp)::date),
  CONSTRAINT monthly_org_reports_month_end_check
    CHECK (month_end = (month_start + INTERVAL '1 month')::date)
);

CREATE INDEX IF NOT EXISTS monthly_org_reports_org_month_idx
  ON public.monthly_org_reports (org_id, month_start DESC);

CREATE INDEX IF NOT EXISTS monthly_org_reports_month_start_idx
  ON public.monthly_org_reports (month_start DESC);

CREATE TABLE IF NOT EXISTS public.monthly_agent_reports (
  id                                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                                 uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  agent_id                               uuid NOT NULL,
  month_start                            date NOT NULL,
  month_end                              date NOT NULL,
  agent_name                             text,
  agent_role                             text,
  assignments                            integer NOT NULL DEFAULT 0,
  unassigned                             integer NOT NULL DEFAULT 0,
  contact_attempts                       integer NOT NULL DEFAULT 0,
  bookings                               integer NOT NULL DEFAULT 0,
  completed                              integer NOT NULL DEFAULT 0,
  lost                                   integer NOT NULL DEFAULT 0,
  expired                                integer NOT NULL DEFAULT 0,
  booking_cancelled                      integer NOT NULL DEFAULT 0,
  review_requests                        integer NOT NULL DEFAULT 0,
  snapshot_generated_at                  timestamptz NOT NULL DEFAULT now(),
  created_at                             timestamptz NOT NULL DEFAULT now(),
  updated_at                             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT monthly_agent_reports_org_agent_month_unique UNIQUE (org_id, agent_id, month_start),
  CONSTRAINT monthly_agent_reports_month_start_check
    CHECK (month_start = date_trunc('month', month_start::timestamp)::date),
  CONSTRAINT monthly_agent_reports_month_end_check
    CHECK (month_end = (month_start + INTERVAL '1 month')::date)
);

CREATE INDEX IF NOT EXISTS monthly_agent_reports_org_month_idx
  ON public.monthly_agent_reports (org_id, month_start DESC);

CREATE INDEX IF NOT EXISTS monthly_agent_reports_org_agent_idx
  ON public.monthly_agent_reports (org_id, agent_id, month_start DESC);

ALTER TABLE public.monthly_org_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_agent_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS monthly_org_reports_org ON public.monthly_org_reports;
CREATE POLICY monthly_org_reports_org ON public.monthly_org_reports
  FOR ALL TO authenticated
  USING (org_id = public.current_user_org_id())
  WITH CHECK (org_id = public.current_user_org_id());

DROP POLICY IF EXISTS monthly_agent_reports_org ON public.monthly_agent_reports;
CREATE POLICY monthly_agent_reports_org ON public.monthly_agent_reports
  FOR ALL TO authenticated
  USING (org_id = public.current_user_org_id())
  WITH CHECK (org_id = public.current_user_org_id());

CREATE OR REPLACE FUNCTION public.snapshot_monthly_reporting(
  p_month_start date DEFAULT ((date_trunc('month', timezone('utc', now())) - INTERVAL '1 month')::date),
  p_org_id uuid DEFAULT NULL
)
RETURNS TABLE (
  org_rows_upserted integer,
  agent_rows_upserted integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month_start date := p_month_start;
  v_month_end date := (p_month_start + INTERVAL '1 month')::date;
  v_month_start_ts timestamptz;
  v_month_end_ts timestamptz;
BEGIN
  IF v_month_start IS NULL THEN
    RAISE EXCEPTION 'p_month_start is required';
  END IF;

  IF v_month_start <> date_trunc('month', v_month_start::timestamp)::date THEN
    RAISE EXCEPTION 'p_month_start must be first day of month (got %)', v_month_start;
  END IF;

  v_month_start_ts := v_month_start::timestamp AT TIME ZONE 'UTC';
  v_month_end_ts := v_month_end::timestamp AT TIME ZONE 'UTC';

  WITH target_orgs AS (
    SELECT p_org_id AS org_id
    WHERE p_org_id IS NOT NULL
    UNION
    SELECT DISTINCT l.org_id
    FROM public.leads l
    WHERE p_org_id IS NULL
      AND l.org_id IS NOT NULL
      AND l.created_at >= v_month_start_ts
      AND l.created_at < v_month_end_ts
    UNION
    SELECT DISTINCT e.org_id
    FROM public.lead_events e
    WHERE p_org_id IS NULL
      AND e.org_id IS NOT NULL
      AND e.created_at >= v_month_start_ts
      AND e.created_at < v_month_end_ts
  ),
  leads_in_month AS (
    SELECT
      l.org_id,
      l.id AS lead_id,
      COALESCE(NULLIF(BTRIM(l.lead_source), ''), NULLIF(BTRIM(l.source), ''), 'Unknown') AS normalized_source
    FROM public.leads l
    JOIN target_orgs t ON t.org_id = l.org_id
    WHERE l.created_at >= v_month_start_ts
      AND l.created_at < v_month_end_ts
  ),
  events_in_month AS (
    SELECT
      e.org_id,
      e.lead_id,
      e.event_type,
      e.created_at,
      COALESCE(e.actor_id, e.created_by) AS actor_id_effective,
      CASE
        WHEN e.event_type IN ('completed', 'lost', 'expired', 'booking_cancelled') THEN e.event_type
        WHEN e.event_type = 'status_change'
          AND e.payload ? 'to_status'
          AND (e.payload->>'to_status') IN ('completed', 'lost', 'expired', 'booking_cancelled')
          THEN e.payload->>'to_status'
        ELSE NULL
      END AS outcome_type,
      CASE
        WHEN e.event_type IN ('call_attempted', 'sms_attempted', 'contact_attempted') THEN true
        ELSE false
      END AS is_contact,
      CASE
        WHEN e.event_type = 'assigned'
             AND e.payload ? 'assigned_to'
             AND (e.payload->>'assigned_to') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN (e.payload->>'assigned_to')::uuid
        ELSE NULL
      END AS payload_assigned_to
    FROM public.lead_events e
    JOIN target_orgs t ON t.org_id = e.org_id
    WHERE e.created_at >= v_month_start_ts
      AND e.created_at < v_month_end_ts
  ),
  first_assigned_by_lead AS (
    SELECT
      e.org_id,
      e.lead_id,
      MIN(e.created_at) AS first_assigned_at
    FROM events_in_month e
    WHERE e.event_type = 'assigned'
    GROUP BY e.org_id, e.lead_id
  ),
  first_contact_after_assign AS (
    SELECT
      e.org_id,
      e.lead_id,
      MIN(e.created_at) AS first_contact_at
    FROM events_in_month e
    JOIN first_assigned_by_lead fa
      ON fa.org_id = e.org_id
     AND fa.lead_id = e.lead_id
    WHERE e.is_contact = true
      AND e.created_at >= fa.first_assigned_at
    GROUP BY e.org_id, e.lead_id
  ),
  first_booking_after_assign AS (
    SELECT
      e.org_id,
      e.lead_id,
      MIN(e.created_at) AS first_booking_at
    FROM events_in_month e
    JOIN first_assigned_by_lead fa
      ON fa.org_id = e.org_id
     AND fa.lead_id = e.lead_id
    WHERE e.event_type = 'booked'
      AND e.created_at >= fa.first_assigned_at
    GROUP BY e.org_id, e.lead_id
  ),
  leads_received AS (
    SELECT
      l.org_id,
      COUNT(*)::integer AS leads_received
    FROM leads_in_month l
    GROUP BY l.org_id
  ),
  source_breakdown AS (
    SELECT
      s.org_id,
      COALESCE(
        jsonb_agg(
          jsonb_build_object('source', s.normalized_source, 'count', s.source_count)
          ORDER BY s.source_count DESC, s.normalized_source ASC
        ),
        '[]'::jsonb
      ) AS source_breakdown
    FROM (
      SELECT
        l.org_id,
        l.normalized_source,
        COUNT(*)::integer AS source_count
      FROM leads_in_month l
      GROUP BY l.org_id, l.normalized_source
    ) s
    GROUP BY s.org_id
  ),
  event_rollup AS (
    SELECT
      e.org_id,
      COUNT(*) FILTER (WHERE e.event_type = 'assigned')::integer AS assignments,
      COUNT(*) FILTER (WHERE e.event_type = 'unassigned')::integer AS unassigned,
      COUNT(*) FILTER (WHERE e.is_contact = true)::integer AS contact_attempts,
      COUNT(*) FILTER (WHERE e.event_type = 'booked')::integer AS bookings,
      COUNT(*) FILTER (WHERE e.event_type = 'review_request')::integer AS review_requests
    FROM events_in_month e
    GROUP BY e.org_id
  ),
  outcome_rollup AS (
    SELECT
      e.org_id,
      COUNT(DISTINCT e.lead_id) FILTER (WHERE e.outcome_type = 'completed')::integer AS completed,
      COUNT(DISTINCT e.lead_id) FILTER (WHERE e.outcome_type = 'lost')::integer AS lost,
      COUNT(DISTINCT e.lead_id) FILTER (WHERE e.outcome_type = 'expired')::integer AS expired,
      COUNT(DISTINCT e.lead_id) FILTER (WHERE e.outcome_type = 'booking_cancelled')::integer AS booking_cancelled
    FROM events_in_month e
    WHERE e.outcome_type IS NOT NULL
    GROUP BY e.org_id
  ),
  assigned_leads AS (
    SELECT DISTINCT e.org_id, e.lead_id
    FROM events_in_month e
    WHERE e.event_type = 'assigned'
  ),
  booked_leads AS (
    SELECT DISTINCT e.org_id, e.lead_id
    FROM events_in_month e
    WHERE e.event_type = 'booked'
  ),
  completed_leads AS (
    SELECT DISTINCT e.org_id, e.lead_id
    FROM events_in_month e
    WHERE e.outcome_type = 'completed'
  ),
  assigned_and_contacted AS (
    SELECT
      fa.org_id,
      fa.lead_id
    FROM first_contact_after_assign fc
    JOIN assigned_leads fa
      ON fa.org_id = fc.org_id
     AND fa.lead_id = fc.lead_id
  ),
  contacted_and_booked AS (
    SELECT
      ac.org_id,
      ac.lead_id
    FROM assigned_and_contacted ac
    JOIN booked_leads b
      ON b.org_id = ac.org_id
     AND b.lead_id = ac.lead_id
  ),
  booked_and_completed AS (
    SELECT
      b.org_id,
      b.lead_id
    FROM booked_leads b
    JOIN completed_leads c
      ON c.org_id = b.org_id
     AND c.lead_id = b.lead_id
  ),
  conversion_rollup AS (
    SELECT
      t.org_id,
      COALESCE(a.assigned_count, 0)::integer AS assigned_to_contacted_denominator,
      COALESCE(ac.assigned_contacted_count, 0)::integer AS assigned_to_contacted_numerator,
      COALESCE(ac.assigned_contacted_count, 0)::integer AS contacted_to_booked_denominator,
      COALESCE(cb.contacted_booked_count, 0)::integer AS contacted_to_booked_numerator,
      COALESCE(b.booked_count, 0)::integer AS booked_to_completed_denominator,
      COALESCE(bc.booked_completed_count, 0)::integer AS booked_to_completed_numerator
    FROM target_orgs t
    LEFT JOIN (
      SELECT org_id, COUNT(*)::integer AS assigned_count
      FROM assigned_leads
      GROUP BY org_id
    ) a ON a.org_id = t.org_id
    LEFT JOIN (
      SELECT org_id, COUNT(*)::integer AS assigned_contacted_count
      FROM assigned_and_contacted
      GROUP BY org_id
    ) ac ON ac.org_id = t.org_id
    LEFT JOIN (
      SELECT org_id, COUNT(*)::integer AS contacted_booked_count
      FROM contacted_and_booked
      GROUP BY org_id
    ) cb ON cb.org_id = t.org_id
    LEFT JOIN (
      SELECT org_id, COUNT(*)::integer AS booked_count
      FROM booked_leads
      GROUP BY org_id
    ) b ON b.org_id = t.org_id
    LEFT JOIN (
      SELECT org_id, COUNT(*)::integer AS booked_completed_count
      FROM booked_and_completed
      GROUP BY org_id
    ) bc ON bc.org_id = t.org_id
  ),
  timing_rollup AS (
    SELECT
      t.org_id,
      AVG(EXTRACT(EPOCH FROM (fc.first_contact_at - fa.first_assigned_at)) / 3600.0) AS avg_hours_to_first_contact,
      COUNT(fc.lead_id)::integer AS first_contact_samples,
      AVG(EXTRACT(EPOCH FROM (fb.first_booking_at - fa.first_assigned_at)) / 3600.0) AS avg_hours_to_booking,
      COUNT(fb.lead_id)::integer AS booking_samples
    FROM target_orgs t
    LEFT JOIN first_assigned_by_lead fa
      ON fa.org_id = t.org_id
    LEFT JOIN first_contact_after_assign fc
      ON fc.org_id = fa.org_id
     AND fc.lead_id = fa.lead_id
    LEFT JOIN first_booking_after_assign fb
      ON fb.org_id = fa.org_id
     AND fb.lead_id = fa.lead_id
    GROUP BY t.org_id
  ),
  org_rows AS (
    SELECT
      t.org_id,
      v_month_start AS month_start,
      v_month_end AS month_end,
      COALESCE(lr.leads_received, 0) AS leads_received,
      COALESCE(er.assignments, 0) AS assignments,
      COALESCE(er.unassigned, 0) AS unassigned,
      COALESCE(er.contact_attempts, 0) AS contact_attempts,
      COALESCE(er.bookings, 0) AS bookings,
      COALESCE(oc.completed, 0) AS completed,
      COALESCE(oc.lost, 0) AS lost,
      COALESCE(oc.expired, 0) AS expired,
      COALESCE(oc.booking_cancelled, 0) AS booking_cancelled,
      COALESCE(er.review_requests, 0) AS review_requests,
      COALESCE(cr.assigned_to_contacted_numerator, 0) AS assigned_to_contacted_numerator,
      COALESCE(cr.assigned_to_contacted_denominator, 0) AS assigned_to_contacted_denominator,
      COALESCE(cr.contacted_to_booked_numerator, 0) AS contacted_to_booked_numerator,
      COALESCE(cr.contacted_to_booked_denominator, 0) AS contacted_to_booked_denominator,
      COALESCE(cr.booked_to_completed_numerator, 0) AS booked_to_completed_numerator,
      COALESCE(cr.booked_to_completed_denominator, 0) AS booked_to_completed_denominator,
      tr.avg_hours_to_first_contact,
      tr.avg_hours_to_booking,
      COALESCE(tr.first_contact_samples, 0) AS first_contact_samples,
      COALESCE(tr.booking_samples, 0) AS booking_samples,
      COALESCE(sb.source_breakdown, '[]'::jsonb) AS source_breakdown
    FROM target_orgs t
    LEFT JOIN leads_received lr ON lr.org_id = t.org_id
    LEFT JOIN event_rollup er ON er.org_id = t.org_id
    LEFT JOIN outcome_rollup oc ON oc.org_id = t.org_id
    LEFT JOIN conversion_rollup cr ON cr.org_id = t.org_id
    LEFT JOIN timing_rollup tr ON tr.org_id = t.org_id
    LEFT JOIN source_breakdown sb ON sb.org_id = t.org_id
  ),
  upserted_org AS (
    INSERT INTO public.monthly_org_reports (
      org_id,
      month_start,
      month_end,
      leads_received,
      assignments,
      unassigned,
      contact_attempts,
      bookings,
      completed,
      lost,
      expired,
      booking_cancelled,
      review_requests,
      assigned_to_contacted_numerator,
      assigned_to_contacted_denominator,
      assigned_to_contacted_rate,
      contacted_to_booked_numerator,
      contacted_to_booked_denominator,
      contacted_to_booked_rate,
      booked_to_completed_numerator,
      booked_to_completed_denominator,
      booked_to_completed_rate,
      avg_hours_to_first_contact,
      avg_hours_to_booking,
      first_contact_samples,
      booking_samples,
      source_breakdown,
      snapshot_generated_at,
      updated_at
    )
    SELECT
      o.org_id,
      o.month_start,
      o.month_end,
      o.leads_received,
      o.assignments,
      o.unassigned,
      o.contact_attempts,
      o.bookings,
      o.completed,
      o.lost,
      o.expired,
      o.booking_cancelled,
      o.review_requests,
      o.assigned_to_contacted_numerator,
      o.assigned_to_contacted_denominator,
      CASE
        WHEN o.assigned_to_contacted_denominator > 0
          THEN o.assigned_to_contacted_numerator::numeric / o.assigned_to_contacted_denominator::numeric
        ELSE NULL
      END AS assigned_to_contacted_rate,
      o.contacted_to_booked_numerator,
      o.contacted_to_booked_denominator,
      CASE
        WHEN o.contacted_to_booked_denominator > 0
          THEN o.contacted_to_booked_numerator::numeric / o.contacted_to_booked_denominator::numeric
        ELSE NULL
      END AS contacted_to_booked_rate,
      o.booked_to_completed_numerator,
      o.booked_to_completed_denominator,
      CASE
        WHEN o.booked_to_completed_denominator > 0
          THEN o.booked_to_completed_numerator::numeric / o.booked_to_completed_denominator::numeric
        ELSE NULL
      END AS booked_to_completed_rate,
      o.avg_hours_to_first_contact,
      o.avg_hours_to_booking,
      o.first_contact_samples,
      o.booking_samples,
      o.source_breakdown,
      now(),
      now()
    FROM org_rows o
    ON CONFLICT (org_id, month_start) DO UPDATE
      SET month_end = EXCLUDED.month_end,
          leads_received = EXCLUDED.leads_received,
          assignments = EXCLUDED.assignments,
          unassigned = EXCLUDED.unassigned,
          contact_attempts = EXCLUDED.contact_attempts,
          bookings = EXCLUDED.bookings,
          completed = EXCLUDED.completed,
          lost = EXCLUDED.lost,
          expired = EXCLUDED.expired,
          booking_cancelled = EXCLUDED.booking_cancelled,
          review_requests = EXCLUDED.review_requests,
          assigned_to_contacted_numerator = EXCLUDED.assigned_to_contacted_numerator,
          assigned_to_contacted_denominator = EXCLUDED.assigned_to_contacted_denominator,
          assigned_to_contacted_rate = EXCLUDED.assigned_to_contacted_rate,
          contacted_to_booked_numerator = EXCLUDED.contacted_to_booked_numerator,
          contacted_to_booked_denominator = EXCLUDED.contacted_to_booked_denominator,
          contacted_to_booked_rate = EXCLUDED.contacted_to_booked_rate,
          booked_to_completed_numerator = EXCLUDED.booked_to_completed_numerator,
          booked_to_completed_denominator = EXCLUDED.booked_to_completed_denominator,
          booked_to_completed_rate = EXCLUDED.booked_to_completed_rate,
          avg_hours_to_first_contact = EXCLUDED.avg_hours_to_first_contact,
          avg_hours_to_booking = EXCLUDED.avg_hours_to_booking,
          first_contact_samples = EXCLUDED.first_contact_samples,
          booking_samples = EXCLUDED.booking_samples,
          source_breakdown = EXCLUDED.source_breakdown,
          snapshot_generated_at = EXCLUDED.snapshot_generated_at,
          updated_at = now()
    RETURNING 1
  )
  SELECT COUNT(*)::integer, 0::integer
  INTO org_rows_upserted, agent_rows_upserted
  FROM upserted_org;

  WITH target_orgs AS (
    SELECT p_org_id AS org_id
    WHERE p_org_id IS NOT NULL
    UNION
    SELECT DISTINCT l.org_id
    FROM public.leads l
    WHERE p_org_id IS NULL
      AND l.org_id IS NOT NULL
      AND l.created_at >= v_month_start_ts
      AND l.created_at < v_month_end_ts
    UNION
    SELECT DISTINCT e.org_id
    FROM public.lead_events e
    WHERE p_org_id IS NULL
      AND e.org_id IS NOT NULL
      AND e.created_at >= v_month_start_ts
      AND e.created_at < v_month_end_ts
  ),
  events_in_month AS (
    SELECT
      e.org_id,
      e.lead_id,
      e.event_type,
      e.created_at,
      COALESCE(e.actor_id, e.created_by) AS actor_id_effective,
      CASE
        WHEN e.event_type IN ('completed', 'lost', 'expired', 'booking_cancelled') THEN e.event_type
        WHEN e.event_type = 'status_change'
          AND e.payload ? 'to_status'
          AND (e.payload->>'to_status') IN ('completed', 'lost', 'expired', 'booking_cancelled')
          THEN e.payload->>'to_status'
        ELSE NULL
      END AS outcome_type,
      CASE
        WHEN e.event_type = 'assigned'
             AND e.payload ? 'assigned_to'
             AND (e.payload->>'assigned_to') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          THEN (e.payload->>'assigned_to')::uuid
        ELSE NULL
      END AS payload_assigned_to
    FROM public.lead_events e
    JOIN target_orgs t ON t.org_id = e.org_id
    WHERE e.created_at >= v_month_start_ts
      AND e.created_at < v_month_end_ts
  ),
  assignment_counts AS (
    SELECT
      e.org_id,
      COALESCE(e.payload_assigned_to, e.actor_id_effective) AS agent_id,
      COUNT(*)::integer AS assignments
    FROM events_in_month e
    WHERE e.event_type = 'assigned'
      AND COALESCE(e.payload_assigned_to, e.actor_id_effective) IS NOT NULL
    GROUP BY e.org_id, COALESCE(e.payload_assigned_to, e.actor_id_effective)
  ),
  activity_counts AS (
    SELECT
      e.org_id,
      e.actor_id_effective AS agent_id,
      COUNT(*) FILTER (WHERE e.event_type = 'unassigned')::integer AS unassigned,
      COUNT(*) FILTER (WHERE e.event_type IN ('call_attempted', 'sms_attempted', 'contact_attempted'))::integer AS contact_attempts,
      COUNT(*) FILTER (WHERE e.event_type = 'booked')::integer AS bookings,
      COUNT(*) FILTER (WHERE e.event_type = 'review_request')::integer AS review_requests
    FROM events_in_month e
    WHERE e.actor_id_effective IS NOT NULL
    GROUP BY e.org_id, e.actor_id_effective
  ),
  distinct_actor_outcomes AS (
    SELECT DISTINCT
      e.org_id,
      e.actor_id_effective AS agent_id,
      e.lead_id,
      e.outcome_type
    FROM events_in_month e
    WHERE e.actor_id_effective IS NOT NULL
      AND e.outcome_type IS NOT NULL
  ),
  outcome_counts AS (
    SELECT
      o.org_id,
      o.agent_id,
      COUNT(*) FILTER (WHERE o.outcome_type = 'completed')::integer AS completed,
      COUNT(*) FILTER (WHERE o.outcome_type = 'lost')::integer AS lost,
      COUNT(*) FILTER (WHERE o.outcome_type = 'expired')::integer AS expired,
      COUNT(*) FILTER (WHERE o.outcome_type = 'booking_cancelled')::integer AS booking_cancelled
    FROM distinct_actor_outcomes o
    GROUP BY o.org_id, o.agent_id
  ),
  profile_agents AS (
    SELECT
      p.org_id,
      p.id AS agent_id
    FROM public.profiles p
    JOIN target_orgs t ON t.org_id = p.org_id
    WHERE p.role IN ('manager', 'employee', 'platform_admin')
  ),
  agent_keys AS (
    SELECT org_id, agent_id FROM profile_agents
    UNION
    SELECT org_id, agent_id FROM assignment_counts
    UNION
    SELECT org_id, agent_id FROM activity_counts
    UNION
    SELECT org_id, agent_id FROM outcome_counts
  ),
  agent_rows AS (
    SELECT
      k.org_id,
      k.agent_id,
      v_month_start AS month_start,
      v_month_end AS month_end,
      p.full_name AS agent_name,
      p.role AS agent_role,
      COALESCE(a.assignments, 0) AS assignments,
      COALESCE(ac.unassigned, 0) AS unassigned,
      COALESCE(ac.contact_attempts, 0) AS contact_attempts,
      COALESCE(ac.bookings, 0) AS bookings,
      COALESCE(oc.completed, 0) AS completed,
      COALESCE(oc.lost, 0) AS lost,
      COALESCE(oc.expired, 0) AS expired,
      COALESCE(oc.booking_cancelled, 0) AS booking_cancelled,
      COALESCE(ac.review_requests, 0) AS review_requests
    FROM agent_keys k
    LEFT JOIN public.profiles p
      ON p.id = k.agent_id
     AND p.org_id = k.org_id
    LEFT JOIN assignment_counts a
      ON a.org_id = k.org_id
     AND a.agent_id = k.agent_id
    LEFT JOIN activity_counts ac
      ON ac.org_id = k.org_id
     AND ac.agent_id = k.agent_id
    LEFT JOIN outcome_counts oc
      ON oc.org_id = k.org_id
     AND oc.agent_id = k.agent_id
  ),
  upserted_agent AS (
    INSERT INTO public.monthly_agent_reports (
      org_id,
      agent_id,
      month_start,
      month_end,
      agent_name,
      agent_role,
      assignments,
      unassigned,
      contact_attempts,
      bookings,
      completed,
      lost,
      expired,
      booking_cancelled,
      review_requests,
      snapshot_generated_at,
      updated_at
    )
    SELECT
      a.org_id,
      a.agent_id,
      a.month_start,
      a.month_end,
      a.agent_name,
      a.agent_role,
      a.assignments,
      a.unassigned,
      a.contact_attempts,
      a.bookings,
      a.completed,
      a.lost,
      a.expired,
      a.booking_cancelled,
      a.review_requests,
      now(),
      now()
    FROM agent_rows a
    ON CONFLICT (org_id, agent_id, month_start) DO UPDATE
      SET month_end = EXCLUDED.month_end,
          agent_name = EXCLUDED.agent_name,
          agent_role = EXCLUDED.agent_role,
          assignments = EXCLUDED.assignments,
          unassigned = EXCLUDED.unassigned,
          contact_attempts = EXCLUDED.contact_attempts,
          bookings = EXCLUDED.bookings,
          completed = EXCLUDED.completed,
          lost = EXCLUDED.lost,
          expired = EXCLUDED.expired,
          booking_cancelled = EXCLUDED.booking_cancelled,
          review_requests = EXCLUDED.review_requests,
          snapshot_generated_at = EXCLUDED.snapshot_generated_at,
          updated_at = now()
    RETURNING 1
  )
  SELECT org_rows_upserted, COUNT(*)::integer
  INTO org_rows_upserted, agent_rows_upserted
  FROM upserted_agent;

  RETURN QUERY SELECT org_rows_upserted, agent_rows_upserted;
END;
$$;

CREATE OR REPLACE FUNCTION public.hide_monthly_closed_leads(
  p_hidden_at timestamptz DEFAULT now(),
  p_org_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer := 0;
BEGIN
  UPDATE public.leads l
  SET hidden_from_kanban_at = p_hidden_at
  WHERE l.hidden_from_kanban_at IS NULL
    AND l.status IN ('lost', 'completed')
    AND (p_org_id IS NULL OR l.org_id = p_org_id);

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.run_monthly_reporting_maintenance(
  p_run_at timestamptz DEFAULT now(),
  p_org_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_previous_month_start date;
  v_snapshot record;
  v_hidden_count integer;
BEGIN
  v_previous_month_start := (date_trunc('month', timezone('utc', p_run_at)) - INTERVAL '1 month')::date;

  SELECT *
  INTO v_snapshot
  FROM public.snapshot_monthly_reporting(v_previous_month_start, p_org_id);

  v_hidden_count := public.hide_monthly_closed_leads(p_run_at, p_org_id);

  RETURN jsonb_build_object(
    'run_at', p_run_at,
    'month_start', v_previous_month_start,
    'org_rows_upserted', COALESCE(v_snapshot.org_rows_upserted, 0),
    'agent_rows_upserted', COALESCE(v_snapshot.agent_rows_upserted, 0),
    'hidden_leads', COALESCE(v_hidden_count, 0)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_monthly_reporting_schedule()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id bigint;
BEGIN
  IF to_regnamespace('cron') IS NULL THEN
    RETURN 'pg_cron unavailable; keep using public.run_monthly_reporting_maintenance() manually or external scheduler';
  END IF;

  BEGIN
    FOR v_job_id IN
      SELECT jobid
      FROM cron.job
      WHERE jobname = 'monthly_reporting_maintenance'
         OR command ILIKE '%public.run_monthly_reporting_maintenance()%'
    LOOP
      PERFORM cron.unschedule(v_job_id);
    END LOOP;
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  BEGIN
    PERFORM cron.schedule(
      'monthly_reporting_maintenance',
      '5 0 1 * *',
      'SELECT public.run_monthly_reporting_maintenance();'
    );
  EXCEPTION
    WHEN undefined_function THEN
      PERFORM cron.schedule(
        '5 0 1 * *',
        'SELECT public.run_monthly_reporting_maintenance();'
      );
  END;

  RETURN 'scheduled monthly_reporting_maintenance (00:05 UTC on day 1)';
EXCEPTION
  WHEN OTHERS THEN
    RETURN FORMAT('schedule not applied: %s', SQLERRM);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.snapshot_monthly_reporting(date, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.hide_monthly_closed_leads(timestamptz, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_monthly_reporting_maintenance(timestamptz, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.ensure_monthly_reporting_schedule() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.snapshot_monthly_reporting(date, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.hide_monthly_closed_leads(timestamptz, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.run_monthly_reporting_maintenance(timestamptz, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_monthly_reporting_schedule() TO service_role;

DO $$
DECLARE
  v_schedule_result text;
BEGIN
  v_schedule_result := public.ensure_monthly_reporting_schedule();
  RAISE NOTICE 'monthly reporting scheduler hook: %', v_schedule_result;
END;
$$;

-- Manual entrypoints:
--   SELECT * FROM public.snapshot_monthly_reporting('2026-06-01'::date, NULL);
--   SELECT public.hide_monthly_closed_leads(now(), NULL);
--   SELECT public.run_monthly_reporting_maintenance(now(), NULL);
