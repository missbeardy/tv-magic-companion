-- Link every auth.users row to a profiles row in the dev org (run after creating users in Supabase Auth).
-- Safe to re-run: updates missing org_id / email only.

INSERT INTO public.profiles (id, email, full_name, role, org_id)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  COALESCE(NULLIF(u.raw_user_meta_data->>'role', ''), 'employee'),
  COALESCE(
    (u.raw_user_meta_data->>'org_id')::uuid,
    'a0000000-0000-4000-8000-000000000001'::uuid
  )
FROM auth.users u
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
  org_id = COALESCE(public.profiles.org_id, EXCLUDED.org_id),
  role = CASE
    WHEN public.profiles.role IN ('manager', 'platform_admin') THEN public.profiles.role
    ELSE COALESCE(public.profiles.role, EXCLUDED.role)
  END;

-- Verify assignable team members (should list your org users)
-- SELECT id, email, full_name, role, org_id, phone FROM public.profiles ORDER BY role, email;
