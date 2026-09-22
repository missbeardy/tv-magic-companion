-- AUD-6: extend prevent_profile_privilege_escalation (20250625100000) to also
-- block departed_at, excluded_service_keywords, is_hidden_test_profile,
-- test_profile_owner_id, manager_id and email for authenticated/anon.
--
-- Confirmed against src/ before writing this: ProfilePage.tsx only writes
-- full_name/suburb/phone/avatar_url/location_enabled. is_hidden_test_profile
-- and departed_at are read-only on the client — OrgMembersPanel.tsx writes
-- them via /api/create-user?action=set-test-profile / set-departed (service
-- role). excluded_service_keywords is written via
-- /api/create-user?action=set-exclusions (service role), never a direct
-- client .update(). manager_id and email are never written client-side at
-- all (manager_id is select-only, e.g. cancelBooking.ts's cancellation
-- notification). test_profile_owner_id has no client write path either.
-- Same trigger, same bypass: service role / postgres / dashboard unaffected.
--
-- profiles.email does NOT exist on prod today (confirmed live via the
-- Management API 22-09-2026 — a pre-existing dev/prod drift, also noted in
-- supabase/PROD_DRIFT_2026-08-19.md). A plain `NEW.email` reference would
-- throw "record has no field email" on every single authenticated profile
-- update in prod the moment this trigger runs. The email check below goes
-- through to_jsonb() instead, which degrades to a harmless no-op when the
-- column is absent and starts protecting it automatically if the column is
-- ever added later — no further migration needed then.

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

    -- to_jsonb(...)->>'email', not NEW.email/OLD.email: safe whether or not
    -- the column exists on this environment's profiles table (see note above).
    IF (to_jsonb(NEW) ->> 'email') IS DISTINCT FROM (to_jsonb(OLD) ->> 'email') THEN
      RAISE EXCEPTION 'Not allowed to change email'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger already exists (trg_prevent_profile_privilege_escalation, bound in
-- 20250625100000) and points at this same function name — CREATE OR REPLACE
-- above is enough, no DROP/CREATE TRIGGER needed.

-- Verify (run as a normal user — should error 42501, matching the existing role/org_id checks):
--   UPDATE public.profiles SET manager_id = '<any other profile id>' WHERE id = auth.uid();
-- The email check can only be exercised where the column exists (e.g. dev) —
--   UPDATE public.profiles SET email = 'someone-else@example.com' WHERE id = auth.uid();
-- On prod, that statement fails at parse time ("column email does not exist"), not via this trigger.
