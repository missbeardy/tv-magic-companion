# Production Cutover — TV Magic

**Prod Supabase:** [abnheynzugpicikxwwmv](https://supabase.com/dashboard/project/abnheynzugpicikxwwmv)  
**Prod URL:** https://tv-magic-companion.vercel.app  
**Branch:** merge `feature/platform-saas` → `main`

Do these steps **in order**. Do not run dev-only migrations on production.

---

## Step 1 — Database (Production Supabase SQL Editor)

**If cutover failed partway**, use **`supabase/production_cutover_recovery.sql`** instead — run **BLOCK A**, verify, then **BLOCK B**, etc. (one block at a time).

Otherwise run the full **`supabase/production_cutover.sql`** in one go.

**Do NOT run on prod:** `20250622130000_dev_seed.sql`, `20250623100000_fix_dev_login.sql`, `20250624110000_sync_auth_profiles.sql` (hard-coded dev org).

**Verify after SQL:**

```sql
SELECT id, name, slug, subscription_tier, brand_id, billing_status FROM public.orgs;
SELECT id, email, role, org_id, phone FROM public.profiles ORDER BY role;
```

Every TV Magic user should have `org_id` set. Org should have `brand_id` and `subscription_tier = enterprise`.

---

## Step 2 — Vercel Production environment variables

In Vercel → **tv-magic-companion** → Settings → Environment Variables → **Production**:

| Variable | Value |
|----------|--------|
| `VITE_SUPABASE_URL` | `https://abnheynzugpicikxwwmv.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Prod anon key (Settings → API) |
| `SUPABASE_URL` | Same as above |
| `SUPABASE_SERVICE_ROLE_KEY` | Prod service role key |
| `TWILIO_*` | Existing prod Twilio vars (unchanged) |
| `STRIPE_SECRET_KEY` | **Live** secret key (when ready for billing) |
| `STRIPE_PRICE_PRO` / `STRIPE_PRICE_ENTERPRISE` | **Live** price IDs |
| `STRIPE_WEBHOOK_SECRET` | From Stripe **live** webhook |
| `ENABLE_PLATFORM_FEATURES` | `true` |
| `VITE_ENABLE_PLATFORM_FEATURES` | `true` |

**Important:** Client (`VITE_*`) and server (`SUPABASE_*`) must point at the **same** prod project.

Optional: `SUPABASE_WEBHOOK_SECRET` if you enable Database Webhooks on prod later.

---

## Step 3 — Deploy code

Merge `feature/platform-saas` → `main` and push. Vercel auto-deploys production.

---

## Step 4 — Stripe live webhook (when using billing)

1. [Stripe Dashboard → Webhooks (live mode)](https://dashboard.stripe.com/webhooks)
2. Endpoint: `https://tv-magic-companion.vercel.app/api/stripe-webhook`
3. Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
4. Copy signing secret → Vercel Production `STRIPE_WEBHOOK_SECRET`

TV Magic org can stay `billing_status = manual` / `enterprise` until you test checkout.

---

## Production smoke test (TV Magic franchise)

Run on **https://tv-magic-companion.vercel.app** after deploy. Use real manager + employee accounts.

| # | Test | How | Pass if |
|---|------|-----|---------|
| 1 | **Login** | Hard refresh, log in as manager | Dashboard loads, no profile error |
| 2 | **Nav / branding** | Check top nav | Shows TV Magic org name; Leads, Calendar, Tasks visible (enterprise) |
| 3 | **Leads list** | Open Leads | Existing leads still visible; no empty/wrong org |
| 4 | **Add lead** | Add Lead → save | Appears in Unassigned; manager gets **bell** (+ SMS if phone on profile) |
| 5 | **Assign lead** | Assign to employee | Employee gets **bell** + **SMS** on their phone |
| 6 | **Calendar** | Open Calendar, view/create event | Events load; save works |
| 7 | **Manual lead mobile** | Phone: open a lead detail | Summary/layout OK |
| 8 | **Franchise Settings** | Org Settings → colors/logo | Save works (logo needs storage policies) |
| 9 | **Employee login** | Log in as technician | Sees assigned + unassigned leads only (not other orgs) |
| 10 | **Inbound path** | Submit test email/call if configured | New lead appears (uses `DEFAULT_ORG_ID` today) |

**Skip for now:** Social post (#9 from preview UAT), Stripe upgrade (test in Stripe test mode first if unsure).

**If something breaks:** set `VITE_ENABLE_PLATFORM_FEATURES=false` + redeploy → tier gates off while you fix.

---

## Promote platform admin (optional)

Only if you need `/platform` on prod:

```sql
UPDATE public.profiles
SET role = 'platform_admin'
WHERE email = 'YOUR_EMAIL@example.com';
```

---

## Rollback

| Layer | Action |
|-------|--------|
| **Code** | Revert `main` to previous commit in Vercel / Git |
| **Flags** | Set `VITE_ENABLE_PLATFORM_FEATURES=false` → redeploy (tier gates off, legacy behavior) |
| **Database** | Migrations are additive; rollback is forward-fix only |

---

## Post-go-live smoke test

See checklist at end of this file after deploy completes.
