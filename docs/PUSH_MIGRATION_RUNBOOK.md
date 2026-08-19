# Switching TV Magic to native Web Push — runbook (19-08-2026)

Covers turning `native_web_push` on for `tv-magic` safely, and telling who still needs to act.

Background: `push_subscriptions` was leaking one row per subscription rotation, because
`syncSubscription` upserted on `endpoint` and a rotation produces a *new* endpoint. One iPhone
reached 69 rows in eleven days. Since `sendWebPushToUsers` fanned out to every row a user owned,
flipping the switch would have pushed 69 copies of one lead alert to that phone.

Fixed in **v1.1.181** (commits `59ea359`, `6af1d75`): client-side prune, a server-side cap of 5
endpoints per user, and `profiles.push_disabled_at` replacing `push_enabled` as the opt-out signal.

## Order matters — do not reorder

### 1. Apply the migration to prod, before the code

`supabase/migrations/20260819140000_push_disabled_at.sql`. Already applied to **dev** and recorded
in dev's ledger.

**The code must not reach prod first.** `ProfilePage` selects `push_disabled_at` alongside
`suburb, phone, avatar_url`; if the column is missing PostgREST fails the whole row and the profile
fields stop populating for every user. Additive `ADD COLUMN IF NOT EXISTS` plus a backfill of
provable opt-outs — no data loss, safe to re-run.

### 2. Prune the leaked rows

Dry-run first — expect roughly `would_delete: 97, would_keep: 7`, plus rows that have actually
delivered left untouched:

```sql
with ranked as (
  select id, row_number() over (
    partition by user_id, user_agent
    order by last_seen_at desc nulls last, created_at desc
  ) as rn
  from public.push_subscriptions
  where last_success_at is null
)
select count(*) filter (where rn > 1) as would_delete,
       count(*) filter (where rn = 1) as would_keep
from ranked;
```

Then swap the `select` for the delete:

```sql
with ranked as (
  select id, row_number() over (
    partition by user_id, user_agent
    order by last_seen_at desc nulls last, created_at desc
  ) as rn
  from public.push_subscriptions
  where last_success_at is null
)
delete from public.push_subscriptions p
using ranked r
where p.id = r.id and r.rn > 1;
```

Keeps the newest row per device and never touches a row with `last_success_at` set.

### 3. Deploy

`vercel deploy --prod --yes`, then `git push origin main`. Smoke-check on the **alias** (deployment
URLs are behind Deployment Protection):

```
curl -X POST https://tv-magic-companion.vercel.app/api/cron/contact-follow-up
```

401 = hub loaded. 500 = ESM load failure.

### 4. Flip the switch

`native_web_push` for `tv-magic` in Platform Admin. Rollback is the same toggle.

Note `fieldbourne` already has it **on**, and was leaking the same way — steps 1-3 fix that brand too.

## Who still needs to turn notifications on

Run after the deploy. `subs > 0` is definitive: that person is on native push and needs to do nothing.

```sql
select p.full_name,
       count(ps.id)::int as subs,
       case when count(ps.id) > 0 then 'OK on native push'
            else 'no subscription - needs the in-app toggle, or iOS PWA not installed'
       end as verdict
from public.profiles p
join public.orgs o on o.id = p.org_id
join public.brands b on b.id = o.brand_id
left join public.push_subscriptions ps on ps.user_id = p.id
where b.slug = 'tv-magic'
group by p.id, p.full_name
order by 2 desc, 1;
```

### What this can and cannot tell you

**Can:** exactly who is working. `subs > 0` is proof of a live subscription.

**Cannot:** why someone is missing. A zero means one of three things and the database cannot
separate them — they have not reopened the app since the deploy, they never granted browser
notification permission, or they are on iOS without the PWA installed to the Home Screen. Browser
permission is client-side state and is never stored server-side.

**Do not use `auth.users.last_sign_in_at` as "last opened the app".** It only updates on an actual
sign-in, and these users stay logged in — every TV Magic profile shows June or July even though
Andrew's subscription rows were being created the same day this was written.

### What to tell the technicians

- **Nobody needs to redo browser permissions.** Notification permission is origin-scoped, not
  per-key, so anyone who allowed notifications under OneSignal is already covered — the app
  re-subscribes them silently.
- Anyone showing no subscription: **Profile → turn notifications on.** That prompts for permission
  if they never granted it.
- **On iPhone, the app must be installed to the Home Screen first.** iOS only delivers web push to
  an installed PWA; in a plain Safari tab the toggle shows an install prompt instead.
- Nobody gets cut off in the meantime. A user with no native subscription falls back to OneSignal
  per-recipient, so notifications keep working exactly as before.

The one cost of leaving people un-migrated is that `dd10` (OneSignal teardown) cannot complete while
anyone still depends on the fallback.
