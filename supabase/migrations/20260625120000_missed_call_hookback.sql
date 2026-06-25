-- Missed call instant SMS hookback + brand template seed

INSERT INTO public.feature_flag_catalog (feature_key, label, description, default_enabled, min_tier)
VALUES
  ('missed_call_hookback_sms', 'Missed Call Auto-Reply SMS', 'Instant branded SMS to callers when a call is missed', false, 'basic')
ON CONFLICT (feature_key) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  min_tier = EXCLUDED.min_tier;

INSERT INTO public.brand_feature_switches (brand_id, feature_key, enabled)
SELECT b.id, 'missed_call_hookback_sms', false
FROM public.brands b
LEFT JOIN public.brand_feature_switches bfs
  ON bfs.brand_id = b.id AND bfs.feature_key = 'missed_call_hookback_sms'
WHERE bfs.brand_id IS NULL;

UPDATE public.brands
SET sms_templates = sms_templates || '{
  "missed_call_hookback": "Hi, {{customerName}} — hands full on-site at {{org.name}}. Your missed call has been assigned to one of our technicians who will call you as soon as possible."
}'::jsonb
WHERE NOT (sms_templates ? 'missed_call_hookback');
