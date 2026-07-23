# FieldBourne — Marketing & Positioning

| Field | Value |
|-------|-------|
| **Purpose** | Market, competitors, positioning, objection handling, and go-to-market sequencing |
| **Basis** | Competitive research 18-07-2026 (vendor pricing pages, Trustpilot/Capterra/Play Store reviews, AU tradie-software comparisons) + verified codebase capability |
| **Related** | [ROADMAP.md](../ROADMAP.md) · [PROJECT.md](PROJECT.md) · [BUSINESS.md](BUSINESS.md) · owner's separate branding guide |

## The market

Australian trade businesses; primary wedge audience is the **solo tradie** (sparkie-adjacent trades without certificate requirements first — antenna/AV, handyman, locksmith, garage doors, cleaning, pest, lawn/garden), then small teams (2–10), then franchise networks (the multi-tenant brand layer is already built for this).

Buying behaviour that shapes everything: tradies buy on **mate's recommendation and app-store ratings**, are price-sensitive (Tradify runs 50%-off promos to win them), fear **data migration and retraining** more than subscription cost, and live on **SMS**, not email.

## Competitors (verified July 2026 — recheck before quoting)

| | ServiceM8 | Tradify |
|---|---|---|
| **Pricing (AUD)** | $0 free tier (30 jobs/mo, 1 user) → Starter **$29** → Growing **$79** → Premium **$149** → Premium Plus $349. GST-inc, **unlimited users**, priced by jobs/month | Lite **$48** → Pro **$52** → Plus **$62** **per user**, ex GST |
| **SMS** | Included per tier (100–3000+), 10¢ overage | 20¢/message add-on |
| **Accounting** | Xero/MYOB/QuickBooks sync | **Xero/QuickBooks sync on every plan** |
| **Key strengths** | Category leader, free tier, forms/certificates ($79+), job costing ($149+), huge review base | Per-user simplicity, compliance certs + recurring jobs (Pro), AI features (Plus) |
| **Verified weaknesses** | **iOS-first — the Android "Lite" app is its most-complained-about weakness** (field staff can barely do more than view a job) | Limited offline; SMS metered; per-user cost stacks for teams |

**What neither does:** ingest a missed call / inbound SMS / Facebook message as a structured, AI-parsed lead and then *enforce working it* (countdown timers, contact rounds, chase ladders). Both are job-management tools that assume the job already exists. That gap is FieldBourne's moat.

## Positioning

**One line:** *FieldBourne answers every enquiry in seconds and chases every job to paid — so a solo tradie never loses a lead.*

**Position as a front-door add-on, not a replacement (until T2.9 decides otherwise).** Sell it as the layer that catches and converts enquiries *beside* whatever the tradie already uses. This sidesteps the three hardest objections at once (Xero sync, feature parity, migration fear) — leads are *new* data, so there's nothing to migrate. Displacement comes later, from the inside.

**Pillars (each maps to verified capability):**
1. **Never lose a lead** — missed call → auto-SMS → AI-parsed lead card → countdown timer → chase ladder at every stage from enquiry to payment.
2. **One saved job pays for a year** — reframes price against recovered revenue ($300–$1,500/job) instead of against a $29 incumbent. Missed-call-text-back literature claims 30–60% of unanswered calls are recoverable.
3. **Built for the phone in your pocket** — Android-first by construction (PWA identical on any device), works in a black spot (offline queue + cached day view), everything one-thumb.
4. **SMS-native, all messaging included** — ack, quote link, booking confirm, day-before reminder, chase, review request. Tradify charges 20¢ each for less.
5. **Aussie-correct paperwork** — GST divide-by-11, ABN Tax Invoices, sub-$75k non-registered handling, Xero-compatible CSV.

## The 60-second demo (the core sales asset)

1. **0:00** — Presenter rings the demo number from their own phone. Nobody answers. Hangs up.
2. **0:10** — Presenter's phone buzzes: branded SMS — "Sorry we missed you! What do you need done? We'll call you back within 30 min."
3. **0:20** — Presenter replies: "burst pipe under the kitchen sink, 12 Smith St Frankston, how soon can you come?"
4. **0:30** — Tradie's **Android** pings: new lead card — name, mobile, address, job type "burst pipe — urgent", countdown timer already running.
5. **0:40** — Tradie taps a price-list chip ("Emergency call-out — $220 inc GST"), sends the quote link; presenter opens it and taps Accept (e-sign).
6. **0:50** — Tradie books tomorrow 8am; presenter instantly receives confirmation SMS + calendar invite. Enquiry-to-booked in under a minute, zero typing.

**Status:** every beat is built. T2.2 runbook makes this demo runnable on demand — rehearse twice cold before outbound marketing. T1.10 (prod TV Magic ack enable) remains manager-gated and is not required for a FieldBourne demo org with the wedge preset ON.

## Objections & honest answers

| Objection | Answer |
|---|---|
| "Do you sync with Xero?" | "Yes — connect Xero in Franchise Settings and push sent invoices live (or download a Xero-compatible CSV). BSB/PayID stays on every invoice." |
| "ServiceM8 is $29 / has a free tier." | "ServiceM8 manages jobs you already won. FieldBourne wins you the jobs you're currently missing — one recovered job covers a year. Also: their Android app; ask any Android user." |
| "I don't want to migrate / retrain." | "Nothing to migrate. Keep your current tool; we sit in front of it. Your leads are new data. Set-up is one session." |
| "Where's the App Store app?" | "It installs from a link in 10 seconds and works identically on any phone — that's why it's the same app on a $300 Android as an iPhone, unlike some. Push notifications included." |
| "Certificates? Recurring jobs? Timesheets?" | Honest: not yet — roadmap. Qualify these prospects out (or park them) rather than overpromise; wrong-fit churn is worse than no sale. |
| "Who else uses it?" | Until case studies exist: "Built and battle-tested daily with a working AU service business for [X] months" + show the live activity/history. Get the Nick case study ASAP (see BUSINESS.md). |

## Go-to-market sequence (gated by roadmap)

1. **Now → Tier 1 UAT passes:** nothing public. Harden the field experience for the existing client; their retention *is* the first case study.
2. **T1.10 + T2.1 + T2.2 done:** demo is real. Record it (screen + both phones) — this video is the website hero, the social ad, and the DM answer.
3. **T2.3–T2.6 done (rebrand, onboarding, import, provisioning):** soft launch — 3–5 hand-picked solo tradies (warm network, the client's trade adjacents), founder-onboarded, honest "founding customer" pricing in exchange for reviews + testimonials.
4. **T2.9 (pricing/positioning decision) recorded:** public pricing page, Google Business profile, review flywheel (the app's own review-request feature pointed at FieldBourne itself), local trade Facebook groups, missed-call-cost calculator as lead magnet.
5. **Later (Tier 3-dependent):** replacement positioning vs ServiceM8/Tradify only once Xero sync + certificates close; franchise/white-label motion (brand layer already supports it) as a separate B2B2B track.

**Channels to prioritise for solo tradies:** word of mouth + referral incentive, local trade FB groups, Google reviews, YouTube/TikTok shorts of the 60-second demo, accountant/bookkeeper referrals (they answer "what should I use?" — the honest Xero-CSV story matters here). Skip paid ads until the demo video + reviews exist.

## Claims discipline

Never claim: native app, live Xero sync, certificates, recurring jobs, offline *everything* (completion/notes/photos queue — quoting/invoicing still needs signal). Every public claim must trace to a shipped, switch-ON feature. When in doubt, demo it live instead of describing it.
