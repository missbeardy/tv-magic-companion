-- Per-technician job exclusions (T1.14): "this person cannot do X".
--
-- Auto-assign has no skill/capability concept, so a Starlink lead can land on the
-- one tech who cannot do Starlink. Each profile gets a list of exclusion keywords
-- matched case-insensitively against the inbound text (service_type + details +
-- raw_sms/raw_email) — NOT against leads.service_type, because that column is free
-- text with no catalog and auto-assign runs before Claude extraction resolves it.
--
-- Matching logic lives in shared/serviceExclusions.ts; this migration only stores.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS excluded_service_keywords text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.profiles.excluded_service_keywords IS
  'Lowercase keywords this person cannot work on (e.g. {starlink}). Auto-assign skips '
  'them when a keyword appears in the inbound lead text. See shared/serviceExclusions.ts.';

-- No new RLS policy: reads are covered by the existing same-org `profiles_select`.
-- Writes deliberately are NOT client-side — `profiles_update_self` restricts updates
-- to id = auth.uid(), so a manager cannot edit a team member's row directly. Writes go
-- through /api/create-user?action=set-exclusions using the service-role key, which
-- enforces manager-or-platform-admin plus a same-org check on the target profile.

INSERT INTO public.feature_flag_catalog (feature_key, label, description, default_enabled, min_tier, category)
VALUES (
  'assignment_exclusions',
  'Technician Job Exclusions',
  'Skip technicians flagged as unable to do a job type when auto-assigning, and warn on manual assign',
  false,
  'basic',
  'team_operations'
)
ON CONFLICT (feature_key) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  min_tier = EXCLUDED.min_tier,
  category = EXCLUDED.category;

INSERT INTO public.brand_feature_switches (brand_id, feature_key, enabled)
SELECT b.id, 'assignment_exclusions', false
FROM public.brands b
LEFT JOIN public.brand_feature_switches bfs
  ON bfs.brand_id = b.id AND bfs.feature_key = 'assignment_exclusions'
WHERE bfs.brand_id IS NULL;
