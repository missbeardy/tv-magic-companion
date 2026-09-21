-- Recreate org-level feature switch overrides (dropped in 20250701140000).
-- Org row wins over brand, then catalog, then code default.

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

ALTER TABLE public.org_feature_switch_overrides ENABLE ROW LEVEL SECURITY;

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
