---
id: "visualise-mobile-uplift-2026-08-31"
status: "in-progress"
priority: "high"
assignee: null
dueDate: null
created: "2026-08-31T04:00:00.000Z"
modified: "2026-08-31T04:00:00.000Z"
completedAt: null
labels: ["campaign", "ux", "accessibility"]
order: "ZD"
---

# Visualise mobile-first UX uplift

A UX review of `/visualise` on 31-08-2026 across 360 / 390 / 1440 found 21 issues. The concept works — the 3D room in particular is strong — but the mobile build has three problems working against it at once:

1. **Every primary CTA fails WCAG AA contrast by roughly half.** White on `#14bac1` measures **2.38:1** against a 4.5:1 requirement. Not one button: the nav Quote, the sticky bottom bar, the form submit, Upload photo, Ideal spot, the selected product tab. Small cyan-on-white labels (CEILING / CENTRE / FLOOR, SUMMARY) are the same 2.38. The coral guarantee card is 3.80.
2. **The core gesture has no instruction on mobile.** The "Drag the TV to set height" hint carries `hidden … sm:block` in `PhotoWall.tsx` — confirmed not rendered at 390px. 3D mode *does* show a mobile hint; photo mode, the default tab a phone user lands on, does not.
3. **Nothing on the phone's first screen sells anything.** Because the stage is `order-1` on mobile, the H1 sits at ~660px and the 460,000-TVs proof at ~1,500px. What loads first is a control panel for a wall that does not exist yet.

**Spec — 19 of the 21 findings:**

- **C1** Split `--c-cyan` into a graphics token and `--c-cyan-ink: #00787f` (5.26:1); darken `--c-coral` to `#d33a43` (4.71:1 both directions).
- **C2** Unhide the drag hint mobile-first; add a grab affordance and a single first-run pulse.
- **C3** 3.00 MB of models ship for the 3D tab, **1.83 MB of it one decorative pot plant** at ~40×60px on a phone. Resize textures to 512px with `sharp`; drop the plant's normal and MR maps. Target under 400 KB.
- **C4** `html, body { height: 100% }` (PWA shell) makes `body` the scroller, so `useScroll()` returns 0 forever — the progress rule never moves, parallax never fires, iOS never collapses its URL bar. Scope a reset to this route.
- **H1/M4** Compact mobile hero band (H1 + promise + proof strip) above the stage; drop the orphaned mobile hero.
- **H2** Re-rank entry buttons on mobile: camera primary, sample secondary, the rest as links.
- **H3** Gate `DimensionReadout` and the dimension fields behind a loaded photo.
- **H4** In-stage size chips so choosing a size shows the size — the see → change → see loop currently never closes on mobile.
- **H5/M11** Presets (2.4 m · 2.7 m · 3.0 m · Custom) plus a slider instead of keypad entry; `mm` suffix.
- **H6** 44px minimum inside the stage. "Ideal spot" is currently **76×26**.
- **M1** `scroll-mt-16` on `#visualise` and `#catalog` to match `#quote`.
- **M2** Suppress the sticky bar while `#quote` is on screen.
- **M3** Summary above the submit button, with one line of reassurance.
- **M5** Edge fade masks; wrap the kind tabs at 390px ("Speakers" is cut mid-word, "Art" is hidden).
- **M6** Card second line carries dimensions instead of restating the first.
- **M8** Drop the deprecated `appearance: slider-vertical`; 44px thumb.
- **M9** Replace the orbit hint's chevrons — they read as carousel controls.
- **M10 (partial)** Add `'wasm-unsafe-eval'` to the report-only `script-src`; the `Room3D` chunk already logs a WASM violation.

**Feature switch:** none. This is UX correction on an ungated public marketing route (`src/App.tsx:119`), not a feature — there is nothing to toggle per brand.

**Out of scope:**

- **M7** `object-contain` letterboxing. Moving to `object-cover` means rewriting `containedRect()` and remapping ceiling/floor calibration onto a cover rect. That maths is what the millimetre accuracy claim rests on — its own session, with manual testing on real photos.
- **M10** CSP promotion. Tracked as `dd9`, edits a global header affecting the whole staff PWA, sequenced behind `dd1`. Only the one-line report-only addition lands here.

**Done when:** every interactive element in the stage clears 44×44 and 4.5:1, the drag hint renders at 390px, the first mobile screen carries headline and proof above the stage, choosing a size updates a visible TV, the 3D room loads under 400 KB, and `window.scrollY` advances on scroll. E2E coverage on the Playwright `mobile` project guards C2, H3, H4 and M2; a vitest guards the C1 ratios.

**Difficulty:** Medium.

Source: UX review 31-08-2026.
