-- Quote follow-up chase: per-quote tracking + feature flag (default off).

ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS follow_up_count int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_followed_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_paused boolean NOT NULL DEFAULT false;

INSERT INTO public.feature_flag_catalog (feature_key, label, description, default_enabled, min_tier, category)
VALUES (
  'quote_chase',
  'Quote Follow-Up Chase',
  'Automated SMS/email nudges for sent quotes awaiting customer response',
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
SELECT b.id, 'quote_chase', false
FROM public.brands b
LEFT JOIN public.brand_feature_switches bfs
  ON bfs.brand_id = b.id AND bfs.feature_key = 'quote_chase'
WHERE bfs.brand_id IS NULL;
