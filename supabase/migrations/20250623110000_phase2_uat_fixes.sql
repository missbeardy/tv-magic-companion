-- Phase 2 UAT fixes: org branding columns + platform admin org list
-- Safe to run in Supabase SQL Editor (public schema only).

-- ── Missing org columns (minimal dev schema may lack these) ──
ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS logo_url text,
  ADD COLUMN IF NOT EXISTS primary_color text NOT NULL DEFAULT '#004B93',
  ADD COLUMN IF NOT EXISTS secondary_color text NOT NULL DEFAULT '#00B4C5',
  ADD COLUMN IF NOT EXISTS support_phone text,
  ADD COLUMN IF NOT EXISTS support_email text,
  ADD COLUMN IF NOT EXISTS avg_job_value numeric NOT NULL DEFAULT 180,
  ADD COLUMN IF NOT EXISTS upsell_items jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ── Platform admin can see ALL orgs (not just their own) ──
DROP POLICY IF EXISTS orgs_platform_select ON public.orgs;
CREATE POLICY orgs_platform_select ON public.orgs
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- Managers can update their own org (franchise settings)
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
