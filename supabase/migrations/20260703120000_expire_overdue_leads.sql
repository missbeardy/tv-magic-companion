-- Assign-timer expiry: flip overdue assigned leads back to the pool and audit each expiry.

CREATE OR REPLACE FUNCTION public.expire_overdue_leads()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  WITH candidates AS (
    SELECT
      l.id,
      l.org_id,
      l.name,
      l.assigned_to,
      p.full_name AS assignee_name
    FROM public.leads l
    LEFT JOIN public.profiles p ON p.id = l.assigned_to
    WHERE l.status = 'assigned'
      AND l.timer_expires_at IS NOT NULL
      AND l.timer_expires_at < now()
  ),
  updated AS (
    UPDATE public.leads l
    SET
      status = 'unassigned',
      assigned_to = NULL,
      assigned_at = NULL,
      timer_expires_at = NULL,
      contact_attempt_round = 0,
      last_contact_attempted_at = NULL,
      lost_reason = NULL
    FROM candidates c
    WHERE l.id = c.id
    RETURNING l.id
  )
  INSERT INTO public.lead_events (lead_id, org_id, event_type, note, payload, actor_id)
  SELECT
    c.id,
    c.org_id,
    'expired',
    format(
      '%s — assign timer expired%s',
      c.name,
      CASE
        WHEN c.assignee_name IS NOT NULL THEN format(' (assigned to %s)', c.assignee_name)
        ELSE ''
      END
    ),
    jsonb_build_object(
      'from_status', 'assigned',
      'to_status', 'unassigned',
      'source', 'assign_timer',
      'lead_name', c.name,
      'previous_assignee_id', c.assigned_to,
      'previous_assignee_name', c.assignee_name
    ),
    c.assigned_to
  FROM candidates c
  WHERE c.id IN (SELECT id FROM updated);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_overdue_leads() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_overdue_leads() TO service_role;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  IF to_regnamespace('cron') IS NULL THEN
    RAISE NOTICE 'pg_cron unavailable; call SELECT public.expire_overdue_leads() manually or via external scheduler';
    RETURN;
  END IF;

  BEGIN
    FOR v_job_id IN
      SELECT jobid
      FROM cron.job
      WHERE jobname = 'expire-overdue-leads'
         OR command ILIKE '%public.expire_overdue_leads()%'
    LOOP
      PERFORM cron.unschedule(v_job_id);
    END LOOP;
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  BEGIN
    PERFORM cron.schedule(
      'expire-overdue-leads',
      '* * * * *',
      'SELECT public.expire_overdue_leads();'
    );
  EXCEPTION
    WHEN OTHERS THEN
      RAISE NOTICE 'expire-overdue-leads schedule not applied: %', SQLERRM;
  END;
END;
$$;

-- Manual entrypoint:
--   SELECT public.expire_overdue_leads();
