-- AUD-9: per-org campaign quote / wall visualiser (/visualise/:orgSlug).
-- Branding now comes from orgs.website (new) plus the existing name/logo_url/
-- primary_color/secondary_color columns instead of literals in the campaign
-- page. Gated by a new per-brand switch, default OFF like every other
-- inbound-channel switch — deploying the route ahead of this migration is
-- safe by construction (no catalog row => isFeatureEnabledForOrg returns false).

ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS website text;

COMMENT ON COLUMN public.orgs.website IS
  'Public marketing site URL, shown on the /visualise/:orgSlug campaign page footer.';

INSERT INTO public.feature_flag_catalog (feature_key, label, description, default_enabled, min_tier, category)
VALUES (
  'campaign_quote',
  'Campaign Quote / Wall Visualiser',
  'Public /visualise/:orgSlug wall visualiser and quote form for this org',
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
SELECT b.id, 'campaign_quote', b.slug = 'tv-magic'
FROM public.brands b
LEFT JOIN public.brand_feature_switches bfs
  ON bfs.brand_id = b.id AND bfs.feature_key = 'campaign_quote'
WHERE bfs.brand_id IS NULL;

-- Dev convenience: the TV Magic brand pack's public site.
UPDATE public.orgs
SET website = 'https://tvmagic.com.au/'
WHERE website IS NULL
  AND brand_id = 'b0000000-0000-4000-8000-000000000001';
