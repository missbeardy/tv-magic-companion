# UX review — 19-08-2026

Driven with Playwright against the dev server (`localhost:5174`, dev Supabase) at a phone viewport
(390×844) and desktop (1440×900). Screenshots in this folder.

**Scope reached:** public and customer-facing routes, both viewports, console/network.
**Scope not reached:** the authenticated app and the Platform section — see "What I couldn't get to".

---

## 1. HIGH — The changelog reaches the two routes that aren't yours

**Scope correction (owner, 19-08-2026):** this app is for FieldBourne's clients and their techs.
A changelog on `/login` or inside the app is aimed at exactly the right people and is not a defect.

**Two routes are the exception.** `ChangelogOverlay` is mounted in `PwaUpdateLayer`, which wraps
**every** route in [src/App.tsx:104-213](../../src/App.tsx#L104-L213), so it also renders on the two
public token pages that are opened by the *tradie's own customer*, never by a tech:

- `/invoice/:token` — built in [api/_lib/quotes.ts](../../api/_lib/quotes.ts) / delivered to `customer_email`
  and `customer_phone`; Stripe returns the payer here via [api/stripe.ts:365](../../api/stripe.ts#L365)
- `/quote/:token` — the acceptance link; chase reminders email `customer_email`
  ([api/_lib/quoteChase.ts:229](../../api/_lib/quoteChase.ts#L229))

A customer who taps the invoice link in their SMS gets a full-screen modal titled **"What's New"**
reading *"Split the overloaded 15-minute background job…"*, *"Follow-up reminders now process in
small batches…"*, *"New Leaderboard tab: a weekly Monday-to-Sunday scoreboard of jobs and sales per
technician…"* — before they can pay.

Screenshot: `03-invoice-customer-sees-changelog.png`

Why it still matters on those two routes:
1. It sits on the **money path** — the last thing between a customer and paying an invoice.
2. The content is internal release notes about background job scheduling and a per-technician sales
   leaderboard, shown to someone outside the business entirely.
3. It is your client's reputation with *their* customer that pays for it — the relationship the
   product exists to protect.

The gate is `shouldShowChangelog()`, which is purely localStorage-based — there is no auth check
anywhere in [src/components/PwaUpdateLayer.tsx](../../src/components/PwaUpdateLayer.tsx).

**Fix:** move `PwaUpdateLayer` inside the authenticated route tree, or add a session check to
`ChangelogGate`. Small change; the blast radius is the reason it's High, not the difficulty.

## 2. LOW — The login form is behind the modal on first visit after a release

Downgraded after the owner's scope correction. The audience here is clients and techs, so showing
them the changelog is intended. The only cost is that the sign-in card is fully hidden until the
modal is dismissed (`01-…` and `04-…`), which is one extra tap for a tech on a phone in the field,
once per release.

Worth considering only if you fix #1 anyway — dismissing on `/login` rather than blocking it.

## 3. LOW — "Sign in to your franchise" reads oddly for a solo tradie

[src/pages/Login.tsx](../../src/pages/Login.tsx) — the sign-in subtitle reads *"Sign in to your
franchise"*, and the title is *"FieldBourne Companion"*.

Lower priority than first written, since no stranger reaches this page — signup is not self-serve.
But a solo sparky onboarded by you still has to translate "your franchise", and "Companion" is
legacy naming from the `tv-magic-companion` era that means nothing to a new client.

**Fix:** "Sign in to your account" / drop "Companion". Copy-only.

## 4. LOW — Service worker fails to register in dev

Console, every page load:

```
Failed to register a ServiceWorker for scope ('http://localhost:5174/')
with script ('http://localhost:5174/dev-sw.js?dev-sw'): ServiceWorker script evaluation failed
```

Dev-only (`dev-sw.js` is the vite-plugin-pwa dev shim), so it does not affect production. But it
means **offline behaviour and push cannot be exercised locally** — the T1.1–T1.4 offline queue and
the T1.12 push path can only be tested on a deployed preview. Worth fixing purely so that work is
testable before it ships.

## 5. Not a bug — checked and clear

- The `Dev DB: rkzgikxxxmovqisxusae` line in the login footer **is** correctly gated behind
  `VITE_ENABLE_PLATFORM_FEATURES === 'true'` ([Login.tsx:177](../../src/pages/Login.tsx#L177)).
  It will not appear in production.
- Login page layout, tap targets and input sizing at 390px are fine. No horizontal overflow.
- `/privacy` and `/terms` are linked from the login footer, as `dd3` intended.

---

## Platform section — structural read only

I could not log in (see below), so this is from the code, not the screen. It is consistent with
finding it unpleasant to use:

| | |
|---|---|
| `PlatformAdminPage.tsx` | 618 lines, **21 `useState`** |
| `src/components/platform/*` | 1,931 lines across 10 components |
| **Total** | ~2,550 lines on one route |

That one page carries: brands, orgs, org members, **34 feature switches**, brand colour editing,
email + SMS template editing, inbound email routing, an inbound simulator, and the workflow run
graph (`WorkflowRunsPanel` alone is 516 lines).

Credit where due — the switches *are* grouped by category with per-category enabled counts
([PlatformFeatureSwitches.tsx](../../src/components/platform/PlatformFeatureSwitches.tsx)), so it
isn't an undifferentiated wall. But there is **no search and no filter** across 34 switches, and no
top-level tabbing to separate "I am configuring a brand" from "I am debugging a workflow run".

Two of those concerns arguably don't belong here at all: the **inbound simulator** and the
**workflow run graph** are debugging tools, not administration. The due diligence review named the
workflow-graph observability as feature creep, and `dd1` has since shipped Sentry — which is where
that job now belongs.

**Suggestion for tomorrow:** the cheapest real win is splitting this into tabs (Brands / Orgs /
Switches / Debug) rather than redesigning anything. The second is `dd19` — 34 switches is the
actual source of the density, and cutting the count beats organising it better.

---

## What I couldn't get to, and why

The authenticated app — `/leads`, `/calendar`, `/profile`, `/org-settings`, `/leaderboard`, and the
Platform section itself.

I created a dev-only user (`uxpass@example.com`) but granting it a `platform_admin` profile row
required a database write that the permission classifier blocked. I did not work around it.

**To unblock, either:** approve that one dev-database write next session, or give me a dev login you
already have. Dev only — nothing here needs prod.
