-- Weekly "up for grabs" prize: a manager-authored spotlight shown on the leaderboard,
-- one row per (org, week), off by default until a manager turns it on.
--
-- Modeled directly on weekly_leaderboard_entries (20260819120000): same week-anchoring,
-- same org scoping, same manager/platform_admin-only write policy, no DELETE policy —
-- a manager corrects a prize by editing it (including switching is_visible back off),
-- never by removing the row.

CREATE TABLE IF NOT EXISTS public.weekly_prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  -- Monday of the Mon-Sun week this prize is for. Enforced below.
  week_start date NOT NULL,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  photo_url text,
  -- Off by default: a fresh week starts with no prize showing until a manager
  -- explicitly turns it on. This one column is the entire on/off gate for the feature.
  is_visible boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT weekly_prizes_title_not_blank CHECK (btrim(title) <> ''),
  -- ISO day-of-week 1 = Monday. A Sunday-anchored or mid-week date would silently
  -- split one week into two prizes, so it is rejected at the database.
  CONSTRAINT weekly_prizes_week_start_is_monday
    CHECK (EXTRACT(ISODOW FROM week_start) = 1),
  CONSTRAINT weekly_prizes_org_week_key
    UNIQUE (org_id, week_start)
);

COMMENT ON TABLE public.weekly_prizes IS
  'Manager-authored "up for grabs this week" spotlight shown on the leaderboard. Off by '
  'default (is_visible); see src/lib/weeklyPrize.ts and src/pages/LeaderboardPage.tsx.';

COMMENT ON COLUMN public.weekly_prizes.week_start IS
  'Monday (local) that starts the Mon-Sun week this prize applies to. Constrained to ISODOW = 1.';

COMMENT ON COLUMN public.weekly_prizes.is_visible IS
  'Manager on/off toggle. False (the default) hides the prize from everyone, including on '
  'a week with content already filled in — a manager can prepare a prize before switching it on.';

-- The page loads exactly one week for one org at a time.
CREATE INDEX IF NOT EXISTS weekly_prizes_org_week_idx
  ON public.weekly_prizes (org_id, week_start);

CREATE OR REPLACE FUNCTION public.touch_weekly_prizes_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS weekly_prizes_touch_updated_at ON public.weekly_prizes;
CREATE TRIGGER weekly_prizes_touch_updated_at
BEFORE UPDATE ON public.weekly_prizes
FOR EACH ROW
EXECUTE FUNCTION public.touch_weekly_prizes_updated_at();

ALTER TABLE public.weekly_prizes ENABLE ROW LEVEL SECURITY;

-- Everyone in the org reads every row (including is_visible = false) so a manager
-- previewing an unpublished prize sees the same row the client will later show once
-- switched on. The UI, not RLS, hides an invisible prize from non-managers.
DROP POLICY IF EXISTS weekly_prizes_select_org ON public.weekly_prizes;
CREATE POLICY weekly_prizes_select_org ON public.weekly_prizes
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

-- Only managers/platform admins write. Employees are read-only by policy, not just by UI.
DROP POLICY IF EXISTS weekly_prizes_manager_insert ON public.weekly_prizes;
CREATE POLICY weekly_prizes_manager_insert ON public.weekly_prizes
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('manager', 'platform_admin')
    )
  );

DROP POLICY IF EXISTS weekly_prizes_manager_update ON public.weekly_prizes;
CREATE POLICY weekly_prizes_manager_update ON public.weekly_prizes
  FOR UPDATE TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('manager', 'platform_admin')
    )
  )
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('manager', 'platform_admin')
    )
  );

-- No DELETE policy on purpose: see the header comment.
