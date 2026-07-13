-- Feature switch: team-mode inbound auto-assign using smart workload + proximity logic.

INSERT INTO public.feature_flag_catalog (feature_key, label, description, default_enabled, min_tier, category)
VALUES (
  'inbound_auto_assign',
  'Inbound Auto-Assign',
  'Automatically assign inbound team leads to the best available technician',
  false,
  'basic',
  'team_operations'
)
ON CONFLICT (feature_key) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  default_enabled = EXCLUDED.default_enabled,
  min_tier = EXCLUDED.min_tier,
  category = EXCLUDED.category;

INSERT INTO public.brand_feature_switches (brand_id, feature_key, enabled)
SELECT b.id, 'inbound_auto_assign', false
FROM public.brands b
LEFT JOIN public.brand_feature_switches bfs
  ON bfs.brand_id = b.id AND bfs.feature_key = 'inbound_auto_assign'
WHERE bfs.brand_id IS NULL;
