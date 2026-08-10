---
id: "t1-12-self-hosted-web-push-2026-08-06"
status: "in-progress"
priority: "high"
assignee: null
dueDate: "2026-08-06"
created: "2026-08-06T12:00:00.000Z"
modified: "2026-08-06T17:00:00.000Z"
completedAt: null
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
