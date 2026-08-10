-- dd5: per-org monthly token ceiling for the LLM proxy, so a compromised session or a bug
-- can no longer run up unbounded Anthropic spend on the platform key.

create table if not exists ai_usage_monthly (
  org_id uuid not null,
  month text not null, -- 'YYYY-MM'
  tokens_used integer not null default 0,
  primary key (org_id, month)
);

-- Server-only accounting table: never queried by anon/authenticated over PostgREST.
alter table ai_usage_monthly enable row level security;

create or replace function increment_ai_usage(p_org_id uuid, p_month text, p_tokens integer)
returns integer
language plpgsql
as $$
declare
  new_total integer;
begin
  insert into ai_usage_monthly (org_id, month, tokens_used)
  values (p_org_id, p_month, p_tokens)
  on conflict (org_id, month)
  do update set tokens_used = ai_usage_monthly.tokens_used + p_tokens
  returning tokens_used into new_total;
  return new_total;
end;
$$;
