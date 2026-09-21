-- Per-org Twilio sender for customer/employee SMS.
-- Do not put a live number in this file. Backfill orgs.sms_from_number via Management API
-- from the org's mapped DID in org_phone_numbers.

ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS sms_from_number text;

COMMENT ON COLUMN public.orgs.sms_from_number IS
  'Twilio From number for this org (E.164). Required for customer/employee SMS; no env fallback.';
