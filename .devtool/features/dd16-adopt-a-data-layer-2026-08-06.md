---
id: "dd16-adopt-a-data-layer-2026-08-06"
status: "backlog"
priority: "low"
assignee: null
dueDate: null
created: "2026-08-06T16:00:00.000Z"
modified: "2026-08-19T17:15:00.000Z"
completedAt: null
labels: ["due-diligence", "tech-debt", "frontend", "architecture"]
order: "ZI"
---

# DD16 Adopt a data layer

There is no React Query / SWR / equivalent. Data fetching is manual `useEffect` + `useState`, with **33 raw `supabase.from()` calls scattered through `src/`**.

Consequences: no request deduplication, no cache, no background refetch, no stale-while-revalidate, and loading/error state hand-rolled at every call site.

**Why this is the diagnosis behind Tier 1, not just debt:** every reliability fix in T1.1–T1.8 had to be applied **site by site** — `runLeadUpdate` here, `fetchWithTimeout` there, an offline-queue fallback in a third place. With a data layer, "every write confirms or queues" would have been one change in one place. The next reliability requirement will cost the same site-by-site price.

**Honest recommendation: accept the debt for now.** A full retrofit is Hard, it touches the money path that T1.x just stabilised, and it competes with `dd1`/`dd13` for the only developer. This card exists so the decision is deliberate rather than accidental.

**Spec (when it is taken on):**
- Adopt TanStack Query. Wrap the app once, configure sensible `staleTime` for a field app on flaky signal.
- **Migrate reads first, writes later.** Reads are safe; writes are where T1.x's queue/timeout/conflict-guard behaviour lives and must be preserved exactly.
- The existing IndexedDB cache (`dd`/T1.4) and TanStack's cache overlap — decide which owns offline reads before starting, or you will have two caches disagreeing about the same lead.
- Migrate opportunistically alongside `dd14`'s `useLeadsData` extraction — that hook is the natural first adopter.

**Interim rule (adopt now, costs nothing):** **no new raw `supabase.from()` calls in components.** New reads go through a hook in `src/hooks/`. This stops the problem growing while the decision is deferred.

**Feature switch:** none.

**Done when (if taken on):** reads flow through the query layer; the offline cache ownership question is resolved and documented; the Tier 1 "done when" criteria still pass manually.

**Difficulty:** Hard to retrofit. The interim rule is Easy and should be adopted regardless.

Source: DUE_DILIGENCE_REVIEW.md — Phase 2, I5.


---

## Verified against the code 19-08-2026

Card quotes **33** raw `supabase.from()` calls in components. Actual count today is **17** across `src/components` + `src/pages` — roughly half what the review claimed. No `@tanstack/react-query` or `swr` in `package.json`.

The debt is real but smaller than carded, which weakens the case for a retrofit further.
