# Platform SaaS — Progress Log



Track implementation on any device via GitHub (open this file in the repo on your phone).



**Branch:** `feature/platform-saas`  

**Production:** untouched (`main` / live TV Magic)



## Status



| Phase | Status | Notes |

|-------|--------|-------|

| Phase 0 — Dev environment | Done | Dev Supabase, login, migrations |

| Phase 1 — Secure foundations | Done | RLS, org scoping, tier gating, tests |

| Phase 2 — Brand template layer | Done | See below |

| Phase 3 — Brand transfer + tier enforcement | UAT partial | Tests 1–7 pass; 8–10 deferred to Vercel preview |

| Production cutover | Not started | explicit approval required |



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

8. **Storage policies** — Dashboard only (see below)



### Storage policies (Dashboard — required for logo upload)



Supabase SQL Editor cannot create policies on `storage.objects`. After running migration **7**, open **Storage → org-assets → Policies → New policy** and add these three:



| Policy name | Operation | Roles | Definition |
|-------------|-----------|-------|------------|
| `org_assets_public_read` | SELECT | public | `bucket_id = 'org-assets'` |
| `org_assets_authenticated_upload` | INSERT | authenticated | `bucket_id = 'org-assets' AND (storage.foldername(name))[1] = (SELECT org_id::text FROM profiles WHERE id = auth.uid())` |
| `org_assets_authenticated_update` | UPDATE | authenticated | same as upload |



Repeat for **`avatars`** (upload: folder = `auth.uid()`) and **`lead-photos`** (upload: folder = org_id) when you need those features.



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
| 8 | AI parsing blocked on Basic (server) | **Deferred** — retest on Vercel preview |
| 9 | Social post blocked on Basic (server) | **Deferred** — retest on Vercel preview |
| 10 | Brand SMS on lead assign | **Deferred** — retest on Vercel preview |

**When Vercel preview is live:** run tests 8–10 on the preview URL (not localhost). Ensure preview env has `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ENABLE_PLATFORM_FEATURES=true`, plus Anthropic/Twilio/Zernio as needed.

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



_Last updated: Phase 3 UAT 1–7 pass; API tests deferred to Vercel preview_



## Phase 3 deliverables

- **Brand transfer** — Platform Admin assigns brand + copies colors/upsells to franchisee orgs
- **Manual tiers** — set per org in Platform Admin (no payment integration)
- **Server-side tier gates** — `anthropic` (Pro), `social-post` (Pro)
- **Brand SMS templates** — `send-sms` uses org brand templates with auth
- **API auth** — protected routes require Supabase session token

## What's next

1. **Push `feature/platform-saas`** → Vercel preview deploy → complete UAT **8–10** on preview URL
2. **Preview env vars** — add server keys to Vercel (Preview): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ENABLE_PLATFORM_FEATURES=true`, `VITE_ENABLE_PLATFORM_FEATURES=true`
3. **Optional polish** — roll theme colors beyond nav (many pages still hard-code `#004B93`); hidden test profile UI if needed
4. **Production cutover** — only after full UAT + your explicit approval (migrations on prod Supabase, merge to main, enable flags gradually)

