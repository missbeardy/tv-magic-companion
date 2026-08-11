---
id: "quote-send-blocks-on-delivery-2026-08-07"
status: "done"
priority: "high"
assignee: null
dueDate: null
created: "2026-08-07T00:45:00.000Z"
modified: "2026-08-10T15:30:00.000Z"
completedAt: "2026-08-10T15:30:00.000Z"
labels: ["reliability", "money-path", "quotes"]
order: "ZK"
---

# Quote send reports failure on a quote that actually saved

**Found while verifying `dd8` on 07-08-2026 — pre-existing, not introduced by the dd-series work.**

Sending a quote locally returned "Couldn't reach server", but the quote row **was** created
(`408edbd3-eb16-4d1c-8f91-5306b827a233`, status `sent`). The cause: `createQuote`
(`api/_lib/quotes.ts`) awaited the Resend email and the Twilio SMS **inline before returning**.
When a provider is slow, the client's 10s `fetchWithTimeout` gives up first and surfaces a
network error — for a quote that is saved and may well have sent.

**Why it matters:** the tradie sees a failure, hits send again, and the customer gets two quotes.
On the money path. This is the same failure shape T1.7 fixed for bookings ("Save = lead write +
event insert only… everything else fires in the background after confirmed save") — quotes never
got the same treatment.

**Local trigger was environmental** (this machine's network silently drops outbound connections
to Twilio/Resend/PostHog IPs — `ETIMEDOUT`, while `curl` to the same hosts succeeds). But a slow
or degraded provider in production produces exactly the same user-visible bug, so the fix stands
on its own.

## Fix shipped (v1.1.162)

Persist first, then deliver — with a grace period rather than a blind hand-off:

- `deliverQuote()` extracted: sends email + SMS and fires the `quote_sent` analytics event.
  Never throws.
- `deliverQuoteWithinBudget()` races delivery against a **3.5s** budget (comfortably covers a
  healthy ~1-2s send, well inside the client's 10s timeout):
  - **Resolves in time** → real per-channel delivery status, exactly as before. No UX regression
    on the happy path.
  - **Still in flight** → hands the promise to Vercel's `waitUntil` so the send completes after
    the response, and reports "Quote saved. Email/SMS still sending."
- Client (`QuoteComposerModal.tsx`) leads with **"Quote saved."** on `delivery_pending`, and
  points at the existing copy-link fallback — so a slow provider never reads as "send it again".
- Pure copy logic extracted to `buildUnresolvedDeliveryCopy()` and unit-tested
  (`tests/quoteDelivery.test.ts`, 5 cases incl. the both-channels-pending stutter guard).

`npm run typecheck` clean, suite green **563/563**.

## Left to verify

Send a quote against a preview deploy (where Resend/Twilio are actually reachable) and confirm
the fast path still reports "Quote email sent to X" — the slow path can't easily be exercised
without throttling a provider, but the budget logic is unit-tested.

## Related follow-on worth considering (not done)

`api/_lib/invoices.ts` `createAndSendInvoice` has the same inline-send shape, and worse: on email
failure it **deletes the invoice row and throws**. Deliberate (avoids an invoice with no
delivery), but it means a transient Resend blip destroys a just-created invoice. Same money path.
Not touched here — a separate call, since "retain and retry" changes invoice-numbering semantics.

## Closed 10-08-2026 — verified on preview, shipped

Owner sent a real quote on preview (Resend/Twilio reachable there, unlike the local machine where
this was first found): got "Quote email sent to…" — the real fast-path status, not the
still-sending fallback, confirming the 3.5s budget doesn't regress the happy path. Shipped in
v1.1.167. The invoice follow-on above remains open — not carded separately yet, flag if wanted.
