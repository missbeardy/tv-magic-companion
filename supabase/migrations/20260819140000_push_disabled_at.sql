-- Distinguish "never asked" from "explicitly turned off" for push notifications.
--
-- `profiles.push_enabled` is a boolean defaulting to false, so it cannot tell those two
-- states apart. reconcileSubscription() bailed on `push_enabled === false`, which meant
-- every user who had never been through the native opt-in — i.e. everyone, while
-- native_web_push was off — read as an explicit refusal and could never be migrated.
--
-- Worse, ProfilePage derives the toggle differently depending on the switch: with
-- native_web_push off it reads browser permission, with it on it reads push_enabled.
-- Flipping the switch would therefore have flipped six of eight TV Magic techs' toggles
-- from on to off without anyone touching them.
--
-- push_disabled_at is null unless disablePush() writes it, so absence means "no opinion
-- recorded", not "no".

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_disabled_at timestamptz;

COMMENT ON COLUMN public.profiles.push_disabled_at IS
  'Set by disablePush() when a user explicitly turns notifications off. NULL means no '
  'opt-out has ever been recorded — do not read NULL as a refusal. Supersedes push_enabled '
  'as the opt-out signal; push_enabled is retained for backwards compatibility with '
  'clients deployed before v1.1.181.';

-- Carry across the only opt-outs we can prove: a row that has push_enabled = false AND has
-- previously held a subscription must have been through disablePush(), because that is the
-- only path that sets the flag false after a subscription existed.
UPDATE public.profiles p
SET push_disabled_at = now()
WHERE p.push_enabled = false
  AND p.push_disabled_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.push_subscriptions ps WHERE ps.user_id = p.id
  );
