-- Package 4: Xero-compatible CSV export — org account code + feature switch

ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS accounting_account_code text DEFAULT '200';

INSERT INTO public.feature_flag_catalog (feature_key, label, description, default_enabled, min_tier, category)
VALUES (
  'accounting_export',
  'Accounting CSV Export',
  'Export invoices as a Xero-compatible sales invoice CSV (Tax Inclusive)',
  false,
  'basic',
  'sales_job_completion'
)
ON CONFLICT (feature_key) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  default_enabled = EXCLUDED.default_enabled,
  min_tier = EXCLUDED.min_tier,
  category = EXCLUDED.category;

INSERT INTO public.brand_feature_switches (brand_id, feature_key, enabled)
SELECT b.id, c.feature_key, false
FROM public.brands b
CROSS JOIN public.feature_flag_catalog c
LEFT JOIN public.brand_feature_switches bfs
  ON bfs.brand_id = b.id AND bfs.feature_key = c.feature_key
WHERE c.feature_key = 'accounting_export'
  AND bfs.brand_id IS NULL;
