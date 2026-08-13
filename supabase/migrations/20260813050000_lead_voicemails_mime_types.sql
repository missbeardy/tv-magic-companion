-- Widen lead-voicemails allowed_mime_types to cover every extension the poller accepts.
--
-- Found in production 13-08-2026: 3CX attaches the recording as
-- `application/octet-stream`, not `audio/wav`. Detection matched on the `.wav`
-- filename, so the message was picked up — but Storage rejected the upload against
-- the audio-only allowed_mime_types, processVoicemail threw, the claim rolled back,
-- and both a poller voicemail AND a short CloudMailin one produced no lead at all.
--
-- The primary fix is in code (normaliseAudioContentType derives the stored type from
-- the filename, so octet-stream is never uploaded). This aligns the bucket with the
-- rest of VOICEMAIL_AUDIO_EXTENSIONS — .m4a and .ogg were accepted for detection but
-- had no matching MIME type here, so they would have hit the same wall.

update storage.buckets
set allowed_mime_types = array[
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/ogg'
]
where id = 'lead-voicemails';
