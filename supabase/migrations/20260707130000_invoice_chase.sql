-- Overdue invoice chase: per-invoice tracking + feature flag (default off).

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS chase_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_chased_at timestamptz,
  ADD COLUMN IF NOT EXISTS chase_paused boolean NOT NULL DEFAULT false;

INSERT INTO public.feature_flag_catalog (feature_key, label, description, default_enabled, min_tier, category)
VALUES (
  'invoice_chase',
  'Overdue Invoice Chase',
  'Automated SMS/email reminders for overdue sent invoices',
  false,
  'pro',
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
SELECT b.id, 'invoice_chase', false
FROM public.brands b
LEFT JOIN public.brand_feature_switches bfs
  ON bfs.brand_id = b.id AND bfs.feature_key = 'invoice_chase'
WHERE bfs.brand_id IS NULL;
