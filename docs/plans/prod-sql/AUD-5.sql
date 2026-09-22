-- AUD-5: make the Messenger receptionist per-org.
-- Copy of supabase/migrations/20260922110000_messenger_org_config.sql, plus
-- a backfill of TV Magic's config so the assembled prompt matches what the
-- old hardcoded MESSENGER_SYSTEM_PROMPT said (see api/_lib/messengerKb.ts
-- git history / docs/kb/tvmagic-south-brisbane/ for the original text).
--
-- Note (checked 22-09-2026): the native Messenger bot has never actually
-- processed a live message in prod — messenger_sessions has 0 rows despite
-- inbound_messenger being on and org_facebook_pages having a real page
-- token. Botpress is what's live on the Page today (confirmed via its own
-- Gen-AI agent producing the 47 existing Messenger leads). This backfill is
-- precautionary, not a live-behaviour-preserving change for a real customer
-- right now — but it's what makes the org "ready" if the Page is ever cut
-- over from Botpress to this app's /api/meta-webhook.

-- ============================================================
-- READ-ONLY VERIFY (run first)
-- ============================================================
-- The three messenger_* / service_area_note columns don't exist yet — that's
-- what the migration below adds. This just confirms the org row itself and
-- the columns that already exist (ai_context, service_types) before you run it.
SELECT slug, name, ai_context, service_types
FROM public.orgs
WHERE slug = 'default';

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'orgs'
  AND column_name IN ('messenger_business_name', 'messenger_contact_phone', 'service_area_note');
-- expect: 0 rows before the migration runs, 3 rows after

-- ============================================================
-- MIGRATION (idempotent)
-- ============================================================

ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS messenger_business_name text,
  ADD COLUMN IF NOT EXISTS messenger_contact_phone text,
  ADD COLUMN IF NOT EXISTS service_area_note text;

COMMENT ON COLUMN public.orgs.messenger_business_name IS
  'Business name the native Messenger receptionist introduces itself as.';
COMMENT ON COLUMN public.orgs.messenger_contact_phone IS
  'Phone number the Messenger receptionist may give out. Null = the bot skips the AI and logs to unrouted_inbound.';
COMMENT ON COLUMN public.orgs.service_area_note IS
  'Free-text out-of-area / service-boundary guidance appended to the Messenger system prompt.';

ALTER TABLE public.unrouted_inbound
  DROP CONSTRAINT IF EXISTS unrouted_inbound_channel_check;

ALTER TABLE public.unrouted_inbound
  ADD CONSTRAINT unrouted_inbound_channel_check
  CHECK (channel IN ('sms', 'call', 'voicemail', 'email', 'facebook_lead', 'campaign_visualise', 'messenger'));

ALTER TABLE public.unrouted_inbound
  DROP CONSTRAINT IF EXISTS unrouted_inbound_reason_check;

ALTER TABLE public.unrouted_inbound
  ADD CONSTRAINT unrouted_inbound_reason_check
  CHECK (reason IN ('no_mapping', 'unknown_tag', 'no_tag', 'not_configured'));

-- ============================================================
-- BACKFILL — TV Magic South Brisbane (org slug 'default')
-- ============================================================

UPDATE public.orgs
SET
  messenger_business_name = 'TV Magic South Brisbane',
  messenger_contact_phone = '0449 947 247',
  service_area_note =
    'Based in South Brisbane. If the customer is clearly not in the Brisbane area, still take the lead and mark it out of area — do not send them to another franchise number. Electrical work is only offered within Brisbane; other services can still be taken further out, a technician will confirm.',
  ai_context = 'South Brisbane Antenna Installation has been solving TV reception issues for Brisbane residents and businesses for over a decade, on high roofs, low roofs, buildings and unit blocks. Handles new antenna installs; reception repair (pixelation, flickering, glitchy or missing audio, rodent-chewed cabling, perished splitters, antenna, TV points, tuner faults) and manual tuning; wall-mounting TVs; extra TV points; outdoor TVs. Franchise page: https://www.tvmagic.com.au/south-brisbane-antenna-installation'
WHERE slug = 'default'
  AND messenger_contact_phone IS NULL;
