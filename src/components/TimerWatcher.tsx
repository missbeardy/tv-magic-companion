// src/components/TimerWatcher.tsx
//
// Expiry is now handled entirely server-side by a pg_cron job calling
// public.expire_overdue_leads() once per minute.
//
// This component can be deleted from your tree and removed from wherever
// it's mounted. The UI already updates correctly without it:
// AssignedLeads.tsx subscribes to postgres_changes on the `leads` table,
// so when the cron job flips a lead's status to 'unassigned', that
// subscription fires and the card disappears — no client-side
// timer-checking required.
//
// Kept as a no-op export so you don't get an import error anywhere it's
// still referenced — remove the import/usage at your convenience, then
// delete this file.

export default function TimerWatcher() {
  return null
}