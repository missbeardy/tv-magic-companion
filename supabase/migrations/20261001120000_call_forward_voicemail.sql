-- T1.20 Missed-call capture for any mobile (01-10-2026).
--
-- A tradie diverts unanswered calls (GSM **61/**67/**62) to a FieldBourne-owned
-- answering line. That line's voicemails arrive by provider webhook, not email, so
-- lead_voicemails gains a third transport. Additive only: existing rows keep their
-- source, and every existing org_phone_numbers row is an SMS number.

alter table public.lead_voicemails
  drop constraint if exists lead_voicemails_source_check;
alter table public.lead_voicemails
  add constraint lead_voicemails_source_check
  check (source in ('cloudmailin', 'imap_poll', 'call_forward'));

-- Voice answering lines live beside SMS numbers so DID → org routing is shared, but
-- the SMS inbound probe must never target a voice-only line.
alter table public.org_phone_numbers
  add column if not exists kind text not null default 'sms';
alter table public.org_phone_numbers
  drop constraint if exists org_phone_numbers_kind_check;
alter table public.org_phone_numbers
  add constraint org_phone_numbers_kind_check check (kind in ('sms', 'voice'));
