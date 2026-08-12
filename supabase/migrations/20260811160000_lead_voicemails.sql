-- Voicemail recordings: storage + idempotency for the CloudMailin/IMAP dual path.
--
-- 3CX emails each voicemail to the ops mailbox, which auto-forwards to CloudMailin.
-- CloudMailin rejects any message over 524,288 bytes:
--
--   552 Message size exceeds the allowed size for this account (524288)
--
-- 3CX records PCM mono 8 kHz 16-bit = 16 KB/sec, and base64 inflates by ~1.33x, so the
-- effective ceiling is roughly 25 SECONDS of speech. Measured against a real bounced
-- sample: 26.6s -> 425,646 bytes raw -> ~554 KB encoded -> rejected. Every voicemail
-- longer than that has been silently lost — no lead, no callback.
--
-- An IMAP poller now reads the original mail straight from the mailbox. Both transports
-- run the same processor, so this table has to make double-delivery impossible:
-- `rfc_message_id` is UNIQUE and the insert itself is the claim. Gmail's auto-forward
-- preserves Message-ID, so both paths derive the same key for the same voicemail.
--
-- The row is also written BEFORE transcription. Previously a Whisper failure discarded
-- the audio entirely and left the tech with "please check 3CX manually"; now the
-- recording survives regardless and is playable on the lead.

create table if not exists public.lead_voicemails (
  id                  uuid primary key default gen_random_uuid(),
  -- Nullable: the audio is stored before the lead exists (or is matched), then linked.
  lead_id             uuid references public.leads(id) on delete cascade,
  org_id              uuid not null references public.orgs(id) on delete cascade,
  -- Null only while an upload is in flight; the claim row is deleted if it fails.
  storage_path        text,
  mime_type           text,
  file_name           text,
  byte_size           integer,
  -- Raw 3CX strings. Deliberately not parsed to timestamptz: the PBX sends
  -- 'Monday, July 27, 2026 11:55:14 AM' with no zone, so any parse would invent one.
  duration_text       text,
  received_text       text,
  caller_phone        text,
  rfc_message_id      text not null,
  source              text not null check (source in ('cloudmailin', 'imap_poll')),
  transcription_status text not null default 'pending'
                        check (transcription_status in ('pending', 'succeeded', 'failed')),
  created_at          timestamptz not null default now()
);

-- The concurrency lock. A 5-minute poll can overlap the instant webhook, so both
-- transports race the same INSERT and the loser (23505) backs off without creating a lead.
create unique index if not exists lead_voicemails_message_id_idx
  on public.lead_voicemails (rfc_message_id);

create index if not exists lead_voicemails_lead_idx
  on public.lead_voicemails (lead_id);

alter table public.lead_voicemails enable row level security;

-- Read-only for the app; every write goes through the service role in api/_lib.
drop policy if exists lead_voicemails_org_read on public.lead_voicemails;
create policy lead_voicemails_org_read on public.lead_voicemails
  for select to authenticated
  using (org_id = public.current_user_org_id());

-- Private bucket. Matches the lead-photos lockdown in 20260710120000.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'lead-voicemails',
  'lead-voicemails',
  false,
  26214400,
  array['audio/wav', 'audio/x-wav', 'audio/wave', 'audio/mpeg', 'audio/mp3']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Objects are stored at {org_id}/{uuid}.wav, so the first path segment is the tenant
-- boundary — the same shape lead_photos_authenticated_read relies on. No INSERT/UPDATE/
-- DELETE policy: only the service role writes here.
drop policy if exists lead_voicemails_authenticated_read on storage.objects;
create policy lead_voicemails_authenticated_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'lead-voicemails'
    and (
      (storage.foldername(name))[1] = public.current_user_org_id()::text
      or public.is_platform_admin()
    )
  );
