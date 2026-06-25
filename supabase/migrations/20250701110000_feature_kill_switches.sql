-- Modular feature kill switches (brand defaults + org overrides)

CREATE TABLE IF NOT EXISTS public.feature_flag_catalog (
  feature_key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  default_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.feature_flag_catalog (feature_key, label, description, default_enabled)
VALUES
  ('smart_assign_badge', 'Smart Assign Badge', 'Recommendation badge and cues in assign modal', false),
  ('quote_esign', 'Quote Acceptance + E-Sign', 'Manager quote send flow and customer acceptance signature', false)
ON CONFLICT (feature_key) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  default_enabled = EXCLUDED.default_enabled;

CREATE TABLE IF NOT EXISTS public.brand_feature_switches (
  brand_id uuid NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
  feature_key text NOT NULL REFERENCES public.feature_flag_catalog(feature_key) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (brand_id, feature_key)
);

CREATE TABLE IF NOT EXISTS public.org_feature_switch_overrides (
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  feature_key text NOT NULL REFERENCES public.feature_flag_catalog(feature_key) ON DELETE CASCADE,
  enabled boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (org_id, feature_key)
);

CREATE INDEX IF NOT EXISTS org_feature_switch_overrides_feature_idx
  ON public.org_feature_switch_overrides(feature_key, org_id);

CREATE INDEX IF NOT EXISTS brand_feature_switches_feature_idx
  ON public.brand_feature_switches(feature_key, brand_id);

-- Ensure every existing brand gets explicit OFF defaults for catalog features.
INSERT INTO public.brand_feature_switches (brand_id, feature_key, enabled)
SELECT b.id, c.feature_key, false
FROM public.brands b
CROSS JOIN public.feature_flag_catalog c
LEFT JOIN public.brand_feature_switches bfs
  ON bfs.brand_id = b.id
 AND bfs.feature_key = c.feature_key
WHERE bfs.brand_id IS NULL;

CREATE OR REPLACE FUNCTION public.get_effective_feature_switch(
  p_org_id uuid,
  p_feature_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT o.enabled
      FROM public.org_feature_switch_overrides o
      WHERE o.org_id = p_org_id
        AND o.feature_key = p_feature_key
      LIMIT 1
    ),
    (
      SELECT b.enabled
      FROM public.orgs o2
      JOIN public.brand_feature_switches b
        ON b.brand_id = o2.brand_id
       AND b.feature_key = p_feature_key
      WHERE o2.id = p_org_id
      LIMIT 1
    ),
    (
      SELECT c.default_enabled
      FROM public.feature_flag_catalog c
      WHERE c.feature_key = p_feature_key
      LIMIT 1
    ),
    false
  );
$$;

ALTER TABLE public.feature_flag_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_feature_switches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_feature_switch_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS feature_flag_catalog_select ON public.feature_flag_catalog;
CREATE POLICY feature_flag_catalog_select ON public.feature_flag_catalog
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS feature_flag_catalog_admin ON public.feature_flag_catalog;
CREATE POLICY feature_flag_catalog_admin ON public.feature_flag_catalog
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS brand_feature_switches_select ON public.brand_feature_switches;
CREATE POLICY brand_feature_switches_select ON public.brand_feature_switches
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR brand_id = (
      SELECT o.brand_id
      FROM public.orgs o
      WHERE o.id = public.current_user_org_id()
      LIMIT 1
    )
  );

DROP POLICY IF EXISTS brand_feature_switches_admin ON public.brand_feature_switches;
CREATE POLICY brand_feature_switches_admin ON public.brand_feature_switches
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS org_feature_switch_overrides_select ON public.org_feature_switch_overrides;
CREATE POLICY org_feature_switch_overrides_select ON public.org_feature_switch_overrides
  FOR SELECT TO authenticated
  USING (
    public.is_platform_admin()
    OR org_id = public.current_user_org_id()
  );

DROP POLICY IF EXISTS org_feature_switch_overrides_admin ON public.org_feature_switch_overrides;
CREATE POLICY org_feature_switch_overrides_admin ON public.org_feature_switch_overrides
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());
