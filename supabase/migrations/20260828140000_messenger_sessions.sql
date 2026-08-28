-- Native Facebook Messenger receptionist (replaces Botpress for South Brisbane).
-- Service-role webhook/cron writes; org members can read their own rows.

CREATE TABLE IF NOT EXISTS public.messenger_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  page_id text NOT NULL,
  psid text NOT NULL,
  conversation_id text NOT NULL,
  state text NOT NULL DEFAULT 'open'
    CHECK (state IN ('open', 'awaiting_suburb', 'submitted', 'closed')),
  name text,
  phone text,
  suburb text,
  service_needed text,
  out_of_area boolean NOT NULL DEFAULT false,
  phone_ask_count integer NOT NULL DEFAULT 0,
  awaiting_suburb_until timestamptz,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (page_id, psid)
);

CREATE INDEX IF NOT EXISTS messenger_sessions_org_id_idx
  ON public.messenger_sessions (org_id);

CREATE INDEX IF NOT EXISTS messenger_sessions_awaiting_idx
  ON public.messenger_sessions (awaiting_suburb_until)
  WHERE state = 'awaiting_suburb' AND awaiting_suburb_until IS NOT NULL;

COMMENT ON TABLE public.messenger_sessions IS
  'Per-PSID Facebook Messenger receptionist state for the native Meta webhook bot.';

ALTER TABLE public.messenger_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS messenger_sessions_platform_admin ON public.messenger_sessions;
CREATE POLICY messenger_sessions_platform_admin ON public.messenger_sessions
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS messenger_sessions_org_read ON public.messenger_sessions;
CREATE POLICY messenger_sessions_org_read ON public.messenger_sessions
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

ALTER TABLE public.org_facebook_pages
  ADD COLUMN IF NOT EXISTS page_access_token text,
  ADD COLUMN IF NOT EXISTS instagram_business_account_id text;
