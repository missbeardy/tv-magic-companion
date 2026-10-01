-- AUD-33: move the /api/webhook-new-lead shared secret out of the trigger definition and into Vault.
--
-- Today `alert_managers_new_lead` (AFTER INSERT on public.leads) is a Database Webhook, i.e.
-- supabase_functions.http_request(...) with the x-supabase-webhook-secret header written literally
-- into the trigger args — readable by anyone who can read pg_trigger or a schema dump, and
-- unrotatable without redefining the trigger.
--
-- Run in the Supabase SQL editor for project abnheynzugpicikxwwmv, one PART at a time.
-- PART 1 changes no behaviour (same secret, same URL, same payload shape). PART 2 rotates.

------------------------------------------------------------------------------------------------
-- PART 1 — switch to Vault, same secret. Zero downtime.
------------------------------------------------------------------------------------------------
BEGIN;

-- Seed Vault with the CURRENT value, lifted from the trigger itself so nobody copies it by hand.
SELECT vault.create_secret(
  (SELECT m[1]
     FROM pg_trigger t,
          regexp_matches(pg_get_triggerdef(t.oid), 'x-supabase-webhook-secret":\s*"([^"]+)"') m
    WHERE t.tgrelid = 'public.leads'::regclass
      AND t.tgname = 'alert_managers_new_lead'),
  'supabase_webhook_secret',
  'x-supabase-webhook-secret for /api/webhook-new-lead; must equal Vercel SUPABASE_WEBHOOK_SECRET (AUD-33)'
);

-- Same payload shape supabase_functions.http_request sends; the handler reads body.record.
CREATE OR REPLACE FUNCTION public.notify_webhook_new_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  webhook_secret text;
BEGIN
  SELECT decrypted_secret INTO webhook_secret
    FROM vault.decrypted_secrets
   WHERE name = 'supabase_webhook_secret';

  IF webhook_secret IS NULL THEN
    RAISE WARNING 'AUD-33: supabase_webhook_secret missing from vault; new-lead alert skipped';
    RETURN NEW;
  END IF;

  PERFORM net.http_post(
    url := 'https://tv-magic-companion.vercel.app/api/webhook-new-lead',
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', to_jsonb(NEW),
      'old_record', NULL
    ),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-supabase-webhook-secret', webhook_secret
    ),
    timeout_milliseconds := 5000
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_webhook_new_lead() FROM PUBLIC, anon, authenticated;

DROP TRIGGER alert_managers_new_lead ON public.leads;
CREATE TRIGGER alert_managers_new_lead
  AFTER INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.notify_webhook_new_lead();

-- Check: must return 0 — the secret is no longer in any trigger on leads.
SELECT count(*) AS literal_secrets_left
  FROM pg_trigger
 WHERE tgrelid = 'public.leads'::regclass
   AND pg_get_triggerdef(oid) ILIKE '%webhook-secret%';

COMMIT;

-- Smoke test: create a test lead in the app and confirm the manager alert arrives
-- (or: SELECT status_code, created FROM net._http_response ORDER BY created DESC LIMIT 5; expect 200).

------------------------------------------------------------------------------------------------
-- PART 2 — rotate. The old value has been sitting in pg_trigger, so treat it as exposed.
------------------------------------------------------------------------------------------------
-- 1. Generate a new value locally:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
-- 2. Set SUPABASE_WEBHOOK_SECRET to it in Vercel (Production) and redeploy.
-- 3. As soon as the deploy is live, run the line below with the same value.
--    Leads inserted between 2 and 3 get a 401 and no manager alert — keep the gap short.
--
-- SELECT vault.update_secret(
--   (SELECT id FROM vault.secrets WHERE name = 'supabase_webhook_secret'),
--   '<NEW VALUE>'
-- );

------------------------------------------------------------------------------------------------
-- ROLLBACK (PART 1) — recreate the Database Webhook from the dashboard (Database → Webhooks)
-- pointing at the same URL with the header, then:
--   DROP FUNCTION public.notify_webhook_new_lead();
------------------------------------------------------------------------------------------------
