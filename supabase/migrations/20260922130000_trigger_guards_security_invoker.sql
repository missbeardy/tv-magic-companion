-- Make the four column-guard trigger functions actually enforce.
--
-- Every one of them gates on `current_user IN ('authenticated', 'anon')`, but was
-- declared SECURITY DEFINER. Inside a security-definer function `current_user` is
-- the function OWNER (postgres), never the caller — so the gate was always false
-- and none of these guards has ever blocked anything, in any environment:
--
--   prevent_profile_privilege_escalation   (20250625100000, extended 20260922120000)
--     → any signed-in user could set their own profiles.role = 'platform_admin'
--   prevent_org_privileged_column_change   (20260922090000)
--   prevent_client_lead_soft_delete        (20260713150000)
--   prevent_client_lead_extraction_status  (20260713170000)
--
-- Confirmed by reproducing the exact function bodies in a local Postgres: as
-- SECURITY DEFINER an `authenticated` caller's role change goes through; as
-- SECURITY INVOKER it raises 42501, while service_role, postgres, platform admins
-- (via is_platform_admin(), itself SECURITY DEFINER) and no-op writes such as
-- OrgSettingsPage's brand_id = brand_id reset are all still allowed.
--
-- The bodies only read NEW/OLD and call is_platform_admin(), so they need no
-- elevated privileges. Trigger functions are not EXECUTE-checked at fire time.
-- ALTER FUNCTION keeps each body exactly as it is on the database today.

ALTER FUNCTION public.prevent_profile_privilege_escalation() SECURITY INVOKER;
ALTER FUNCTION public.prevent_org_privileged_column_change() SECURITY INVOKER;
ALTER FUNCTION public.prevent_client_lead_soft_delete() SECURITY INVOKER;
ALTER FUNCTION public.prevent_client_lead_extraction_status() SECURITY INVOKER;

-- Verify: expect prosecdef = false for all four.
--   SELECT proname, prosecdef FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace
--     AND proname IN ('prevent_profile_privilege_escalation', 'prevent_org_privileged_column_change',
--                     'prevent_client_lead_soft_delete', 'prevent_client_lead_extraction_status');
-- Then, signed in as a normal employee (PostgREST, their own JWT), expect 42501:
--   PATCH /rest/v1/profiles?id=eq.<their id>  {"role":"platform_admin"}
