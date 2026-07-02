-- Stage 1.2: Enable inbound lead capture for FieldBourne brands (preview + prod brand pack).
-- Does not enable WhatsApp / employee alert features.

INSERT INTO public.brand_feature_switches (brand_id, feature_key, enabled)
SELECT b.id, k.feature_key, true
FROM public.brands b
CROSS JOIN (
  VALUES
    ('inbound_sms'),
    ('inbound_email'),
    ('inbound_calls')
) AS k(feature_key)
WHERE b.slug IN ('fieldbourne', 'fieldbourne-dev')
ON CONFLICT (brand_id, feature_key) DO UPDATE
SET enabled = true,
    updated_at = now();
