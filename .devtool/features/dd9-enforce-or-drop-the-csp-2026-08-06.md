---
id: "dd9-enforce-or-drop-the-csp-2026-08-06"
status: "backlog"
priority: "medium"
assignee: null
dueDate: null
created: "2026-08-06T16:00:00.000Z"
modified: "2026-08-06T17:00:00.000Z"
completedAt: null
labels: ["due-diligence", "security", "infrastructure"]
order: "ZC"
---

# DD9 Enforce or drop the CSP

`vercel.json:37` ships a well-constructed Content Security Policy as **`Content-Security-Policy-Report-Only`** with **no `report-uri` and no `report-to` directive.**

It blocks nothing. It reports nowhere. It exists solely to look good in a security scan — which is worse than having no CSP, because it creates the impression of a control that does not exist.

To be fair: the policy content itself is good — `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, scoped `connect-src`. The rest of the header block (HSTS, `nosniff`, `X-Frame-Options: DENY`, scoped `Permissions-Policy`) is genuinely above average. This one line is the exception.

**Spec — pick one:**

**(a) Make it real (preferred).**
1. Add `report-to` / `report-uri` pointing at Sentry's CSP endpoint (`dd1` gives you one for free — sequence this after it).
2. Run report-only for one week across real usage: login, quote accept, invoice pay, push registration, Stripe redirect, Google Places autocomplete, static map tiles.
3. Fix the violations the reports surface — expect Stripe, Google Maps/Places, and OneSignal (until `dd10`) to need entries the current policy is missing.
4. Promote to enforcing `Content-Security-Policy`.

**(b) Delete the header.** Honest, and better than theatre. Only choose this if (a) will not get done.

**Coordinate with `dd10`:** the OneSignal allowances in `script-src` / `connect-src` / `frame-src` come out with the teardown.

**Feature switch:** none.

**Done when:** either an enforcing CSP is live with a week of clean reports behind it, or the header is gone. No third option.

**Difficulty:** Easy.

Source: DUE_DILIGENCE_REVIEW.md — Phase 2, I3.
