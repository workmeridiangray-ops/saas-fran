-- Foundation: tenants, org hierarchy, roles/permissions, plans, audit, RLS.
-- Runs on Supabase (auth.uid()) and on plain Postgres with a stub auth schema (scripts/db-test.sh).
--
-- Tenancy: every child row references its parent by (id, company_id), so a row
-- cannot point at another company's brand/region/branch even if app code is wrong.
-- RLS then scopes every read and write to the caller's company, role grants and scope.

create schema if not exists app;

-- ---------------------------------------------------------------- companies
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}$'),
  industry text not null default 'general',
  operating_model text not null default 'company_owned'
    check (operating_model in ('company_owned','franchise','mixed','internal','service_network')),
  country text not null default 'US',
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'UTC',
  fiscal_year_start_month int not null default 1 check (fiscal_year_start_month between 1 and 12),
  status text not null default 'trial' check (status in ('trial','active','suspended','closing','closed')),
  is_sample_data boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key, -- = identity.users.id / auth.users.id
  display_name text not null default '',
  email text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------- roles & memberships
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  -- [{ "resource": "branches"|"*", "actions": ["view",...]|"*", "ownOnly": bool }]
  grants jsonb not null default '[]' check (jsonb_typeof(grants) = 'array'),
  unique (id, company_id),
  unique (company_id, name)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null,
  status text not null default 'invited' check (status in ('invited','active','suspended')),
  -- empty array = unrestricted on that dimension
  brand_ids uuid[] not null default '{}',
  region_ids uuid[] not null default '{}',
  branch_ids uuid[] not null default '{}',
  department_ids uuid[] not null default '{}',
  approval_limit_minor bigint check (approval_limit_minor >= 0),
  created_at timestamptz not null default now(),
  unique (id, company_id),
  unique (company_id, user_id)
);

create table public.membership_roles (
  membership_id uuid not null,
  role_id uuid not null,
  company_id uuid not null,
  primary key (membership_id, role_id),
  foreign key (membership_id, company_id) references public.memberships(id, company_id) on delete cascade,
  foreign key (role_id, company_id) references public.roles(id, company_id) on delete cascade
);

-- ------------------------------------------------------ organisation tree
create table public.brands (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null, status text not null default 'active' check (status in ('active','archived')),
  unique (id, company_id), unique (company_id, name)
);
create table public.legal_entities (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null, tax_id text, status text not null default 'active' check (status in ('active','archived')),
  unique (id, company_id), unique (company_id, name)
);
create table public.regions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null, parent_region_id uuid,
  status text not null default 'active' check (status in ('active','archived')),
  unique (id, company_id), unique (company_id, name),
  foreign key (parent_region_id, company_id) references public.regions(id, company_id)
);
create table public.franchise_partners (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  -- a prospect is not an active partner (brief §9)
  stage text not null default 'prospect' check (stage in ('prospect','approved','active','renewing','terminated')),
  status text not null default 'active' check (status in ('active','archived')),
  unique (id, company_id), unique (company_id, name)
);
create table public.departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null, status text not null default 'active' check (status in ('active','archived')),
  unique (id, company_id), unique (company_id, name)
);

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(trim(name)) >= 2),
  code text not null,
  brand_id uuid, legal_entity_id uuid, region_id uuid, partner_id uuid,
  ownership text not null default 'company' check (ownership in ('company','franchise')),
  status text not null default 'planned'
    check (status in ('planned','opening','active','suspended','closing','closed')),
  timezone text not null default 'UTC', -- deadlines are evaluated in the branch timezone
  address jsonb not null default '{}',
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, company_id), unique (company_id, code),
  foreign key (brand_id, company_id) references public.brands(id, company_id),
  foreign key (legal_entity_id, company_id) references public.legal_entities(id, company_id),
  foreign key (region_id, company_id) references public.regions(id, company_id),
  foreign key (partner_id, company_id) references public.franchise_partners(id, company_id),
  check (ownership = 'franchise' or partner_id is null),
  check ((status = 'closed') = (closed_at is not null))
);

-- Preserves history when a branch changes region/brand/partner (brief §8).
create table public.branch_history (
  id bigint generated always as identity primary key,
  company_id uuid not null,
  branch_id uuid not null,
  brand_id uuid, region_id uuid, partner_id uuid, status text,
  valid_from timestamptz not null default now(),
  foreign key (branch_id, company_id) references public.branches(id, company_id)
);

-- ------------------------------------------------- plans & subscriptions
create table public.plans (
  id text primary key, name text not null, is_public boolean not null default true
);
-- Immutable: a plan edit creates a new version, so history is never rewritten.
create table public.plan_versions (
  plan_id text not null references public.plans(id),
  version int not null,
  monthly_price_minor bigint not null check (monthly_price_minor >= 0),
  currency text not null default 'USD',
  max_branches int, max_users int, storage_mb int, -- null = unlimited
  modules text[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (plan_id, version)
);
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  plan_id text not null, plan_version int not null,
  status text not null default 'trialing' check (status in ('trialing','active','past_due','cancelled')),
  current_period_end timestamptz,
  pending_plan_id text, pending_plan_version int, -- applies at next renewal
  foreign key (plan_id, plan_version) references public.plan_versions(plan_id, version),
  foreign key (pending_plan_id, pending_plan_version) references public.plan_versions(plan_id, version)
);

-- ------------------------------------------------ platform staff & support
create table public.platform_staff (
  user_id uuid primary key,
  role text not null check (role in ('super_admin','billing','support','technical'))
);
-- Support sees a customer workspace only through a time-limited, reasoned grant.
create table public.support_access_grants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  staff_user_id uuid not null references public.platform_staff(user_id),
  granted_by uuid not null,
  reason text not null check (length(trim(reason)) >= 5),
  expires_at timestamptz not null check (expires_at > now()),
  created_at timestamptz not null default now()
);

-- -------------------------------------------------------------- audit log
create table public.audit_log (
  id bigint generated always as identity primary key,
  company_id uuid,
  actor uuid,
  at timestamptz not null default now(),
  table_name text not null,
  op text not null,
  row_id text,
  changed_fields text[] -- names only, never values
);

-- ============================================================ functions
create or replace function app.uid() returns uuid language sql stable as $$
  select auth.uid()
$$;

-- Does the caller hold `act` on `res` for a record with this scope? Mirrors lib/rules/permissions.ts.
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
      and (cardinality(m.brand_ids) = 0 or coalesce(p_brand = any (m.brand_ids), false))
      and (cardinality(m.region_ids) = 0 or coalesce(p_region = any (m.region_ids), false))
      and (cardinality(m.branch_ids) = 0 or coalesce(p_branch = any (m.branch_ids), false))
      and (cardinality(m.department_ids) = 0 or coalesce(p_dept = any (m.department_ids), false))
      and (g->>'resource' in ('*', p_res))
      and (g->'actions' = '"*"'::jsonb or g->'actions' ? p_act)
      and (coalesce((g->>'ownOnly')::boolean, false) = false or p_owner = auth.uid())
  )
$$;

create or replace function app.is_member(p_company uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships
                 where company_id = p_company and user_id = auth.uid() and status = 'active')
$$;

create or replace function app.support_can_read(p_company uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from support_access_grants
                 where company_id = p_company and staff_user_id = auth.uid() and expires_at > now())
$$;

-- Creating a company: the only way a tenant comes into existence.
create or replace function public.create_company(p_name text, p_slug text, p_operating_model text default 'company_owned')
returns uuid language plpgsql security definer set search_path = public as $$
declare cid uuid; rid uuid; mid uuid;
begin
  if auth.uid() is null then raise exception 'sign in required'; end if;
  insert into companies(name, slug, operating_model) values (p_name, p_slug, p_operating_model) returning id into cid;
  insert into roles(company_id, name, grants) values (cid, 'Company owner', '[{"resource":"*","actions":"*"}]') returning id into rid;
  insert into memberships(company_id, user_id, status) values (cid, auth.uid(), 'active') returning id into mid;
  insert into membership_roles(membership_id, role_id, company_id) values (mid, rid, cid);
  return cid;
end $$;

-- ------------------------------------------------------------ audit triggers
create or replace function app.audit() returns trigger language plpgsql security definer set search_path = public as $$
declare cid uuid; rid text; fields text[];
begin
  cid := coalesce((to_jsonb(new)->>'company_id'), (to_jsonb(old)->>'company_id'))::uuid;
  rid := coalesce(to_jsonb(new)->>'id', to_jsonb(old)->>'id');
  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into fields
    from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
    where n.value is distinct from o.value;
    if fields is null then return new; end if;
  end if;
  insert into audit_log(company_id, actor, table_name, op, row_id, changed_fields)
  values (cid, auth.uid(), tg_table_name, tg_op, rid, fields);
  return coalesce(new, old);
end $$;

create or replace function app.deny_change() returns trigger language plpgsql as $$
begin raise exception '% is append-only', tg_table_name using errcode = '42501'; end $$;

create trigger audit_log_immutable before update or delete on public.audit_log
  for each row execute function app.deny_change();
create trigger plan_versions_immutable before update or delete on public.plan_versions
  for each row execute function app.deny_change();

do $$ declare t text; begin
  foreach t in array array['companies','roles','memberships','membership_roles','brands','legal_entities',
                           'regions','franchise_partners','departments','branches','subscriptions','support_access_grants']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app.audit()',
                   'audit_' || t, t);
  end loop;
end $$;

-- Branch history: record every change of placement/status.
create or replace function app.branch_history() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or (new.brand_id, new.region_id, new.partner_id, new.status)
       is distinct from (old.brand_id, old.region_id, old.partner_id, old.status) then
    insert into branch_history(company_id, branch_id, brand_id, region_id, partner_id, status)
    values (new.company_id, new.id, new.brand_id, new.region_id, new.partner_id, new.status);
  end if;
  return new;
end $$;
create trigger branches_history after insert or update on public.branches
  for each row execute function app.branch_history();

-- ============================================================== RLS
alter table public.companies enable row level security;
alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.memberships enable row level security;
alter table public.membership_roles enable row level security;
alter table public.brands enable row level security;
alter table public.legal_entities enable row level security;
alter table public.regions enable row level security;
alter table public.franchise_partners enable row level security;
alter table public.departments enable row level security;
alter table public.branches enable row level security;
alter table public.branch_history enable row level security;
alter table public.plans enable row level security;
alter table public.plan_versions enable row level security;
alter table public.subscriptions enable row level security;
alter table public.platform_staff enable row level security;
alter table public.support_access_grants enable row level security;
alter table public.audit_log enable row level security;

create policy companies_select on public.companies for select
  using (app.is_member(id) or app.support_can_read(id));
create policy companies_update on public.companies for update
  using (app.has_perm(id, 'organisation', 'configure'))
  with check (app.has_perm(id, 'organisation', 'configure'));

create policy profiles_self on public.profiles for all
  using (id = auth.uid()) with check (id = auth.uid());

create policy roles_select on public.roles for select using (app.is_member(company_id));
create policy roles_write on public.roles for all
  using (app.has_perm(company_id, 'users', 'configure'))
  with check (app.has_perm(company_id, 'users', 'configure'));

create policy memberships_select on public.memberships for select
  using (user_id = auth.uid() or app.has_perm(company_id, 'users', 'view'));
create policy memberships_insert on public.memberships for insert
  with check (app.has_perm(company_id, 'users', 'create'));
create policy memberships_update on public.memberships for update
  using (app.has_perm(company_id, 'users', 'edit'))
  with check (app.has_perm(company_id, 'users', 'edit'));
create policy membership_roles_select on public.membership_roles for select
  using (app.has_perm(company_id, 'users', 'view') or exists (
    select 1 from public.memberships m where m.id = membership_id and m.user_id = auth.uid()));
create policy membership_roles_write on public.membership_roles for all
  using (app.has_perm(company_id, 'users', 'assign'))
  with check (app.has_perm(company_id, 'users', 'assign'));

-- Organisation tables: view / create / edit by role grant. No delete policy: archive instead.
do $$ declare pair text[]; begin
  foreach pair slice 1 in array array[
    array['brands','organisation'], array['legal_entities','organisation'],
    array['regions','organisation'], array['departments','organisation'],
    array['franchise_partners','franchise']]
  loop
    execute format('create policy %I on public.%I for select using (app.has_perm(company_id, %L, ''view'') or app.support_can_read(company_id))',
                   pair[1] || '_select', pair[1], pair[2]);
    execute format('create policy %I on public.%I for insert with check (app.has_perm(company_id, %L, ''create''))',
                   pair[1] || '_insert', pair[1], pair[2]);
    execute format('create policy %I on public.%I for update using (app.has_perm(company_id, %L, ''edit'')) with check (app.has_perm(company_id, %L, ''edit''))',
                   pair[1] || '_update', pair[1], pair[2], pair[2]);
  end loop;
end $$;

-- Branches carry brand/region/branch scope into the permission check.
create policy branches_select on public.branches for select
  using (app.has_perm(company_id, 'branches', 'view', brand_id, region_id, id) or app.support_can_read(company_id));
create policy branches_insert on public.branches for insert
  with check (app.has_perm(company_id, 'branches', 'create', brand_id, region_id, id));
create policy branches_update on public.branches for update
  using (app.has_perm(company_id, 'branches', 'edit', brand_id, region_id, id))
  with check (app.has_perm(company_id, 'branches', 'edit', brand_id, region_id, id));
create policy branch_history_select on public.branch_history for select
  using (app.has_perm(company_id, 'branches', 'view', brand_id, region_id, branch_id));

create policy plans_select on public.plans for select using (is_public);
create policy plan_versions_select on public.plan_versions for select
  using (exists (select 1 from public.plans p where p.id = plan_id and p.is_public)
         or exists (select 1 from public.subscriptions s where s.plan_id = plan_versions.plan_id and s.plan_version = plan_versions.version and app.is_member(s.company_id)));
create policy subscriptions_select on public.subscriptions for select
  using (app.has_perm(company_id, 'billing', 'view'));
-- subscriptions/plans/plan_versions/platform_staff are written only by the service role.

create policy platform_staff_self on public.platform_staff for select using (user_id = auth.uid());
create policy support_grants_select on public.support_access_grants for select
  using (app.has_perm(company_id, 'users', 'view') or staff_user_id = auth.uid());
create policy support_grants_insert on public.support_access_grants for insert
  with check (app.has_perm(company_id, 'users', 'configure') and granted_by = auth.uid());

create policy audit_select on public.audit_log for select
  using (company_id is not null and app.has_perm(company_id, 'organisation', 'configure'));

-- ============================================================ grants
revoke all on all tables in schema public from anon;
grant usage on schema public, app to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
revoke update, delete on public.audit_log from authenticated;
revoke insert, update on public.plans, public.plan_versions, public.subscriptions, public.platform_staff from authenticated;
revoke insert on public.companies from authenticated;
grant execute on function public.create_company(text, text, text) to authenticated;
