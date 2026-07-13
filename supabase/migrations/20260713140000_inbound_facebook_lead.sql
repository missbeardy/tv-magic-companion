-- Facebook Messenger leads via Make: feature switch + unrouted capture channel.

INSERT INTO public.feature_flag_catalog (feature_key, label, description, default_enabled, min_tier, category)
VALUES (
  'inbound_messenger',
  'Inbound Meta Messaging',
  'Create leads from Facebook Messenger web forms via Make.com',
  false,
  'basic',
  'lead_intake'
)
ON CONFLICT (feature_key) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  min_tier = EXCLUDED.min_tier,
  category = EXCLUDED.category;

INSERT INTO public.brand_feature_switches (brand_id, feature_key, enabled)
SELECT b.id, 'inbound_messenger', false
FROM public.brands b
LEFT JOIN public.brand_feature_switches bfs
  ON bfs.brand_id = b.id AND bfs.feature_key = 'inbound_messenger'
WHERE bfs.brand_id IS NULL;

ALTER TABLE public.unrouted_inbound
  DROP CONSTRAINT IF EXISTS unrouted_inbound_channel_check;

ALTER TABLE public.unrouted_inbound
  ADD CONSTRAINT unrouted_inbound_channel_check
  CHECK (channel IN ('sms', 'call', 'voicemail', 'email', 'facebook_lead'));
