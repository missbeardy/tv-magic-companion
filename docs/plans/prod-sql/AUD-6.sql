-- AUD-6: extend the profile lock trigger.
-- Copy of supabase/migrations/20260922120000_extend_profile_lock_trigger.sql.

-- ============================================================
-- READ-ONLY VERIFY (run first)
-- ============================================================

-- Confirm which of the six new columns actually exist on prod's profiles
-- table today. Every column NOT listed here needs the to_jsonb() defensive
-- pattern instead of a plain NEW.col/OLD.col reference, or the trigger will
-- throw on every authenticated profile update. As of 22-09-2026, only
-- `email` was missing — the migration below already accounts for that.
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles'
  AND column_name IN (
    'departed_at', 'excluded_service_keywords', 'is_hidden_test_profile',
    'test_profile_owner_id', 'manager_id', 'email'
  )
ORDER BY column_name;

-- Confirm the existing trigger is the one this migration replaces:
SELECT tgname, proname
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE t.tgrelid = 'public.profiles'::regclass
  AND t.tgname = 'trg_prevent_profile_privilege_escalation';

-- ============================================================
-- MIGRATION (idempotent: CREATE OR REPLACE FUNCTION only, trigger already bound)
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Not allowed to change your own role'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN
      RAISE EXCEPTION 'Not allowed to change your own organisation'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.departed_at IS DISTINCT FROM OLD.departed_at THEN
      RAISE EXCEPTION 'Not allowed to change departed_at'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.excluded_service_keywords IS DISTINCT FROM OLD.excluded_service_keywords THEN
      RAISE EXCEPTION 'Not allowed to change excluded_service_keywords'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.is_hidden_test_profile IS DISTINCT FROM OLD.is_hidden_test_profile THEN
      RAISE EXCEPTION 'Not allowed to change is_hidden_test_profile'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.test_profile_owner_id IS DISTINCT FROM OLD.test_profile_owner_id THEN
      RAISE EXCEPTION 'Not allowed to change test_profile_owner_id'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.manager_id IS DISTINCT FROM OLD.manager_id THEN
      RAISE EXCEPTION 'Not allowed to change manager_id'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF (to_jsonb(NEW) ->> 'email') IS DISTINCT FROM (to_jsonb(OLD) ->> 'email') THEN
      RAISE EXCEPTION 'Not allowed to change email'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
