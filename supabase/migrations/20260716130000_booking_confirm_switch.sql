-- Feature switch for customer booking confirmation SMS/email (previously unconditional — every
-- booking sent one with no way to turn it off). Defaults ON so existing orgs see no change;
-- managers/platform admins can now switch it off per brand.

INSERT INTO public.feature_flag_catalog (feature_key, label, description, default_enabled, min_tier, category)
VALUES (
  'booking_confirm',
  'Customer Booking Confirmation',
  'SMS + email with .ics calendar invite sent to the customer when a job is booked',
  true,
  'basic',
  'customer_communication'
)
ON CONFLICT (feature_key) DO UPDATE
SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  default_enabled = EXCLUDED.default_enabled,
  min_tier = EXCLUDED.min_tier,
  category = EXCLUDED.category;
