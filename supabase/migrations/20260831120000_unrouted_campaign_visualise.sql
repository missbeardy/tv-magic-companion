-- Allow wall-visualiser quotes to land in unrouted_inbound when org slug is unknown.

ALTER TABLE public.unrouted_inbound
  DROP CONSTRAINT IF EXISTS unrouted_inbound_channel_check;

ALTER TABLE public.unrouted_inbound
  ADD CONSTRAINT unrouted_inbound_channel_check
  CHECK (channel IN ('sms', 'call', 'voicemail', 'email', 'facebook_lead', 'campaign_visualise'));
