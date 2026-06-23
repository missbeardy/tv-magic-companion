-- Stripe billing per franchisee org (dev + production when ready)

ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS billing_status text NOT NULL DEFAULT 'manual'
    CHECK (billing_status IN ('manual', 'trialing', 'active', 'past_due', 'canceled'));

CREATE UNIQUE INDEX IF NOT EXISTS orgs_stripe_customer_id_idx
  ON public.orgs (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orgs_stripe_subscription_id_idx
  ON public.orgs (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
