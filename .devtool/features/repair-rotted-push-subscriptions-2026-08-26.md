---
id: "repair-rotted-push-subscriptions-2026-08-26"
status: "in-progress"
priority: "high"
assignee: null
epic: "Notifications"
dueDate: null
created: "2026-08-26T05:50:00.000Z"
modified: "2026-08-26T05:50:00.000Z"
completedAt: null
labels: ["push", "bug", "t1-12"]
order: "Z0"
---

# Repair rotted push subscriptions

Found in prod 26-08-2026 while diagnosing "I posted an announcement and nobody got a
notification". The announcement outage had a separate cause (stale `notify-message` edge
function, fixed the same day), but verifying the fix surfaced this second, quieter bug.

## Why

`Demo Manager` sat on Profile looking at **"✅ Notifications are enabled on this device"**
while that device could not receive a single notification.

`deviceNotificationsOn` ([src/pages/ProfilePage.tsx:257](../../src/pages/ProfilePage.tsx#L257))
is derived from browser permission plus the absence of an opt-out:

```ts
notifStatus === 'success' || (!pushDisabled && notifPermission === 'granted')
```

Neither input knows whether a live `push_subscriptions` row exists. The row is the only
thing that makes delivery possible, and the sender **deletes** it the moment the push
service reports the endpoint gone
([api/_lib/webPush.ts](../../api/_lib/webPush.ts) — the 404/410 prune). So the moment an
endpoint rots, the UI keeps claiming everything is fine.

Worse, it does not recover. `reconcileSubscription`
([src/lib/webPush.ts:240](../../src/lib/webPush.ts#L240)) runs on every app load, finds the
browser still holding the dead `PushSubscription`, and upserts it straight back:

1. Sender pushes → push service says 410 Gone → row deleted
2. Next app load → reconcile re-inserts a row for the same dead endpoint
3. Go to 1

A rot loop that costs the user every notification and reports success at every step.

Observed on prod: `Demo Manager` had two rows, one last seen `05:17` that day. The 05:37
announcement pruned it. The row that survived was created 19-08 and has not been seen
since — so the announcement was "delivered" to a browser nobody is sitting at, while the
active device showed a green banner.

The only escape available today is Turn off → turn on, which the user has no reason to
think they need, and which the green banner actively argues against.

## Spec

**1. Detect it.** New `isDeviceSubscribed(userId)` in `src/lib/webPush.ts`: resolve this
device's current `PushSubscription` and check for a matching `push_subscriptions` row.
Returns `boolean | null`, where `null` is "cannot tell" (unsupported, unconfigured, or the
lookup itself failed). **`null` must never read as broken** — a flaky query must not
nag a working device.

**2. Stop lying about it.** `ProfilePage` gains a third state between "on" and "blocked":
permission granted, no opt-out, no live row → an amber panel saying this device is not
reachable, plus a **Re-register this device** button wired to the existing
`enablePush()`. One click, no off/on dance.

**3. Self-heal it.** In `reconcileSubscription`, when the browser hands back a
subscription that has no server row, unsubscribe and subscribe again rather than
upserting the dead endpoint. Absence of the row is the only signal the client gets that
the sender pruned it. Gate strictly on `=== false` so an errored lookup does nothing.

Client-only. No migration, no new endpoint, no Vercel function slot.

## Feature switch

**None.** This is a correctness fix inside `native_web_push`, which is already the switch
governing this path (on for both brands). A switch here would only let someone turn the
repair off and keep the lie. Flagged per the standing convention rather than assumed, and
consistent with `dd19`'s push to stop growing the catalog.

## Done when

- A device whose row was pruned shows the amber "not reachable" state, not the green one
- Re-register issues a fresh endpoint and writes a row, verified by `last_success_at` moving on the next send
- Reconcile does not resurrect a row for an endpoint the sender already pruned
- A failed lookup leaves the panel reading as on
- `null` vs `false` covered by tests

**Difficulty:** Low — one helper, one branch, one panel state.

## Related

- Parent: T1.12 Self-hosted Web Push (shipped `143e2df`, retro-ticked 19-08-2026)
- Same-day sibling: stale `notify-message` edge function (v3 → v5), see [[edge-functions-drift]]
