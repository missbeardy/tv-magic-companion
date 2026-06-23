-- Run in DEV Supabase SQL Editor if localhost login fails.
-- Re-links all auth users to the dev org and fixes profile RLS.

CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid();
$$;

INSERT INTO public.orgs (
  id, name, slug, subscription_tier
) VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'FieldBourne Dev Demo',
  'fieldbourne-dev',
  'enterprise'
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.profiles (id, email, full_name, role, org_id)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', 'Dev User'),
  'manager',
  'a0000000-0000-4000-8000-000000000001'
FROM auth.users u
ON CONFLICT (id) DO UPDATE SET
  org_id = COALESCE(public.profiles.org_id, EXCLUDED.org_id),
  email = EXCLUDED.email,
  role = COALESCE(public.profiles.role, EXCLUDED.role);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select ON public.profiles;
DROP POLICY IF EXISTS profiles_select_org ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR org_id = public.current_user_org_id()
  );

DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid());

ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS orgs_select ON public.orgs;
DROP POLICY IF EXISTS orgs_select_own ON public.orgs;
CREATE POLICY orgs_select_own ON public.orgs
  FOR SELECT TO authenticated
  USING (id = public.current_user_org_id());

-- Verify (should return your user with org_id set)
-- SELECT id, email, role, org_id FROM public.profiles;
