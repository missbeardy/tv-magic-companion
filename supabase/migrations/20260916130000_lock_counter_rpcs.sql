-- increment_rate_limit / increment_ai_usage were executable by anon + authenticated
-- via PostgREST default grants. A visitor could lock a quote page or inflate an
-- org's AI ceiling. Mirror expire_overdue_leads: service_role only.

REVOKE EXECUTE ON FUNCTION public.increment_rate_limit(text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_rate_limit(text, timestamptz) TO service_role;

REVOKE EXECUTE ON FUNCTION public.increment_ai_usage(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_ai_usage(uuid, text, integer) TO service_role;
