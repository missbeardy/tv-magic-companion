-- Switches, not subscription tier, gate product features. Keep subscription_tier for billing display.

UPDATE public.feature_flag_catalog
SET min_tier = 'basic'
WHERE min_tier IS DISTINCT FROM 'basic';
