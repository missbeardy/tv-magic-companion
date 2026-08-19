-- Per-brand switch for the weekly leaderboard nudge (T1.16 follow-up).
--
-- Gates the *cron send*, not the page. The leaderboard itself stays ungated — this
-- only controls whether the Friday reminder goes to the manager and whether the team
-- gets told the week is in. A weekly push to every employee is exactly the kind of
-- thing that needs a fast off switch if the team finds it noisy.
--
-- Default OFF. `isFeatureEnabledForOrg` returns `catalogRow?.default_enabled === true`,
-- so deploying the cron ahead of this migration is safe by construction: with no
-- catalog row the sweep finds zero enabled orgs and sends nothing.

INSERT INTO public.feature_flag_catalog (feature_key, label, description, default_enabled, min_tier, category)
VALUES (
  'weekly_leaderboard_nudge',
  'Weekly Leaderboard Nudge',
  'Friday reminder to the manager to post results, then a notification to the team when the week is in',
  false,
  'basic',
  'team_operations'
)
ON CONFLICT (feature_key) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  min_tier = EXCLUDED.min_tier,
  category = EXCLUDED.category;

INSERT INTO public.brand_feature_switches (brand_id, feature_key, enabled)
SELECT b.id, 'weekly_leaderboard_nudge', false
FROM public.brands b
LEFT JOIN public.brand_feature_switches bfs
  ON bfs.brand_id = b.id AND bfs.feature_key = 'weekly_leaderboard_nudge'
WHERE bfs.brand_id IS NULL;
