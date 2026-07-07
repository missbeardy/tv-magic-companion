-- Allow contact_follow_up (and any legacy types already in prod rows).
-- Rebuild CHECK from existing distinct types + known app types so ADD never fails on prod data.

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

DO $$
DECLARE
  type_list text;
BEGIN
  SELECT string_agg(quote_literal(t), ', ' ORDER BY t)
  INTO type_list
  FROM (
    SELECT DISTINCT type AS t
    FROM public.notifications
    UNION
    SELECT unnest(ARRAY[
      'new_lead',
      'lead_expired',
      'timer_low',
      'lead_assigned',
      'contact_follow_up',
      'calendar'
    ]::text[])
  ) s;

  IF type_list IS NOT NULL THEN
    EXECUTE format(
      'ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type IN (%s))',
      type_list
    );
  END IF;
END $$;
