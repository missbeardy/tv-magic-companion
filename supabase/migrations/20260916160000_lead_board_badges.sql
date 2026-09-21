-- Board badge + last-manual-SMS fields in one org-scoped view (security invoker so RLS holds).
-- Also publish leads / lead_events for filtered postgres_changes.

CREATE OR REPLACE VIEW public.lead_board_badges
WITH (security_invoker = true) AS
SELECT
  l.org_id,
  l.id AS lead_id,
  q.status AS latest_quote_status,
  q.accepted_at AS latest_quote_accepted_at,
  q.total_amount AS latest_quote_total_amount,
  q.scope AS latest_quote_scope,
  i.status AS latest_invoice_status,
  i.id AS latest_invoice_id,
  i.invoice_number AS latest_invoice_number,
  sms.note AS last_manual_sms_text,
  sms.created_at AS last_manual_sms_at
FROM public.leads l
LEFT JOIN LATERAL (
  SELECT status, accepted_at, total_amount, scope
  FROM public.quotes
  WHERE lead_id = l.id
  ORDER BY created_at DESC
  LIMIT 1
) q ON true
LEFT JOIN LATERAL (
  SELECT id, status, invoice_number
  FROM public.invoices
  WHERE lead_id = l.id
  ORDER BY created_at DESC
  LIMIT 1
) i ON true
LEFT JOIN LATERAL (
  SELECT note, created_at
  FROM public.lead_events
  WHERE lead_id = l.id
    AND event_type = 'sms_sent'
    AND COALESCE(payload->>'manual', '') = 'true'
  ORDER BY created_at DESC
  LIMIT 1
) sms ON true;

GRANT SELECT ON public.lead_board_badges TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'leads'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.leads;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'lead_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_events;
  END IF;
END $$;
