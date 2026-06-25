# Platform SaaS — Progress Log



Track implementation on any device via GitHub (open this file in the repo on your phone).



**Branch:** `feature/platform-saas` (pushed to GitHub)

**Preview URL:** `https://tv-magic-companion-git-feature-plat-8c5410-missbeardys-projects.vercel.app`

**Production:** untouched (`main` / live TV Magic)



## Status



| Phase | Status | Notes |

|-------|--------|-------|

| Phase 0 — Dev environment | Done | Dev Supabase, login, migrations |

| Phase 1 — Secure foundations | Done | RLS, org scoping, tier gating, tests |

| Phase 2 — Brand template layer | Done | See below |

| Phase 3 — Brand transfer + tier enforcement | UAT done (9 skipped) | Tests 1–8, 10 pass on preview; Stripe billing |

| Security hardening | Done (dev) | Migrations `20250625100000`, `20250625110000` run + tested |

| Post-merge smoke test | **Done** | All 6 pass on preview (see below) |

| Production cutover | **In progress** | See `PRODUCTION_CUTOVER.md` |



### Phase 2 deliverables



- **`brands` table** + `brand_id` on orgs — migration `20250623000000_brands.sql`

- **TV Magic brand pack** seeded (colors, SMS templates, upsells, AI config)

- **ThemeProvider** — dynamic nav colors + org name/logo from org/brand

- **NavBar** — shows franchise name instead of hard-coded TVMagic

- **Platform Admin** — `/platform` route (role: `platform_admin`)

- **Provision franchisees** — create org under a brand from Platform Admin UI



## Dev SQL to run (in order, if not done)



1. `20250622140000_fix_existing_dev_minimal.sql`

2. `20250622160000_fix_profiles_rls_recursion.sql`

3. `20250622150000_add_remaining_tables.sql`

4. `20250622170000_tenant_rls.sql`

5. **`20250623000000_brands.sql`** ← Phase 2

6. **`20250623110000_phase2_uat_fixes.sql`** ← UAT fixes (colors columns, org list RLS)

7. **`20250623120000_storage_buckets.sql`** ← creates buckets (SQL Editor)

8. **`20250624100000_fix_dev_profiles_columns.sql`** ← phone, suburb, avatar, location columns

9. **`20250624110000_sync_auth_profiles.sql`** ← backfill profiles for auth users (lead assign)

10. **`20250624120000_stripe_billing.sql`** ← Stripe customer/subscription columns on orgs

11. **`20250625100000_lock_profile_role_org.sql`** ← blocks users changing own role/org_id

12. **`20250625110000_storage_policies.sql`** ← storage RLS (Dashboard fallback if SQL fails)

13. **Storage policies** — Dashboard only if migration 12 fails (see below)



Supabase SQL Editor cannot create policies on `storage.objects`. After running migration **7**, open **Storage → org-assets → Policies → New policy** and add these three:



| Policy name | Operation | Roles | Definition |
|-------------|-----------|-------|------------|
| `org_assets_public_read` | SELECT | public | `bucket_id = 'org-assets'` |
| `org_assets_authenticated_upload` | INSERT | authenticated | `bucket_id = 'org-assets' AND (storage.foldername(name))[1] = (SELECT org_id::text FROM profiles WHERE id = auth.uid())` |
| `org_assets_authenticated_update` | UPDATE | authenticated | same as upload |



Repeat for **`lead-photos`** and **`avatars`** when you need those features.



#### `lead-photos` policies (Social uploads + job photos)

| Policy name | Operation | Roles | Definition |
|-------------|-----------|-------|------------|
| `lead_photos_public_read` | SELECT | public | `bucket_id = 'lead-photos'` |
| `lead_photos_authenticated_upload` | INSERT | authenticated | `bucket_id = 'lead-photos' AND ((storage.foldername(name))[1] = (SELECT org_id::text FROM profiles WHERE id = auth.uid()) OR (storage.foldername(name))[1] = auth.uid()::text)` |
| `lead_photos_authenticated_update` | UPDATE | authenticated | same as upload |



## Phase 3 UAT

| # | Test | Result |
|---|------|--------|
| 1 | Platform lists all orgs | Pass |
| 2 | Change org brand dropdown | Pass |
| 3 | Create franchisee with brand | Pass |
| 4 | Re-apply template (Platform) | Pass |
| 5 | Reset from brand (Franchise Settings) | Pass |
| 6 | Basic tier hides Tasks/Social | Pass |
| 7 | Tier on new org | Pass |
| 8 | AI parsing blocked on Basic (server) | **Pass** (preview) |
| 9 | Social post blocked on Basic (server) | **Skipped** — not in use first 3 months |
| 10 | Brand SMS on lead assign | **Pass** (preview) |

**When Vercel preview is live:** tests 8 & 10 verified on preview. Ensure preview env has `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ENABLE_PLATFORM_FEATURES=true`, plus Anthropic/Twilio/Zernio as needed.

### Stripe billing (optional on preview)

1. Run migration **`20250624120000_stripe_billing.sql`** in dev Supabase SQL Editor
2. Create **Pro** and **Enterprise** recurring prices in [Stripe test mode](https://dashboard.stripe.com/test/products)
3. Add to Vercel **Preview** env (and `.env.local` for `vercel dev`):
   - `STRIPE_SECRET_KEY` — test secret key
   - `STRIPE_PRICE_PRO` / `STRIPE_PRICE_ENTERPRISE` — price IDs
   - `STRIPE_WEBHOOK_SECRET` — signing secret from Stripe (see webhook URL below)
   - ~~`VITE_PLATFORM_URL`~~ — **not needed on Vercel** (auto from `VERCEL_URL`); only set locally to `http://localhost:5173`
4. **Stripe webhook** — one-time setup in [Stripe test webhooks](https://dashboard.stripe.com/test/webhooks):
   - **Endpoint URL:** copy your branch preview URL from Vercel (see below) + `/api/stripe-webhook`
   - **Events:** `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
   - Copy the **Signing secret** (`whsec_…`) → Vercel Preview env as `STRIPE_WEBHOOK_SECRET`
5. **Org Settings → Subscription & Billing** — managers can upgrade via Stripe Checkout; webhooks sync tier to `orgs.subscription_tier`
6. Platform Admin manual tier changes still work (orgs with `billing_status = manual` until first checkout)

#### Finding your preview URL (for the Stripe webhook only)

1. Open [Vercel → tv-magic-companion → Deployments](https://vercel.com/missbeardys-projects/tv-magic-companion)
2. Click the latest **Preview** row for branch `feature/platform-saas`
3. Under **Domains**, copy the URL that contains `git-feature-platform` (branch alias — stable for this branch)
4. Your webhook endpoint is that URL + `/api/stripe-webhook`

**Your branch alias (as of last deploy):**
`https://tv-magic-companion-git-feature-plat-8c5410-missbeardys-projects.vercel.app/api/stripe-webhook`

Use the URL shown in *your* Vercel dashboard if it differs slightly.

## Phase 3 testing checklist

1. **Platform → Brand transfer** — change an org's brand dropdown → colors/upsells copy from brand template
2. **Re-apply template** — updates org colors from brand without changing brand link
3. **Basic tier org** — Social hidden; AI parse blocked server-side without Pro
4. **Set tier manually** — Platform Admin tier dropdown when creating org, or edit `orgs.subscription_tier` in Supabase
5. **Assign lead** — SMS uses brand template (org name, not hard-coded TVMagic)
6. Production: leave `VITE_ENABLE_PLATFORM_FEATURES` unset — tier gates stay off



## Phase 2 testing checklist



1. Run migrations **5, 6, 7** in dev Supabase SQL Editor, then add storage policies above

2. Restart `npm run dev`

3. Nav bar shows **FieldBourne Dev Demo** (or your org name), not TVMagic

4. Open **Platform** in nav (your dev user is promoted to `platform_admin`)

5. **Platform → All franchise orgs** should list every org (FieldBourne + TV Magic + any test franchisees)

6. **Franchise Settings → Brand Colors** — change primary to e.g. `#FF0000`, Save → nav bar updates immediately

7. **Franchise Settings → logo upload** — should succeed (uses `org-assets` bucket)

8. Optional: edit `orgs.primary_color` in Supabase Table Editor, hard-refresh → nav updates  
   (Org colors override brand template colors; editing `brands` alone won't change the nav if the org has its own color set.)



## Phase 2 UAT (initial run)



| # | Test | Result |
|---|------|--------|
| 1 | Org name in nav | Pass |
| 2 | Brand colors | Fail → fixed in code + migration |
| 3 | Logo upload | Fail (bucket missing) → fixed in migration |
| 4 | Platform nav | Pass |
| 5 | All franchise orgs table | Partial (only own org) → fixed RLS |
| 6 | Leads/calendar/tasks | Pass |
| 7 | Tier gating | Pass |
| 8 | Production untouched | Pass (branch: `feature/platform-saas`)



## Rollback



- Code: `git checkout main`

- Database: delete dev Supabase project



_Last updated: post-merge smoke test complete (all 6 pass); preview sign-off done_



## Phase 3 deliverables

- **Brand transfer** — Platform Admin assigns brand + copies colors/upsells to franchisee orgs
- **Manual tiers** — set per org in Platform Admin (works alongside Stripe)
- **Stripe billing** — checkout, customer portal, webhook sync (`api/stripe-*`, `BillingPanel` on Org Settings)
- **Server-side tier gates** — `anthropic` (Pro), `social-post` (Pro)
- **Brand SMS templates** — `send-sms` uses org brand templates with auth
- **API auth** — protected routes require Supabase session token

## Post-merge smoke test (preview, after `main` → feature merge)

| # | Test | Result |
|---|------|--------|
| 1 | Hard refresh / login | Pass |
| 2 | Login + nav | Pass |
| 3 | Assign lead → SMS + bell | Pass (`6cab259`) |
| 4 | Manager alert on new lead (Add Lead) | **Pass** (`55aa778`, `13e9a2a` — app-side alert; includes `platform_admin`) |
| 5 | Stripe Upgrade to Pro | Pass |
| 6 | Manual lead entry / mobile summary | Pass |

**Note:** Manager alerts fire from the app after Add Lead / Email Parser. Supabase DB webhook optional on prod (`webhook-new-lead`); dev project lacks `supabase_functions` schema.

## What's next

1. **Production cutover** — only when you approve (checklist below)
2. **Optional polish** — theme colors beyond nav; Messenger (fold into existing API — 12/12 function cap); inbound email/voicemail org routing before franchise #2

## Feature switch release checklist (new)

Before each preview or production release that includes modular features:

1. Open **Platform → Feature switches**.
2. Confirm **brand defaults** for every onboarded brand.
3. Confirm **org overrides** only where intentionally different.
4. Spot check effective states for:
   - TV Magic OFF (unless explicitly enabled)
   - At least one target brand ON
   - One org override ON and OFF
5. Include this verification in release notes / UAT sign-off.

