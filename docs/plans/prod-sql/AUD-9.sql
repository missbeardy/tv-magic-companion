-- AUD-9: per-org campaign quote / wall visualiser (/visualise/:orgSlug).
-- Copy of supabase/migrations/20260922150000_campaign_quote_switch.sql, plus
-- enabling the switch and backfilling website for the live client (org slug
-- 'default', brand 'tv-magic').

-- ============================================================
-- READ-ONLY VERIFY (run first)
-- ============================================================
SELECT slug, name, website, logo_url, primary_color, secondary_color
FROM public.orgs
WHERE slug = 'default';

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'orgs' AND column_name = 'website';
-- expect: 0 rows before the migration runs, 1 row after

SELECT feature_key, default_enabled FROM public.feature_flag_catalog WHERE feature_key = 'campaign_quote';
-- expect: 0 rows before, 1 row (default_enabled = false) after

-- ============================================================
-- MIGRATION (idempotent)
-- ============================================================

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
SELECT b.id, 'campaign_quote', false
FROM public.brands b
LEFT JOIN public.brand_feature_switches bfs
  ON bfs.brand_id = b.id AND bfs.feature_key = 'campaign_quote'
WHERE bfs.brand_id IS NULL;

-- ============================================================
-- ENABLE for tv-magic + backfill website — the live ad links currently
-- pointing at bare /visualise must keep working the moment this runs, so
-- apply this only once the branch carrying the /visualise/:orgSlug redirect
-- is deployed.
-- ============================================================

UPDATE public.brand_feature_switches bfs
SET enabled = true
FROM public.brands b
WHERE bfs.brand_id = b.id AND b.slug = 'tv-magic' AND bfs.feature_key = 'campaign_quote';

UPDATE public.orgs
SET website = 'https://tvmagic.com.au/'
WHERE slug = 'default' AND website IS NULL;
