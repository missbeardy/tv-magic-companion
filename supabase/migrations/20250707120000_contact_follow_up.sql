-- Contact follow-up: track attempts, rollover to retry phases, unable-to-contact lost reason

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS last_contact_attempted_at timestamptz,
  ADD COLUMN IF NOT EXISTS contact_attempt_round smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lost_reason text;

COMMENT ON COLUMN leads.contact_attempt_round IS
  '0 = first contact_attempted cycle; 1–5 = second through sixth attempt wait';
COMMENT ON COLUMN leads.lost_reason IS
  'e.g. unable_to_contact when auto-closed after max contact attempts';

-- Backfill last_contact_attempted_at for leads already in contact_attempted
UPDATE leads l
SET last_contact_attempted_at = sub.latest_at
FROM (
  SELECT e.lead_id, MAX(e.created_at) AS latest_at
  FROM lead_events e
  WHERE e.event_type IN ('call_attempted', 'sms_attempted', 'contact_attempted')
     OR (e.event_type = 'status_change' AND e.payload->>'to_status' = 'contact_attempted')
  GROUP BY e.lead_id
) sub
WHERE l.id = sub.lead_id
  AND l.status = 'contact_attempted'
  AND l.last_contact_attempted_at IS NULL;

UPDATE leads
SET last_contact_attempted_at = created_at
WHERE status = 'contact_attempted'
  AND last_contact_attempted_at IS NULL;
