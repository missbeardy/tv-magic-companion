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

## Platform section — reviewed on screen

Logged in as a `platform_admin` on dev. Screenshots `05-`, `06-`, `07-`.

### P1. HIGH — A debug panel owns the page, and it shows red on every visit

**Workflow Runs is the only section expanded by default**, and it is a *read-only debugging trace*.
It sits above Brand templates, Feature switches and Provision franchisee org — i.e. above every
task you actually came to do.

Worse, the first thing in it is three lines of **red text**:

```
Contact follow-up last ran: never recorded
Invoice/quote/booking sweeps last ran: never recorded
Cron maintenance last ran: never recorded
```

That is a *status readout*, not an error — on dev it simply means no cron has run. But it is rendered
in error-red, above the fold, on every single visit. If the page greets you with what looks like
three failures every time you open it, of course you hate opening it.

**Fix (cheap, high payoff):** collapse Workflow Runs by default, and render "never recorded" in
muted grey rather than red — reserve red for an actual stale-heartbeat threshold.

### P2. MEDIUM — Six identical cards, no hierarchy, admin mixed with debugging

The page is six visually identical accordions: Org members · Workflow Runs · Brand templates ·
Feature switches · Inbound pipeline simulator · Provision franchisee org.

**Provisioning a new franchisee** (rare, high-stakes, irreversible-ish) is presented exactly like
**inspecting workflow runs** (frequent, read-only, zero-risk). Nothing signals which is which.

Two of the six are not administration at all — **Workflow Runs** and **Inbound pipeline simulator**
are debugging/testing tools. The due diligence review already named workflow-graph observability as
feature creep, and `dd1` shipped Sentry since, which is where that job now belongs.

**Fix:** split into tabs — *Brands & Orgs* / *Switches* / *Debug* — and put the two debug tools
behind the last one. Tabs are a far smaller change than a redesign and would remove most of the
friction.

### P3. MEDIUM — 34 switches behind one collapsed row, no search

`Feature switches` expands to a brand picker plus four category groups:

| Category | On |
|---|---|
| Lead Intake | 5/7 |
| Customer Communication | 6/8 |
| Team Operations | 8/10 |
| Sales & Job Completion | 7/9 |

Credit where due: they *are* grouped, with per-category counts — that part is well built. But there
is **no search and no filter** across 34 toggles, so changing one you can't remember the category of
means opening all four groups and reading.

This is `dd19`'s point restated from the UI side: the fix is fewer switches, not better switch
organisation. Note the count has gone 32 → 34 since the review.

### P4. MEDIUM — `<html>` is height-locked, so the page scrolls in `<body>`

Measured on `/platform`:

```
document.documentElement.scrollHeight = 900   (= viewport height)
document.body.scrollHeight            = 2368
body overflow                          = hidden auto
```

The document element is pinned to the viewport and `body` is the scroll container. Consequences:

- **On mobile, the browser URL bar never auto-hides on scroll** — it only collapses on *document*
  scroll. You permanently lose ~60-100px of vertical space on the exact device the tech uses
  one-handed in the field.
- `position: fixed` and sticky elements can behave unexpectedly against a non-document scroller.
- It is also why the full-page screenshots clip at 900px (`07-`) — the renderer sees a 900px document.

**Fix:** let the document scroll. Usually one `height: 100%` / `overflow: hidden` on a root wrapper.

### P5. LOW — Nav crowding and a naming collision

At 1440px the top nav carries eight items plus five icons. Two of them are **Franchise Settings**
and **Platform** — both "settings for the business", with no cue about which holds what. On mobile
the org name truncates to "FieldBourne Dev …".

## What I couldn't get to, and why

The rest of the authenticated app — `/leads`, `/calendar`, `/profile`, `/org-settings`,
`/leaderboard`, `/reports`. `/leads` is the one that matters most: it is the money path, it is the
1,394-line screen `dd14` targets, and it is where a tech spends their day.

The Platform section itself **is** now reviewed (above).

Review account was `claude-uxreview@example.com` on **dev**, created for this pass and deleted
afterwards.
