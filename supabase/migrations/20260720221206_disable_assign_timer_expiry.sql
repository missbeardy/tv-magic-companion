-- Disable assign-timer auto-unassign: assigned leads stay with the technician.
-- Pill UI now shows elapsed "time assigned" instead of a countdown to pool return.

CREATE OR REPLACE FUNCTION public.expire_overdue_leads()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Intentionally empty: clients keep assigned leads even after the old timer window.
  RETURN;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_overdue_leads() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_overdue_leads() TO service_role;

DO $$
DECLARE
  v_job_id bigint;
BEGIN
  IF to_regnamespace('cron') IS NULL THEN
    RAISE NOTICE 'pg_cron unavailable; expire_overdue_leads already a no-op';
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
END;
$$;
