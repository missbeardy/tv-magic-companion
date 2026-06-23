# Dev Environment Setup

This guide keeps **production TV Magic users untouched**. All platform work runs on a separate dev stack. You can roll back at any time by staying on `main` / production deploys.

## Your environments

| | Production (live TV Magic) | Development (platform work) |
|---|---------------------------|----------------------------|
| **Supabase** | [abnheynzugpicikxwwmv](https://supabase.com/dashboard/project/abnheynzugpicikxwwmv) | **New project you create below** |
| **Git branch** | `main` | `dev` or `feature/platform-saas` |
| **Vercel** | Current production deployment | Preview deploy from `dev` branch |

## Step 1 — Create a dev Supabase project

1. Open [Supabase Dashboard](https://supabase.com/dashboard) → **New project**.
2. Name it e.g. `tv-magic-companion-dev`.
3. Choose the same region as production (lower latency for AU users).
4. Set a strong database password and **save it** in your password manager.
5. Wait for the project to finish provisioning.

## Step 2 — Copy production schema into dev (one-time)

**Option A — Supabase CLI (recommended if you install the CLI)**

```powershell
# Link to PRODUCTION only to pull schema (read-only export)
npx supabase link --project-ref abnheynzugpicikxwwmv
npx supabase db dump --schema public -f supabase/seed/schema-from-prod.sql

# Link to DEV and apply
npx supabase link --project-ref YOUR_DEV_PROJECT_REF
npx supabase db push
# Or run migrations: npx supabase migration up
```

**Option B — Manual (no CLI)**

1. In **production** dashboard → SQL Editor → export table definitions, or use Table Editor to note structure.
2. In **dev** dashboard → SQL Editor → run the migration files in `supabase/migrations/` in order.
3. Optionally seed test data (one org, test users) — do **not** copy real customer PII from prod.

## Step 3 — Local environment file

Copy the example file and fill in **dev** credentials only:

```powershell
copy .env.example .env.local
```

Edit `.env.local`:

```env
VITE_SUPABASE_URL=https://YOUR_DEV_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=your_dev_anon_key
VITE_ENABLE_PLATFORM_FEATURES=true
VITE_PLATFORM_URL=http://localhost:5173
```

Get URL and anon key from dev project → **Settings → API**.

**Never commit `.env.local`.** It is gitignored.

## Step 4 — Run locally against dev

```powershell
npm install
npm run dev
```

Confirm the app loads and login works with a **dev test user** (create in dev Supabase → Authentication → Users).

### Step 4b — Seed org + profile for your test user

The app requires a `profiles` row linked to your auth user. In **dev** SQL Editor, run (adjust name/email as needed):

```sql
-- One org for local testing
INSERT INTO public.orgs (id, name, slug, primary_color, secondary_color, subscription_tier)
VALUES (
  gen_random_uuid(),
  'FieldBourne Dev Demo',
  'fieldbourne-dev',
  '#004B93',
  '#00B4C5',
  'enterprise'
)
ON CONFLICT DO NOTHING;

-- Link your auth user (replace org id from above if needed)
INSERT INTO public.profiles (id, email, full_name, role, org_id)
SELECT
  '3a623e9d-2caa-49a9-bc55-42b32c1db217',
  u.email,
  'Dev Manager',
  'manager',
  o.id
FROM auth.users u
CROSS JOIN public.orgs o
WHERE u.id = '3a623e9d-2caa-49a9-bc55-42b32c1db217'
  AND o.slug = 'fieldbourne-dev'
ON CONFLICT (id) DO UPDATE SET
  org_id = EXCLUDED.org_id,
  role = EXCLUDED.role,
  full_name = EXCLUDED.full_name;
```

If `orgs` / `profiles` tables do not exist in dev yet, apply production schema first (Step 2).

### Step 4c — Point the app at dev (important)

The React app **only** reads `VITE_SUPABASE_*`. For local work:

```env
VITE_SUPABASE_URL=https://rkzgikxxxmovqisxusae.supabase.co
VITE_SUPABASE_ANON_KEY=<your dev anon key>
VITE_ENABLE_PLATFORM_FEATURES=true
```

### Step 4d — Fix login loop (406 on profiles)

If login refreshes with no error, run in dev **SQL Editor**:

1. `supabase/migrations/20250622140000_fix_existing_dev_minimal.sql`
2. `supabase/migrations/20250622160000_fix_profiles_rls_recursion.sql` — **required** if you see "Could not load your profile"

**406 Not Acceptable** = no profile row. **Profile load error** = usually RLS recursion — run step 2.

Then run locally:

```powershell
npm install
npm run dev
```

## Step 5 — Vercel preview (optional)

1. Vercel project → **Settings → Environment Variables**.
2. Add the same `VITE_*` vars for the **Preview** environment only (not Production).
3. Push to `dev` or `feature/platform-saas` — Vercel creates a preview URL.

## Rollback

| What | How |
|------|-----|
| **Code** | `git checkout main` or delete `feature/platform-saas` |
| **Database** | Dev project is isolated — delete the dev Supabase project to wipe |
| **Production** | Untouched if you never run migrations on `abnheynzugpicikxwwmv` |

## Applying changes to production (later)

Only after dev UAT sign-off:

1. Run **additive** migrations on production Supabase (SQL Editor or `supabase db push` linked to prod).
2. Merge `feature/platform-saas` → `dev` → `main`.
3. Deploy with `VITE_ENABLE_PLATFORM_FEATURES=false` initially, then enable per org.
