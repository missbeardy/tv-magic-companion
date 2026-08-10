-- dd4: replace the five broken module-scope Map() rate limiters (wiped on every cold start,
-- and every concurrent Lambda instance gets its own — see DUE_DILIGENCE_REVIEW.md Phase 2 C2)
-- with an honest, atomic, Postgres-backed fixed-window counter.

create table if not exists rate_limit_hits (
  key text not null,
  window_start timestamptz not null,
  count integer not null default 1,
  primary key (key, window_start)
);

create index if not exists rate_limit_hits_window_start_idx on rate_limit_hits (window_start);

-- Server-only accounting table: never queried by anon/authenticated over PostgREST.
-- RLS enabled with no policies (default-deny) so only the service-role key can touch it.
alter table rate_limit_hits enable row level security;

-- Atomic increment-and-return-count. A plain select-then-update from the client would race
-- under concurrent requests (the exact bug being fixed here) — INSERT ... ON CONFLICT is a
-- single atomic statement even under concurrent transactions targeting the same key.
create or replace function increment_rate_limit(p_key text, p_window_start timestamptz)
returns integer
language plpgsql
as $$
declare
  new_count integer;
begin
  insert into rate_limit_hits (key, window_start, count)
  values (p_key, p_window_start, 1)
  on conflict (key, window_start)
  do update set count = rate_limit_hits.count + 1
  returning count into new_count;
  return new_count;
end;
$$;
