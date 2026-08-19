-- Weekly team leaderboard: manager-maintained jobs/sales figures per employee, per ISO week.
--
-- Deliberately NOT derived from leads/invoices. The numbers a franchise wants on the
-- wall are the ones the owner reconciles at the end of the week (cash jobs, split
-- invoices, warranty work), so this is a hand-maintained scoreboard, not a report.
-- Reporting stays in the monthly snapshot tables.
--
-- One row per (org, technician, week). Missing rows are NOT an error: the page merges
-- the visible employee roster over whatever rows exist and shows zeros for the rest,
-- so a manager only ever types the people who actually did something.

CREATE TABLE IF NOT EXISTS public.weekly_leaderboard_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  technician_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Monday of the Mon-Sun week this row scores. Enforced below.
  week_start date NOT NULL,
  jobs_completed integer NOT NULL DEFAULT 0,
  sales_amount numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT weekly_leaderboard_entries_jobs_non_negative CHECK (jobs_completed >= 0),
  CONSTRAINT weekly_leaderboard_entries_sales_non_negative CHECK (sales_amount >= 0),
  -- ISO day-of-week 1 = Monday. A Sunday-anchored or mid-week date would silently
  -- split one week into two scoreboards, so it is rejected at the database.
  CONSTRAINT weekly_leaderboard_entries_week_start_is_monday
    CHECK (EXTRACT(ISODOW FROM week_start) = 1),
  CONSTRAINT weekly_leaderboard_entries_org_tech_week_key
    UNIQUE (org_id, technician_id, week_start)
);

COMMENT ON TABLE public.weekly_leaderboard_entries IS
  'Manager-maintained weekly scoreboard (jobs + sales) per employee. Hand-entered, not '
  'derived from leads/invoices — see src/lib/leaderboard.ts and src/pages/LeaderboardPage.tsx.';

COMMENT ON COLUMN public.weekly_leaderboard_entries.week_start IS
  'Monday (local) that starts the Mon-Sun week being scored. Constrained to ISODOW = 1.';

-- The page loads exactly one week for one org at a time.
CREATE INDEX IF NOT EXISTS weekly_leaderboard_entries_org_week_idx
  ON public.weekly_leaderboard_entries (org_id, week_start);

-- Integrity that a CHECK cannot express: the scored person must be an `employee` in
-- the same organisation as the row. Without this a manager could be scored, or a row
-- could point at another franchise's technician while still passing the RLS org check
-- (RLS validates the row's org_id, not the technician's).
CREATE OR REPLACE FUNCTION public.ensure_leaderboard_technician_is_org_employee()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tech_org uuid;
  tech_role text;
BEGIN
  SELECT p.org_id, p.role INTO tech_org, tech_role
  FROM public.profiles p
  WHERE p.id = NEW.technician_id;

  IF tech_org IS NULL THEN
    RAISE EXCEPTION 'weekly_leaderboard_entries: technician % has no profile', NEW.technician_id;
  END IF;

  IF tech_org <> NEW.org_id THEN
    RAISE EXCEPTION 'weekly_leaderboard_entries: technician % is not in org %',
      NEW.technician_id, NEW.org_id;
  END IF;

  IF tech_role <> 'employee' THEN
    RAISE EXCEPTION 'weekly_leaderboard_entries: technician % is %, not an employee',
      NEW.technician_id, tech_role;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS weekly_leaderboard_entries_validate ON public.weekly_leaderboard_entries;
CREATE TRIGGER weekly_leaderboard_entries_validate
BEFORE INSERT OR UPDATE ON public.weekly_leaderboard_entries
FOR EACH ROW
EXECUTE FUNCTION public.ensure_leaderboard_technician_is_org_employee();

ALTER TABLE public.weekly_leaderboard_entries ENABLE ROW LEVEL SECURITY;

-- Everyone in the org reads the whole board — that is the point of a leaderboard.
DROP POLICY IF EXISTS weekly_leaderboard_entries_select_org ON public.weekly_leaderboard_entries;
CREATE POLICY weekly_leaderboard_entries_select_org ON public.weekly_leaderboard_entries
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

-- Only managers/platform admins write. Employees are read-only by policy, not just by UI.
DROP POLICY IF EXISTS weekly_leaderboard_entries_manager_insert ON public.weekly_leaderboard_entries;
CREATE POLICY weekly_leaderboard_entries_manager_insert ON public.weekly_leaderboard_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('manager', 'platform_admin')
    )
  );

DROP POLICY IF EXISTS weekly_leaderboard_entries_manager_update ON public.weekly_leaderboard_entries;
CREATE POLICY weekly_leaderboard_entries_manager_update ON public.weekly_leaderboard_entries
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

-- No DELETE policy on purpose: a week is corrected by editing it back to zero, never
-- by removing history. Nothing in the app deletes a leaderboard row.
