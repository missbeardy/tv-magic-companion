-- Run this if you already created minimal orgs/profiles tables before the full migration.
-- Fixes 406 login loop: creates profile rows for all auth users.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_hidden_test_profile boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_profile_owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

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
  COALESCE(u.raw_user_meta_data->>'full_name', 'Dev Manager'),
  'manager',
  'a0000000-0000-4000-8000-000000000001'
FROM auth.users u
ON CONFLICT (id) DO UPDATE SET
  org_id = COALESCE(public.profiles.org_id, EXCLUDED.org_id),
  role = COALESCE(public.profiles.role, EXCLUDED.role),
  email = EXCLUDED.email;

-- Replace overly permissive dev policies if present
CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid();
$$;

DROP POLICY IF EXISTS profiles_select ON public.profiles;
DROP POLICY IF EXISTS profiles_select_org ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR org_id = public.current_user_org_id()
    OR (
      COALESCE(is_hidden_test_profile, false) = true
      AND test_profile_owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS profiles_update ON public.profiles;
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS orgs_select ON public.orgs;
DROP POLICY IF EXISTS orgs_select_own ON public.orgs;
CREATE POLICY orgs_select_own ON public.orgs FOR SELECT TO authenticated
  USING (id = public.current_user_org_id());
