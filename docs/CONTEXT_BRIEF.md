# FieldBourne — Master Context Brief

> **Paste this whole document into a fresh LLM session.** Sections 1–9 are context and do not change.
> Section 10 is the task. Section 11 holds alternate tasks you can swap in for §10.

---

## 1. How to use this brief

Everything in sections 2–8 is **verified against the source code and production configuration** of a real,
running application. It is not a pitch deck. Numbers are real, failures are included, and where something is
genuinely unknown it says so rather than guessing.

Section 9 is **my current thinking**, not a settled decision. Disagreeing with it is explicitly in scope — in
fact it is most of what I want from you.

Treat sections 2–9 as data. Your instructions are in section 10.

---

## 2. What the product is

**FieldBourne** — a multi-tenant field-service CRM, built as an installable PWA, for Australian trade
businesses (electricians, antenna/TV installers, plumbers, and similar).

The wedge, in the product's own words, is **"never lose a lead."** The full loop it automates:

> missed call / SMS / email / Facebook enquiry → instant branded auto-reply → AI-parsed lead with a countdown
> timer → assigned to a technician → quote with e-signature → booked with calendar invite → job completed →
> invoice → paid by card → Google review request

Deliberate positioning (decided 20-07-2026): a **front-door add-on that sits beside ServiceM8 or Tradify**,
not a replacement for them. The bet is that incumbents manage jobs you have already won, and nobody guards the
moment an enquiry arrives.

Built solo with heavy AI assistance. **500 commits over 92 days** (01-06-2026 → 31-08-2026). Currently at
v1.1.193.

---

## 3. What it actually does — verified

**Scale markers:** ~44,700 lines of code · 87 database migrations · ~34 tables · 534 tests · 21 routes ·
34 feature switches · 65 components.

**Stack:** React 19 + Vite + Tailwind + PWA · Supabase (Postgres with row-level security) · Vercel serverless
functions · Twilio SMS · Resend email · Stripe · OneSignal / self-hosted Web Push · Anthropic Claude.

### Lead pipeline (the core)

- 10-stage kanban board — drag-and-drop on desktop, tabbed on mobile.
- **Two operation modes per business.** *Solo*: Inbox → In progress → Booked → Done, everything auto-assigned
  to the owner. *Team*: an unassigned lead pool with a 4-hour countdown, technicians claim leads, unclaimed
  leads auto-return via a scheduled database job, contact rounds are enforced.
- Auto-assignment by technician proximity (geocoded) and current workload, with a "smart assign" recommendation
  badge and per-technician job-type exclusions.
- **AI lead extraction** — Claude parses raw inbound SMS/email into structured fields, with a deterministic
  regex fallback, a per-business monthly token ceiling, an extraction-status badge, and manual retry.
- Photo attachments, voicemail playback, soft delete with reason, customer job history.

### Money path

- Quotes with line items, GST and ABN, sent as a public tokenised link, accepted by **typed e-signature**
  (name, email, IP and user-agent captured) or declined.
- Invoices with sequential per-business numbering, PDF generation, and a **"Pay Now"** card button running on
  **the tradie's own Stripe Connect account** — the platform never touches client money and carries no payment
  risk.
- Automated chase ladders for unpaid invoices and unanswered quotes.
- Xero OAuth sync and a Xero-compatible CSV export.
- A configurable price list of common jobs surfaced as quick-add chips, ranked by usage.

### Communication

- Twilio SMS in and out, per-business phone numbers routed by inbound number.
- WhatsApp templates for technician alerts.
- Transactional email via Resend, including booking confirmations with a `.ics` calendar attachment.
- Inbound email and voicemail-to-email via CloudMailin, plus a direct IMAP poller that recovers voicemail
  recordings too large for the webhook to accept.
- Push notifications over two interchangeable transports (self-hosted VAPID Web Push, or OneSignal).

### Inbound channels

SMS · email · missed call and voicemail · **Facebook Lead Ads** (via Make.com) · and a **native Claude-powered
Facebook Messenger and Instagram DM receptionist** that answers questions from an embedded knowledge base,
never quotes prices, captures a name and mobile, and creates a real lead.

### Operations and observability (built into the product)

- `workflow_runs` — a step-level execution trace of every automated pipeline, with a visual node graph.
- A **synthetic probe** that runs hourly and verifies inbound leads were actually *created*, not merely that
  the endpoint returned HTTP 200.
- Cron heartbeats, an unrouted-inbound capture table, rate-limit logging, and a production config drift audit.
- Offline support: an IndexedDB queue for contact attempts, photos, completions and notes, plus a 12-hour
  read-through cache of leads and calendar.

### Roles and admin

Three roles only: `manager`, `employee`, `platform_admin`. There is no separate franchise-owner role. A
platform admin console provides brand template editing, per-brand feature switches, business provisioning, an
inbound-pipeline simulator, and cross-business brand transfer.

### Also present

`/visualise` — a three.js 3D room / photo-of-your-wall tool where a homeowner drags a TV, soundbar, video wall
or speaker onto their wall at millimetre accuracy and requests a quote, which creates a real lead. Built as a
marketing funnel for the single existing client.

---

## 4. Real-world track record — the honest version

| Reality | Detail |
|---|---|
| **Paying customers** | **One** business in production: an antenna/TV installation franchise in South Brisbane, roughly 4–8 technicians, 20 live push subscriptions. |
| **Is it actually paying?** | **Unknown.** There is no Stripe subscription evidence anywhere in the repo for that business. |
| **Brands ever created** | Two. One is the platform's own demo. |
| **Strangers who have paid** | Zero. |
| **Features requested by a paying stranger** | Zero. |
| **Sales assets** | A checklist of five (demo video, case study, cost calculator, comparison page, founding-customer offer). **Zero ticked**, since 20-07-2026. |
| **Real usage signal** | The product's own UX review found leads carrying badges reading 321h, 893h, 997h and **1019h** since last contact attempt. A pipeline-discipline product with leads untouched for six weeks. |

The internal due-diligence review I commissioned scores the project **5.5/10** and summarises it as
*"well-engineered, over-scoped, entirely unvalidated."* Its single most quoted line:

> **1 customer, 20+ roadmap items shipped in three weeks, 0 requested by a stranger who has ever paid.**

---

## 5. Hard learnings

**A. The repository was a poor description of production.**
This is the biggest one. Error monitoring and analytics were recorded as *shipped and verified against real
production data*, and an entire governance rule — "nothing ships until it is observable" — was built on that
claim. In fact the four environment variables involved were never set in production. The system designed to
make silent failures visible had itself never been switched on. That is why a **16-day notification outage went
unnoticed**. Alongside it: a Supabase edge function frozen at an old version while the code had moved on; three
orphaned edge functions live in production holding a service-role key with **no source code anywhere in the
repo**; and a production database whose migration ledger matches **none** of the 87 migration files, with 51
recorded schema differences.

**B. Governance produced confidence, not correctness.**
A 297-line governing roadmap, tier gates, changelog gates, per-session rules and a versioned behavioural spec
all coexisted with a two-week silent outage. Process made shipping *feel* like progress.

**C. A ~$20/month hosting decision deformed the architecture.**
Staying on the hosting free tier imposed a hard 12-serverless-function cap. Consequences: one 39 KB "god hub"
file mixing public, cron and authenticated endpoints behind an `?action=` parameter; ~35 URL rewrite rules; a
cron chain running eight jobs serially inside a 60-second limit that timed out and **silently skipped invoice
chase, quote chase and booking reminders**; and an 18-hour outage in which every inbound SMS returned HTTP 200
and created nothing. The free tier also prohibits commercial use — so charging money on it was a breach.

**D. Configurability outran validation.**
34 feature switches × 2 operation modes, 32 of them defaulting off. Roughly **one** configuration has ever been
exercised in the real world. The count grew from 32 to 34 while an open task to *cut it to twelve* sat
untouched.

**E. Gravity always pulled back to the one client.**
Xero sync shipped in direct violation of a documented decision to defer it. The newest, most polished code in
the entire repository is a TV-antenna wall visualiser built for that one client, written while a feature freeze
was formally in effect. Every recent item traces to the same person.

**F. A dormant inventory accumulated.**
Features built, shipped, and never switched on: lead acknowledgement emails (permanently off by choice),
per-technician job exclusions, the weekly leaderboard nudge, Xero live sync (never tested against a real Xero
account). Features built and then deleted entirely: social media posting, task boards. Roughly **half the open
task board turned out to be fiction** when reconciled.

---

## 6. Why "one app, many brands" did not hold

This is the crux of the rethink. The evidence is one-sided.

**Feature switches resolve at *brand* scope only.** A table for per-business overrides was created and then
dropped. The admin console says so in plain text on screen:

> *"Feature switches below are manual rollout controls per brand — all franchises under a brand share the same
> setting."*

You cannot pilot a feature with one customer. Flipping a switch flips it for everyone on that brand.

**Provisioning customer N reconfigures customers 1 to N−1.** The onboarding preset writes **21 switches on,
brand-wide**. Adding a third business would silently change behaviour for the first two — including switches
that send SMS and email to *those businesses' customers*. Real messages, real money, triggered by an admin
action about someone else.

**Client identity is compiled into shared code.** All verified, all in code paths shared by every brand:

- The client's URL hardcoded as the password-setup redirect for *every* new user on *any* brand
- The same URL baked into four WhatsApp message bodies
- `noreply@tv-magic-companion.com` as the sender fallback on every quote and invoice email
- `@tv-magic-companion` in the identifier of every calendar invite a customer receives
- The client's Gmail folder structure as the default IMAP voicemail path
- A brand-name substring test that decides **whether push notifications work at all**
- The client's Messenger receptionist script and phone number living in a server module
- TV-mounting service types (`Sound Bar`, `Home Theatre`, `Video Wall`, `Wall Mounting`) hardcoded in the
  `shared/` directory that both the server and the browser app compile

**The vocabulary is franchising** — "Sign in to your franchise", "Franchise Settings" — while the stated target
market is solo tradies who have never heard the word.

**The counter-evidence, stated fairly.** The *data* layer is genuinely, unusually well isolated: 82 row-level
security policies with only 3 legacy permissive ones, server-side resolution of business and role from the auth
token rather than client claims, and 66 server-side switch enforcement points versus 19 UI ones. Theming, brand
templates and brand transfer all work.

**The verdict this supports:** *the data layer is multi-tenant; the application layer is single-tenant with a
config table bolted onto it.* Every time a real client need arrived — a Gmail label, a receptionist script, an
invoice sender address, a calendar identifier, a wall visualiser — it landed as a constant in shared code,
because there was nowhere brand-scoped to put it, and building that place cost more than the second brand was
worth.

---

## 7. Commercial reality

- **Documented pricing decision:** A$69/month GST-inclusive for a solo tradie, all messaging included under a
  fair-use clause. A higher **flat per-business** tier for teams, explicitly not per-user.
- **I am now contemplating ~A$200/month** — roughly 3×. That only works with a materially different offer.
- **Cost floor:** ~US$45–50/month fixed (paid hosting + paid database) plus ~A$15–25 per business per month
  variable. Twilio SMS is the dominant variable cost and the reason "messaging included" is a competitive
  weapon.
- **Competitor anchors:** ServiceM8 A$29/month GST-inc for unlimited users (with a free tier); Tradify A$48–62
  per user ex-GST. A price war is unwinnable.
- **Value frame:** one recovered job is worth A$300–1,500 to the tradie.
- **Support:** founder-answered in-app messaging, documented as sustainable to 10–20 businesses.

**The sharpest question in this document:** my stated goal is ~10 clients at ~$200/month for ~$2,000/month of
**side income that does not consume significant hours**. The money side is comfortably viable. But bespoke or
done-for-you work is *high hours per client* — which is in direct conflict with the hours constraint. Any
recommendation that ignores this tension is useless to me.

---

## 8. Blockers before charging any stranger

1. Hosting free tier prohibits commercial use — must move to paid (this also removes the 12-function cap).
2. Production database is not migration-driven; it was stood up by a one-off cutover script. Point-in-time
   recovery status is **unverified**.
3. Error monitoring and analytics are **inert in production**.
4. Per-business configuration does not exist — only per-brand.
5. Terms of service, privacy policy, Australian Privacy Principles posture, and SMS consent/opt-out compliance
   need real legal advice.
6. No demo video, no case study, no comparison page, no pricing page.

---

## 9. My current thinking (challenge this)

I set out to build **one app that many brands could be retrofitted into**. Based on the feedback I am getting
and what the codebase above demonstrates, I no longer think that works — brands have genuinely different needs,
and I now suspect **that difference is the selling point rather than the problem**.

My working hypothesis is a shift toward **agency / done-for-you builds**: I build each client the app they
actually need, charging a build fee plus a monthly, with this codebase as my private starting kit rather than a
product I sell. That justifies ~$200/month where $69 was the SaaS price.

**I am not confident in this hypothesis.** I want it pressure-tested, not agreed with.

Target: **10 clients × ~$200/month ≈ $2,000/month**, as side income, not a full-time job.

---

## 10. YOUR TASK

Using everything above, work through these in order. Be direct, be specific, and disagree with me where the
evidence warrants it.

1. **Recommend the business model.** Pressure-test my agency/done-for-you hypothesis rather than endorsing it.
   Weigh it against the alternatives — vertical-specific editions, a genuinely productised SaaS with
   per-business configuration built properly, or something I have not considered. Resolve the
   hours-versus-income tension in §7 explicitly: show me the arithmetic of hours per client × 10 clients under
   whichever model you recommend. If my $200 × 10 target is unrealistic under your recommendation, say so and
   tell me what is realistic.

2. **Brand and name direction.** "FieldBourne" was built for the SaaS thesis and the code still carries the
   original client's name throughout. Tell me whether the name survives the new model, and give me a direction
   for identity, voice and positioning that fits what you recommended in (1).

3. **Pricing and packaging.** Concrete numbers. What is charged, when, for what, and how the offer is
   structured so it is defensible against the ServiceM8/Tradify anchors.

4. **Website.** Sitemap, homepage structure section by section, and actual headline and body copy for the
   homepage — not placeholders. Tell me what proof assets I must create before the site can convert, ranked by
   leverage.

5. **How I build from here.** Given §6, what the technical model has to become to support your recommendation —
   and, just as importantly, what I should stop doing. Be specific about what gets deleted.

Finally: name the **single riskiest assumption** in your own recommendation, and tell me the cheapest test that
would falsify it within two weeks.

---

## 11. Appendix — alternate task blocks

Swap any one of these in for section 10. Sections 1–9 stay untouched.

### 11a. Branding only

> **YOUR TASK.** Using the context above, deliver a complete brand direction. (1) Name — does "FieldBourne"
> survive, and if not give me 5–8 candidates with reasoning, checking each against the Australian trades
> market. (2) Positioning statement in one sentence, and the specific customer it is aimed at. (3) Brand voice,
> with three do/don't pairs and example sentences. (4) Visual direction — palette, typography, imagery
> approach, and what to deliberately avoid given how every trades-software brand currently looks. (5) The
> one-line promise that goes above the fold. Finally, name the riskiest assumption in your direction.

### 11b. Website only

> **YOUR TASK.** Using the context above, design the website. (1) Full sitemap with the job each page does.
> (2) Homepage structure section by section, with actual copy — headline, subhead, body — not placeholders.
> (3) The conversion path: what a visitor does, in what order, and where they convert. (4) Proof assets I must
> create before this site can work, ranked by leverage, given that I currently have one client and zero sales
> assets. (5) How to handle the honest weakness that I have one customer — hide it, reframe it, or lead with
> it. Finally, name the riskiest assumption in your design.

### 11c. Re-architecture only

> **YOUR TASK.** Using the context above — especially §6 — give me a technical plan to move from "one app, many
> brands" to a codebase that supports [**INSERT THE CHOSEN BUSINESS MODEL HERE**]. (1) What the tenancy and
> configuration model must become. (2) How to get client identity out of shared code without a full rewrite.
> (3) What to delete — be aggressive; the due-diligence review's own conclusion was "subtraction beats
> addition". (4) The order of operations, given that one real business is live on this code and must not break.
> (5) What must be true before a second paying business is onboarded. Assume a solo developer with limited
> hours. Finally, name the riskiest assumption in your plan.
