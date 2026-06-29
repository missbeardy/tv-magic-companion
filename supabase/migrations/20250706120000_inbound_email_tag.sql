-- Per-org CloudMailin plus-address tag for inbound email routing.
-- FieldBourne ops forwards admin@fieldbourne → {base}+{tag}@cloudmailin.net

ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS inbound_email_tag text;

UPDATE public.orgs
SET inbound_email_tag = slug
WHERE inbound_email_tag IS NULL;

ALTER TABLE public.orgs
  ALTER COLUMN inbound_email_tag SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orgs_inbound_email_tag_idx
  ON public.orgs (inbound_email_tag);

COMMENT ON COLUMN public.orgs.inbound_email_tag IS
  'Plus-address tag for CloudMailin routing (e.g. tv-magic-sydney → base+tv-magic-sydney@cloudmailin.net)';
