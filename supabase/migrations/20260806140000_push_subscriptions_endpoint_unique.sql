-- Prod push_subscriptions was created without the UNIQUE(endpoint) that the
-- initial schema and the client upsert (onConflict: 'endpoint') both assume.
-- Without it every subscribe returns 400: "no unique or exclusion constraint
-- matching the ON CONFLICT specification".
-- Dev already had push_subscriptions_endpoint_key from the initial schema.

CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_endpoint_key
  ON public.push_subscriptions (endpoint);

-- Leftover catch-all from the abandoned first attempt (named differently than
-- push_subscriptions_own, so the T1.12 migration did not drop it).
DROP POLICY IF EXISTS "Users own their subscriptions" ON public.push_subscriptions;
