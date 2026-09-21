-- In-app two-way SMS switch (default off) and customer_reply notification type.

INSERT INTO public.feature_flag_catalog (feature_key, label, description, default_enabled, min_tier, category)
VALUES (
  'two_way_sms',
  'In-App Two-Way SMS',
  'Send and receive customer SMS from the lead sheet instead of the device SMS app',
  false,
  'basic',
  'customer_communication'
)
ON CONFLICT (feature_key) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  min_tier = EXCLUDED.min_tier,
  category = EXCLUDED.category;

INSERT INTO public.brand_feature_switches (brand_id, feature_key, enabled)
SELECT b.id, 'two_way_sms', false
FROM public.brands b
LEFT JOIN public.brand_feature_switches bfs
  ON bfs.brand_id = b.id AND bfs.feature_key = 'two_way_sms'
WHERE bfs.brand_id IS NULL;

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
      'customer_reply',
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
