---
id: "t1-10-enable-stage3-acks-2026-07-24"
status: "review"
priority: "high"
assignee: null
dueDate: "2026-07-24"
created: "2026-07-24T12:00:00.000Z"
modified: "2026-08-06T17:00:00.000Z"
completedAt: null
labels: ["roadmap", "enablement"]
order: "a0"
---
# T1.10 Enable Stage-3 lead acknowledgments for TV Magic

Turn on `lead_ack_sms`, `lead_ack_email`, `manager_new_lead_alerts` for the real TV Magic brand. Confirm brand slug; UAT SMS in → customer ack + manager push <60s.

**Governing next item** per ROADMAP.md.

---

## Board review 06-08-2026 — STALE SCOPE, needs rewrite

Two of the three switches this card asks you to turn on **are already on in prod**. ROADMAP.md's own 31-07-2026 correction: `lead_ack_sms` and `manager_new_lead_alerts` are `true` for brand `tv-magic`; only `lead_ack_email` is still `false`. The brand-slug question the card raises is also resolved (prod has exactly two brands, `tv-magic` and `fieldbourne`; the client's org is `default`).

**Actual remaining scope is much smaller than the card says:**

1. Decide whether to enable `lead_ack_email` (owner's call, left off 31-07 with no urgency stated).
2. Run the Stage-3 UAT on prod — SMS in to customer ack + manager push under 60s. **Never actually confirmed**, despite the switches being live. That means acks have possibly been firing unverified for weeks.
3. Reconcile the stale Stage 3 checkboxes in `SALES_PIPELINE_BACKLOG.md`.

**Verdict: valuable, but rewrite it.** Item 2 is the real work and it is a genuine risk — a live customer-facing SMS path that has never been end-to-end verified. Arguably it should be `critical`, not `high`. Left in Review for you to rescope rather than silently rewriting your card.
