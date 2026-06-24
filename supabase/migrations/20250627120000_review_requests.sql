-- Post-job Google review request SMS (A3)

ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS google_review_url text,
  ADD COLUMN IF NOT EXISTS review_requests_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS review_request_sent_at timestamptz;

-- Default SMS template for review requests (merge into existing brand packs)
UPDATE public.brands
SET sms_templates = sms_templates || '{
  "customer_review_request": "Hi {{customerName}}, thanks for choosing {{org.name}}! We''d love your feedback: {{reviewUrl}}"
}'::jsonb
WHERE NOT (sms_templates ? 'customer_review_request');
