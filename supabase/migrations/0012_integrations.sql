-- Integrations: API keys (read-only API), signed outbound webhooks with retries, and a delivery log.

create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(trim(name)) >= 2), prefix text not null unique, key_hash text not null,
  scopes text[] not null check (cardinality(scopes) > 0 and scopes <@ array['read:branches','read:tasks','read:tickets','read:requisitions']),
  created_by uuid not null, created_at timestamptz not null default now(), last_used_at timestamptz, revoked_at timestamptz
);
create table public.api_usage (key_id uuid not null references public.api_keys(id) on delete cascade, minute timestamptz not null, hits int not null default 0, primary key (key_id, minute));

create table public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  url text not null check (url ~ '^https?://' and length(url) < 500), secret text not null,
  events text[] not null check (cardinality(events) > 0),
  active boolean not null default true, consecutive_dead int not null default 0, disabled_reason text,
  created_by uuid not null, created_at timestamptz not null default now(), unique (id, company_id)
);
create table public.webhook_deliveries (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  endpoint_id uuid not null, event text not null, payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','sent','failed','dead')),
  attempts int not null default 0, next_attempt_at timestamptz not null default now(),
  last_status int, last_error text, created_at timestamptz not null default now(), sent_at timestamptz,
  foreign key (endpoint_id, company_id) references public.webhook_endpoints(id, company_id) on delete cascade
);
create index on public.webhook_deliveries(status, next_attempt_at) where status in ('pending','failed');

select app.secure('api_keys', 'integrations');
select app.secure('webhook_endpoints', 'integrations');
select app.secure('webhook_deliveries', 'integrations');
alter table public.api_usage enable row level security;   -- service only
do $$ declare t text; begin foreach t in array array['api_keys','webhook_endpoints'] loop
  execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app.audit()', 'audit_' || t, t); end loop; end $$;

-- Secrets and key hashes are write-only to customers: never selectable, even by administrators.
revoke select on public.api_keys, public.webhook_endpoints from authenticated;
grant select (id, company_id, name, prefix, scopes, created_by, created_at, last_used_at, revoked_at) on public.api_keys to authenticated;
grant select (id, company_id, url, events, active, consecutive_dead, disabled_reason, created_by, created_at) on public.webhook_endpoints to authenticated;
grant insert, update on public.api_keys, public.webhook_endpoints to authenticated;
grant select, update on public.webhook_deliveries to authenticated;

create or replace function app.emit_event(p_company uuid, p_event text, p_payload jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into webhook_deliveries(company_id, endpoint_id, event, payload)
  select e.company_id, e.id, p_event, jsonb_build_object('event', p_event, 'occurred_at', now(), 'data', p_payload)
    from webhook_endpoints e where e.company_id = p_company and e.active and (p_event = any (e.events) or '*' = any (e.events));
end $$;
revoke execute on function app.emit_event(uuid, text, jsonb) from public, authenticated;

create or replace function app.emit_row() returns trigger language plpgsql security definer set search_path = public as $$
declare ev text := tg_argv[0]; j jsonb := to_jsonb(new);
begin
  if tg_argv[1] = 'status' and tg_op = 'UPDATE' and (to_jsonb(old)->>'status') is not distinct from (j->>'status') then return new; end if;
  perform app.emit_event(new.company_id, ev, jsonb_build_object('id', j->>'id', 'status', j->>'status', 'title', coalesce(j->>'title', j->>'number', j->>'name'), 'branch_id', j->>'branch_id'));
  return new;
end $$;
create trigger emit_branch_created after insert on public.branches for each row execute function app.emit_row('branch.created', 'always');
create trigger emit_branch_status after update on public.branches for each row execute function app.emit_row('branch.status_changed', 'status');
create trigger emit_ticket_created after insert on public.tickets for each row execute function app.emit_row('ticket.created', 'always');
create trigger emit_finding_created after insert on public.findings for each row execute function app.emit_row('finding.created', 'always');
create trigger emit_po_created after insert on public.purchase_orders for each row execute function app.emit_row('purchase_order.created', 'always');
create trigger emit_approval_decided after update on public.approval_requests for each row when (old.status = 'pending' and new.status <> 'pending') execute function app.emit_row('approval.decided', 'status');
create trigger emit_statement_issued after update on public.statements for each row when (new.status = 'issued' and old.status <> 'issued') execute function app.emit_row('statement.issued', 'status');
create trigger emit_applicant_created after insert on public.applicants for each row execute function app.emit_row('applicant.created', 'always');
create trigger emit_agreement_active after update on public.agreements for each row when (new.status = 'active' and old.status <> 'active') execute function app.emit_row('agreement.activated', 'status');

-- Fair-use limit for the API: 120 requests per key per minute.
create or replace function app.api_hit(p_key uuid) returns int language sql security definer set search_path = public as $$
  with u as (insert into api_usage(key_id, minute, hits) values (p_key, date_trunc('minute', now()), 1)
             on conflict (key_id, minute) do update set hits = api_usage.hits + 1 returning hits)
  select hits from u
$$;
revoke execute on function app.api_hit(uuid) from public, authenticated;

-- "Send test" queues one ping for one of your own endpoints. Customers can't insert deliveries directly.
create or replace function public.send_test_event(p_endpoint uuid) returns void
language plpgsql security definer set search_path = public as $$
declare e webhook_endpoints;
begin
  select * into e from webhook_endpoints where id = p_endpoint;
  if e.id is null or not app.has_perm(e.company_id, 'integrations', 'edit') then raise exception 'you cannot send test events for this webhook' using errcode = '42501'; end if;
  insert into webhook_deliveries(company_id, endpoint_id, event, payload)
  values (e.company_id, e.id, 'ping', jsonb_build_object('event', 'ping', 'occurred_at', now(), 'data', jsonb_build_object('message', 'Test from Network Manager')));
end $$;
grant execute on function public.send_test_event(uuid) to authenticated;
