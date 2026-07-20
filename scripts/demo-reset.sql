-- Demo org reset (T2.2). Replace the UUID before running.
-- NEVER run against the live TV Magic South Brisbane org.

-- \set demo_org_id '00000000-0000-0000-0000-000000000000'

BEGIN;

DELETE FROM public.lead_events
WHERE org_id = :'demo_org_id';

DELETE FROM public.invoices
WHERE org_id = :'demo_org_id';

DELETE FROM public.quotes
WHERE org_id = :'demo_org_id';

DELETE FROM public.events
WHERE org_id = :'demo_org_id';

DELETE FROM public.leads
WHERE org_id = :'demo_org_id';

-- Optional: wipe imported demo customers
-- DELETE FROM public.customers WHERE org_id = :'demo_org_id';

COMMIT;
