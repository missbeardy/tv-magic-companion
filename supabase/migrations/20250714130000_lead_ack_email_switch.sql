-- Separate feature switch for lead acknowledgement email (optional; independent of lead_ack_sms)

INSERT INTO public.feature_flag_catalog (feature_key, label, description, default_enabled, min_tier, category)
VALUES
  (
    'lead_ack_email',
    'Lead Acknowledgement Email',
    'Instant branded thank-you email when a new inbound lead has no phone number',
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
SELECT b.id, 'lead_ack_email', false
FROM public.brands b
LEFT JOIN public.brand_feature_switches bfs
  ON bfs.brand_id = b.id AND bfs.feature_key = 'lead_ack_email'
WHERE bfs.brand_id IS NULL;

-- FieldBourne UAT: enable email ack alongside SMS ack
INSERT INTO public.brand_feature_switches (brand_id, feature_key, enabled)
SELECT b.id, 'lead_ack_email', true
FROM public.brands b
WHERE b.slug IN ('fieldbourne', 'fieldbourne-dev')
ON CONFLICT (brand_id, feature_key) DO UPDATE
SET enabled = true,
    updated_at = now();
