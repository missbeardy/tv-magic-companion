-- Internal Support Messaging (v1): user ↔ platform_admin 1:1 threads + one-way announcements.
-- Zero new Vercel functions. All access gated by RLS; live updates via Realtime.
-- Reuses existing helpers: public.is_platform_admin(), profiles.org_id for org resolution.

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 1 — support_messages (one thread per owner user_id)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.support_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,   -- thread owner
  sender_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,   -- who wrote it
  body        text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_messages_user_created_idx
  ON public.support_messages (user_id, created_at);
CREATE INDEX IF NOT EXISTS support_messages_org_idx
  ON public.support_messages (org_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE 2 — platform_announcements (one-way broadcast, admin writes / all read)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_announcements (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body        text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS platform_announcements_created_idx
  ON public.platform_announcements (created_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- org_id integrity: set server-side from the thread owner's profile.
-- SECURITY DEFINER because a platform_admin has no RLS read access to another
-- user's profile row; the function resolves org the same way current_user_org_id()
-- and notifyOrgUser() do. Never trusts client-supplied org_id.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_support_message_org_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_org uuid;
BEGIN
  SELECT org_id INTO owner_org FROM public.profiles WHERE id = NEW.user_id;
  IF owner_org IS NULL THEN
    RAISE EXCEPTION 'Thread owner % has no org_id; cannot post support message', NEW.user_id;
  END IF;
  NEW.org_id := owner_org;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_messages_set_org_id ON public.support_messages;
CREATE TRIGGER support_messages_set_org_id
  BEFORE INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_support_message_org_id();

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — support_messages
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_messages_select ON public.support_messages;
CREATE POLICY support_messages_select ON public.support_messages
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin());

DROP POLICY IF EXISTS support_messages_insert ON public.support_messages;
CREATE POLICY support_messages_insert ON public.support_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (user_id = auth.uid() OR public.is_platform_admin())
  );
-- No UPDATE, no DELETE policies: messages are immutable in v1.

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — platform_announcements
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.platform_announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_announcements_select ON public.platform_announcements;
CREATE POLICY platform_announcements_select ON public.platform_announcements
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS platform_announcements_insert ON public.platform_announcements;
CREATE POLICY platform_announcements_insert ON public.platform_announcements
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());
-- No UPDATE, no DELETE policies.

-- ─────────────────────────────────────────────────────────────────────────────
-- Realtime — publish both tables. postgres_changes enforces the SELECT policies
-- above per-subscriber (matches existing leads/notifications realtime usage).
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'support_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'platform_announcements'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_announcements;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Platform admin visibility of thread owners.
-- The admin inbox must show which user/org a thread belongs to. The existing
-- profiles_select policy only exposes same-org rows, so add a platform-admin
-- SELECT policy — mirrors the precedent in 20260707120000 (platform_admin SELECT
-- on leads/lead_events). Additive: existing profiles_select is left intact.
-- FLAG FOR REVIEW: this widens platform_admin read to all profile rows.
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS profiles_platform_admin_select ON public.profiles;
CREATE POLICY profiles_platform_admin_select ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- Feature flag — internal_messaging, default OFF (catalog + per-brand rows).
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.feature_flag_catalog (feature_key, label, description, default_enabled, min_tier, category)
VALUES (
  'internal_messaging',
  'Internal Support Messaging',
  'In-app 1:1 messaging with FieldBourne support plus a read-only announcements feed',
  false,
  'basic',
  'team_operations'
)
ON CONFLICT (feature_key) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  default_enabled = EXCLUDED.default_enabled,
  min_tier = EXCLUDED.min_tier,
  category = EXCLUDED.category;

INSERT INTO public.brand_feature_switches (brand_id, feature_key, enabled)
SELECT b.id, 'internal_messaging', false
FROM public.brands b
LEFT JOIN public.brand_feature_switches bfs
  ON bfs.brand_id = b.id AND bfs.feature_key = 'internal_messaging'
WHERE bfs.brand_id IS NULL;
