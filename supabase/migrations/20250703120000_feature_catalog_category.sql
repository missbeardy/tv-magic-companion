-- Feature catalog categories for Platform Admin grouped toggles + safe default reaffirmation

ALTER TABLE public.feature_flag_catalog
  ADD COLUMN IF NOT EXISTS category text;

UPDATE public.feature_flag_catalog SET category = 'lead_intake'
WHERE feature_key IN ('inbound_sms', 'inbound_email', 'inbound_calls');

UPDATE public.feature_flag_catalog SET category = 'customer_communication'
WHERE feature_key IN ('missed_call_hookback_sms', 'customer_ontheway_sms', 'review_requests');

UPDATE public.feature_flag_catalog SET category = 'team_operations'
WHERE feature_key IN ('manager_new_lead_alerts', 'smart_assign_badge', 'tech_location');

UPDATE public.feature_flag_catalog SET category = 'sales_job_completion'
WHERE feature_key IN ('quote_esign', 'completion_upsells');

ALTER TABLE public.feature_flag_catalog
  ALTER COLUMN category SET NOT NULL;

ALTER TABLE public.feature_flag_catalog
  ALTER COLUMN default_enabled SET DEFAULT false;
