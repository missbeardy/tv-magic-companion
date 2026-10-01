---
id: "overdue-bookings-show-the-date-nudge-the-employee-2026-10-01"
status: "in-progress"
priority: "high"
assignee: null
dueDate: null
created: "2026-10-01T00:00:00.000Z"
modified: "2026-10-01T00:00:00.000Z"
completedAt: null
labels: ["kanban", "notifications", "bookings"]
order: "a4"
---

# Overdue bookings: show the date, nudge the employee

Owner request 01-10-2026. ROADMAP block: **T1.21**.

The Booked column banks up: cards don't show when the booking is, so past jobs that were
never closed out (completed / lost / rescheduled) are indistinguishable from future ones.

## Decisions (owner, 01-10-2026)

- No feature switch.
- Employee: in-app bell + push, ONE per day covering all their overdue jobs, business hours
  (changed from per-lead at ship time: prod had 148 overdue, 55 for one tech).
- Managers: one daily digest notification while any bookings are overdue.

## Build

- Board fetches latest `events` row per lead; Booked card shows date, red "Booking passed" when
  the booking ended >2h ago; Booked column sorts overdue-first with an overdue count.
- `automation-sweeps` cron → `api/_lib/bookingOverdue.ts`; dedupe on the sweep's own
  `notifications` rows by title; notification type `calendar`. Date on the card links to
  `/calendar?event=<id>`.
