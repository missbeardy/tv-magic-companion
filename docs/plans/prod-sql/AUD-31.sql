-- AUD-31: record already-applied migrations in the prod ledger. Bookkeeping only — no schema change.
--
-- Verified 28-09-2026: every object these create exists on prod, but the ledger stops at
-- 20260916011741. The card listed the six hardening migrations; the three after them
-- (campaign/quote switch, voicemail folder, SMS provider) are unrecorded too — orgs.website,
-- orgs.voicemail_imap_folder and orgs.sms_provider are all present.
--
-- Without these rows a `supabase db push` would try to re-apply them. That matters most for
-- 20260922100000: re-running it after 20260922140000 narrows the event policies back.
--
-- Run in the Supabase SQL editor for project abnheynzugpicikxwwmv. Safe to re-run.

INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES
  ('20260922090000', 'lock_org_privileged_columns'),
  ('20260922100000', 'split_leads_events_rls'),
  ('20260922110000', 'messenger_org_config'),
  ('20260922120000', 'extend_profile_lock_trigger'),
  ('20260922130000', 'trigger_guards_security_invoker'),
  ('20260922140000', 'drop_legacy_permissive_policies'),
  ('20260922150000', 'campaign_quote_switch'),
  ('20260922160000', 'voicemail_imap_folder_per_org'),
  ('20260923090000', 'org_sms_provider')
ON CONFLICT (version) DO NOTHING;

-- Check: expect 9 rows.
SELECT version, name FROM supabase_migrations.schema_migrations
WHERE version BETWEEN '20260922000000' AND '20260923999999'
ORDER BY version;
