-- Read-only. Run against PROD (ref abnheynzugpicikxwwmv) to size the risk of the
-- 10 pending migrations in AUD-1-pending-migrations.md before applying any of them.
-- Nothing here writes data.

-- 1. Which features are currently gated above 'basic'? (flatten_tiers.sql zeroes this out)
SELECT feature_key, label, min_tier, default_enabled
FROM public.feature_flag_catalog
WHERE min_tier <> 'basic'
ORDER BY min_tier, feature_key;

-- 2. Of those, which are actually switched ON for a brand? (the ones that would
--    newly become available to a lower-tier org the moment flatten_tiers.sql runs)
SELECT bfs.feature_key, b.slug AS brand_slug, b.name AS brand_name, bfs.enabled, fc.min_tier
FROM public.brand_feature_switches bfs
JOIN public.brands b ON b.id = bfs.brand_id
JOIN public.feature_flag_catalog fc ON fc.feature_key = bfs.feature_key
WHERE fc.min_tier <> 'basic'
ORDER BY b.slug, bfs.feature_key;

-- 3. What subscription_tier is each live org actually on?
SELECT o.id, o.slug AS org_slug, o.subscription_tier, br.slug AS brand_slug
FROM public.orgs o
JOIN public.brands br ON br.id = o.brand_id
ORDER BY o.slug;

-- 4. Current supabase_realtime publication membership (lead_board_badges.sql
--    adds leads/lead_events if they're not already here)
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
ORDER BY tablename;

-- 5. Current grants on the two RPCs lock_counter_rpcs.sql revokes from anon/authenticated
SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_name IN ('increment_rate_limit', 'increment_ai_usage')
ORDER BY routine_name, grantee;
