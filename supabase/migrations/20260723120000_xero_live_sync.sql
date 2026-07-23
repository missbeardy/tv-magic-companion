-- T3.1: Xero live OAuth sync — org tokens + invoice sync markers + feature switch

ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS xero_tenant_id text,
  ADD COLUMN IF NOT EXISTS xero_tenant_name text,
  ADD COLUMN IF NOT EXISTS xero_access_token text,
  ADD COLUMN IF NOT EXISTS xero_refresh_token text,
  ADD COLUMN IF NOT EXISTS xero_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS xero_connected_at timestamptz;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS xero_invoice_id text,
  ADD COLUMN IF NOT EXISTS xero_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS invoices_org_xero_invoice_id_idx
  ON public.invoices (org_id, xero_invoice_id)
  WHERE xero_invoice_id IS NOT NULL;

INSERT INTO public.feature_flag_catalog (feature_key, label, description, default_enabled, min_tier, category)
VALUES (
  'xero_live_sync',
  'Xero Live Sync',
  'Connect a Xero organisation via OAuth and push sent invoices (contacts + ACCREC) live',
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
WHERE c.feature_key = 'xero_live_sync'
  AND bfs.brand_id IS NULL;

-- Hard-off for every brand (ship dark)
UPDATE public.brand_feature_switches
SET enabled = false
WHERE feature_key = 'xero_live_sync';

UPDATE public.feature_flag_catalog
SET default_enabled = false
WHERE feature_key = 'xero_live_sync';
