-- T2.4 / T2.5 / T2.6: onboarding tips, customer CSV import, customers.notes

ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS notes text;

INSERT INTO public.feature_flag_catalog (feature_key, label, description, default_enabled, min_tier, category)
VALUES
  (
    'onboarding_tips',
    'In-App Onboarding Tips',
    'Coach tips for pool timer, contact rounds, and next-action CTAs (team mode only)',
    true,
    'basic',
    'team_operations'
  ),
  (
    'customer_import',
    'Customer CSV Import',
    'Import an existing customer list from CSV in Franchise Settings',
    false,
    'basic',
    'lead_intake'
  )
ON CONFLICT (feature_key) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  min_tier = EXCLUDED.min_tier,
  category = EXCLUDED.category;

INSERT INTO public.brand_feature_switches (brand_id, feature_key, enabled)
SELECT b.id, 'onboarding_tips', true
FROM public.brands b
LEFT JOIN public.brand_feature_switches bfs
  ON bfs.brand_id = b.id AND bfs.feature_key = 'onboarding_tips'
WHERE bfs.brand_id IS NULL;

INSERT INTO public.brand_feature_switches (brand_id, feature_key, enabled)
SELECT b.id, 'customer_import', false
FROM public.brands b
LEFT JOIN public.brand_feature_switches bfs
  ON bfs.brand_id = b.id AND bfs.feature_key = 'customer_import'
WHERE bfs.brand_id IS NULL;
