-- Structured visual email template documents per franchise (org).
-- Compiled subject/html continue to live in orgs.email_templates for the send path.

ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS email_template_docs jsonb NOT NULL DEFAULT '{}'::jsonb;
