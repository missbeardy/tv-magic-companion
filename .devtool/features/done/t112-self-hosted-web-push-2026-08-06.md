---
id: "t1-12-self-hosted-web-push-2026-08-06"
status: "done"
priority: "high"
assignee: null
dueDate: "2026-08-06"
created: "2026-08-06T12:00:00.000Z"
modified: "2026-08-19T09:00:00.000Z"
completedAt: "2026-08-19T09:00:00.000Z"
labels: ["roadmap", "notifications", "reliability"]
order: "a3"
---
# T1.12 Self-hosted Web Push — own the notification delivery path

Replace OneSignal *delivery* with VAPID + the W3C Web Push protocol against our own `push_subscriptions` table. OneSignal is only a relay to FCM / autopush / Apple; removing the hop removes the outage surface. Owner wants the notification to come from the app itself.

Dual-run behind a new per-brand `native_web_push` switch, with a **per-recipient fallback to OneSignal** when a user has no live subscription — so flipping the switch cannot black out anyone who hasn't reopened the app. Rollback is one toggle in Platform Admin.

No new Vercel function (Hobby cap is 12/12): sender is `api/_lib/webPush.ts` called in-process; subscribe/unsubscribe go client → Supabase direct via RLS.

**Also fixes a likely live bug:** `public/OneSignalSDKWorker.js` does `importScripts('/sw.js')`, so our `push` listener and OneSignal's share one SW global and both fire on every push — the second rendering a stray "TVMagic / New notification".

**Out of scope:** OneSignal teardown — that is T1.13, once the subscription table plateaus.

**Governing next item** per ROADMAP.md.


---

## Closed 19-08-2026 — board reconciliation

**Code complete** — merged in commit `143e2df` (v1.1.155–1.1.167), not started-and-abandoned as the board status suggested.

Shipped: `api/_lib/webPush.ts` (VAPID sender, 404/410 row pruning, failure_count backoff), `api/_lib/pushTransport.ts` (switch routing + per-recipient OneSignal fallback), `api/_lib/pushEndpoints.ts`, `src/lib/webPush.ts`, hardened `public/sw.js` (the `PUSH_SOURCE='fb'` marker gate that fixes the duplicate-notification bug, try/catch on malformed payloads, focus-then-navigate, `pushsubscriptionchange` rotation), `?action=push-rotate` / `?action=push-send` on the send-sms hub, both `push_subscriptions` migrations, the `native_web_push` switch, and `tests/pushTransport.test.ts`.

`src/App.tsx` calls `reconcileSubscription()` unconditionally, so subscriptions have been accumulating in prod ahead of any flip.

**Dark only because `native_web_push` defaults to false.** Flipping it for `tv-magic` plus one device UAT is an owner action, carried to the owner-action list. Unblocks `dd10`.
