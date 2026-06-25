-- Phase 3 monthly reporting: backfill + parity verification helper.
-- Run in Supabase SQL Editor (or psql) after migration:
--   supabase/migrations/20250630120000_phase3_monthly_reporting_snapshots.sql
--
-- This script is intentionally non-destructive:
-- - snapshot_monthly_reporting() is idempotent (upsert)
-- - hide_monthly_closed_leads() only sets hidden_from_kanban_at when NULL

-- -----------------------------------------------------------------------------
-- 1) Backfill the last 6 closed months (adjust interval as needed)
-- -----------------------------------------------------------------------------
WITH target_months AS (
  SELECT generate_series(
    (date_trunc('month', timezone('utc', now())) - INTERVAL '6 month')::date,
    (date_trunc('month', timezone('utc', now())) - INTERVAL '1 month')::date,
    INTERVAL '1 month'
  )::date AS month_start
)
SELECT
  m.month_start,
  s.org_rows_upserted,
  s.agent_rows_upserted
FROM target_months m
CROSS JOIN LATERAL public.snapshot_monthly_reporting(m.month_start, NULL) s
ORDER BY m.month_start;

-- Optional: backfill a single org for one month
-- SELECT * FROM public.snapshot_monthly_reporting('2026-06-01'::date, '<ORG_UUID>'::uuid);

-- -----------------------------------------------------------------------------
-- 2) Apply monthly kanban cleanup once (all orgs)
-- -----------------------------------------------------------------------------
SELECT public.hide_monthly_closed_leads(now(), NULL) AS hidden_rows;

-- -----------------------------------------------------------------------------
-- 3) Parity checks: snapshot totals vs live source data
-- -----------------------------------------------------------------------------

-- 3a) Leads received parity (monthly_org_reports.leads_received vs leads created)
WITH live AS (
  SELECT
    l.org_id,
    date_trunc('month', timezone('utc', l.created_at))::date AS month_start,
    COUNT(*)::integer AS leads_received_live
  FROM public.leads l
  GROUP BY 1, 2
)
SELECT
  r.org_id,
  r.month_start,
  r.leads_received AS leads_received_snapshot,
  COALESCE(l.leads_received_live, 0) AS leads_received_live,
  r.leads_received - COALESCE(l.leads_received_live, 0) AS delta
FROM public.monthly_org_reports r
LEFT JOIN live l
  ON l.org_id = r.org_id
 AND l.month_start = r.month_start
ORDER BY r.month_start DESC, r.org_id;

-- 3b) Key event parity (assignments, bookings, review_requests)
WITH live AS (
  SELECT
    e.org_id,
    date_trunc('month', timezone('utc', e.created_at))::date AS month_start,
    COUNT(*) FILTER (WHERE e.event_type = 'assigned')::integer AS assignments_live,
    COUNT(*) FILTER (WHERE e.event_type = 'booked')::integer AS bookings_live,
    COUNT(*) FILTER (WHERE e.event_type = 'review_request')::integer AS review_requests_live
  FROM public.lead_events e
  GROUP BY 1, 2
)
SELECT
  r.org_id,
  r.month_start,
  r.assignments,
  COALESCE(l.assignments_live, 0) AS assignments_live,
  r.bookings,
  COALESCE(l.bookings_live, 0) AS bookings_live,
  r.review_requests,
  COALESCE(l.review_requests_live, 0) AS review_requests_live
FROM public.monthly_org_reports r
LEFT JOIN live l
  ON l.org_id = r.org_id
 AND l.month_start = r.month_start
ORDER BY r.month_start DESC, r.org_id;

-- 3c) Hidden lead status sanity check (must only be lost/completed)
SELECT
  l.status,
  COUNT(*)::integer AS hidden_count
FROM public.leads l
WHERE l.hidden_from_kanban_at IS NOT NULL
GROUP BY l.status
ORDER BY hidden_count DESC, l.status;

SELECT
  l.id,
  l.org_id,
  l.status,
  l.hidden_from_kanban_at
FROM public.leads l
WHERE l.hidden_from_kanban_at IS NOT NULL
  AND l.status NOT IN ('lost', 'completed')
ORDER BY l.hidden_from_kanban_at DESC
LIMIT 50;

-- 3d) Snapshot coverage check for each org/month where there were leads/events
WITH activity_months AS (
  SELECT DISTINCT
    x.org_id,
    x.month_start
  FROM (
    SELECT
      l.org_id,
      date_trunc('month', timezone('utc', l.created_at))::date AS month_start
    FROM public.leads l
    UNION
    SELECT
      e.org_id,
      date_trunc('month', timezone('utc', e.created_at))::date AS month_start
    FROM public.lead_events e
  ) x
)
SELECT
  a.org_id,
  a.month_start
FROM activity_months a
LEFT JOIN public.monthly_org_reports r
  ON r.org_id = a.org_id
 AND r.month_start = a.month_start
WHERE r.id IS NULL
ORDER BY a.month_start DESC, a.org_id;

-- App-side defensive behavior note:
-- fetchReportingData() now falls back to live aggregation for closed months when
-- snapshot tables/rows are missing, so reporting and manager brief remain usable
-- during rollout/backfill windows.
