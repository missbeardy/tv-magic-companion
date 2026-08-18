---
id: "contact-follow-up-lifecycle-rebuild-2026-08-18"
status: "backlog"
priority: "high"
assignee: null
epic: "Refactor"
dueDate: null
created: "2026-08-18T04:57:00.000Z"
modified: "2026-08-18T05:43:00.000Z"
completedAt: null
labels: ["Refactor"]
order: "Z0"
---

# Contact Follow-up Lifecycle Rebuild

Phased rebuild of the contact follow-up lifecycle. **Do not implement yet** — this card is the specification only.

Source: architecture review `architecture-review-20260818-142853.html` (18-08-2026), candidate 01 — "Deepen the contact follow-up lifecycle". Treat the current uncommitted follow-up reliability work as the behavior baseline.

Target direction: one deep lifecycle module returns a complete transition/reminder plan; only the backend owns automatic writes; one atomic persistence adapter claims work and pairs transitions with audit events; notification delivery stays outside the data transaction.

```
Browser / Cron  →  Follow-up plan interface
                →  Deep lifecycle module
                →  Atomic persistence adapter
                →  Committed work list
                →  Notification adapter (post-commit)
Browser         →  Read resulting state
```

## Compatibility contract

Preserve current behavior and database compatibility throughout. Old deployed clients continue working during rollout.

**Policy (unchanged):**

- 6-hour reminder / cooldown (`CONTACT_FOLLOW_UP_MS`)
- 14-day stale auto-lost (`STALE_LEAD_AUTO_LOST_MS`)
- Final-round auto-lost (`FINAL_LABEL_ROUND` = 4, then 6h with no contact)
- Six employee contact attempts before unable-to-contact lost
- Oldest-due-first reminder batch of 12 (`CONTACT_FOLLOW_UP_REMINDER_BATCH_SIZE`)
- In-app-only reminder copy and `notifications.type = 'contact_follow_up'`
- Unassigned leads still get the cooldown stamp; only assignees receive a notification
- Reminders create **no** `lead_events` row
- Stamp cooldown **before** notify; a claimed reminder stays stamped if delivery fails
- Stale loss takes precedence over final-round loss; a committed loss cannot also be reminded

**Runtime (unchanged):**

- Endpoint `/api/cron/contact-follow-up`
- GitHub Actions 15-minute cadence (`.github/workflows/contact-follow-up-cron.yml`)
- Hobby 60-second function limit; GitHub `curl --max-time 55`
- Cron result shape: `{ checked, reminded, lost, notified, remaining, errors }`
- Heartbeat key `contact_follow_up`

**Database (compatible, additive only):**

- Keep `leads`, `lead_events`, and `notifications` column and row meanings
- Do not rename or drop columns; do not rewrite historical rows as part of this rebuild
- All SQL changes are additive and **migration-first** (apply to dev, then prod, then deploy code)

**Out of scope (explicit):**

- Manual employee contact commands (`buildContactAttemptUpdate` used by LeadsPage, LeadStatusMenu, offline queue)
- Offline replay of contact attempts
- GitHub scheduling, cron auth, physical Vercel handler, and function-count limit
- Later architecture candidates (lead workflow, booking, feature switches, send-sms hub) except the notification trust seam required by this lifecycle

## Target module interfaces

```ts
interface ContactFollowUpLifecycle {
  plan(input: PlanContactFollowUpInput): ContactFollowUpPlan
  run(input: RunContactFollowUpInput): Promise<ContactFollowUpCronResult>
}

interface ContactFollowUpPersistence {
  loadCandidates(cutoffIso: string): Promise<FollowUpLeadSnapshot[]>
  commit(plan: ContactFollowUpPlan): Promise<CommittedFollowUpWork>
}

interface ContactFollowUpReminderPort {
  deliver(intent: CommittedReminderIntent): Promise<ReminderDeliveryResult>
}
```

`ContactFollowUpPlan` contains:

- Deterministic **loss** transitions with the exact lead update and audit event (notes and payload sources must match today: `stale_no_contact` / `follow_up_timeout`)
- **Reminder** candidates with expected-state preconditions (`status`, `contact_attempt_round`, `last_contact_attempted_at`, `last_follow_up_reminder_at`)

`commit` atomically claims reminders and pairs each committed loss update with its audit event. It returns only committed work. `run` delivers reminder intents **after** the transaction.

---

## Phase 0 — Freeze behavior and repair the contract

### Module interface

Introduce shared snapshot, plan, committed-work, result, and port types. Do **not** move runtime ownership. Existing cron and browser call sites stay on today's orchestration.

### Adapters

Retain the existing cron/browser callbacks as a named **legacy compatibility adapter**. New types wrap today's `processContactFollowUpRollovers` / `selectFollowUpReminderBatch` behavior; they do not replace it yet.

### Migrations

None. Regenerate [`src/types/database.types.ts`](src/types/database.types.ts) so `leads.last_follow_up_reminder_at` is canonical (the 20260810 migration added the column; the generated lead type currently omits it). Parameterize Supabase clients with the generated contract. Add drift verification to the normal check path (`typecheck` / `prebuild`).

### Characterization tests

Lock the compatibility contract before any rewrite:

- 6h reminder / cooldown, 14-day stale loss, final-round loss, six contact attempts
- Oldest-due-first batch of 12 and `remaining`
- Exact lost notes and payload sources (`stale_no_contact`, `follow_up_timeout`)
- Stamp-before-notify; no-assignee still stamps; notify failure does not unstamp
- Update / event insert failures are recorded in `errors` and do not silently succeed
- Browser-load side effects of `processContactFollowUpRollovers` on LeadsPage
- Cron heartbeat key and `ContactFollowUpCronResult` shape
- Reminder path writes no `lead_events` row

Primary files: [`tests/contactFollowUp.test.ts`](tests/contactFollowUp.test.ts), [`tests/contactFollowUpCron.test.ts`](tests/contactFollowUpCron.test.ts), [`tests/cronActions.test.ts`](tests/cronActions.test.ts), [`tests/notifyUser.test.ts`](tests/notifyUser.test.ts).

### Rollout

Test/type-only release. No behavior switch. Ship generated types + characterization coverage only.

### Old code deleted

None.

---

## Phase 1 — Introduce the deterministic lifecycle planner

### Module interface

Implement `plan(...)` as the **single policy surface**. Stale loss takes precedence over final-round loss. Committed losses cannot also be reminded. Batching, sort, copy, and update construction all come from the plan.

### Adapters

[`shared/contactFollowUp.ts`](shared/contactFollowUp.ts) and [`api/_lib/runContactFollowUpCron.ts`](api/_lib/runContactFollowUpCron.ts) delegate through compatibility wrappers. Browser still behaves as today (writes on load via the legacy adapter).

### Migrations

None.

### Characterization tests

Differential fixtures compare **legacy vs new plan** for:

- Boundary timestamps (exactly 6h, 6h−1ms, 14d, 14d−1ms)
- Null / invalid timestamps
- All rounds and statuses (including booked — never auto-lost)
- Tie ordering (same due timestamp → id)
- Custom reminder limits
- Mixed loss + reminder sets (a lost lead is never in the reminder batch)

### Rollout

Shadow-plan in cron. Log only aggregate mismatches. Keep legacy writes authoritative until parity is clean.

### Old code deleted

Duplicated selector / update / event construction **only after fixture parity**. Retain the legacy adapter for rollback.

---

## Phase 2 — Add atomic persistence and cut the cron over

### Module interface

- `loadCandidates` returns narrow generated projections (`id`, `org_id`, `name`, `service_type`, `status`, `assigned_to`, `contact_attempt_round`, `last_contact_attempted_at`, `last_follow_up_reminder_at`)
- `commit(plan)` returns `{ lost, reminders, remaining }` containing only rows whose expected state still matched

Overlapping cron runs must not select the same work.

### Adapters

Typed Supabase persistence adapter using **one service-role-only RPC transaction** with conditional updates / row claims (`FOR UPDATE SKIP LOCKED` or equivalent expected-state `UPDATE … WHERE`). `run(...)` delivers returned reminder intents afterward and preserves `ContactFollowUpCronResult`.

Do **not** put notification delivery inside the data transaction.

### Migrations

Add the RPC/function and a supporting index only if query evidence requires it. Revoke `PUBLIC`, `anon`, and `authenticated`; grant `service_role`. Do not rename/drop columns or rewrite historical rows. Regenerate RPC types into the shared database contract.

Apply to **dev then prod before code**.

### Characterization tests

- Adapter contract tests against the persistence port
- Local-database concurrency tests: two overlapping runs cannot duplicate a reminder stamp or a lost event
- A failed event insert cannot leave a loss update committed (atomic pair)
- Stamp-then-notify still holds: delivery failure after commit does not unstamp

### Rollout

1. Apply migration to dev, then prod, **before** deploying code
2. Deploy with the new path **disabled** (server flag); shadow-read only
3. Enable with the server flag
4. Observe at least **two cooldown windows** (two 6h cycles / multiple 15-minute ticks)
5. Keep flag rollback to the legacy adapter

### Old code deleted

Direct per-lead cron `leads.update` and `lead_events.insert` calls in [`api/_lib/runContactFollowUpCron.ts`](api/_lib/runContactFollowUpCron.ts) after the observation gate.

---

## Phase 3 — Separate notification intents at the trust seam

Architecture review candidate 02. Required here because the follow-up cron currently passes `type: "contact_follow_up"` into a free-form interface that skips organisation membership checks.

### Module interface

Replace the free-form notification `type` policy switch with:

- `sendPublicOrgNotification(...)` — always validates membership
- `insertTrustedFollowUpReminder(...)` — narrow internal reminder interface

### Adapters

Public callers always verify membership. The internal adapter performs a **verified insert** against the committed lead / org / assignee and remains in-app only (no push, SMS, or WhatsApp). Cron uses only the internal intent.

### Migrations

If needed, add a service-role-only verified-insert RPC; otherwise no schema change. Keep `notifications.type = 'contact_follow_up'` and the existing row shape (`user_id`, `org_id`, `lead_id`, `title`, `message`, `type`, `read`).

### Characterization tests

- Reject cross-org and public-action bypasses (`type: "contact_follow_up"` from an authenticated caller must not skip membership)
- Accept only the committed current assignee
- Preserve exact copy, URL (`/leads?lead={id}`), and type
- Prove no external transport is invoked (no push / SMS / WhatsApp)

### Rollout

Switch cron to the internal intent first. Then migrate public callers ([`api/send-sms.ts`](api/send-sms.ts), inbound auto-assign, quotes). Remove the compatibility wrapper after one release.

### Old code deleted

- `type?: string` as an authorization / delivery control on `NotifyOrgUserInput`
- The `contact_follow_up` special-case branch in [`api/_lib/notifyUser.ts`](api/_lib/notifyUser.ts)

---

## Phase 4 — Make the backend the sole automatic lifecycle owner

### Module interface

Browser imports become **read-only presentation helpers** (`getAttemptPhaseLabel`, `sortLeadsForKanbanColumn`, `getContactFollowUpState`, `buildContactAttemptUpdate` for **manual** contact only). Automatic transitions belong to `run(...)` on the backend.

Manual employee contact commands and offline replay retain their current behavior and are **outside** this automatic sweep boundary.

### Adapters

[`src/pages/LeadsPage.tsx`](src/pages/LeadsPage.tsx) only reads refreshed lead state after load. GitHub scheduling, cron auth/action, heartbeat, and the physical Vercel handler remain unchanged.

### Migrations

None.

### Characterization tests

- Loading Leads no longer writes `leads` or `lead_events`
- UI labels and kanban order remain identical
- Backend cron still produces the frozen Phase 0 outcomes within the 15-minute cadence and 60-second limit

### Rollout

Remove browser write ownership only after the atomic cron has stable production metrics (Phase 2 observation gate). Refresh / realtime state remains the browser convergence path. Worst case: a lead sits in `contact_attempted` until the next 15-minute tick instead of flipping on page load.

### Old code deleted

The browser call to `processContactFollowUpRollovers` in [`src/pages/LeadsPage.tsx`](src/pages/LeadsPage.tsx) and its update / event callbacks.

---

## Phase 5 — Remove compatibility scaffolding

### Module interface

Retain only:

- Lifecycle service (`plan` / `run`)
- Persistence and reminder ports
- Generated database projections
- Browser-safe presentation API

### Adapters

Remove the legacy callback adapter and the Phase 2 server flag after the rollback window.

### Migrations

No destructive cleanup. Keep compatible columns and stable RPCs unless a separately approved deprecation proves no deployed caller remains.

### Characterization tests

- Import-boundary checks prevent browser code from acquiring automatic lifecycle write ports
- Full `npm test`, `npm run typecheck`, `npm run build`
- Manual cron smoke: dispatch `/api/cron/contact-follow-up` and confirm heartbeat + result counters

### Rollout

Delete in a **separate release** after production parity and concurrency evidence are recorded.

### Old code deleted

- [`src/lib/contactFollowUp.ts`](src/lib/contactFollowUp.ts) shallow re-export (import cleanup first)
- Deprecated aliases: `MAX_RETRY_WAIT_ROUND`, `leadsDueForFollowUpEscalation`, `leadsDueForFollowUpRollover`, `buildFollowUpEscalationUpdate`, `buildFollowUpRolloverUpdate`, `rolloverEventType`
- Unused `onReminder` callback path on `processContactFollowUpRollovers`
- Old selectors / orchestrator once no caller remains
- Compatibility-only tests that exist only to keep the aliases alive

---

## Completion gate

Do not move this card to done until all of the following are recorded:

- [ ] Migration-before-code proof (Phase 2 RPC present on **prod** before the code that calls it)
- [ ] Planner parity: legacy vs new plan fixtures green, including mixed loss/reminder sets
- [ ] Overlap / concurrency evidence: two overlapping runs cannot duplicate a reminder or lost event
- [ ] Preserved cron / API / database contracts: endpoint, heartbeat, result shape, 15-minute cadence, Hobby 60s, in-app-only reminders, no reminder `lead_events`
- [ ] Production observation: at least two cooldown windows on the atomic path
- [ ] Explicit deletion checklist from Phase 5 completed in a separate release
- [ ] Full suite, typecheck, and build green

## Partial delivery (18-08-2026, v1.1.176)

The bug subset of this card shipped without the architectural rebuild. What is **done**:

- Notification trust seam, narrow slice of Phase 3: `insertTrustedFollowUpReminder` in
  [`api/_lib/notifyUser.ts`](api/_lib/notifyUser.ts) is the cron-only path; `notifyOrgUser` now
  validates org membership for every `type` with no branch above the check. (A `contact_follow_up`
  early-exit had made the check skippable from a request body — caught before it deployed.)
- Phase 4 browser ownership: `processContactFollowUpRollovers` removed from
  [`src/pages/LeadsPage.tsx`](src/pages/LeadsPage.tsx) and from the `src/lib` re-export. The backend
  sweep is the sole automatic writer.
- Candidate load hardened: `deleted_at is null`, oldest-first ordering, explicit 1000-row limit with
  a `[FOLLOWUP_CANDIDATE_CAP]` log.
- `result.lost` no longer counts a transition whose `lead_events` insert failed.
- Phase 0 type contract: `leads.last_follow_up_reminder_at` added to the generated types, guarded by
  [`tests/databaseContract.assert.ts`](tests/databaseContract.assert.ts) under `typecheck`.

### Prod evidence (18-08-2026, project `abnheynzugpicikxwwmv`)

| Measure | Value | Meaning |
| --- | --- | --- |
| `contact_attempted` leads | 47 | — |
| Due candidates (>6h, not deleted) | 36 | Deploy gate **passes**: 1000-row cap has ~28x headroom |
| Soft-deleted `contact_attempted` | 0 | New `deleted_at` filter is a no-op today; kept as a guard |
| Auto-lost events, last 7d | 19 | Post-deploy baseline (~2.7/day) |
| `contact_follow_up` notifications, last 7d | 1237 | ~177/day vs a 47x4=188/day ceiling — cooldown working |
| Leads with duplicate auto-lost events, all time | **1** | Browser race is real but has fired once, ever |

`leads.deleted_at` and `leads.last_follow_up_reminder_at` both confirmed present on prod, so the
hardened query is safe there despite prod not being migration-faithful.
`contact_attempt_round` is `smallint NOT NULL default 0` — the generated type is correct and the
`number | null` handling in `shared/contactFollowUp.ts` is over-defensive but harmless.

**Single duplicate in all history is the key number.** It justifies the near-free browser-write
removal and argues against the Phase 2 RPC. Cron-vs-cron overlap is still unmeasured: the first
attempt used a 30-day window that straddles the 10-08 cooldown fix, so it measured the closed
incident rather than current behaviour. Re-measured 18-08-2026 over the post-fix window (`created_at >= 2026-08-11`), using `lag()` on
consecutive reminders per lead rather than the hour-bucket proxy:

| Measure | Value |
| --- | --- |
| Reminders inside the 6h cooldown | **0** |
| Leads affected | 0 |
| Tightest gap between reminders | null |

Corroborated by daily volume 11-08 to 17-08: 147-194 notifications/day across 42-53 distinct leads,
i.e. **2.88-3.90 reminders per lead per day** against a hard ceiling of 4 that the 6h cooldown
implies. No day exceeds the ceiling, so the stamp is holding on a second, independent measure.
Flat ~177/day with no growth — use as the post-deploy comparison baseline.

**Phase 2 (atomic claim RPC) is not justified by evidence.** Its purpose was preventing overlapping
runs from double-claiming work, and there are zero such events in a week of production. Do not
build it on speculation. The one gap the RPC would still close is atomicity of the loss update and
its audit event — a distinct failure mode from concurrency, measurable as leads that reached
`lost`/`unable_to_contact` with no `lost` row in `lead_events`. **Measured 18-08-2026: 0 rows.**

### Phase 2 is closed on evidence, not deferred

Every justification for the atomic claim RPC measured zero in production:

| Failure the RPC would prevent | Observed |
| --- | --- |
| Overlapping runs double-claiming a reminder | 0 in 7 days |
| Loss update committed without its audit event | 0, all time |
| Duplicate auto-lost `lead_events` (browser race) | 1, all time — fixed by the v1.1.176 browser-write removal |

Do not build the RPC, the migration, the server kill switch, or the shadow-mode rollout without new
evidence. Re-run the three queries above if follow-up volume grows by an order of magnitude or the
cron cadence tightens; until then this is speculative work with a measured-zero payoff.

What is left of this card is **maintainability only, no bug attached**: the Phase 1 planner module
(single policy surface), Phase 3 steps 3-4 (migrate remaining public callers off the free-form
`type`; the injection hole itself is already closed), and Phase 5 alias cleanup. None of it is
urgent, and `DUE_DILIGENCE_REVIEW.md` freezes new work while dd1 is open.

What remains **open**, and why it was deferred rather than dropped:

- **Phase 2 atomic persistence.** Two overlapping cron runs can still double-stamp a reminder, and a
  loss update is still not transactionally paired with its audit event. With one automatic writer
  instead of three, overlap is now the only remaining race on a job that runs every 15 minutes and
  finishes in seconds. Measure before committing to the RPC: duplicate `lost` events per `lead_id`,
  and cron `elapsedMs` against the cadence.
- **Phase 1 planner module** and **Phase 5 scaffolding removal** — pure structure, no bug attached.
- **Phase 3 public callers** (`api/send-sms.ts`, inbound auto-assign, quotes) still route through
  `notifyOrgUser`. Safe, since it now always checks membership, but `type` is still a free-form
  string doubling as a transport switch.

Historical rows are untouched: duplicate `lead_events` already in the database were not cleaned up.

## Related

- Done: `contact-follow-up-cron-multi-attempt-to-lost-2026-07-01`
- Done: `cron-follow-up-reminder-spam-2026-08-10`
- Done: `isolate-overloaded-cron-chain-2026-08-17`
- Backlog (later, do not mix): `dd14-decompose-leadspage-2026-08-06`
- Architecture candidates 03–07 (lead workflow, booking, feature switches, send-sms hub, shared database contract) stay out of this card except the follow-up-owned slice of candidate 07 in Phase 0 and candidate 02 in Phase 3
