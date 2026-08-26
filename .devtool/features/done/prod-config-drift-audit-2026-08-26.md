---
id: "prod-config-drift-audit-2026-08-26"
status: "done"
priority: "high"
assignee: null
epic: "Observability"
dueDate: null
created: "2026-08-26T06:30:00.000Z"
modified: "2026-08-26T06:30:00.000Z"
completedAt: "2026-08-26T06:30:00.000Z"
labels: ["observability", "ci", "tooling"]
order: "Z1"
---

# Prod config drift audit

Owner request, 26-08-2026, immediately after the notification outage. "Is this something we
can have as an alert somewhere as well?"

## Why

The outage had two causes and **neither was visible from this repo**:

1. `notify-message` was live at v3 (12-07) while `143e2df` (10-08) had migrated push off
   OneSignal. `supabase/functions/*` ships only via a manual `supabase functions deploy` —
   a merge to main deploys the Vercel app and leaves edge functions frozen.
2. `PLATFORM_URL` was never set on the Supabase project, so even a correct deploy would
   have hit the fail-closed branch and returned success.

Tests passed. Typecheck passed. CI was green. The repo looked correct because it *was*
correct — production was not. No diff-scoped review can catch that, which is why
`/code-review`, `/security-review` and `/simplify` were all the wrong tool.

## Spec

`scripts/audit-prod-config.mjs`, read-only, exit 1 on any finding:

- **edge-drift** — a function whose last commit is newer than its deployment date
- **edge-orphan** — deployed with no source in the repo
- **edge-missing** — in the repo but never deployed
- **edge-secret** — a `Deno.env.get("X")` with no matching Supabase secret (the
  `PLATFORM_URL` bug, caught directly)
- **vercel-env** — a short curated list of vars whose absence degrades to a *no-op*
  rather than an error

That last list is hand-maintained on purpose. Deriving it from every `process.env.X` in
the tree yields ~24 entries, most of them legitimately optional, and a check that cries
wolf stops being read.

A skipped check prints `SKIPPED — this is not a pass`. Reporting absence as success is
the exact failure mode the script exists to catch, and it must not commit it itself.

`.github/workflows/prod-config-audit.yml` runs it on push to main (a merge touching an
edge function creates drift at that moment) and daily at 20:00 UTC (a secret can be
removed with no commit at all). `fetch-depth: 0` — the drift check needs real git history
or every function reads as "no history".

## Feature switch

**None.** Build tooling, not runtime behaviour, and nothing a brand would turn off.

## Done when

- The audit finds real drift when run against prod
- CI fails on a stale edge function
- A missing Vercel token reads as skipped, never as clean

## Built — 26-08-2026

Working on first run. Correctly reported three orphaned edge functions, no drift on
`notify-message`, and refused to claim the Vercel half passed without a token.

**Outstanding — the alert is not armed yet.** GitHub needs, from the owner:

- Secrets: `SUPABASE_ACCESS_TOKEN`, `VERCEL_TOKEN`
- Variables: `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID` (`.vercel/` is gitignored, so CI
  cannot read the linked project the way a local run does)

Until then the Supabase half runs and the Vercel half prints SKIPPED.

## Related

- Cause it was built for: [[edge-functions-drift]]
- Findings from the first run: `dd1-observability-is-inert-in-prod`, `orphan-edge-functions`
