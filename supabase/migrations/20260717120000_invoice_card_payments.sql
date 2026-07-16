-- Card / Pay Now on invoice: Stripe Connect Standard, direct charges, lazy Checkout Sessions

-- The original paid_via CHECK constraint was declared inline with no explicit name, so
-- Postgres auto-generated one. Find it by inspecting its definition rather than guessing.
DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'public.invoices'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%paid_via%';

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.invoices DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE public.invoices
  ADD CONSTRAINT invoices_paid_via_check
  CHECK (paid_via IS NULL OR paid_via IN ('manual', 'stripe'));

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS public_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;

CREATE INDEX IF NOT EXISTS invoices_public_token_idx
  ON public.invoices(public_token);

ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS stripe_connect_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_connect_status text;

INSERT INTO public.feature_flag_catalog (feature_key, label, description, default_enabled, min_tier, category)
VALUES (
  'invoice_card_payments',
  'Card / Pay Now on Invoice',
  'Adds a Pay Now button to invoice emails; customer pays by card via the org''s connected Stripe account',
  false,
  'pro',
  'sales_job_completion'
)
ON CONFLICT (feature_key) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  default_enabled = EXCLUDED.default_enabled,
  min_tier = EXCLUDED.min_tier,
  category = EXCLUDED.category;
