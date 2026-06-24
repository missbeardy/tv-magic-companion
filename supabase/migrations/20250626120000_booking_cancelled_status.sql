-- Allow booking_cancelled lead status for cancelled calendar appointments
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check
  CHECK (status IN (
    'unassigned', 'assigned', 'contact_attempted', 'booked',
    'booking_cancelled', 'lost', 'completed', 'expired'
  ));
