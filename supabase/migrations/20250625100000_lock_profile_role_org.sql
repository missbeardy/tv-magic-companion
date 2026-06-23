-- SECURITY FIX 1 (critical): prevent privilege escalation via profile self-edit.
--
-- The existing `profiles_update_self` RLS policy only checks WHO is editing
-- (id = auth.uid()) but not WHICH columns change. A normal authenticated user
-- could therefore set their own `role` to 'platform_admin' or change `org_id`
-- to another franchise — collapsing tenant isolation.
--
-- This trigger blocks changes to `role` and `org_id` when the caller is a normal
-- end user (Postgres role `authenticated` or `anon`). The service-role key
-- (server / api routes), `postgres`, and Supabase admin roles are unaffected,
-- so create-user.ts, brand transfer, and Platform Admin tier changes keep working.
--
-- Additive migration — does not modify or delete existing migrations.

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only restrict end-user roles. Service role / postgres / dashboard bypass.
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Not allowed to change your own role'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN
      RAISE EXCEPTION 'Not allowed to change your own organisation'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;

CREATE TRIGGER trg_prevent_profile_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- Verify (run as a normal user — should error):
--   UPDATE public.profiles SET role = 'platform_admin' WHERE id = auth.uid();
