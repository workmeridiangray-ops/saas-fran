-- Billing, plan limits, company lifecycle. SaaS billing (company -> platform) lives here
-- and is structurally separate from partner royalties (partner_payments / statements).

alter table public.companies drop constraint companies_status_check;
alter table public.companies add constraint companies_status_check
  check (status in ('trial','active','past_due','suspended','closing','closed'));
alter table public.subscriptions add column period_start timestamptz not null default now();
alter table public.subscriptions add column billing_email text;
alter table public.subscriptions add constraint subscriptions_company_unique unique (company_id);

-- Suspended companies are read-only (they can still reach billing and export). Closed are sealed.
create or replace function app.has_perm(
  p_company uuid, p_res text, p_act text,
  p_brand uuid default null, p_region uuid default null, p_branch uuid default null,
  p_dept uuid default null, p_owner uuid default null
) returns boolean language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1
    from memberships m
    join membership_roles mr on mr.membership_id = m.id and mr.company_id = m.company_id
    join roles r on r.id = mr.role_id and r.company_id = m.company_id
    cross join lateral jsonb_array_elements(r.grants) g
    join companies c on c.id = m.company_id
    where m.company_id = p_company
      and m.user_id = auth.uid()
      and m.status = 'active'
      and c.status <> 'closed'
      and (c.status <> 'suspended' or p_res = 'billing' or p_act = 'view')
      and (cardinality(m.brand_ids) = 0 or coalesce(p_brand = any (m.brand_ids), false))
      and (cardinality(m.region_ids) = 0 or coalesce(p_region = any (m.region_ids), false))
      and (cardinality(m.branch_ids) = 0 or coalesce(p_branch = any (m.branch_ids), false))
      and (cardinality(m.department_ids) = 0 or coalesce(p_dept = any (m.department_ids), false))
      and (g->>'resource' in ('*', p_res))
      and (g->'actions' = '"*"'::jsonb or g->'actions' ? p_act)
      and (coalesce((g->>'ownOnly')::boolean, false) = false or p_owner = auth.uid())
  )
$$;

-- ------------------------------------------------------------ plans (versioned, immutable)
insert into public.plans(id, name) values ('starter','Starter'), ('growth','Growth'), ('scale','Scale');
insert into public.plan_versions(plan_id, version, monthly_price_minor, max_branches, max_users, storage_mb, modules) values
  ('starter', 1,  9900,   3,  10,   5000, '{tasks,documents,tickets,people}'),
  ('growth',  1, 29900,  25,  60,  50000, '{tasks,documents,tickets,people,inspections,purchasing,training,assets,projects,stock}'),
  ('scale',   1, 79900, null, null, 500000, '{tasks,documents,tickets,people,inspections,purchasing,training,assets,projects,stock,royalties,franchise,integrations}');

create or replace function app.current_plan(p_company uuid) returns plan_versions
language sql stable security definer set search_path = public as $$
  select pv.* from subscriptions s join plan_versions pv on pv.plan_id = s.plan_id and pv.version = s.plan_version
  where s.company_id = p_company
$$;

-- Plan limits block creating NEW records only; nothing existing is ever removed.
create or replace function app.enforce_limit() returns trigger language plpgsql security definer set search_path = public as $$
declare pv plan_versions; used int; lim int;
begin
  select * into pv from app.current_plan(new.company_id);
  if pv.plan_id is null then return new; end if;
  if tg_argv[0] = 'branches' then
    lim := pv.max_branches;
    select count(*) into used from branches where company_id = new.company_id and status <> 'closed';
  else
    lim := pv.max_users;
    select count(*) into used from memberships where company_id = new.company_id and status in ('active','invited');
  end if;
  if lim is not null and used >= lim then
    raise exception 'plan limit reached: your plan includes % %. Upgrade the plan to add more.', lim, tg_argv[0] using errcode = 'P0001', hint = 'plan_limit';
  end if;
  return new;
end $$;
create trigger branches_limit before insert on public.branches for each row execute function app.enforce_limit('branches');
create trigger memberships_limit before insert on public.memberships for each row execute function app.enforce_limit('users');

-- ------------------------------------------------------------ invoices (SaaS)
create table public.platform_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  subscription_id uuid not null references public.subscriptions(id),
  number text not null unique,
  plan_id text not null, plan_version int not null,
  amount_minor bigint not null check (amount_minor >= 0), currency text not null,
  period_start timestamptz not null, period_end timestamptz not null,
  status text not null default 'open' check (status in ('open','paid','void')),
  due_at timestamptz not null, paid_at timestamptz, created_at timestamptz not null default now(),
  unique (subscription_id, period_start)
);
-- Issued invoices never change amounts; only status can move.
create or replace function app.guard_invoice() returns trigger language plpgsql as $$
begin
  if (new.amount_minor, new.currency, new.plan_id, new.plan_version, new.period_start, new.period_end, new.number, new.company_id)
     is distinct from (old.amount_minor, old.currency, old.plan_id, old.plan_version, old.period_start, old.period_end, old.number, old.company_id) then
    raise exception 'issued invoices cannot be changed; issue a credit note instead';
  end if;
  if old.status <> 'open' and new.status <> old.status then raise exception 'a % invoice cannot be reopened', old.status; end if;
  return new;
end $$;
create trigger platform_invoices_guard before update on public.platform_invoices for each row execute function app.guard_invoice();
alter table public.platform_invoices enable row level security;
create policy platform_invoices_sel on public.platform_invoices for select using (app.has_perm(company_id, 'billing', 'view'));
create trigger audit_platform_invoices after insert or update on public.platform_invoices for each row execute function app.audit();

-- ------------------------------------------------------------ lifecycle
create or replace function app.run_renewals(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public as $$
declare s record; pv plan_versions; n int := 0; inv record;
begin
  -- 1. invoice every subscription whose period has ended
  for s in select * from subscriptions where current_period_end <= p_now and status in ('trialing','active') loop
    if s.pending_plan_id is not null then
      update subscriptions set plan_id = pending_plan_id, plan_version = pending_plan_version, pending_plan_id = null, pending_plan_version = null where id = s.id;
      s.plan_id := s.pending_plan_id; s.plan_version := s.pending_plan_version;
    end if;
    select * into pv from plan_versions where plan_id = s.plan_id and version = s.plan_version;
    insert into platform_invoices(company_id, subscription_id, number, plan_id, plan_version, amount_minor, currency, period_start, period_end, due_at)
    values (s.company_id, s.id, app.next_number_system(s.company_id, 'saas_invoice', 'INV'), s.plan_id, s.plan_version, pv.monthly_price_minor, pv.currency,
            s.current_period_end, s.current_period_end + interval '1 month', s.current_period_end + interval '3 days')
    on conflict (subscription_id, period_start) do nothing;
    if s.status = 'active' then
      update subscriptions set period_start = current_period_end, current_period_end = current_period_end + interval '1 month' where id = s.id;
    else
      update subscriptions set status = 'past_due' where id = s.id;  -- trial over: awaiting first payment
    end if;
    n := n + 1;
  end loop;
  -- 2. unpaid invoices: past due, then suspended after grace
  for inv in select distinct company_id, min(due_at) as first_due from platform_invoices where status = 'open' and due_at < p_now group by company_id loop
    update companies set status = case when inv.first_due + interval '7 days' < p_now then 'suspended' else 'past_due' end
    where id = inv.company_id and status in ('trial','active','past_due','suspended');
    n := n + 1;
  end loop;
  return n;
end $$;

-- Number allocation without a signed-in user (renewals run from a scheduler).
create or replace function app.next_number_system(p_company uuid, p_kind text, p_prefix text) returns text
language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  insert into company_counters(company_id, kind, last) values (p_company, p_kind, 1)
  on conflict (company_id, kind) do update set last = company_counters.last + 1 returning last into n;
  return p_prefix || '-' || to_char(now(), 'YYYYMM') || '-' || substr(p_company::text, 1, 4) || '-' || lpad(n::text, 4, '0');
end $$;
revoke execute on function app.next_number_system(uuid, text, text) from public, authenticated;
revoke execute on function app.run_renewals(timestamptz) from public, authenticated;

-- Recording a payment (platform billing staff or the payment provider's webhook, via the service connection).
create or replace function app.mark_invoice_paid(p_invoice uuid, p_paid_at timestamptz default now()) returns void
language plpgsql security definer set search_path = public as $$
declare i platform_invoices;
begin
  select * into i from platform_invoices where id = p_invoice for update;
  if i.id is null then raise exception 'invoice not found'; end if;
  if i.status = 'paid' then return; end if;
  if i.status = 'void' then raise exception 'invoice is void'; end if;
  update platform_invoices set status = 'paid', paid_at = p_paid_at where id = i.id;
  update subscriptions set status = 'active', period_start = greatest(period_start, i.period_start),
         current_period_end = greatest(current_period_end, i.period_end) where id = i.subscription_id;
  if not exists (select 1 from platform_invoices where company_id = i.company_id and status = 'open') then
    update companies set status = 'active' where id = i.company_id and status in ('trial','past_due','suspended');
  end if;
end $$;
revoke execute on function app.mark_invoice_paid(uuid, timestamptz) from public, authenticated;

-- Plan change request. Trial: switches now. Paid: applies at the next renewal (history untouched).
create or replace function public.request_plan_change(p_company uuid, p_plan text) returns text
language plpgsql security definer set search_path = public as $$
declare s subscriptions; v int;
begin
  if not app.has_perm(p_company, 'billing', 'configure') then raise exception 'you cannot change the plan' using errcode = '42501'; end if;
  select max(version) into v from plan_versions where plan_id = p_plan;
  if v is null then raise exception 'unknown plan'; end if;
  select * into s from subscriptions where company_id = p_company for update;
  if s.status = 'trialing' then
    update subscriptions set plan_id = p_plan, plan_version = v, pending_plan_id = null, pending_plan_version = null where id = s.id;
    return 'now';
  end if;
  update subscriptions set pending_plan_id = p_plan, pending_plan_version = v where id = s.id;
  return 'renewal';
end $$;
grant execute on function public.request_plan_change(uuid, text) to authenticated;

-- ------------------------------------------------------------ create_company (seeds a usable workspace)
drop function if exists public.create_company(text, text, text);
create or replace function public.create_company(
  p_name text, p_slug text, p_operating_model text default 'company_owned', p_industry text default 'general',
  p_country text default 'US', p_currency text default 'USD', p_timezone text default 'UTC'
) returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid; owner_r uuid; mgr_r uuid; mid uuid; v int;
begin
  if auth.uid() is null then raise exception 'sign in required'; end if;
  insert into companies(name, slug, operating_model, industry, country, currency, timezone)
  values (p_name, p_slug, p_operating_model, p_industry, p_country, p_currency, p_timezone) returning id into cid;

  insert into roles(company_id, name, grants) values (cid, 'Company owner', '[{"resource":"*","actions":"*"}]') returning id into owner_r;
  insert into roles(company_id, name, grants) values (cid, 'Branch manager', '[
    {"resource":"branches","actions":["view","edit"]},{"resource":"tasks","actions":["view","create","edit","assign"]},
    {"resource":"approvals","actions":["view","approve","reject"]},{"resource":"purchasing","actions":["view","create","edit","approve"]},
    {"resource":"inspections","actions":["view"]},{"resource":"actions","actions":["view","edit"]},{"resource":"training","actions":["view"]},{"resource":"documents","actions":["view"]},
    {"resource":"tickets","actions":["view","create","edit"]},{"resource":"sales","actions":["view","create"]},
    {"resource":"assets","actions":["view","create","edit"]},{"resource":"projects","actions":["view","create","edit"]},{"resource":"inventory","actions":["view","create","edit"]},{"resource":"reports","actions":["view","export"]},{"resource":"people","actions":["view"]}]') returning id into mgr_r;
  insert into roles(company_id, name, grants) values
    (cid, 'Finance', '[{"resource":"royalties","actions":["view","create","edit","approve","pay"]},{"resource":"sales","actions":["view"]},
      {"resource":"billing","actions":["view"]},{"resource":"approvals","actions":["view","approve"]},{"resource":"reports","actions":["view","export"]},{"resource":"branches","actions":["view"]},{"resource":"franchise","actions":["view"]}]'),
    (cid, 'Auditor / inspector', '[{"resource":"inspections","actions":["view","create","edit","approve"]},{"resource":"actions","actions":["view","create","edit"]},{"resource":"branches","actions":["view"]},{"resource":"tasks","actions":["view","create"]}]'),
    (cid, 'Employee', '[{"resource":"tasks","actions":["view","edit"],"ownOnly":true},{"resource":"training","actions":["view"]},{"resource":"documents","actions":["view"]},{"resource":"tickets","actions":["view","create"]}]');

  insert into memberships(company_id, user_id, status, approval_limit_minor) values (cid, auth.uid(), 'active', 1000000000000) returning id into mid;
  insert into membership_roles(membership_id, role_id, company_id) values (mid, owner_r, cid);

  insert into approval_rules(company_id, name, kind, priority, min_amount_minor, steps) values
    (cid, 'Purchases', 'purchase', 1, null, jsonb_build_array(jsonb_build_object('role_id', mgr_r, 'label', 'Branch manager'))),
    (cid, 'Large purchases (over 5,000)', 'purchase', 2, 500000, jsonb_build_array(jsonb_build_object('role_id', mgr_r, 'label', 'Branch manager'), jsonb_build_object('role_id', owner_r, 'label', 'Company owner')));

  insert into checklist_templates(company_id, name, kind, items) values
    (cid, 'Opening checklist', 'opening', '[{"id":"o1","text":"Doors unlocked, lights on","required":true},{"id":"o2","text":"Equipment powered and working","required":true},{"id":"o3","text":"Cash float counted","required":false}]'),
    (cid, 'Closing checklist', 'closing', '[{"id":"c1","text":"Equipment switched off and cleaned","required":true},{"id":"c2","text":"Waste removed","required":true},{"id":"c3","text":"Doors locked, alarm set","required":true}]');
  insert into inspection_templates(company_id, name, items) values
    (cid, 'General branch inspection', '[{"id":"i1","text":"Premises clean and tidy","weight":2,"critical":false},{"id":"i2","text":"Safety equipment present and in date","weight":3,"critical":true},{"id":"i3","text":"Staff in correct uniform","weight":1,"critical":false},{"id":"i4","text":"Current SOPs displayed","weight":2,"critical":false}]');

  select max(version) into v from plan_versions where plan_id = 'growth';
  insert into subscriptions(company_id, plan_id, plan_version, status, period_start, current_period_end)
  values (cid, 'growth', v, 'trialing', now(), now() + interval '14 days');
  return cid;
end $$;
grant execute on function public.create_company(text, text, text, text, text, text, text) to authenticated;

-- Archive a role: not needed. Soft close of a company (owner action): leaves data readable/exportable.
create or replace function public.close_company(p_company uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not app.has_perm(p_company, 'billing', 'configure') then raise exception 'only an owner can close the company' using errcode = '42501'; end if;
  update companies set status = 'closing' where id = p_company;
end $$;
grant execute on function public.close_company(uuid) to authenticated;

grant select, insert, update on all tables in schema public to authenticated;
revoke update, delete on public.audit_log from authenticated;
revoke all on public.company_counters from authenticated;
revoke insert, update on public.plans, public.plan_versions, public.subscriptions, public.platform_staff, public.platform_invoices from authenticated;
revoke insert on public.companies from authenticated;
revoke update on public.approval_decisions, public.payment_allocations, public.receipt_lines, public.goods_receipts from authenticated;
grant execute on all functions in schema app to authenticated;
revoke execute on function app.next_number_system(uuid, text, text), app.run_renewals(timestamptz), app.mark_invoice_paid(uuid, timestamptz) from authenticated, public;
