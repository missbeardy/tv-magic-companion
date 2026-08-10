---
id: "dd15-accessibility-pass-2026-08-06"
status: "backlog"
priority: "medium"
assignee: null
dueDate: null
created: "2026-08-06T16:00:00.000Z"
modified: "2026-08-06T17:00:00.000Z"
completedAt: null
labels: ["due-diligence", "accessibility", "ux", "frontend"]
order: "ZH"
---

# DD15 Accessibility pass

Scored **3/10** — the lowest score in the review.

**Measured across `src/`:**

- 33 `aria-label` attributes against **235 `<button>` elements**
- 8 `role` attributes total
- 18 `alt` attributes
- No focus-trap audit on the bottom sheets / modals
- No automated accessibility testing in the 534-test suite

**Honest framing:** for a one-handed field app used in bright sun in a van, contrast and target size matter more day-to-day than screen-reader support — and T1.8 already did good work on tap targets (≥44px on the money path). This is not a crisis for the current user.

It matters because: (a) Play Store listings attract accessibility scrutiny, (b) a Lighthouse a11y audit would fail badly and that audit is a stranger's first technical impression, and (c) icon-only buttons with no label are a usability problem for *everyone*, not just assistive-tech users — "what does this button do?" is a support ticket.

## Spec

- `aria-label` on every icon-only button — start with the highest-frequency: LeadCard actions, LeadStatusMenu trigger, MobileBottomNav, MobileNavFab, NotificationBell, photo share/delete controls.
- Focus management on `BottomSheet.tsx` and every modal: trap focus while open, restore focus to the trigger on close, Escape to dismiss. `BottomSheet` is reused widely, so fixing it once covers a lot of surface.
- `role` / `aria-live` on the toast host (`ToastHost.tsx`) and the offline banner — status changes that are currently visual-only.
- Contrast audit against WCAG AA on the brand palette, especially status pills and the primary `#004B93` on white.
- Add `vitest-axe` or equivalent to the suite for at least the top five components.
- Run Lighthouse a11y and record the before/after score in this card.

**Feature switch:** none.

## Done when

- [ ] No icon-only button lacks a label.
- [ ] Sheets and modals trap and restore focus.
- [ ] Lighthouse a11y materially improved (target 90+).
- [ ] Automated a11y assertions exist for the top five components.

**Difficulty:** Medium — broad but shallow.

Source: DUE_DILIGENCE_REVIEW.md — Phase 3, Phase 9 (Accessibility 3/10).
