-- Stage 3: Enable lead ack + manager new-lead alerts for FieldBourne; SLA copy + email ack templates

INSERT INTO public.brand_feature_switches (brand_id, feature_key, enabled)
SELECT b.id, k.feature_key, true
FROM public.brands b
CROSS JOIN (
  VALUES
    ('lead_ack_sms'),
    ('manager_new_lead_alerts')
) AS k(feature_key)
WHERE b.slug IN ('fieldbourne', 'fieldbourne-dev')
ON CONFLICT (brand_id, feature_key) DO UPDATE
SET enabled = true,
    updated_at = now();

UPDATE public.brands
SET sms_templates = jsonb_set(
  sms_templates,
  '{lead_ack_sms}',
  '"Hi {{customerName}}, thanks for contacting {{org.name}}. We''ve received your enquiry and we''ll call you {{callbackWindow}}.{{orgPhoneLine}}"'::jsonb
)
WHERE sms_templates ? 'lead_ack_sms';

UPDATE public.brands
SET email_templates = email_templates || '{
  "lead_ack_email_subject": "We received your enquiry — {{org.name}}",
  "lead_ack_email_html": "<div style=\"font-family:Inter,Arial,sans-serif;line-height:1.5;color:#1f2937;max-width:560px\"><p>Hi {{customerName}},</p><p>Thanks for contacting {{org.name}}. We''ve received your enquiry and will call you {{callbackWindow}}.</p>{{orgPhoneBlock}}<p>— {{org.name}}</p></div>"
}'::jsonb
WHERE NOT (email_templates ? 'lead_ack_email_subject');
