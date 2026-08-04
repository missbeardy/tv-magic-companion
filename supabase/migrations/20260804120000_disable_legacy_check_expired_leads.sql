-- Kill leftover assign-timer auto-unassign.
-- 20260720221206 no-op'd expire_overdue_leads, but prod still ran the older
-- check_expired_leads() cron (jobname expire-leads) every minute, returning
-- assigned leads to the pool with no lead_events audit row.

CREATE OR REPLACE FUNCTION public.check_expired_leads()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Intentionally empty: assigned leads stay with the technician.
  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_expired_leads() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_expired_leads() TO service_role;

-- Stop "expires soon" warnings — timer no longer returns leads to the pool.
CREATE OR REPLACE FUNCTION public.notify_low_timer_leads()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_low_timer_leads() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_low_timer_leads() TO service_role;

-- Keep expire_overdue_leads as a no-op (idempotent with prior migration).
CREATE OR REPLACE FUNCTION public.expire_overdue_leads()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN;
END;
$$;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  IF to_regnamespace('cron') IS NULL THEN
    RAISE NOTICE 'pg_cron unavailable; expiry functions already no-op';
    RETURN;
  END IF;

  BEGIN
    FOR v_job_id IN
      SELECT jobid
      FROM cron.job
      WHERE jobname IN (
          'expire-leads',
          'expire-overdue-leads',
          'notify-low-timer-leads'
        )
         OR command ILIKE '%check_expired_leads%'
         OR command ILIKE '%expire_overdue_leads%'
         OR command ILIKE '%notify_low_timer_leads%'
    LOOP
      PERFORM cron.unschedule(v_job_id);
    END LOOP;
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;
END;
$$;
