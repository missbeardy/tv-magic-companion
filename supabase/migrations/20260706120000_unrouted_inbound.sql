-- Platform-scoped capture of inbound webhooks that could not be routed to an org.

CREATE TABLE public.unrouted_inbound (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel text NOT NULL CHECK (channel IN ('sms', 'call', 'voicemail', 'email')),
  identifier text,
  reason text NOT NULL CHECK (reason IN ('no_mapping', 'unknown_tag', 'no_tag')),
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE public.unrouted_inbound ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS unrouted_inbound_platform_admin ON public.unrouted_inbound;
CREATE POLICY unrouted_inbound_platform_admin ON public.unrouted_inbound
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

CREATE INDEX unrouted_inbound_created_at_idx ON public.unrouted_inbound (created_at DESC);
CREATE INDEX unrouted_inbound_unresolved_idx ON public.unrouted_inbound (created_at DESC)
  WHERE resolved_at IS NULL;

COMMENT ON TABLE public.unrouted_inbound IS
  'Platform-scoped capture of inbound webhooks that could not be routed to an org.';
