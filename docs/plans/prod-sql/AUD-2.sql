-- AUD-2: lock privileged `orgs` columns.
-- Copy of supabase/migrations/20260922090000_lock_org_privileged_columns.sql.

-- ============================================================
-- READ-ONLY VERIFY (run first — confirms the trigger isn't already there,
-- and shows every brand_id value currently on file so you can eyeball that
-- nothing here is mid-transfer before locking writes to it)
-- ============================================================
SELECT tgname
FROM pg_trigger
WHERE tgrelid = 'public.orgs'::regclass
  AND tgname = 'trg_prevent_org_privileged_column_change';
-- expect: 0 rows before applying, 1 row after

SELECT id, slug, brand_id, subscription_tier, sms_from_number
FROM public.orgs
ORDER BY slug;

-- ============================================================
-- MIGRATION (idempotent: CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS)
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_org_privileged_column_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER -- not DEFINER: current_user must be the caller, see AUD-C1.sql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') AND NOT public.is_platform_admin() THEN
    IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier THEN
      RAISE EXCEPTION 'Not allowed to change subscription_tier'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id THEN
      RAISE EXCEPTION 'Not allowed to change stripe_customer_id'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.stripe_connect_account_id IS DISTINCT FROM OLD.stripe_connect_account_id THEN
      RAISE EXCEPTION 'Not allowed to change stripe_connect_account_id'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.stripe_connect_status IS DISTINCT FROM OLD.stripe_connect_status THEN
      RAISE EXCEPTION 'Not allowed to change stripe_connect_status'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.brand_id IS DISTINCT FROM OLD.brand_id THEN
      RAISE EXCEPTION 'Not allowed to change brand_id'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.slug IS DISTINCT FROM OLD.slug THEN
      RAISE EXCEPTION 'Not allowed to change slug'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF NEW.sms_from_number IS DISTINCT FROM OLD.sms_from_number THEN
      RAISE EXCEPTION 'Not allowed to change sms_from_number'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_org_privileged_column_change ON public.orgs;

CREATE TRIGGER trg_prevent_org_privileged_column_change
  BEFORE UPDATE ON public.orgs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_org_privileged_column_change();
