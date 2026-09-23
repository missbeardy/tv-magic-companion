-- T1.18: per-org SMS provider (Twilio -> Mobile Message).
--
-- Additive. Every existing and new org defaults to 'twilio', so applying this changes no
-- behaviour. Switching an org (first `fbd`, later TV Magic `default`) is an ops UPDATE of
-- sms_provider + sms_from_number + its org_phone_numbers row; rollback is one UPDATE back
-- to 'twilio'. Not a brand feature switch (owner decision 23-09-2026).
--
-- Also adds sms_provider to the AUD-2 privileged-column lock: an org manager must not be
-- able to flip their org onto a provider that has no credentials or sender, any more than
-- they can change sms_from_number. The function body is otherwise identical to
-- 20260922090000_lock_org_privileged_columns.sql.

ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS sms_provider text NOT NULL DEFAULT 'twilio';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orgs_sms_provider_check'
      AND conrelid = 'public.orgs'::regclass
  ) THEN
    ALTER TABLE public.orgs
      ADD CONSTRAINT orgs_sms_provider_check CHECK (sms_provider IN ('twilio', 'mobilemessage'));
  END IF;
END
$$;

COMMENT ON COLUMN public.orgs.sms_provider IS
  'Outbound SMS provider for this org: twilio (default) or mobilemessage. Sender is sms_from_number. T1.18.';

COMMENT ON COLUMN public.orgs.sms_from_number IS
  'SMS From/sender number for this org (E.164), on the provider in sms_provider. Required for customer/employee SMS; no env fallback.';

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

    IF NEW.sms_provider IS DISTINCT FROM OLD.sms_provider THEN
      RAISE EXCEPTION 'Not allowed to change sms_provider'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- The trigger itself (trg_prevent_org_privileged_column_change) already exists from
-- 20260922090000 and calls this function by name, so it picks up the new body as-is.

-- Verify:
--   SELECT slug, sms_provider, sms_from_number FROM public.orgs ORDER BY slug;  -- all 'twilio'
-- Switch the test org (ops, after the Mobile Message number exists):
--   UPDATE public.orgs SET sms_provider = 'mobilemessage', sms_from_number = '+61…' WHERE slug = 'fbd';
-- Rollback for one org:
--   UPDATE public.orgs SET sms_provider = 'twilio', sms_from_number = '<old Twilio number>' WHERE slug = 'fbd';
