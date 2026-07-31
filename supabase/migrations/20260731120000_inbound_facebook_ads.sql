-- Facebook Lead Ads intake (T1.11): per-brand feature switch, default off.
-- Separate from inbound_messenger so a franchise can run ads without the Messenger bot.

INSERT INTO public.feature_flag_catalog (feature_key, label, description, default_enabled, min_tier, category)
VALUES (
  'inbound_facebook_ads',
  'Facebook Lead Ads',
  'Create leads from Facebook Lead Ads instant forms (via Make.com)',
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
SELECT b.id, 'inbound_facebook_ads', false
FROM public.brands b
LEFT JOIN public.brand_feature_switches bfs
  ON bfs.brand_id = b.id AND bfs.feature_key = 'inbound_facebook_ads'
WHERE bfs.brand_id IS NULL;
