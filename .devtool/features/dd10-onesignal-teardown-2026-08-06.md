---
id: "dd10-onesignal-teardown-2026-08-06"
status: "backlog"
priority: "medium"
assignee: null
dueDate: null
created: "2026-08-06T16:00:00.000Z"
modified: "2026-08-19T17:15:00.000Z"
completedAt: null
labels: ["due-diligence", "notifications", "tech-debt", "t1"]
order: "ZB"
---

# DD10 OneSignal teardown

The review's verdict on dual push transports: **justified, but finish it.** The T1.12 migration design is genuinely careful — per-recipient fallback so flipping `native_web_push` cannot black out anyone who hasn't reopened the app, rollback by one Platform Admin toggle. That care is correct for the cutover and a permanent tax if it becomes the steady state.

Two push stacks means: two SDKs, two service-worker code paths sharing one global, two sets of env vars, two failure modes to reason about on every notification bug, and the `importScripts('/sw.js')` double-notification hazard that T1.12 was partly built to fix.

**Gate:** the `push_subscriptions` table plateaus — i.e. essentially all active users have reopened the app and registered a native subscription. Verify with a query, not a guess: count of distinct `profiles` with a live subscription vs count of active users in the last 30 days.

**Spec (from ROADMAP.md T1.12 "Later"):**
- Remove `react-onesignal` from `package.json`.
- Delete `public/OneSignalSDKWorker.js` and `src/lib/oneSignal.ts`.
- Remove both `ONESIGNAL_*` env vars from Vercel + `.env.example`.
- Remove the three REST call sites and the OneSignal branch in `api/_lib/pushTransport.ts`.
- Retire the `native_web_push` switch itself once there is no alternative transport to route to (a switch with one option is dead config — see `dd19`).
- Also remove the unused `supabase/functions/push-notify` scaffold still deployed (noted in ROADMAP T1.9 and PROJECT.md known debt).
  **DONE via dd18 (11-08-2026)** — deleted from repo + undeployed from prod.
- Update `vercel.json` CSP: drop `https://cdn.onesignal.com` and `https://*.onesignal.com` from `script-src` / `connect-src` / `frame-src` (coordinate with `dd9`).

**Feature switch:** removes one.

**Done when:** no OneSignal code, dependency, env var, CSP allowance or deployed scaffold remains; push delivery is verified unchanged on Android PWA and installed iOS PWA after removal.

**Difficulty:** Easy once the gate is met. **Do not start before the subscription table plateaus.**

Source: DUE_DILIGENCE_REVIEW.md — Phase 4, Phase 8 item 14; ROADMAP.md T1.12 "Later".


---

## Verified against the code 19-08-2026

Card says teardown must remove "the three REST call sites". There is **one**: `sendViaOneSignal` at `api/_lib/pushTransport.ts:39`. `supabase/functions/notify-message` was already migrated to `?action=push-send`.

Full remaining surface: `react-onesignal` in package.json, `src/lib/oneSignal.ts`, `src/App.tsx` `OneSignalBootstrap`, `public/OneSignalSDKWorker.js`, `public/web-push-handler.js` (a classic-syntax duplicate of the sw.js listeners), the `sendViaOneSignal` branch, `ONESIGNAL_APP_ID`/`ONESIGNAL_API_KEY`, the `onesignal.com` CSP allowances in `vercel.json`, the `globIgnores` entry in `vite.config.ts`, and the sub-processor line in `PrivacyPolicyPage.tsx`. The `PUSH_SOURCE='fb'` gate in `public/sw.js` becomes unnecessary but is harmless to keep.

**Still gated:** `native_web_push` must be ON and `push_subscriptions` plateaued first. T1.12 is code-complete but the switch is still off.
