-- Solo vs team operation mode + Facebook Page routing for inbound Messenger / Lead Ads.

ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS operation_mode text NOT NULL DEFAULT 'team';

ALTER TABLE public.orgs
  DROP CONSTRAINT IF EXISTS orgs_operation_mode_check;

ALTER TABLE public.orgs
  ADD CONSTRAINT orgs_operation_mode_check
  CHECK (operation_mode IN ('solo', 'team'));

COMMENT ON COLUMN public.orgs.operation_mode IS
  'solo = owner-operator (no assignment pool); team = manager assigns technicians';

CREATE TABLE IF NOT EXISTS public.org_facebook_pages (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  page_id    text NOT NULL UNIQUE,
  page_name  text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_facebook_pages_org_id_idx ON public.org_facebook_pages(org_id);

ALTER TABLE public.org_facebook_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_facebook_pages_platform_admin ON public.org_facebook_pages;
CREATE POLICY org_facebook_pages_platform_admin ON public.org_facebook_pages
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS org_facebook_pages_org_read ON public.org_facebook_pages;
CREATE POLICY org_facebook_pages_org_read ON public.org_facebook_pages
  FOR SELECT
  USING (org_id = public.current_user_org_id());
