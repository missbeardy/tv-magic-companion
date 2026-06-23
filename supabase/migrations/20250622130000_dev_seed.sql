-- DEV ONLY: seed demo org and link all existing auth users as managers.

INSERT INTO public.orgs (
  id, name, slug, primary_color, secondary_color, subscription_tier
) VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'FieldBourne Dev Demo',
  'fieldbourne-dev',
  '#004B93',
  '#00B4C5',
  'enterprise'
) ON CONFLICT (slug) DO NOTHING;

-- Ensure every auth user has a profile linked to the dev org
INSERT INTO public.profiles (id, email, full_name, role, org_id)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', 'Dev Manager'),
  'manager',
  'a0000000-0000-4000-8000-000000000001'
FROM auth.users u
ON CONFLICT (id) DO UPDATE SET
  org_id = EXCLUDED.org_id,
  role = EXCLUDED.role,
  email = EXCLUDED.email,
  full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name);
