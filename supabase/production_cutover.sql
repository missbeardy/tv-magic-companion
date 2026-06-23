-- =============================================================================
-- PRODUCTION CUTOVER — TV Magic (abnheynzugpicikxwwmv)
-- Run ONCE in Production Supabase → SQL Editor (not dev).
-- Idempotent where possible. Skip any statement that errors "already exists".
-- =============================================================================

-- ── 1. Profile RLS helper (fixes recursion / profile load) ─────────────────
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

-- ── 2. Brands + org branding columns ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.brands (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  slug            text NOT NULL UNIQUE,
  vertical        text NOT NULL DEFAULT 'general',
  logo_url        text,
  primary_color   text NOT NULL DEFAULT '#004B93',
  secondary_color text NOT NULL DEFAULT '#00B4C5',
  sms_templates   jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_config       jsonb NOT NULL DEFAULT '{}'::jsonb,
  upsell_items    jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS primary_color text NOT NULL DEFAULT '#004B93',
  ADD COLUMN IF NOT EXISTS secondary_color text NOT NULL DEFAULT '#00B4C5',
  ADD COLUMN IF NOT EXISTS support_phone text,
  ADD COLUMN IF NOT EXISTS support_email text,
  ADD COLUMN IF NOT EXISTS avg_job_value numeric NOT NULL DEFAULT 180,
  ADD COLUMN IF NOT EXISTS upsell_items jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('manager', 'employee', 'platform_admin'));

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
    "manager_alert": "{{org.name}}: A new lead has been submitted — {{leadName}} ({{serviceType}}). Please review and assign a technician: {{appUrl}}",
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

-- Link every existing franchise org to TV Magic brand + enterprise tier
UPDATE public.orgs
SET
  brand_id = 'b0000000-0000-4000-8000-000000000001',
  subscription_tier = 'enterprise',
  upsell_items = CASE
    WHEN upsell_items = '[]'::jsonb OR upsell_items IS NULL THEN (
      SELECT upsell_items FROM public.brands WHERE slug = 'tv-magic'
    )
    ELSE upsell_items
  END
WHERE brand_id IS NULL;

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
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS brands_admin ON public.brands;
CREATE POLICY brands_admin ON public.brands
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS orgs_platform_select ON public.orgs;
CREATE POLICY orgs_platform_select ON public.orgs
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS orgs_platform_insert ON public.orgs;
CREATE POLICY orgs_platform_insert ON public.orgs
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());
DROP POLICY IF EXISTS orgs_platform_update ON public.orgs;
CREATE POLICY orgs_platform_update ON public.orgs
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin());
DROP POLICY IF EXISTS orgs_update_manager ON public.orgs;
CREATE POLICY orgs_update_manager ON public.orgs
  FOR UPDATE TO authenticated
  USING (
    id = public.current_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('manager', 'platform_admin')
        AND p.org_id = orgs.id
    )
  );

-- ── 3. Profile columns (additive) ──────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS suburb text,
  ADD COLUMN IF NOT EXISTS lat double precision,
  ADD COLUMN IF NOT EXISTS lng double precision,
  ADD COLUMN IF NOT EXISTS location_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS location_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS push_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_hidden_test_profile boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_profile_owner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ── 4. Stripe billing columns ───────────────────────────────────────────────
ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'manual'
    CHECK (billing_status IN ('manual', 'trialing', 'active', 'past_due', 'canceled'));

CREATE UNIQUE INDEX IF NOT EXISTS orgs_stripe_customer_id_idx
  ON public.orgs (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS orgs_stripe_subscription_id_idx
  ON public.orgs (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- ── 5. Security: block self role/org_id changes ─────────────────────────────
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon') THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Not allowed to change your own role'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.org_id IS DISTINCT FROM OLD.org_id THEN
      RAISE EXCEPTION 'Not allowed to change your own organisation'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_privilege_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- ── 6. Storage buckets ──────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('org-assets', 'org-assets', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  ('avatars', 'avatars', true, 5242880, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  ('lead-photos', 'lead-photos', true, 10485760, ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime'])
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- ── 7. Verify ───────────────────────────────────────────────────────────────
-- SELECT id, name, slug, subscription_tier, brand_id FROM public.orgs;
-- SELECT id, email, role, org_id, phone FROM public.profiles LIMIT 20;
