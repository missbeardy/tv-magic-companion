-- Simplify on-the-way SMS template (generic, not job-specific)

UPDATE public.brands
SET sms_templates = sms_templates || '{
  "customer_ontheway": "{{techName}} from {{org.name}} is on their way. Thank you."
}'::jsonb;
