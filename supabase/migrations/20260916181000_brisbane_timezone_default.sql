-- Quiet hours and calendar math should default to Brisbane, not Perth.

ALTER TABLE public.orgs
  ALTER COLUMN timezone SET DEFAULT 'Australia/Brisbane';
