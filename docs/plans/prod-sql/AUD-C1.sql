-- AUD-C1: make the column-guard triggers actually enforce. APPLY FIRST — this
-- closes a live privilege escalation (any signed-in user can set their own
-- profiles.role = 'platform_admin' today).
-- Copy of supabase/migrations/20260922130000_trigger_guards_security_invoker.sql.
-- Independent of the release branch: safe to run before the app is deployed.

-- ============================================================
-- READ-ONLY VERIFY (run first) — expect prosecdef = true for all four today
-- ============================================================
SELECT proname, prosecdef
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('prevent_profile_privilege_escalation', 'prevent_org_privileged_column_change',
                  'prevent_client_lead_soft_delete', 'prevent_client_lead_extraction_status')
ORDER BY proname;

-- Who is platform_admin right now (confirm every row is expected before and after):
SELECT p.id, p.full_name, p.role, o.slug
FROM public.profiles p LEFT JOIN public.orgs o ON o.id = p.org_id
WHERE p.role = 'platform_admin';

-- ============================================================
-- MIGRATION (idempotent: ALTER FUNCTION … SECURITY INVOKER; bodies unchanged)
-- ============================================================
ALTER FUNCTION public.prevent_profile_privilege_escalation() SECURITY INVOKER;
ALTER FUNCTION public.prevent_org_privileged_column_change() SECURITY INVOKER;
ALTER FUNCTION public.prevent_client_lead_soft_delete() SECURITY INVOKER;
ALTER FUNCTION public.prevent_client_lead_extraction_status() SECURITY INVOKER;

-- ============================================================
-- AFTER: re-run the first query — expect prosecdef = false for all four.
-- Then, signed in to the app as the Demo Employee, in the browser console:
--   await supabase.from('profiles').update({ role: 'platform_admin' }).eq('id', (await supabase.auth.getUser()).data.user.id)
-- expect error code 42501 "Not allowed to change your own role".
-- ============================================================
