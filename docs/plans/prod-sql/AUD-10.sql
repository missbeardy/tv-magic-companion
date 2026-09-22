-- AUD-10: remove hardcoded tenant values (voicemail IMAP folder column only —
-- everything else in this card is pure app code / env vars, no other SQL).

-- ============================================================
-- READ-ONLY VERIFY (run first)
-- ============================================================
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'orgs' AND column_name = 'voicemail_imap_folder';
-- expect: 0 rows before the migration runs, 1 row after

-- ============================================================
-- MIGRATION (idempotent)
-- ============================================================

ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS voicemail_imap_folder text;

COMMENT ON COLUMN public.orgs.voicemail_imap_folder IS
  'Per-org override for the Gmail/IMAP folder the voicemail poller reads (falls back to VOICEMAIL_IMAP_FOLDER env, then the TV Magic default).';

-- No backfill needed: leaving it NULL for the live client (org slug 'default')
-- preserves today's behaviour exactly (env var, then the hardcoded TV Magic
-- folder name) — see api/_lib/voicemailMailbox.ts.
