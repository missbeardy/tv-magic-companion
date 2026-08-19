# UX review — 19-08-2026

Driven with Playwright against the dev server (`localhost:5174`, dev Supabase) at a phone viewport
(390×844) and desktop (1440×900). Screenshots in this folder.

**Scope reached:** public and customer-facing routes, both viewports, console/network.
**Scope not reached:** the authenticated app and the Platform section — see "What I couldn't get to".

---

## 1. HIGH — Your customers see your internal engineering changelog

**The single worst thing found.** `ChangelogOverlay` is mounted in `PwaUpdateLayer`, which wraps
**every** route in [src/App.tsx:104-213](../../src/App.tsx#L104-L213) — including the public,
unauthenticated ones:

- `/invoice/:token` — the link SMS'd to your client's customers to pay an invoice
- `/quote/:token` — the link customers open to accept a quote
- `/login`, `/privacy`, `/terms`, `/delete-account`

A customer who taps the invoice link in their SMS gets a full-screen modal titled **"What's New"**
reading *"Split the overloaded 15-minute background job…"*, *"Follow-up reminders now process in
small batches…"*, *"New Leaderboard tab: a weekly Monday-to-Sunday scoreboard of jobs and sales per
technician…"* — before they can pay.

Screenshot: `03-invoice-customer-sees-changelog.png`

Three separate problems in one:
1. A member of the public sees internal release notes about background jobs and staff leaderboards.
2. It sits on the **money path** — it is the last thing between a customer and paying an invoice.
3. It makes your client look unprofessional to *their* customers, which is the relationship the
   whole product is meant to protect.

The gate is `shouldShowChangelog()`, which is purely localStorage-based — there is no auth check
anywhere in [src/components/PwaUpdateLayer.tsx](../../src/components/PwaUpdateLayer.tsx).

**Fix:** move `PwaUpdateLayer` inside the authenticated route tree, or add a session check to
`ChangelogGate`. Small change; the blast radius is the reason it's High, not the difficulty.

## 2. MEDIUM — The login form is invisible until the modal is dismissed

Same root cause, separate consequence. At both viewports the entire sign-in card is behind the
overlay on first visit (`01-…` and `04-…`). A returning tradie on a phone in the field has to read
and dismiss a changelog before they can type a password.

Fixing #1 fixes this.

## 3. MEDIUM — "Sign in to your franchise" doesn't match who you're selling to

[src/pages/Login.tsx](../../src/pages/Login.tsx) — the sign-in subtitle reads *"Sign in to your
franchise"*, and the title is *"FieldBourne Companion"*.

fieldbournedigital.com.au sells *"Missed Call Follow-Up for Aussie Tradies"*. A solo sparky who
signs up there and lands on "your franchise" has to translate. "Companion" is also legacy naming
from the `tv-magic-companion` era and means nothing to a new user.

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
