---
id: "orphan-edge-functions-2026-08-26"
status: "backlog"
priority: "high"
assignee: null
epic: "Tech debt"
dueDate: null
created: "2026-08-26T06:30:00.000Z"
modified: "2026-08-26T06:30:00.000Z"
completedAt: null
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

## Related

- Found by: `prod-config-drift-audit`
- Same root cause as [[edge-functions-drift]]: nothing tied deployments to the repo
