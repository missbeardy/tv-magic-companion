-- Simplify feature switches: tier gate + brand default only (no per-franchise overrides)

ALTER TABLE public.feature_flag_catalog
  ADD COLUMN IF NOT EXISTS min_tier text NOT NULL DEFAULT 'basic';

UPDATE public.feature_flag_catalog
SET min_tier = 'pro'
WHERE feature_key = 'quote_esign';

UPDATE public.feature_flag_catalog
SET min_tier = 'basic'
WHERE feature_key = 'smart_assign_badge';

INSERT INTO public.feature_flag_catalog (feature_key, label, description, default_enabled, min_tier)
VALUES
  ('review_requests', 'Google Review Request SMS', 'Post-job review link SMS to customers', false, 'basic'),
  ('customer_ontheway_sms', 'Customer On The Way SMS', 'ETA SMS with maps link when tech is en route', false, 'basic'),
  ('manager_new_lead_alerts', 'Manager New-Lead Alert SMS', 'SMS to managers when a new unassigned lead arrives', false, 'basic'),
  ('inbound_sms', 'Inbound SMS Leads', 'Create leads from inbound Twilio SMS webhooks', false, 'basic'),
  ('inbound_email', 'Inbound Email Leads', 'Create leads from inbound email webhooks', false, 'basic'),
  ('inbound_calls', 'Inbound Calls / Voicemail', 'Create leads from missed calls and voicemail', false, 'basic'),
  ('completion_upsells', 'Completion Upsell Checklist', 'Upsell prompts in the job completion flow', false, 'basic'),
  ('tech_location', 'Tech Location Tracking', 'Periodic GPS updates from employee devices', false, 'basic')
ON CONFLICT (feature_key) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  min_tier = EXCLUDED.min_tier;

-- Seed OFF brand defaults for any new catalog keys
INSERT INTO public.brand_feature_switches (brand_id, feature_key, enabled)
SELECT b.id, c.feature_key, false
FROM public.brands b
CROSS JOIN public.feature_flag_catalog c
LEFT JOIN public.brand_feature_switches bfs
  ON bfs.brand_id = b.id AND bfs.feature_key = c.feature_key
WHERE bfs.brand_id IS NULL;

CREATE OR REPLACE FUNCTION public.get_effective_feature_switch(
  p_org_id uuid,
  p_feature_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH org_ctx AS (
    SELECT o.subscription_tier, o.brand_id
    FROM public.orgs o
    WHERE o.id = p_org_id
    LIMIT 1
  ),
  catalog AS (
    SELECT c.default_enabled, c.min_tier
    FROM public.feature_flag_catalog c
    WHERE c.feature_key = p_feature_key
    LIMIT 1
  ),
  tier_ok AS (
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM org_ctx) THEN false
      WHEN NOT EXISTS (SELECT 1 FROM catalog) THEN false
      WHEN (SELECT subscription_tier FROM org_ctx) IS NULL THEN false
      ELSE (
        CASE (SELECT min_tier FROM catalog)
          WHEN 'enterprise' THEN (SELECT subscription_tier FROM org_ctx) = 'enterprise'
          WHEN 'pro' THEN (SELECT subscription_tier FROM org_ctx) IN ('pro', 'enterprise')
          ELSE (SELECT subscription_tier FROM org_ctx) IN ('basic', 'pro', 'enterprise')
        END
      )
    END AS ok
  )
  SELECT CASE
    WHEN (SELECT ok FROM tier_ok) IS NOT TRUE THEN false
    ELSE COALESCE(
      (
        SELECT b.enabled
        FROM org_ctx o
        JOIN public.brand_feature_switches b
          ON b.brand_id = o.brand_id
         AND b.feature_key = p_feature_key
        LIMIT 1
      ),
      (SELECT default_enabled FROM catalog),
      false
    )
  END;
$$;

-- Backup note: export org_feature_switch_overrides before drop if any custom overrides exist
DROP TABLE IF EXISTS public.org_feature_switch_overrides;
