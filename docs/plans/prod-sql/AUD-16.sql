-- AUD-16: rate limiter / cron auth hardening.
-- The REVOKE/GRANT below already exist as a committed migration
-- (supabase/migrations/20260916130000_lock_counter_rpcs.sql, dated BEFORE this
-- audit's baseline) — this file just lets you verify + re-apply it against prod
-- specifically, since AUD-16 depends on it and it isn't otherwise called out in
-- the AUD-1..AUD-8 handoff's apply list. Idempotent; safe to re-run even if
-- already live.

-- ============================================================
-- READ-ONLY VERIFY (run first)
-- ============================================================
SELECT
  p.proname,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS args,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('increment_rate_limit', 'increment_ai_usage');
-- expect (after applying): anon_can_execute = false, authenticated_can_execute = false, for both rows

-- ============================================================
-- MIGRATION (idempotent)
-- ============================================================

REVOKE EXECUTE ON FUNCTION public.increment_rate_limit(text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_rate_limit(text, timestamptz) TO service_role;

REVOKE EXECUTE ON FUNCTION public.increment_ai_usage(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_ai_usage(uuid, text, integer) TO service_role;
