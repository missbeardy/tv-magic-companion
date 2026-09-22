-- AUD-5: per-org Messenger receptionist config. A null messenger_contact_phone
-- means the org isn't configured yet — the bot skips the AI entirely rather
-- than guessing at an identity or a number to give out, and logs the turn to
-- unrouted_inbound instead.

ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS messenger_business_name text,
  ADD COLUMN IF NOT EXISTS messenger_contact_phone text,
  ADD COLUMN IF NOT EXISTS service_area_note text;

COMMENT ON COLUMN public.orgs.messenger_business_name IS
  'Business name the native Messenger receptionist introduces itself as.';
COMMENT ON COLUMN public.orgs.messenger_contact_phone IS
  'Phone number the Messenger receptionist may give out. Null = the bot skips the AI and logs to unrouted_inbound.';
COMMENT ON COLUMN public.orgs.service_area_note IS
  'Free-text out-of-area / service-boundary guidance appended to the Messenger system prompt.';

-- Widen unrouted_inbound to record a Messenger turn for an org that exists
-- but isn't configured for the receptionist yet (channel + reason follow the
-- established DROP/ADD CONSTRAINT pattern from 20260831120000).
ALTER TABLE public.unrouted_inbound
  DROP CONSTRAINT IF EXISTS unrouted_inbound_channel_check;

ALTER TABLE public.unrouted_inbound
  ADD CONSTRAINT unrouted_inbound_channel_check
  CHECK (channel IN ('sms', 'call', 'voicemail', 'email', 'facebook_lead', 'campaign_visualise', 'messenger'));

ALTER TABLE public.unrouted_inbound
  DROP CONSTRAINT IF EXISTS unrouted_inbound_reason_check;

ALTER TABLE public.unrouted_inbound
  ADD CONSTRAINT unrouted_inbound_reason_check
  CHECK (reason IN ('no_mapping', 'unknown_tag', 'no_tag', 'not_configured'));
