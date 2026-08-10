---
id: "dd17-ship-to-google-play-as-a-twa-2026-08-06"
status: "backlog"
priority: "medium"
assignee: null
dueDate: null
created: "2026-08-06T16:00:00.000Z"
modified: "2026-08-06T17:00:00.000Z"
completedAt: null
labels: ["due-diligence", "android", "play-store", "gtm"]
order: "ZJ"
---

# DD17 Ship to Google Play as a TWA

**Decision: wrap the existing PWA in a Trusted Web Activity (Bubblewrap or PWABuilder). No Flutter, no React Native, no Kotlin.**

## Why not a rewrite

- **The value is server-side.** SMS ingestion, AI extraction, webhooks, cron sweeps, Stripe, chase ladders — all in `api/` and Postgres. The client is a CRUD-and-notification shell. A native rewrite reimplements the *cheap* half of the product.
- **A rewrite costs 3–6 months, and speed is the only advantage available.** One developer, one customer, no validated demand. Porting 44,670 lines to obtain a listing achievable in a week would be the worst decision on the menu.
- **It would fragment the codebase** — two clients to maintain, or abandon the web app the manager surfaces need.
- **A TWA is a real Android app** — Play listing, Play install, no browser chrome, home-screen icon, real push via FCM. T1.12's self-hosted Web Push makes this *better*: VAPID delivers straight to FCM with no OneSignal hop.

## Why bother with Play at all — this is the actual argument

It is **not technical**. MARKETING.md's own research: *"tradies buy on mate's recommendation and app-store ratings."* No store presence → no ratings → no social proof → the *"where's the app?"* objection currently answered with a defensive paragraph about install-from-link. Play is a **distribution and credibility** decision.

## Hard prerequisites — do not start before these

- `dd6` — a genuine ≥512×512 PNG icon. Bubblewrap will not package without it. **Blocking.**
- `dd3` — privacy policy URL, terms, in-app + web account deletion. **Blocking** (three of Play's six rejection reasons).
- `dd7` — code splitting. A 439 kB gzip first load in a store-installed app invites one-star "it's slow" reviews, which is the opposite of why you are going to Play.
- `dd1` — you will want crash reporting *before* strangers install it, not after.

## Spec

- Bubblewrap or PWABuilder → signed AAB. Digital Asset Links (`assetlinks.json`) served from the production origin so the URL bar disappears.
- **Exclude `BillingPanel.tsx` from the Android build.** Ship a login-only app with no purchase UI and no link to purchase — the path ServiceM8, Tradify and Xero all take. Do not rely on a B2B carve-out interpretation of Play's Billing policy.
- **`tech_location` is the riskiest permission declaration.** Employee GPS attracts Sensitive Permissions review. Ensure it is foreground-only, explicitly consented, and clearly explained in-listing and in the privacy policy.
- Data Safety form filled in truthfully from `dd3`'s data inventory: names, phones, addresses, photos, location, payment metadata; US-hosted subprocessors.
- Listing screenshots must show the app **doing real work** — a lead card with a countdown, a quote being accepted — not a login screen. Thin webview wrappers get rejected under Minimum Functionality; a genuine authenticated SaaS with push and offline does not.
- Internal testing track first, then closed testing with the `dd13` founding customers, then production.

**iOS: later, or not initially.** ServiceM8 is iOS-first with a famously weak Android app — Android-first is genuine differentiation *and* the larger AU tradie segment. Do not split focus.

**Done when:** a signed AAB is on the internal testing track, installs without a URL bar, receives push to a fully-closed app, and passes review.

**Difficulty:** Medium — mostly the prerequisites, not the packaging. **Sequence last: after `dd1`–`dd6`, and only if the `dd13` five stick.**

Source: DUE_DILIGENCE_REVIEW.md — Phase 5, Phase 6, Phase 10 (#6).
