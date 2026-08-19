---
id: "dd19-cut-the-feature-switch-catalog-to-twelve-2026-08-06"
status: "backlog"
priority: "medium"
assignee: null
dueDate: null
created: "2026-08-06T16:00:00.000Z"
modified: "2026-08-19T17:15:00.000Z"
completedAt: null
labels: ["due-diligence", "subtraction", "product", "ux"]
order: "ZE"
---

# DD19 Cut the feature switch catalog to twelve

**The deepest feature creep in the product, disguised as architecture.**

`shared/featureSwitchCatalog.ts` holds 32 per-brand switches with tier gating, catalog defaults, code defaults, and a Platform Admin UI. Combined with two operation modes (`solo` vs `team`, which change core mechanics — pool timers, contact rounds, auto-assign), **the product has thousands of possible configurations and approximately one has ever been tested.**

Franchise-grade configurability was built before a single stranger validated the defaults. T2.6 exists specifically because *"new orgs feel empty with switches default off"* — that is the symptom. The disease is the switch system itself.

Every switch is: a branch to test, a support question to answer, a line in the onboarding runbook, and a way for a customer to have a broken product without knowing why.

**Spec:**
1. **Classify all 32.** Three buckets:
   - **Wedge — delete the switch, ship it ON always.** The nine-step spine: `inbound_sms`, `inbound_email`, `inbound_calls`, `lead_ack_sms`, `manager_new_lead_alerts`, `quote_esign`, `price_list`, `booking_confirm`, `one_tap_invoice`, `invoice_card_payments`, `review_requests`, `auto_review_on_paid`, `invoice_chase`, `quote_chase`, `booking_reminder_sms`. If it is in the 60-second demo, it is not optional.
   - **Genuine per-brand choice — keep.** Things a real business would legitimately turn off: `tech_location` (employee GPS — privacy-sensitive, see `dd3`), `completion_upsells`, `customer_ontheway_sms`, `internal_messaging`, `xero_live_sync`, `accounting_export`.
   - **Dead or transitional — delete with the feature.** `native_web_push` (goes with `dd10`), anything gating deleted features (`dd18`), `onboarding_tips`, `smart_assign_badge`.
2. **Target ~12 switches.** Anything that survives must answer: *"which real customer would turn this off, and why?"* If there is no answer, it is not a switch — it is an untested branch.
3. **Every survivor defaults ON** for the solo tradie preset. T2.6's preset then becomes nearly redundant, which is the point.
4. Update `FEATURE_SWITCH_MIN_TIERS` so the sellable wedge is actually inside the tier you sell at $69 (BUSINESS.md flags this as unresolved).
5. Migration to drop removed rows from `brand_feature_switches` / `feature_flag_catalog` / `org_feature_switch_overrides`.

**Standing convention conflict — flag for owner:** the "ask whether a per-brand switch is needed on every feature" rule (memory + ROADMAP governance #3) is what produced 32 switches. The review's position is that the default answer should flip to **no** unless a named customer would turn it off. That is an owner decision, not a session decision.

**Done when:** the catalog is ~12 switches; every remaining one has a written "who turns this off" justification in the catalog file; a brand-new org with zero configuration can run the full 60-second demo.

**Difficulty:** Medium — the deletion is easy, the classification decisions are the work.

Source: DUE_DILIGENCE_REVIEW.md — Phase 3, Phase 4, Phase 8 Remove item 27.


---

## Verified against the code 19-08-2026

Card quotes **32** switches from the 06-08 review. Actual count today is **34** — `assignment_exclusions`, `weekly_leaderboard_nudge` and `native_web_push` were added since. The catalog is moving away from the target, not toward it.

Adding a key is **six edits**: `FEATURE_SWITCH_KEYS`, `FEATURE_SWITCHES_BY_CATEGORY`, `FEATURE_SWITCH_CATEGORY_BY_KEY` and `FEATURE_SWITCH_MIN_TIERS` in `shared/featureSwitchCatalog.ts`, then `FEATURE_SWITCH_DEFAULTS` and the label/description map in `src/lib/features.ts` — plus a migration inserting into `feature_flag_catalog` and backfilling `brand_feature_switches`. Note there is no `src/lib/featureSwitchCatalog.ts`; the canonical file is the `shared/` one.
