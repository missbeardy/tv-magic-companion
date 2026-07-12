-- FOUNDER REVIEW REQUIRED before production apply.
-- Spec C (Customer Linking, Phase A): matching indexes + feature catalog seed.
-- Applied to the DEV Supabase project only until founder approves production.

-- 1. Matching indexes. The linker looks up an existing customer per inbound
--    lead by (org_id, email) then (org_id, phone); partial to skip null rows.
CREATE INDEX IF NOT EXISTS customers_org_phone_idx
  ON public.customers (org_id, phone)
  WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS customers_org_email_idx
  ON public.customers (org_id, email)
  WHERE email IS NOT NULL;

-- 2. Feature catalog seed: customer_linking, default OFF, min tier basic,
--    category lead_intake (it runs inside the inbound lead pipeline).
INSERT INTO public.feature_flag_catalog (feature_key, label, description, default_enabled, min_tier, category)
VALUES
  ('customer_linking', 'Customer Linking', 'Match or create a customer record for each inbound lead', false, 'basic', 'lead_intake')
ON CONFLICT (feature_key) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  min_tier = EXCLUDED.min_tier,
  category = EXCLUDED.category;

-- Seed OFF brand defaults for the new key (matches existing catalog pattern).
INSERT INTO public.brand_feature_switches (brand_id, feature_key, enabled)
SELECT b.id, c.feature_key, false
FROM public.brands b
CROSS JOIN public.feature_flag_catalog c
LEFT JOIN public.brand_feature_switches bfs
  ON bfs.brand_id = b.id AND bfs.feature_key = c.feature_key
WHERE bfs.brand_id IS NULL;
