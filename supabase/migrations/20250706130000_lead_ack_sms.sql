-- Instant lead acknowledgement SMS + brand template seed

INSERT INTO public.feature_flag_catalog (feature_key, label, description, default_enabled, min_tier, category)
VALUES
  (
    'lead_ack_sms',
    'Lead Acknowledgement SMS',
    'Instant branded thank-you SMS to customers when a new inbound lead is created',
    false,
    'basic',
    'customer_communication'
  )
ON CONFLICT (feature_key) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  min_tier = EXCLUDED.min_tier,
  category = EXCLUDED.category;

INSERT INTO public.brand_feature_switches (brand_id, feature_key, enabled)
SELECT b.id, 'lead_ack_sms', false
FROM public.brands b
LEFT JOIN public.brand_feature_switches bfs
  ON bfs.brand_id = b.id AND bfs.feature_key = 'lead_ack_sms'
WHERE bfs.brand_id IS NULL;

UPDATE public.brands
SET sms_templates = sms_templates || '{
  "lead_ack_sms": "Hi {{customerName}}, thanks for contacting {{org.name}}. We''ve received your enquiry and will be in touch soon."
}'::jsonb
WHERE NOT (sms_templates ? 'lead_ack_sms');
