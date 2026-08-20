-- Separate "this person has left" from "this is a test account".
--
-- `is_hidden_test_profile` was the only lever available when Mitch Singe left TV Magic, so
-- he was flagged with it. The two states want opposite treatment in reporting: a test
-- profile is noise and should be scrubbed, a departed employee is history and should stay
-- for the period they worked. Worse, isProfileVisibleToViewer() shows a hidden profile only
-- to itself or its test_profile_owner_id — Mitch's owner is Demo Manager, so Nick could not
-- see Mitch or his history at all, the precise opposite of why he was hidden rather than
-- deleted.
--
-- departed_at is NULL for an active person. When set, the profile drops out of auto-assign,
-- manager alerts, pickers, the current leaderboard and app access, but every lead, event,
-- invoice and past leaderboard week they earned stays visible and attributed.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS departed_at timestamptz;

COMMENT ON COLUMN public.profiles.departed_at IS
  'When this person left the organisation. NULL means active. Excludes them from routing, '
  'alerts, pickers, the current leaderboard and sign-in, but retains all of their history. '
  'Distinct from is_hidden_test_profile, which means "test account" and scrubs history.';

-- Undo the workaround on the one person it was applied to. Guarded on the hidden flag so
-- this is a no-op in dev and on any re-run. Dated to his last sign-in rather than now(),
-- which is the last day we can prove he was working.
UPDATE public.profiles
SET departed_at = timestamptz '2026-06-21 00:00:00+10',
    is_hidden_test_profile = false,
    test_profile_owner_id = NULL
WHERE full_name = 'Mitch Singe'
  AND is_hidden_test_profile = true
  AND departed_at IS NULL;
