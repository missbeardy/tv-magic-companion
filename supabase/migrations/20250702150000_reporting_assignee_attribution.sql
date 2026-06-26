-- Agent monthly reports: credit funnel activity to the lead assignee for the month
-- (mirrors src/lib/reporting/aggregateReports.ts monthAssigneeByLead logic)

CREATE OR REPLACE FUNCTION public.upsert_monthly_agent_reports(
  p_month_start date,
  p_org_id uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month_end date := (p_month_start + INTERVAL '1 month')::date;
  v_month_start_ts timestamptz := p_month_start::timestamp AT TIME ZONE 'UTC';
  v_month_end_ts timestamptz := v_month_end::timestamp AT TIME ZONE 'UTC';
  v_rows integer := 0;
BEGIN
  IF p_month_start IS NULL THEN
    RAISE EXCEPTION 'p_month_start is required';
  END IF;

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
        WHEN e.event_type = 'status_change'
          AND e.payload->>'to_status' = 'contact_attempted'
          THEN 'contact'
        WHEN e.event_type = 'status_change'
          AND e.payload->>'to_status' = 'booked'
          THEN 'booked'
        ELSE NULL
      END AS activity_or_outcome,
      CASE
        WHEN e.event_type IN ('call_attempted', 'sms_attempted', 'contact_attempted') THEN true
        WHEN e.event_type = 'status_change' AND e.payload->>'to_status' = 'contact_attempted' THEN true
        ELSE false
      END AS is_contact,
      CASE
        WHEN e.event_type = 'booked' THEN true
        WHEN e.event_type = 'status_change' AND e.payload->>'to_status' = 'booked' THEN true
        ELSE false
      END AS is_booking,
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
  assignment_events AS (
    SELECT
      org_id,
      lead_id,
      created_at,
      COALESCE(payload_assigned_to, actor_id_effective) AS assignee_id
    FROM events_in_month
    WHERE event_type = 'assigned'
      AND COALESCE(payload_assigned_to, actor_id_effective) IS NOT NULL
  ),
  unassign_events AS (
    SELECT org_id, lead_id, created_at
    FROM events_in_month
    WHERE event_type = 'unassigned'
  ),
  events_with_credit AS (
    SELECT
      e.*,
      COALESCE(
        (
          SELECT a.assignee_id
          FROM assignment_events a
          WHERE a.org_id = e.org_id
            AND a.lead_id = e.lead_id
            AND a.created_at <= e.created_at
            AND NOT EXISTS (
              SELECT 1
              FROM unassign_events u
              WHERE u.org_id = e.org_id
                AND u.lead_id = e.lead_id
                AND u.created_at > a.created_at
                AND u.created_at <= e.created_at
            )
          ORDER BY a.created_at DESC
          LIMIT 1
        ),
        e.actor_id_effective
      ) AS credit_agent_id
    FROM events_in_month e
  ),
  assignment_counts AS (
    SELECT
      e.org_id,
      COALESCE(e.payload_assigned_to, e.actor_id_effective) AS agent_id,
      COUNT(*)::integer AS assignments
    FROM events_with_credit e
    WHERE e.event_type = 'assigned'
      AND COALESCE(e.payload_assigned_to, e.actor_id_effective) IS NOT NULL
    GROUP BY e.org_id, COALESCE(e.payload_assigned_to, e.actor_id_effective)
  ),
  activity_counts AS (
    SELECT
      e.org_id,
      e.credit_agent_id AS agent_id,
      COUNT(*) FILTER (WHERE e.event_type = 'unassigned')::integer AS unassigned,
      COUNT(*) FILTER (WHERE e.is_contact)::integer AS contact_attempts,
      COUNT(*) FILTER (WHERE e.is_booking)::integer AS bookings,
      COUNT(*) FILTER (WHERE e.event_type = 'review_request')::integer AS review_requests
    FROM events_with_credit e
    WHERE e.credit_agent_id IS NOT NULL
      AND (
        e.event_type = 'unassigned'
        OR e.is_contact
        OR e.is_booking
        OR e.event_type = 'review_request'
      )
    GROUP BY e.org_id, e.credit_agent_id
  ),
  distinct_credit_outcomes AS (
    SELECT DISTINCT
      e.org_id,
      e.credit_agent_id AS agent_id,
      e.lead_id,
      e.activity_or_outcome AS outcome_type
    FROM events_with_credit e
    WHERE e.credit_agent_id IS NOT NULL
      AND e.activity_or_outcome IN ('completed', 'lost', 'expired', 'booking_cancelled')
  ),
  outcome_counts AS (
    SELECT
      o.org_id,
      o.agent_id,
      COUNT(*) FILTER (WHERE o.outcome_type = 'completed')::integer AS completed,
      COUNT(*) FILTER (WHERE o.outcome_type = 'lost')::integer AS lost,
      COUNT(*) FILTER (WHERE o.outcome_type = 'expired')::integer AS expired,
      COUNT(*) FILTER (WHERE o.outcome_type = 'booking_cancelled')::integer AS booking_cancelled
    FROM distinct_credit_outcomes o
    GROUP BY o.org_id, o.agent_id
  ),
  profile_agents AS (
    SELECT p.org_id, p.id AS agent_id
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
      p_month_start AS month_start,
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
  upserted AS (
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
  SELECT COUNT(*)::integer INTO v_rows FROM upserted;

  RETURN COALESCE(v_rows, 0);
END;
$$;

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
  v_org_rows integer := 0;
  v_agent_rows integer := 0;
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
        WHEN e.event_type = 'status_change' AND e.payload->>'to_status' = 'contact_attempted' THEN true
        ELSE false
      END AS is_contact,
      CASE
        WHEN e.event_type = 'booked' THEN true
        WHEN e.event_type = 'status_change' AND e.payload->>'to_status' = 'booked' THEN true
        ELSE false
      END AS is_booking,
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
    SELECT e.org_id, e.lead_id, MIN(e.created_at) AS first_assigned_at
    FROM events_in_month e
    WHERE e.event_type = 'assigned'
    GROUP BY e.org_id, e.lead_id
  ),
  first_contact_after_assign AS (
    SELECT e.org_id, e.lead_id, MIN(e.created_at) AS first_contact_at
    FROM events_in_month e
    JOIN first_assigned_by_lead fa
      ON fa.org_id = e.org_id AND fa.lead_id = e.lead_id
    WHERE e.is_contact = true AND e.created_at >= fa.first_assigned_at
    GROUP BY e.org_id, e.lead_id
  ),
  first_booking_after_assign AS (
    SELECT e.org_id, e.lead_id, MIN(e.created_at) AS first_booking_at
    FROM events_in_month e
    JOIN first_assigned_by_lead fa
      ON fa.org_id = e.org_id AND fa.lead_id = e.lead_id
    WHERE e.is_booking
      AND e.created_at >= fa.first_assigned_at
    GROUP BY e.org_id, e.lead_id
  ),
  leads_received AS (
    SELECT l.org_id, COUNT(*)::integer AS leads_received
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
      SELECT l.org_id, l.normalized_source, COUNT(*)::integer AS source_count
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
      COUNT(*) FILTER (WHERE e.is_contact)::integer AS contact_attempts,
      COUNT(*) FILTER (WHERE e.is_booking)::integer AS bookings,
      COUNT(*) FILTER (WHERE e.event_type = 'review_request')::integer AS review_requests
    FROM events_in_month e
    GROUP BY e.org_id
  ),
  distinct_outcomes AS (
    SELECT DISTINCT e.org_id, e.lead_id, e.outcome_type
    FROM events_in_month e
    WHERE e.outcome_type IS NOT NULL
  ),
  outcome_rollup AS (
    SELECT
      o.org_id,
      COUNT(*) FILTER (WHERE o.outcome_type = 'completed')::integer AS completed,
      COUNT(*) FILTER (WHERE o.outcome_type = 'lost')::integer AS lost,
      COUNT(*) FILTER (WHERE o.outcome_type = 'expired')::integer AS expired,
      COUNT(*) FILTER (WHERE o.outcome_type = 'booking_cancelled')::integer AS booking_cancelled
    FROM distinct_outcomes o
    GROUP BY o.org_id
  ),
  assigned_leads AS (
    SELECT DISTINCT org_id, lead_id FROM events_in_month WHERE event_type = 'assigned'
  ),
  contacted_leads AS (
    SELECT DISTINCT e.org_id, e.lead_id
    FROM events_in_month e
    JOIN assigned_leads al ON al.org_id = e.org_id AND al.lead_id = e.lead_id
    WHERE e.is_contact
  ),
  booked_leads AS (
    SELECT DISTINCT e.org_id, e.lead_id
    FROM events_in_month e
    WHERE e.is_booking
  ),
  completed_leads AS (
    SELECT DISTINCT org_id, lead_id FROM distinct_outcomes WHERE outcome_type = 'completed'
  ),
  conversion_rollup AS (
    SELECT
      t.org_id,
      (SELECT COUNT(*)::integer FROM assigned_leads al JOIN contacted_leads cl
        ON cl.org_id = al.org_id AND cl.lead_id = al.lead_id WHERE al.org_id = t.org_id) AS assigned_to_contacted_numerator,
      (SELECT COUNT(*)::integer FROM assigned_leads al WHERE al.org_id = t.org_id) AS assigned_to_contacted_denominator,
      (SELECT COUNT(*)::integer FROM contacted_leads cl JOIN booked_leads bl
        ON bl.org_id = cl.org_id AND bl.lead_id = cl.lead_id WHERE cl.org_id = t.org_id) AS contacted_to_booked_numerator,
      (SELECT COUNT(*)::integer FROM contacted_leads cl WHERE cl.org_id = t.org_id) AS contacted_to_booked_denominator,
      (SELECT COUNT(*)::integer FROM booked_leads bl JOIN completed_leads cl
        ON cl.org_id = bl.org_id AND cl.lead_id = bl.lead_id WHERE bl.org_id = t.org_id) AS booked_to_completed_numerator,
      (SELECT COUNT(*)::integer FROM booked_leads bl WHERE bl.org_id = t.org_id) AS booked_to_completed_denominator
    FROM target_orgs t
  ),
  timing_rollup AS (
    SELECT
      t.org_id,
      AVG(EXTRACT(EPOCH FROM (fc.first_contact_at - fa.first_assigned_at)) / 3600.0) AS avg_hours_to_first_contact,
      COUNT(fc.lead_id)::integer AS first_contact_samples,
      AVG(EXTRACT(EPOCH FROM (fb.first_booking_at - fa.first_assigned_at)) / 3600.0) AS avg_hours_to_booking,
      COUNT(fb.lead_id)::integer AS booking_samples
    FROM target_orgs t
    LEFT JOIN first_assigned_by_lead fa ON fa.org_id = t.org_id
    LEFT JOIN first_contact_after_assign fc
      ON fc.org_id = fa.org_id AND fc.lead_id = fa.lead_id
    LEFT JOIN first_booking_after_assign fb
      ON fb.org_id = fa.org_id AND fb.lead_id = fa.lead_id
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
      org_id, month_start, month_end, leads_received, assignments, unassigned,
      contact_attempts, bookings, completed, lost, expired, booking_cancelled,
      review_requests, assigned_to_contacted_numerator, assigned_to_contacted_denominator,
      assigned_to_contacted_rate, contacted_to_booked_numerator, contacted_to_booked_denominator,
      contacted_to_booked_rate, booked_to_completed_numerator, booked_to_completed_denominator,
      booked_to_completed_rate, avg_hours_to_first_contact, avg_hours_to_booking,
      first_contact_samples, booking_samples, source_breakdown, snapshot_generated_at, updated_at
    )
    SELECT
      o.org_id, o.month_start, o.month_end, o.leads_received, o.assignments, o.unassigned,
      o.contact_attempts, o.bookings, o.completed, o.lost, o.expired, o.booking_cancelled,
      o.review_requests, o.assigned_to_contacted_numerator, o.assigned_to_contacted_denominator,
      CASE WHEN o.assigned_to_contacted_denominator > 0
        THEN o.assigned_to_contacted_numerator::numeric / o.assigned_to_contacted_denominator::numeric
        ELSE NULL END,
      o.contacted_to_booked_numerator, o.contacted_to_booked_denominator,
      CASE WHEN o.contacted_to_booked_denominator > 0
        THEN o.contacted_to_booked_numerator::numeric / o.contacted_to_booked_denominator::numeric
        ELSE NULL END,
      o.booked_to_completed_numerator, o.booked_to_completed_denominator,
      CASE WHEN o.booked_to_completed_denominator > 0
        THEN o.booked_to_completed_numerator::numeric / o.booked_to_completed_denominator::numeric
        ELSE NULL END,
      o.avg_hours_to_first_contact, o.avg_hours_to_booking,
      o.first_contact_samples, o.booking_samples, o.source_breakdown, now(), now()
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
  SELECT COUNT(*)::integer INTO v_org_rows FROM upserted_org;

  v_agent_rows := public.upsert_monthly_agent_reports(v_month_start, p_org_id);

  RETURN QUERY SELECT COALESCE(v_org_rows, 0), COALESCE(v_agent_rows, 0);
END;
$$;
