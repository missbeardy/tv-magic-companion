-- AUD-2: prevent authenticated/anon clients from changing privileged `orgs`
-- columns directly (subscription_tier, Stripe fields, brand_id, slug,
-- sms_from_number). Platform admins and service-role/server code are
-- unaffected.
--
-- Mirrors 20250625100000_lock_profile_role_org.sql. Uses IS DISTINCT FROM so
-- a write that doesn't actually change a protected value is never blocked —
-- e.g. OrgSettingsPage's "reset to brand template" button re-writes the
-- org's own existing brand_id via buildBrandTransferPayload(); that's a
-- no-op value change and must keep working for non-admin org managers.
-- PlatformAdminPage's "change org brand" writes a genuinely different
-- brand_id, but only platform admins can reach that UI, and is_platform_admin()
-- lets them through.

CREATE OR REPLACE FUNCTION public.prevent_org_privileged_column_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER -- not DEFINER: current_user must be the caller, see 20260922130000
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

-- Verify (run as a normal authenticated user against their own org — should error 42501):
--   UPDATE public.orgs SET subscription_tier = 'enterprise' WHERE id = <their org id>;
-- Verify the brand-template reset still works (writes the org's own existing brand_id back):
--   UPDATE public.orgs SET brand_id = brand_id, primary_color = primary_color WHERE id = <their org id>;
