-- Add org contact phone line to lead acknowledgement SMS template

UPDATE public.brands
SET sms_templates = jsonb_set(
  sms_templates,
  '{lead_ack_sms}',
  '"Hi {{customerName}}, thanks for contacting {{org.name}}. We''ve received your enquiry and will be in touch soon.{{orgPhoneLine}}"'::jsonb
)
WHERE sms_templates ? 'lead_ack_sms';
