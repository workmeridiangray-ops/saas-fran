-- 1. Region and brand scope now apply to every record that belongs to a branch (the record's brand and
--    region are looked up from its branch), and a region scope includes the regions beneath it.
-- 2. Ticket SLAs and escalation.

create or replace function app.region_chain(p_region uuid) returns uuid[]
language sql stable security definer set search_path = public as $$
  with recursive up(id, parent) as (
    select id, parent_region_id from regions where id = p_region
    union all select r.id, r.parent_region_id from regions r join up on r.id = up.parent)
  select coalesce(array_agg(id), '{}') from up
$$;

create or replace function app.has_perm(
  p_company uuid, p_res text, p_act text,
  p_brand uuid default null, p_region uuid default null, p_branch uuid default null,
  p_dept uuid default null, p_owner uuid default null
) returns boolean language plpgsql stable security definer set search_path = public, app as $$
declare v_brand uuid := p_brand; v_region uuid := p_region; v_chain uuid[];
begin
  if p_branch is not null and (v_brand is null or v_region is null) then
    select coalesce(v_brand, b.brand_id), coalesce(v_region, b.region_id) into v_brand, v_region from branches b where b.id = p_branch;
  end if;
  v_chain := case when v_region is null then '{}' else app.region_chain(v_region) end;
  return exists (
    select 1
    from memberships m
    join membership_roles mr on mr.membership_id = m.id and mr.company_id = m.company_id
    join roles r on r.id = mr.role_id and r.company_id = m.company_id
    cross join lateral jsonb_array_elements(r.grants) g
    join companies c on c.id = m.company_id
    where m.company_id = p_company and m.user_id = auth.uid() and m.status = 'active'
      and c.status <> 'closed'
      and (c.status <> 'suspended' or p_res = 'billing' or p_act = 'view')
      and (cardinality(m.brand_ids) = 0 or coalesce(v_brand = any (m.brand_ids), false))
      and (cardinality(m.region_ids) = 0 or m.region_ids && v_chain)
      and (cardinality(m.branch_ids) = 0 or coalesce(p_branch = any (m.branch_ids), false))
      and (cardinality(m.department_ids) = 0 or coalesce(p_dept = any (m.department_ids), false))
      and (g->>'resource' in ('*', p_res))
      and (g->'actions' = '"*"'::jsonb or g->'actions' ? p_act)
      and (coalesce((g->>'ownOnly')::boolean, false) = false or p_owner = auth.uid())
  );
end $$;

alter table public.invitations add column brand_ids uuid[] not null default '{}', add column region_ids uuid[] not null default '{}';

-- ------------------------------------------------------------ SLAs
create table public.sla_policies (
  company_id uuid not null references public.companies(id) on delete cascade,
  priority text not null check (priority in ('low','normal','high','urgent')),
  resolve_hours int not null check (resolve_hours between 1 and 8760),
  primary key (company_id, priority)
);
alter table public.sla_policies enable row level security;
create policy sla_sel on public.sla_policies for select using (app.is_member(company_id));
create policy sla_write on public.sla_policies for all using (app.has_perm(company_id, 'tickets', 'configure')) with check (app.has_perm(company_id, 'tickets', 'configure'));
grant select, insert, update, delete on public.sla_policies to authenticated;

alter table public.tickets add column due_at timestamptz, add column escalation_level int not null default 0, add column escalated_at timestamptz;
alter table public.tasks add column escalated_at timestamptz;

create or replace function app.ticket_due() returns trigger language plpgsql security definer set search_path = public as $$
declare h int;
begin
  select resolve_hours into h from sla_policies where company_id = new.company_id and priority = new.priority;
  h := coalesce(h, case new.priority when 'urgent' then 4 when 'high' then 24 when 'normal' then 72 else 168 end);
  new.due_at := coalesce(new.due_at, now() + make_interval(hours => h));
  return new;
end $$;
create trigger tickets_due before insert on public.tickets for each row execute function app.ticket_due();

-- Escalation: a ticket past its SLA tells the people who configure tickets (level 1); a day later it tells owners (level 2).
-- An overdue task a day late tells whoever created it. Idempotent; run from the daily job.
create or replace function app.run_escalations(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public as $$
declare t record; n int := 0;
begin
  for t in select * from tickets where status in ('open','in_progress') and due_at is not null and due_at < p_now loop
    if t.escalation_level = 0 then
      update tickets set escalation_level = 1, escalated_at = p_now where id = t.id;
      insert into notifications(company_id, user_id, title, body, href)
      select t.company_id, m.user_id, 'Ticket past its deadline: ' || t.title, t.number, '/tickets/' || t.id
        from memberships m join membership_roles mr on mr.membership_id = m.id join roles r on r.id = mr.role_id
       where m.company_id = t.company_id and m.status = 'active' and (r.grants @> '[{"resource":"tickets","actions":["configure"]}]'::jsonb or r.grants @> '[{"resource":"*"}]'::jsonb) and m.user_id is distinct from t.assignee_id;
      n := n + 1;
    elsif t.escalation_level = 1 and t.due_at < p_now - interval '24 hours' then
      update tickets set escalation_level = 2, escalated_at = p_now where id = t.id;
      insert into notifications(company_id, user_id, title, body, href)
      select t.company_id, m.user_id, 'Escalated: ticket still unresolved a day after its deadline', t.title || ' (' || t.number || ')', '/tickets/' || t.id
        from memberships m join membership_roles mr on mr.membership_id = m.id join roles r on r.id = mr.role_id
       where m.company_id = t.company_id and m.status = 'active' and r.name = 'Company owner';
      n := n + 1;
    end if;
  end loop;
  for t in select * from tasks where status in ('open','in_progress','blocked') and due_at < p_now - interval '24 hours' and escalated_at is null loop
    update tasks set escalated_at = p_now where id = t.id;
    insert into notifications(company_id, user_id, title, body, href)
    values (t.company_id, t.created_by, 'Task a day overdue: ' || t.title, 'Assigned work is late.', '/tasks/' || t.id);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function app.run_escalations(timestamptz) from public, authenticated;
