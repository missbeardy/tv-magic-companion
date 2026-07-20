-- T2.1 / Package 6: auto-send Google review SMS when an invoice is marked paid.
-- Catalog insert only — behaviour is gated per brand via feature switches.

INSERT INTO public.feature_flag_catalog (feature_key, label, description, default_enabled, min_tier, category)
VALUES (
  'auto_review_on_paid',
  'Auto Review Request on Paid',
  'When an invoice is marked paid (card or manual), automatically SMS the customer a Google review link if review requests are also enabled and one has not already been sent for the lead',
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
