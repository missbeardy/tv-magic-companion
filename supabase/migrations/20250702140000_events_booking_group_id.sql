-- Link mirrored calendar rows for manager team meetings (same slot, multiple attendees).
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS booking_group_id uuid;

CREATE INDEX IF NOT EXISTS events_booking_group_id_idx
  ON public.events (booking_group_id)
  WHERE booking_group_id IS NOT NULL;
