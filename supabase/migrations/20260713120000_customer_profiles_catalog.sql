-- FOUNDER REVIEW REQUIRED before production apply.
-- Spec D (Customer History UI, Phase B): feature catalog seed only.
-- Applied to the DEV Supabase project only until founder approves production.
-- No schema, index, or RLS changes: the read-only history view relies entirely
-- on the existing leads_org RLS policy.

-- Feature catalog seed: customer_profiles, default OFF, min tier basic,
-- category team_operations (a read-only UI surface, not part of intake).
INSERT INTO public.feature_flag_catalog (feature_key, label, description, default_enabled, min_tier, category)
VALUES
  ('customer_profiles', 'Customer Profiles', 'Show a read-only history of a customer''s previous jobs in the lead detail sheet', false, 'basic', 'team_operations')
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
