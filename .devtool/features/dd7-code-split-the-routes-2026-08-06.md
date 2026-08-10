---
id: "dd7-code-split-the-routes-2026-08-06"
status: "review"
priority: "high"
assignee: null
dueDate: null
created: "2026-08-06T16:00:00.000Z"
modified: "2026-08-06T21:45:00.000Z"
completedAt: null
labels: ["due-diligence", "performance", "frontend", "mobile"]
order: "Z7"
---

# DD7 Code-split the routes

**Measured, `vite build` on v1.1.154:**

```
dist/assets/index-DU2sRv7w.js   1,555.33 kB │ gzip: 438.67 kB
precache 12 entries (1667.12 KiB)
```

21 routes in `src/App.tsx` and **zero `React.lazy`, zero `Suspense`, zero dynamic imports.** Recharts (reports), `@xyflow/react` (Platform Admin workflow graphs), `@dnd-kit` (desktop kanban) and canvas-confetti all ship to every user on first load.

**Why it matters:** this directly contradicts marketing pillar 3 — *"built for the phone in your pocket… works on a $300 Android."* 439 kB gzip is roughly 4–8 seconds of parse+execute on a budget Android over 3G, and it lands at the highest-value moment in the product: a tech opening the app to check an address at a job site. The `@xyflow` graph library exists for a Platform Admin screen only the founder will ever open, and every field tech downloads it.

**Spec:**
- `React.lazy` + `Suspense` on at minimum: `ReportsPage` (recharts), `PlatformAdminPage` (@xyflow + the whole `components/platform/` tree), `SocialPage` (delete instead if `dd18` lands first), `CalendarPage`, `QuoteAcceptPage` / `InvoiceStatusPage` (public routes — no reason for a customer opening a quote link to download the whole CRM).
- Route-level fallback that isn't a blank screen (a skeleton, matching the offline/cached patterns already in use).
- Fix the `INEFFECTIVE_DYNAMIC_IMPORT` warning on `src/lib/apiAuth.ts` (dynamically imported by `PlatformAdminPage` but statically imported by 6+ components, so it never splits out).
- Re-measure and record the new numbers in the card on completion.

**Feature switch:** none.

**Done when:** the field-tech entry path (login → leads) downloads materially less than 439 kB gzip — target under 250 kB; admin/report chunks load on demand; no regression in the offline precache behaviour (check the `injectManifest` glob still covers what `sw.js` expects).

**Difficulty:** Easy — a couple of hours for the largest single UX win available.

Source: DUE_DILIGENCE_REVIEW.md — Phase 2, I1.

## Build status (06-08-2026) — real win, short of the <250kB target

**Re-measured, `vite build` on v1.1.160** (note: baseline had already grown to 1,808 kB/520 kB
gzip by the time this was picked up — dd1's Sentry/PostHog additions landed first this session):

```
Before (v1.1.159, this session): dist/assets/index-*.js  1,807.88 kB │ gzip: 520.38 kB  (1 chunk)
After  (v1.1.160):                dist/assets/index-*.js  1,069.84 kB │ gzip: 311.75 kB  (+ 10 lazy chunks)
```

**A 40% cut in the field-tech entry-path download (520 kB → 312 kB gzip), short of the card's
<250 kB target.** The remaining weight in the main chunk is `@dnd-kit` (desktop kanban) and
`canvas-confetti`, both imported directly by `LeadsPage.tsx` — the field-tech path itself, so they
can't be lazy-loaded at the route level the way Reports/Platform Admin/Calendar could. Getting
under 250 kB means extracting the desktop-kanban view out of `LeadsPage.tsx` into its own
lazy-loaded component, which is real surgery on the 1,412-line file `dd14` already exists to
decompose — doing it as a drive-by here risked the money-path file for a bundle-size chase. Left
as a note for whoever picks up `dd14`: pull the dnd-kit-dependent kanban board out first, lazy-load
it, and this card's target becomes reachable almost for free.

**Shipped in code (v1.1.160, uncommitted pending owner review):**
- `React.lazy` + one root-level `<Suspense>` (not per-route — simpler, same effect) around
  `CalendarPage`, `SocialPage`, `ReportsPage`, `OrgSettingsPage`, `PlatformAdminPage`,
  `QuoteAcceptPage`, `InvoiceStatusPage`, plus this session's new `PrivacyPolicyPage` /
  `TermsOfServicePage` / `DeleteAccountPage` (rarely visited, no reason to ship them eagerly
  either).
- `src/components/RouteLoadingFallback.tsx` — the fallback, matching the existing centered
  "Loading..." treatment already used by `ProtectedRoute`/`Login`/`Dashboard`, not a new visual
  pattern.
- Fixed the `INEFFECTIVE_DYNAMIC_IMPORT` warning: `PlatformAdminPage.tsx` had a pointless
  `await import('../lib/apiAuth')` — pointless because `apiAuth.ts` is already statically
  imported by 6+ other components, so the dynamic import bought zero splitting benefit, just
  overhead. Changed to a normal static import.
- Confirmed no offline-precache regression: `vite.config.ts`'s `injectManifest` glob
  (`**/*.{js,css,html,ico,png,svg,woff2}`) still matches every new chunk file; precache went from
  9 entries/~1,874 KiB to 22 entries/~1,890 KiB (more, smaller files — the service worker still
  caches everything for offline use, code-splitting only changes what's downloaded *before* the
  SW finishes its background precache).
- `npm run typecheck` clean, full suite green: **558/558** (route-level splitting doesn't affect
  component-level tests like `WorkflowRunsPage.test.tsx`, which import the component directly).

**Left to close this card out:** either accept 312 kB gzip as the win for now, or fold the
dnd-kit-extraction into `dd14` to reach the original <250 kB target.
