-- DEV: Fix white screen after login (broken profiles/orgs RLS + missing profile rows).
-- Run the ENTIRE script in dev Supabase → SQL Editor.
--
-- NOTE: auth.uid() is NULL in the SQL Editor (you are postgres, not a logged-in app user).
-- Use the diagnostic queries in STEP 1 instead of "WHERE id = auth.uid()".

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 1 — Diagnostics (run these first; should return rows)
-- ═══════════════════════════════════════════════════════════════════════════

-- 1a. Auth users that exist
-- SELECT id, email, created_at FROM auth.users ORDER BY created_at;

-- 1b. Profile rows (SQL Editor bypasses RLS)
-- SELECT id, role, org_id, full_name FROM public.profiles ORDER BY role;

-- 1c. Auth users MISSING a profile (these cannot use the app)
-- SELECT u.id, u.email
-- FROM auth.users u
-- LEFT JOIN public.profiles p ON p.id = u.id
-- WHERE p.id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 2 — RLS helpers + policies
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'platform_admin'
  );
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select ON public.profiles;
DROP POLICY IF EXISTS profiles_select_org ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
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
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS orgs_select ON public.orgs;
DROP POLICY IF EXISTS orgs_select_own ON public.orgs;
CREATE POLICY orgs_select_own ON public.orgs
  FOR SELECT TO authenticated
  USING (id = public.current_user_org_id());

DROP POLICY IF EXISTS orgs_platform_select ON public.orgs;
CREATE POLICY orgs_platform_select ON public.orgs
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 3 — Dev org + link every auth user to a profile
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.orgs (id, name, slug, subscription_tier)
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'FieldBourne Dev Demo',
  'fieldbourne-dev',
  'enterprise'
) ON CONFLICT (slug) DO NOTHING;

-- Dev schemas vary: some have profiles.email, some don't (prod-style).
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'email'
  ) THEN
    EXECUTE $sql$
      INSERT INTO public.profiles (id, email, full_name, role, org_id)
      SELECT
        u.id,
        COALESCE(u.email, u.id::text || '@dev.local'),
        COALESCE(u.raw_user_meta_data->>'full_name', split_part(COALESCE(u.email, 'dev'), '@', 1)),
        'manager',
        'a0000000-0000-4000-8000-000000000001'::uuid
      FROM auth.users u
      ON CONFLICT (id) DO UPDATE SET
        org_id = COALESCE(public.profiles.org_id, EXCLUDED.org_id),
        email = COALESCE(EXCLUDED.email, public.profiles.email),
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        role = COALESCE(public.profiles.role, EXCLUDED.role)
    $sql$;
  ELSE
    EXECUTE $sql$
      INSERT INTO public.profiles (id, full_name, role, org_id)
      SELECT
        u.id,
        COALESCE(u.raw_user_meta_data->>'full_name', 'Dev User'),
        'manager',
        'a0000000-0000-4000-8000-000000000001'::uuid
      FROM auth.users u
      ON CONFLICT (id) DO UPDATE SET
        org_id = COALESCE(public.profiles.org_id, EXCLUDED.org_id),
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
        role = COALESCE(public.profiles.role, EXCLUDED.role)
    $sql$;
  END IF;
END $$;

-- Backfill org_id on any profile that still has NULL
UPDATE public.profiles
SET org_id = 'a0000000-0000-4000-8000-000000000001'::uuid
WHERE org_id IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- STEP 4 — Verify (works in SQL Editor — no auth.uid())
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  u.email AS login_email,
  p.id,
  p.role,
  p.org_id,
  p.full_name,
  CASE WHEN p.org_id IS NULL THEN 'MISSING org_id' ELSE 'ok' END AS status
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
ORDER BY u.email;
