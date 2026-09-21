-- Per-org SMS suppression list. STOP replies write here; sendBrandedSms refuses
-- to send when a row exists. Service-role only — no client policies (default deny).

CREATE TABLE IF NOT EXISTS public.sms_opt_outs (
  org_id uuid NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  phone text NOT NULL,
  opted_out_at timestamptz NOT NULL DEFAULT now(),
  source text,
  PRIMARY KEY (org_id, phone)
);

ALTER TABLE public.sms_opt_outs ENABLE ROW LEVEL SECURITY;
