---
id: "t1-14-technician-job-exclusions-2026-08-11"
status: "review"
priority: "high"
assignee: null
dueDate: null
created: "2026-08-11T00:00:00.000Z"
modified: "2026-08-11T00:00:00.000Z"
completedAt: null
labels: ["roadmap", "t1", "team-operations"]
order: "a2"
---
# T1.14 Per-technician job exclusions

Owner request 11-08-2026: the client has a technician who cannot do Starlink, and auto-assign has no way to know that. Today `api/_lib/teamInboundLead.ts` filters candidates on four things only — role, `is_hidden_test_profile`, a same-day `Leave` event, and active workload — then picks min-workload → nearest → oldest. **No skill, capability, certification or exclusion concept exists anywhere in the codebase.** So a Starlink lead can land on the one person who can't do it, the assignment SMS fires, the 4-hour timer starts, and the lead ages until a human notices.

## Spec

Per-person `text[]` of exclusion keywords (`profiles.excluded_service_keywords`), matched case-insensitively against **the inbound text, not `service_type`**.

Two constraints found during planning forced that choice:

1. **There is no service-type taxonomy.** `leads.service_type` is free text — no enum, no catalog table, no CHECK. Three *different* hardcoded lists live inside Claude prompt strings (`extractLead.ts:70`, `:84`, `aiPrompts.ts:23`) and none of them contains "Starlink" — it classifies as `"Other"` today. `brands.ai_config.service_types` exists in the brand seed but is read by nothing.
2. **Auto-assign runs before AI extraction.** `rawFirstLead.ts:57-68` assigns inside `insertRawFirstLead`, while `service_type` is still the raw-first placeholder (`'Other'` for SMS, `'General Enquiry'` for email). Anything keyed on that column reads the wrong value on every inbound lead.

Haystack = `service_type` + `details` + `raw_sms`/`raw_email`. Pure matcher in `shared/serviceExclusions.ts` with vitest cover; the filter is applied to **both** the tech and manager lists before `selectAssignmentPool`, so the existing empty-pool early return gives the agreed fallback for free — when everyone is excluded the lead stays `unassigned` in the pool and the standard manager alert fires. It is never assigned to someone who cannot do it.

Manual assign (`AssignLeadModal`) **warns rather than blocks**: red badge, sorted last, inline confirm. A manager may know the flag is stale.

Manager UI extends the Team Management card on `ProfilePage` — which today holds only "+ Create New Employee Account" and lists no existing employees at all. Writes go through a new `?action=set-exclusions` on the `create-user` hub, because `profiles_update_self` RLS restricts updates to `id = auth.uid()` (a manager cannot write another profile's row from the client) and the Vercel Hobby function cap is at 12/12.

**Feature switch:** new per-brand `assignment_exclusions` (default off, category `team_operations`, min_tier basic), gating the **server** filter, not just the UI badges.

**Tension worth recording:** this makes the catalog 33 switches while [[dd19]] ("cut the feature switch catalog to twelve") is open backlog. Owner chose the switch anyway on 11-08-2026 so exclusions can be turned off independently of `inbound_auto_assign`.

**Deployed 11-08-2026 (v1.1.171)** — prod `readyState: READY`, 593 tests green, hubs smoke-checked (`create-user` 405, `?action=set-exclusions` 401). **Inert until the migration is applied and the switch is enabled**: `isFeatureEnabledForOrg` returns `catalogRow?.default_enabled === true`, so with no catalog row the feature is hard-off.

Gotcha for the next session: the `src/lib/features.ts` half of this change leaked into the v1.1.170 social-posting commit without its `shared/featureSwitchCatalog.ts` counterpart, breaking that build with `TS2741`. Reverted in `e347b25`, restored here. **A switch key must land in both files in the same commit** — `FEATURE_SWITCH_DEFAULTS` and `FEATURE_SWITCH_DEFINITIONS` are `Record<FeatureSwitchKey, …>`, so the union and its two tables are one atomic change.

## Done when

- [ ] Owner applies `supabase/migrations/20260811120000_assignment_exclusions.sql` to prod (Management API) and enables `assignment_exclusions` for `tv-magic`.
- [ ] Switch on: an inbound SMS reading "Starlink installation plus wifi extender" assigns to someone *other than* the excluded tech, even when that tech has the lowest workload and is nearest.
- [ ] "TV aerial not working" still assigns to that same tech.
- [ ] Exclude every tech and manager → lead lands `unassigned`, manager alert fires, no assignment SMS sent.
- [ ] Manual assign shows the red badge, sorts the excluded tech last, and requires a confirm to override.
- [ ] Switch off → routing byte-for-byte unchanged and badges gone.

## Not in this item

- **Pool pickup bypasses the check.** `src/lib/leadPoolPickup.ts:15-21` self-assigns the actor on *any* status change out of `unassigned`, so an excluded employee can still pull the lead off the board by dragging it. Threading the check through the drag and status-menu paths is separate work.
- **Solo mode** always assigns the owner; exclusions are meaningless there and are not applied.
- **Semantics.** Keyword-on-text catches the word, not the concept — "satellite internet dish" with no "Starlink" in it will not match. The proper fix is a real service-type catalog (seams: the unused `brands.ai_config.service_types`, the orphaned `LeadFilterBar.tsx`), a much larger item this one does not block.

**Difficulty:** Medium.

Source: ROADMAP.md — Tier 1, T1.14 (added 11-08-2026, owner request).
