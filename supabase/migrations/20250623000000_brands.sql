-- Phase 2: Brand template layer (DEV first)

CREATE TABLE IF NOT EXISTS public.brands (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  slug          text NOT NULL UNIQUE,
  vertical      text NOT NULL DEFAULT 'general',
  logo_url      text,
  primary_color text NOT NULL DEFAULT '#004B93',
  secondary_color text NOT NULL DEFAULT '#00B4C5',
  sms_templates jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_config     jsonb NOT NULL DEFAULT '{}'::jsonb,
  upsell_items  jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS upsell_items jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('manager', 'employee', 'platform_admin'));

-- TV Magic as first brand pack
INSERT INTO public.brands (
  id, name, slug, vertical, primary_color, secondary_color,
  sms_templates, ai_config, upsell_items
) VALUES (
  'b0000000-0000-4000-8000-000000000001',
  'TV Magic',
  'tv-magic',
  'tv_installation',
  '#004B93',
  '#00B4C5',
  '{
    "tech_assignment": "{{org.name}}: You''ve been assigned {{leadName}} — {{serviceType}}",
    "customer_ontheway": "{{techName}} from {{org.name}} is on their way to help with your {{serviceType}} enquiry.",
    "receipt_footer": "— {{org.name}} Team"
  }'::jsonb,
  '{
    "service_types": ["TV Aerial", "Satellite Dish", "MATV", "CCTV", "General Enquiry"],
    "caption_hashtags": ["#TVMagic", "#TVAerial", "#SmartHome", "#LocalTech"]
  }'::jsonb,
  '[
    {"id": "1", "label": "Signal health check"},
    {"id": "2", "label": "Surge protector"},
    {"id": "3", "label": "Extra TV point"},
    {"id": "4", "label": "Extended warranty"}
  ]'::jsonb
) ON CONFLICT (slug) DO NOTHING;

UPDATE public.orgs
SET brand_id = 'b0000000-0000-4000-8000-000000000001'
WHERE slug = 'fieldbourne-dev' AND brand_id IS NULL;

-- FieldBourne platform demo brand
INSERT INTO public.brands (
  id, name, slug, vertical, primary_color, secondary_color
) VALUES (
  'b0000000-0000-4000-8000-000000000002',
  'FieldBourne Digital',
  'fieldbourne',
  'platform',
  '#1a1a2e',
  '#4361ee'
) ON CONFLICT (slug) DO NOTHING;

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

ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS brands_select ON public.brands;
CREATE POLICY brands_select ON public.brands
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS brands_admin ON public.brands;
CREATE POLICY brands_admin ON public.brands
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS orgs_platform_insert ON public.orgs;
CREATE POLICY orgs_platform_insert ON public.orgs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS orgs_platform_update ON public.orgs;
CREATE POLICY orgs_platform_update ON public.orgs
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin());

-- Dev convenience: promote first dev org manager to platform_admin
UPDATE public.profiles
SET role = 'platform_admin'
WHERE org_id = 'a0000000-0000-4000-8000-000000000001'
  AND role = 'manager'
  AND id = (
    SELECT id FROM public.profiles
    WHERE org_id = 'a0000000-0000-4000-8000-000000000001'
    ORDER BY created_at NULLS LAST
    LIMIT 1
  );
