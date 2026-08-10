---
id: "t1-6c-sms-invoice-no-email-2026-07-24"
status: "backlog"
priority: "medium"
assignee: null
dueDate: "2026-07-24"
created: "2026-07-24T12:00:00.000Z"
modified: "2026-08-06T17:00:00.000Z"
completedAt: null
labels: ["roadmap", "t1"]
order: "a1"
---
# T1.6c SMS invoice link when customer has no email

Server SMS action + email-optional invoice creation; send public `/invoice/:token` link.

---

## Board review 06-08-2026 — KEEP as-is

Genuinely valuable and correctly scoped. Trade customers frequently have no email; the public `/invoice/:token` page already exists; today `InvoiceStep` **requires** a typed email to invoice at all. This is a real dead end on the money path, and it is small.

Contrast with T1.6b (its sibling deferral, parked in Review): that one adds config nobody asked for, this one removes a hard block. Different things.
