-- ============================================================================
--  DEV ONLY — four test technicians + two weeks of leaderboard results.
--
--  ⛔ NEVER RUN THIS AGAINST PRODUCTION (abnheynzugpicikxwwmv).
--     It creates real, login-capable auth users with a password written in
--     plain text below. It is for the dev project (rkzgikxxxmovqisxusae) only.
--
--  Deliberately NOT in supabase/migrations/ so it can never be applied by a
--  migration run. Paste it into the Supabase SQL editor for dev.
--
--  Safe to re-run: every insert is keyed on a fixed UUID and upserts.
--  Section 4 removes everything it created.
-- ============================================================================


-- ── 1. Check which org this will land in ────────────────────────────────────
-- Run this on its own FIRST. It picks the org that already has a manager —
-- i.e. the one you actually log into. If it returns more than one row, or the
-- wrong one, replace the whole `target_org` CTE below with a literal:
--     select 'your-org-uuid'::uuid as id

SELECT o.id, o.name, count(p.id) FILTER (WHERE p.role = 'employee') AS employees_now
FROM public.orgs o
LEFT JOIN public.profiles p ON p.org_id = o.id
GROUP BY o.id, o.name
ORDER BY count(p.id) DESC;


-- ── 2. Create the four technicians ──────────────────────────────────────────
-- Login: ava.bell@example.com … kit.vance@example.com   Password: TestPass123!
-- Being able to sign in as one of them is the only way to see the employee
-- view: the read-only board and the "You" card.

BEGIN;

WITH target_org AS (
  SELECT org_id AS id
  FROM public.profiles
  WHERE role IN ('manager', 'platform_admin') AND org_id IS NOT NULL
  GROUP BY org_id
  ORDER BY count(*) DESC
  LIMIT 1
),
people (id, email, full_name) AS (
  VALUES
    ('e0000000-0000-4000-8000-000000000001'::uuid, 'ava.bell@example.com',  'Ava Bell'),
    ('e0000000-0000-4000-8000-000000000002'::uuid, 'zed.cruz@example.com',  'Zed Cruz'),
    ('e0000000-0000-4000-8000-000000000003'::uuid, 'mo.reed@example.com',   'Mo Reed'),
    ('e0000000-0000-4000-8000-000000000004'::uuid, 'kit.vance@example.com', 'Kit Vance')
),
new_users AS (
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
  )
  SELECT
    '00000000-0000-0000-0000-000000000000',
    p.id,
    'authenticated',
    'authenticated',
    p.email,
    -- If this errors with "function crypt does not exist", prefix both calls
    -- with `extensions.` — pgcrypto lives in a different schema on some projects.
    crypt('TestPass123!', gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', p.full_name, 'role', 'employee'),
    '', '', '', ''
  FROM people p
  ON CONFLICT (id) DO NOTHING
  RETURNING id
)
INSERT INTO public.profiles (id, email, full_name, role, org_id, is_hidden_test_profile)
SELECT p.id, p.email, p.full_name, 'employee', t.id, false
FROM people p CROSS JOIN target_org t
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  role      = 'employee',
  org_id    = EXCLUDED.org_id;

-- GoTrue wants an identity row per provider before email/password sign-in works.
-- Display-only testing does not need this; logging in as them does.
INSERT INTO auth.identities (
  id, user_id, identity_data, provider, provider_id,
  last_sign_in_at, created_at, updated_at
)
SELECT
  gen_random_uuid(), u.id,
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  'email', u.id::text,
  now(), now(), now()
FROM auth.users u
WHERE u.id IN (
  'e0000000-0000-4000-8000-000000000001',
  'e0000000-0000-4000-8000-000000000002',
  'e0000000-0000-4000-8000-000000000003',
  'e0000000-0000-4000-8000-000000000004'
)
AND NOT EXISTS (
  SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email'
);

COMMIT;


-- ── 3. Two weeks of results, so the board has something to show ─────────────
-- Requires migration 20260819120000. Ranks are shuffled between the weeks on
-- purpose, so the movement arrows (▲/▼ vs last week) have something to report:
--
--   last week   Ava 1st · Kit 2nd · Zed 3rd · Mo 4th
--   this week   Zed 1st · Ava 2nd · Mo 3rd · Kit 4th
--   movement    Zed ▲2 · Mo ▲1 · Ava ▼1 · Kit ▼2
--
-- `date_trunc('week', …)` is Monday in Postgres, which is what the table's
-- ISODOW = 1 constraint requires. Anchored to Sydney so a late-Sunday run does
-- not write into next week.

BEGIN;

WITH target_org AS (
  SELECT org_id AS id
  FROM public.profiles
  WHERE role IN ('manager', 'platform_admin') AND org_id IS NOT NULL
  GROUP BY org_id
  ORDER BY count(*) DESC
  LIMIT 1
),
editor AS (
  SELECT p.id FROM public.profiles p, target_org t
  WHERE p.org_id = t.id AND p.role IN ('manager', 'platform_admin')
  ORDER BY p.created_at LIMIT 1
),
weeks AS (
  SELECT
    date_trunc('week', (now() AT TIME ZONE 'Australia/Sydney'))::date AS this_week,
    (date_trunc('week', (now() AT TIME ZONE 'Australia/Sydney')) - interval '7 days')::date AS last_week
),
results (technician_id, jobs_this, sales_this, jobs_last, sales_last) AS (
  VALUES
    ('e0000000-0000-4000-8000-000000000001'::uuid, 7, 1850.00,10, 3000.00),  -- Ava  ▼1
    ('e0000000-0000-4000-8000-000000000002'::uuid, 9, 2400.00, 4,  900.00),  -- Zed  ▲2
    ('e0000000-0000-4000-8000-000000000003'::uuid, 5, 1200.00, 2,  500.00),  -- Mo   ▲1
    ('e0000000-0000-4000-8000-000000000004'::uuid, 3,  640.00, 6, 1400.00)   -- Kit  ▼2
)
INSERT INTO public.weekly_leaderboard_entries
  (org_id, technician_id, week_start, jobs_completed, sales_amount, created_by, updated_by)
SELECT t.id, r.technician_id, w.this_week, r.jobs_this, r.sales_this, e.id, e.id
FROM results r, target_org t, weeks w, editor e
UNION ALL
SELECT t.id, r.technician_id, w.last_week, r.jobs_last, r.sales_last, e.id, e.id
FROM results r, target_org t, weeks w, editor e
ON CONFLICT (org_id, technician_id, week_start) DO UPDATE SET
  jobs_completed = EXCLUDED.jobs_completed,
  sales_amount   = EXCLUDED.sales_amount,
  updated_by     = EXCLUDED.updated_by;

COMMIT;


-- Confirm what landed.
SELECT p.full_name, e.week_start, e.jobs_completed, e.sales_amount
FROM public.weekly_leaderboard_entries e
JOIN public.profiles p ON p.id = e.technician_id
ORDER BY e.week_start DESC, e.sales_amount DESC;


-- ── 4. Undo — removes the four people and all their results ─────────────────
-- The profiles cascade from auth.users, and the leaderboard rows cascade from
-- profiles, so deleting the auth users is enough.
--
-- DELETE FROM auth.users WHERE id IN (
--   'e0000000-0000-4000-8000-000000000001',
--   'e0000000-0000-4000-8000-000000000002',
--   'e0000000-0000-4000-8000-000000000003',
--   'e0000000-0000-4000-8000-000000000004'
-- );
