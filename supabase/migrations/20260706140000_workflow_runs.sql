-- Platform-scoped workflow execution log for operator tooling.

CREATE TABLE public.workflow_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.orgs(id),
  workflow_key text NOT NULL,
  trigger_channel text,
  trigger_summary jsonb,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','succeeded','partial','failed')),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE TABLE public.workflow_run_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.workflow_runs(id) ON DELETE CASCADE,
  node_id text NOT NULL,
  seq int NOT NULL,
  status text NOT NULL
    CHECK (status IN ('succeeded','failed','skipped')),
  output jsonb,
  error jsonb,
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL
);

CREATE INDEX workflow_runs_org_started_idx
  ON public.workflow_runs (org_id, started_at DESC);
CREATE INDEX workflow_runs_key_started_idx
  ON public.workflow_runs (workflow_key, started_at DESC);
CREATE INDEX workflow_runs_status_started_idx
  ON public.workflow_runs (status, started_at DESC);
CREATE INDEX workflow_run_steps_run_seq_idx
  ON public.workflow_run_steps (run_id, seq);

ALTER TABLE public.workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_run_steps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS workflow_runs_platform_admin ON public.workflow_runs;
CREATE POLICY workflow_runs_platform_admin ON public.workflow_runs
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS workflow_run_steps_platform_admin ON public.workflow_run_steps;
CREATE POLICY workflow_run_steps_platform_admin ON public.workflow_run_steps
  FOR ALL TO authenticated
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

COMMENT ON TABLE public.workflow_runs IS
  'Platform-scoped workflow execution log (operator tooling).';
COMMENT ON TABLE public.workflow_run_steps IS
  'Per-step records for workflow_runs; cascades on run delete.';
