-- dd3: in-app account deletion (self-service) + a web-accessible deletion request path,
-- two of Google Play's account-deletion requirements. Deletion here means the individual
-- staff member's own login/profile PII — organisational business records (leads, customers,
-- invoices) are NOT touched by this, they belong to the org and have separate retention
-- obligations (invoices in particular: ATO record-keeping, see DUE_DILIGENCE_REVIEW.md dd3).

alter table profiles add column if not exists deleted_at timestamptz;

-- Public (unauthenticated) deletion requests, for someone who wants their data gone but either
-- isn't currently logged in or wants a human to handle org-level data alongside their own login.
-- Processed manually by the platform admin (alerted via SMS on insert, see accountDeletion.ts).
create table if not exists account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  org_hint text,
  note text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

-- Server-only: the public form and the in-app self-service action both go through the service
-- role (api/_lib/accountDeletion.ts), never directly from the client over PostgREST.
alter table account_deletion_requests enable row level security;
