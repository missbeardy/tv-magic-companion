-- Per-org extraction labels and brand Messenger prompt.
-- Do not put live TV Magic copy in this file; backfill via Management API.

ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS service_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_context text;

ALTER TABLE public.brands
  ADD COLUMN IF NOT EXISTS messenger_prompt text;

COMMENT ON COLUMN public.orgs.service_types IS
  'Allowed service_type labels for inbound extraction. Empty = generic Other.';
COMMENT ON COLUMN public.orgs.ai_context IS
  'Optional extra context appended to inbound extraction prompts.';
COMMENT ON COLUMN public.brands.messenger_prompt IS
  'System prompt for the native Messenger receptionist. Null = bot refuses to run.';
