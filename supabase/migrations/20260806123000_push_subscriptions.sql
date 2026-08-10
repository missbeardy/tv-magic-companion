-- T1.12 Self-hosted Web Push: bring the dormant push_subscriptions table into service.
--
-- The table already exists from 20250622120000_initial_schema.sql (id, user_id,
-- endpoint UNIQUE, p256dh, auth, created_at) but was never written to — it is the
-- leftover of the abandoned web-push attempt noted in docs/PROJECT.md:66. This
-- migration adds the delivery-health columns the sender needs and replaces the
-- catch-all FOR ALL policy with explicit per-verb ones.
--
-- Deliberately NOT added: notification_prefs / notification_log. Per-event dedupe
-- already happens at each call site and the in-app bell lives in public.notifications.

ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.orgs(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS failure_count integer NOT NULL DEFAULT 0;

-- Send-path scan: "live subscriptions for these users". Rows are dropped from the
-- send query after 3 consecutive soft failures (429/5xx).
CREATE INDEX IF NOT EXISTS push_subscriptions_user_active_idx
  ON public.push_subscriptions (user_id) WHERE failure_count < 3;

CREATE INDEX IF NOT EXISTS push_subscriptions_org_id_idx
  ON public.push_subscriptions (org_id);

COMMENT ON TABLE public.push_subscriptions IS
  'W3C Web Push subscriptions (VAPID). Written by the client via RLS; read by the service-role sender in api/_lib/webPush.ts. Rows are deleted on a 404/410 from the push service.';

-- Replace the FOR ALL catch-all with explicit per-verb policies, matching the
-- convention used by the newer tables. Platform admins can read and prune.
DROP POLICY IF EXISTS push_subscriptions_own ON public.push_subscriptions;

DROP POLICY IF EXISTS push_subscriptions_select ON public.push_subscriptions;
CREATE POLICY push_subscriptions_select ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_platform_admin());

DROP POLICY IF EXISTS push_subscriptions_insert ON public.push_subscriptions;
CREATE POLICY push_subscriptions_insert ON public.push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subscriptions_update ON public.push_subscriptions;
CREATE POLICY push_subscriptions_update ON public.push_subscriptions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS push_subscriptions_delete ON public.push_subscriptions;
CREATE POLICY push_subscriptions_delete ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_platform_admin());

-- Per-brand transport switch. Default off: OneSignal stays the delivery path until
-- a brand is explicitly flipped over.
INSERT INTO public.feature_flag_catalog (feature_key, label, description, default_enabled, min_tier, category)
VALUES (
  'native_web_push',
  'Native Web Push',
  'Deliver push notifications directly from the app via Web Push (VAPID) instead of relaying through OneSignal',
  false,
  'basic',
  'team_operations'
)
ON CONFLICT (feature_key) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  min_tier = EXCLUDED.min_tier,
  category = EXCLUDED.category;

INSERT INTO public.brand_feature_switches (brand_id, feature_key, enabled)
SELECT b.id, 'native_web_push', false
FROM public.brands b
LEFT JOIN public.brand_feature_switches bfs
  ON bfs.brand_id = b.id AND bfs.feature_key = 'native_web_push'
WHERE bfs.brand_id IS NULL;
