-- AUD-10: remove hardcoded tenant values. The voicemail IMAP folder can now
-- come from the org row instead of only a global env var — getVoicemailMailboxConfig
-- prefers orgs.voicemail_imap_folder, then VOICEMAIL_IMAP_FOLDER, then the
-- current TV Magic default, so this is additive and safe to run any time.

ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS voicemail_imap_folder text;

COMMENT ON COLUMN public.orgs.voicemail_imap_folder IS
  'Per-org override for the Gmail/IMAP folder the voicemail poller reads (falls back to VOICEMAIL_IMAP_FOLDER env, then the TV Magic default).';
