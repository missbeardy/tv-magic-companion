---
id: "orphan-edge-functions-2026-08-26"
status: "done"
priority: "high"
assignee: null
epic: "Tech debt"
dueDate: null
created: "2026-08-26T06:30:00.000Z"
modified: "2026-08-31T00:00:00.000Z"
completedAt: "2026-08-31T00:00:00.000Z"
labels: ["tech-debt", "security", "edge-functions"]
order: "ZL"
---

# Orphan edge functions

Found 26-08-2026 by the first run of `npm run audit:prod`.

## Why

Three edge functions are live on the production Supabase project with **no source anywhere
in this repo** and no commit that ever added them:

| Function | Deployed | Last deploy |
|---|---|---|
| `create-employee` | v11 | 12-06-2026 |
| `notify-lead-expired` | v5 | 10-06-2026 |
| `update-org` | v7 | 12-06-2026 |

`supabase/functions/` contains only `notify-message`. Searching the tree for their names
returns nothing — not a call site, not a migration, not a doc.

Two names suggest privileged work: `create-employee` almost certainly uses the service role
to create auth users, and `update-org` to mutate org records. They are publicly reachable
URLs whose authentication nobody can currently read. Nothing in the repo appears to call
them — there is not a single `functions.invoke(` in `src/`, `api/` or `shared/` — so the
most likely story is that they predate the current `api/create-user.ts` path and were left
running.

"Probably dead" and "definitely dead" are different things when the thing holds a service
role key.

## Spec

1. Pull each deployed body and read it (`GET /v1/projects/<ref>/functions/<slug>/body` —
   returns an eszip bundle, so use the dashboard editor to read it as source).
2. For each: confirm whether anything still calls it. Supabase function logs will show
   invocations, which settles it better than grepping.
3. Then either **commit the source** to `supabase/functions/<slug>/` so it is reviewable and
   redeployable, or **delete the deployment**. Not both, and not neither.

Deleting is the better default under the review's "subtraction beats addition" rule, but
only after step 2 — a silent 404 on a function something still calls would be one more
invisible failure.

## Feature switch

**None.** Cleanup.

## Done when

- Each of the three is either committed to the repo or removed from the project
- `npm run audit:prod` reports no `edge-orphan` findings

## Resolution (31-08-2026)

Pulled each deployed eszip body and extracted the original source from its embedded
source map. Checked prod for anything still wiring them up: `information_schema.triggers`,
the full history of `supabase_functions.hooks`, and `cron.job` — none reference any of the
three function names, ever. No call site in the repo either.

- `create-employee` — created users with a raw password and, when no auth header was sent,
  trusted a client-supplied `org_id` with no role check at all. Fully superseded by
  `api/create-user.ts` (invite-based, validates the caller is a manager, blocks cross-org
  and privilege-escalation). The orphan was strictly less secure than what replaced it.
- `update-org` — did check the caller was a manager, but is fully superseded by the direct
  RLS-protected `orgs` update in `src/pages/OrgSettingsPage.tsx`.
- `notify-lead-expired` — sent a lead-expiry push via OneSignal, which is on the dd10
  teardown path. Confirmed dead, not just deprecated: nothing in prod invokes it.

All three confirmed dead and deleted from the Supabase project via the Management API
(`DELETE /v1/projects/<ref>/functions/<slug>`). `npm run audit:prod` reports no
`edge-orphan` findings and the `Prod config audit` GitHub Actions workflow is green again.

## Related

- Found by: `prod-config-drift-audit`
- Same root cause as [[edge-functions-drift]]: nothing tied deployments to the repo
