-- Operations: tasks, checklists, approvals, purchasing, inspections, tickets,
-- documents, training, royalties, assets. Same tenancy pattern as 0001.

create extension if not exists btree_gist;

-- ------------------------------------------------------------ generators
-- Standard policies: select=view, insert=create, update=edit. No delete policy: archive/void instead.
create or replace function app.secure(t text, res text, branch_col text default null, owner_col text default null)
returns void language plpgsql as $$
declare b text := coalesce(branch_col, 'null::uuid'); o text := coalesce(owner_col, 'null::uuid');
begin
  execute format('alter table public.%I enable row level security', t);
  execute format('create policy %I on public.%I for select using (app.has_perm(company_id,%L,''view'',null,null,%s,null,%s) or app.support_can_read(company_id))', t||'_sel', t, res, b, o);
  execute format('create policy %I on public.%I for insert with check (app.has_perm(company_id,%L,''create'',null,null,%s,null,%s))', t||'_ins', t, res, b, o);
  execute format('create policy %I on public.%I for update using (app.has_perm(company_id,%L,''edit'',null,null,%s,null,%s)) with check (app.has_perm(company_id,%L,''edit'',null,null,%s,null,%s))', t||'_upd', t, res, b, o, res, b, o);
end $$;

-- Child rows inherit visibility from the parent (parent RLS applies inside the subquery).
create or replace function app.secure_child(t text, parent text, fk text, res text)
returns void language plpgsql as $$
begin
  execute format('alter table public.%I enable row level security', t);
  execute format('create policy %I on public.%I for select using (exists (select 1 from public.%I p where p.id = %I.%I and p.company_id = %I.company_id))', t||'_sel', t, parent, t, fk, t);
  execute format('create policy %I on public.%I for insert with check (exists (select 1 from public.%I p where p.id = %I.%I and p.company_id = %I.company_id) and app.has_perm(company_id,%L,''create''))', t||'_ins', t, parent, t, fk, t, res);
  execute format('create policy %I on public.%I for update using (exists (select 1 from public.%I p where p.id = %I.%I and p.company_id = %I.company_id) and app.has_perm(company_id,%L,''edit'')) with check (app.has_perm(company_id,%L,''edit''))', t||'_upd', t, parent, t, fk, t, res, res);
end $$;

create or replace function app.sole_member(p_company uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select (select count(*) from memberships where company_id = p_company and status = 'active') < 2
$$;

create table public.company_counters (
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null, last bigint not null default 0, primary key (company_id, kind)
);
alter table public.company_counters enable row level security; -- no policies: reachable only via next_number()

create or replace function app.next_number(p_company uuid, p_kind text, p_prefix text) returns text
language plpgsql security definer set search_path = public as $$
declare n bigint;
begin
  if not app.is_member(p_company) then raise exception 'not a member of this company' using errcode = '42501'; end if;
  insert into company_counters(company_id, kind, last) values (p_company, p_kind, 1)
  on conflict (company_id, kind) do update set last = company_counters.last + 1 returning last into n;
  return p_prefix || '-' || lpad(n::text, 4, '0');
end $$;

-- ------------------------------------------------------------ people
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email citext not null,
  role_id uuid not null,
  branch_ids uuid[] not null default '{}',
  invited_by uuid not null,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now(),
  unique (id, company_id),
  foreign key (role_id, company_id) references public.roles(id, company_id)
);
create unique index invitations_one_pending on public.invitations(company_id, email) where status = 'pending';

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid not null,
  title text not null, body text not null default '', href text,
  read_at timestamptz, created_at timestamptz not null default now(),
  foreign key (company_id, user_id) references public.memberships(company_id, user_id) on delete cascade
);

-- ------------------------------------------------------------ tasks & checklists
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid, title text not null check (length(trim(title)) >= 2), description text not null default '',
  assignee_id uuid, created_by uuid not null,
  status text not null default 'open' check (status in ('open','in_progress','blocked','done','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  due_at timestamptz, requires_evidence boolean not null default false,
  evidence_note text, completed_at timestamptz, created_at timestamptz not null default now(),
  unique (id, company_id),
  foreign key (branch_id, company_id) references public.branches(id, company_id),
  foreign key (company_id, assignee_id) references public.memberships(company_id, user_id),
  check (status <> 'done' or not requires_evidence or length(trim(coalesce(evidence_note,''))) >= 3)
);
create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, task_id uuid not null, author_id uuid not null, body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  foreign key (task_id, company_id) references public.tasks(id, company_id) on delete cascade
);
create table public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null, kind text not null default 'opening' check (kind in ('opening','closing','other')),
  items jsonb not null default '[]' check (jsonb_typeof(items) = 'array'),   -- [{id,text,required}]
  status text not null default 'active' check (status in ('active','archived')),
  unique (id, company_id), unique (company_id, name)
);
create table public.checklist_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, branch_id uuid not null, template_id uuid not null,
  run_date date not null, answers jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected')),
  submitted_by uuid, submitted_at timestamptz, reviewed_by uuid, review_note text,
  unique (branch_id, template_id, run_date),
  unique (id, company_id),
  foreign key (branch_id, company_id) references public.branches(id, company_id),
  foreign key (template_id, company_id) references public.checklist_templates(id, company_id)
);

-- ------------------------------------------------------------ approvals
create table public.approval_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null, kind text not null, priority int not null default 1,
  min_amount_minor bigint, max_amount_minor bigint,
  steps jsonb not null check (jsonb_typeof(steps) = 'array' and jsonb_array_length(steps) > 0),  -- [{role_id,label}]
  unique (id, company_id)
);
create table public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid, kind text not null, subject_id uuid not null, title text not null,
  amount_minor bigint not null default 0 check (amount_minor >= 0),
  requester_id uuid not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  steps jsonb not null,           -- snapshot of the rule at submission
  current_step int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, company_id),
  foreign key (branch_id, company_id) references public.branches(id, company_id)
);
create table public.approval_decisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, request_id uuid not null,
  step int not null, decided_by uuid not null,
  outcome text not null check (outcome in ('approved','rejected')),
  reason text, decided_at timestamptz not null default now(),
  foreign key (request_id, company_id) references public.approval_requests(id, company_id) on delete cascade
);

-- ------------------------------------------------------------ purchasing
create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null, contact_email text, status text not null default 'approved' check (status in ('approved','suspended','archived')),
  unique (id, company_id), unique (company_id, name)
);
create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null, sku text not null, name text not null, unit text not null default 'each',
  unit_price_minor bigint not null check (unit_price_minor >= 0), tax_bp int not null default 0 check (tax_bp between 0 and 10000),
  status text not null default 'active' check (status in ('active','archived')),
  unique (id, company_id), unique (company_id, sku),
  foreign key (supplier_id, company_id) references public.suppliers(id, company_id)
);
create table public.requisitions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null, supplier_id uuid not null, number text not null,
  requester_id uuid not null, note text not null default '',
  status text not null default 'draft' check (status in ('draft','submitted','approved','rejected','ordered','closed','cancelled')),
  total_minor bigint not null default 0, created_at timestamptz not null default now(),
  unique (id, company_id), unique (company_id, number),
  foreign key (branch_id, company_id) references public.branches(id, company_id),
  foreign key (supplier_id, company_id) references public.suppliers(id, company_id)
);
create table public.requisition_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, requisition_id uuid not null, item_id uuid not null,
  qty numeric(12,3) not null check (qty > 0), unit_price_minor bigint not null check (unit_price_minor >= 0),
  foreign key (requisition_id, company_id) references public.requisitions(id, company_id) on delete cascade,
  foreign key (item_id, company_id) references public.catalog_items(id, company_id)
);
create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null, supplier_id uuid not null, requisition_id uuid not null, number text not null,
  status text not null default 'sent' check (status in ('sent','partially_received','received','cancelled')),
  total_minor bigint not null, created_by uuid not null, created_at timestamptz not null default now(),
  unique (id, company_id), unique (company_id, number), unique (requisition_id),
  foreign key (branch_id, company_id) references public.branches(id, company_id),
  foreign key (supplier_id, company_id) references public.suppliers(id, company_id),
  foreign key (requisition_id, company_id) references public.requisitions(id, company_id)
);
create table public.po_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, po_id uuid not null, item_id uuid not null,
  qty_ordered numeric(12,3) not null check (qty_ordered > 0),
  qty_received numeric(12,3) not null default 0 check (qty_received >= 0),
  unit_price_minor bigint not null,
  unique (id, company_id), check (qty_received <= qty_ordered),
  foreign key (po_id, company_id) references public.purchase_orders(id, company_id) on delete cascade,
  foreign key (item_id, company_id) references public.catalog_items(id, company_id)
);
create table public.goods_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, po_id uuid not null, received_by uuid not null, note text not null default '',
  created_at timestamptz not null default now(), unique (id, company_id),
  foreign key (po_id, company_id) references public.purchase_orders(id, company_id)
);
create table public.receipt_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, receipt_id uuid not null, po_line_id uuid not null,
  qty_received numeric(12,3) not null check (qty_received >= 0),
  qty_rejected numeric(12,3) not null default 0 check (qty_rejected >= 0), discrepancy_note text,
  check (qty_received + qty_rejected > 0),
  check (qty_rejected = 0 or length(trim(coalesce(discrepancy_note,''))) >= 3),
  foreign key (receipt_id, company_id) references public.goods_receipts(id, company_id) on delete cascade,
  foreign key (po_line_id, company_id) references public.po_lines(id, company_id)
);

-- ------------------------------------------------------------ inspections
create table public.inspection_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null, items jsonb not null check (jsonb_typeof(items) = 'array'),  -- [{id,text,weight,critical}]
  status text not null default 'active' check (status in ('active','archived')),
  unique (id, company_id), unique (company_id, name)
);
create table public.inspections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, branch_id uuid not null, template_id uuid not null, inspector_id uuid not null,
  status text not null default 'scheduled' check (status in ('scheduled','completed','cancelled')),
  scheduled_for date not null, completed_at timestamptz,
  answers jsonb not null default '{}', score numeric(5,2), critical_failed boolean not null default false,
  created_at timestamptz not null default now(), unique (id, company_id),
  foreign key (branch_id, company_id) references public.branches(id, company_id),
  foreign key (template_id, company_id) references public.inspection_templates(id, company_id),
  foreign key (company_id, inspector_id) references public.memberships(company_id, user_id)
);
create table public.findings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, inspection_id uuid not null, branch_id uuid not null,
  item_id text not null, text text not null, severity text not null check (severity in ('minor','major','critical')),
  comment text, status text not null default 'open' check (status in ('open','fixed_pending_verification','verified','reopened')),
  created_at timestamptz not null default now(), unique (id, company_id),
  foreign key (inspection_id, company_id) references public.inspections(id, company_id),
  foreign key (branch_id, company_id) references public.branches(id, company_id)
);
create table public.corrective_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, finding_id uuid not null, branch_id uuid not null, assignee_id uuid not null,
  due_at date not null, description text not null,
  status text not null default 'open' check (status in ('open','done','verified')),
  proof_note text, completed_at timestamptz, verified_by uuid, verified_at timestamptz, verify_note text,
  created_at timestamptz not null default now(), unique (id, company_id),
  foreign key (finding_id, company_id) references public.findings(id, company_id),
  foreign key (branch_id, company_id) references public.branches(id, company_id),
  foreign key (company_id, assignee_id) references public.memberships(company_id, user_id),
  check (status = 'open' or length(trim(coalesce(proof_note,''))) >= 3),
  check (status <> 'verified' or (verified_by is not null and verified_by <> assignee_id))   -- independent verification
);

-- ------------------------------------------------------------ tickets
create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid, number text not null,
  kind text not null default 'internal' check (kind in ('internal','customer_complaint','incident')),
  category text not null default 'general', title text not null check (length(trim(title)) >= 3), body text not null default '',
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  assignee_id uuid, created_by uuid not null, resolved_at timestamptz, resolution text,
  created_at timestamptz not null default now(), unique (id, company_id), unique (company_id, number),
  foreign key (branch_id, company_id) references public.branches(id, company_id),
  check (status not in ('resolved','closed') or length(trim(coalesce(resolution,''))) >= 3)
);
create table public.ticket_comments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, ticket_id uuid not null, author_id uuid not null, body text not null check (length(trim(body)) > 0),
  created_at timestamptz not null default now(),
  foreign key (ticket_id, company_id) references public.tickets(id, company_id) on delete cascade
);

-- ------------------------------------------------------------ documents / SOPs
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null, kind text not null default 'sop' check (kind in ('sop','policy','template')),
  status text not null default 'draft' check (status in ('draft','in_review','published','archived')),
  current_version int not null default 0, expires_on date, created_by uuid not null,
  created_at timestamptz not null default now(), unique (id, company_id)
);
create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, document_id uuid not null, version int not null,
  body text not null, created_by uuid not null, published boolean not null default false,
  created_at timestamptz not null default now(), unique (document_id, version),
  foreign key (document_id, company_id) references public.documents(id, company_id) on delete cascade
);
create table public.acknowledgements (
  company_id uuid not null, document_id uuid not null, version int not null, user_id uuid not null,
  at timestamptz not null default now(), primary key (document_id, version, user_id),
  foreign key (document_id, company_id) references public.documents(id, company_id) on delete cascade,
  foreign key (company_id, user_id) references public.memberships(company_id, user_id)
);

-- ------------------------------------------------------------ training
create table public.courses (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null, description text not null default '', lesson text not null default '',
  pass_mark int not null default 80 check (pass_mark between 1 and 100),
  max_attempts int not null default 3 check (max_attempts >= 1), validity_days int check (validity_days > 0),
  questions jsonb not null default '[]',   -- [{q, options[], answer}] answer is never sent to learners
  status text not null default 'active' check (status in ('active','archived')),
  unique (id, company_id)
);
create table public.enrolments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, course_id uuid not null, user_id uuid not null,
  status text not null default 'assigned' check (status in ('assigned','passed','failed')),
  score int, attempts int not null default 0, completed_at timestamptz, expires_at timestamptz,
  unique (course_id, user_id),
  foreign key (course_id, company_id) references public.courses(id, company_id),
  foreign key (company_id, user_id) references public.memberships(company_id, user_id)
);

-- ------------------------------------------------------------ royalties (franchise partner -> brand)
create table public.royalty_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  partner_id uuid, version int not null default 1,
  type text not null check (type in ('fixed','percent','percent_with_minimum')),
  rate_bp int check (rate_bp between 0 and 10000), fixed_minor bigint check (fixed_minor >= 0), minimum_minor bigint check (minimum_minor >= 0),
  effective_from date not null, effective_to date,
  unique (id, company_id),
  foreign key (partner_id, company_id) references public.franchise_partners(id, company_id),
  check (effective_to is null or effective_to >= effective_from),
  check ((type = 'fixed' and fixed_minor is not null) or (type = 'percent' and rate_bp is not null)
         or (type = 'percent_with_minimum' and rate_bp is not null and minimum_minor is not null)),
  -- a partner (or the company default) cannot have two rules effective on the same day
  exclude using gist (company_id with =, (coalesce(partner_id, '00000000-0000-0000-0000-000000000000'::uuid)) with =,
                      daterange(effective_from, coalesce(effective_to, 'infinity'::date), '[]') with &&)
);
create table public.sales_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, branch_id uuid not null, period date not null check (extract(day from period) = 1),
  gross_minor bigint not null check (gross_minor >= 0), exclusions_minor bigint not null default 0 check (exclusions_minor >= 0),
  adjustments_minor bigint not null default 0, note text not null default '', submitted_by uuid not null,
  created_at timestamptz not null default now(), unique (branch_id, period), unique (id, company_id),
  foreign key (branch_id, company_id) references public.branches(id, company_id)
);
create table public.statements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, partner_id uuid not null, branch_id uuid not null, period date not null,
  rule_id uuid not null, rule_version int not null, base_minor bigint not null, royalty_minor bigint not null check (royalty_minor >= 0),
  minimum_applied boolean not null default false,
  status text not null default 'draft' check (status in ('draft','in_review','approved','issued','void')),
  number text, due_date date, prepared_by uuid not null, approved_by uuid, review_reason text, issued_at timestamptz,
  created_at timestamptz not null default now(), unique (id, company_id),
  foreign key (partner_id, company_id) references public.franchise_partners(id, company_id),
  foreign key (branch_id, company_id) references public.branches(id, company_id),
  foreign key (rule_id, company_id) references public.royalty_rules(id, company_id)
);
create unique index statements_one_live on public.statements(branch_id, period) where status <> 'void';
-- Money received from franchise partners. Structurally separate from platform_invoices (SaaS).
create table public.partner_payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, partner_id uuid not null, amount_minor bigint not null check (amount_minor > 0),
  received_on date not null, reference text not null default '', recorded_by uuid not null,
  created_at timestamptz not null default now(), unique (id, company_id),
  foreign key (partner_id, company_id) references public.franchise_partners(id, company_id)
);
create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, payment_id uuid not null, statement_id uuid not null,
  amount_minor bigint not null check (amount_minor > 0), created_at timestamptz not null default now(),
  foreign key (payment_id, company_id) references public.partner_payments(id, company_id),
  foreign key (statement_id, company_id) references public.statements(id, company_id)
);

-- ------------------------------------------------------------ assets & licences
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null, name text not null, serial text, status text not null default 'active' check (status in ('active','under_repair','disposed')),
  warranty_until date, cost_minor bigint check (cost_minor >= 0), notes text not null default '',
  unique (id, company_id), foreign key (branch_id, company_id) references public.branches(id, company_id)
);
create table public.licences (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid, name text not null, expires_on date not null, notes text not null default '',
  unique (id, company_id), foreign key (branch_id, company_id) references public.branches(id, company_id)
);

-- ============================================================ integrity triggers
-- Approval decisions: who may decide, at which step, with what reason.
create or replace function app.check_decision() returns trigger language plpgsql security definer set search_path = public as $$
declare r approval_requests; step_role uuid; lim bigint;
begin
  select * into r from approval_requests where id = new.request_id and company_id = new.company_id for update;
  if r.id is null or r.status <> 'pending' then raise exception 'this request is not waiting for a decision'; end if;
  if new.decided_by is distinct from auth.uid() then raise exception 'decisions are recorded as the signed-in user'; end if;
  if r.requester_id = auth.uid() and not app.sole_member(r.company_id) then raise exception 'you cannot decide your own request'; end if;
  if new.step <> r.current_step then raise exception 'this request is at step %', r.current_step + 1; end if;
  if new.outcome = 'rejected' and length(trim(coalesce(new.reason, ''))) < 3 then raise exception 'give a reason for rejecting'; end if;
  step_role := nullif(r.steps -> r.current_step ->> 'role_id', '')::uuid;
  if step_role is not null
     and not exists (select 1 from membership_roles mr join memberships m on m.id = mr.membership_id and m.company_id = mr.company_id
                     where m.user_id = auth.uid() and m.company_id = r.company_id and m.status = 'active' and mr.role_id = step_role)
     and not app.has_perm(r.company_id, 'approvals', 'configure') then
    raise exception 'you are not an approver for this step';
  end if;
  if r.amount_minor > 0 then
    select approval_limit_minor into lim from memberships where company_id = r.company_id and user_id = auth.uid();
    if lim is null or r.amount_minor > lim then raise exception 'this is above your approval limit'; end if;
  end if;
  return new;
end $$;
create trigger approval_decisions_check before insert on public.approval_decisions for each row execute function app.check_decision();

create or replace function app.apply_decision() returns trigger language plpgsql security definer set search_path = public as $$
declare r approval_requests; final text;
begin
  select * into r from approval_requests where id = new.request_id;
  if new.outcome = 'rejected' then final := 'rejected';
  elsif r.current_step + 1 >= jsonb_array_length(r.steps) then final := 'approved';
  end if;
  if final is null then
    update approval_requests set current_step = current_step + 1 where id = r.id;
  else
    update approval_requests set status = final where id = r.id;
    if r.kind = 'purchase' then update requisitions set status = final where id = r.subject_id and company_id = r.company_id; end if;
  end if;
  insert into notifications(company_id, user_id, title, body, href)
  values (r.company_id, r.requester_id,
          case when final = 'approved' then 'Approved: ' when final = 'rejected' then 'Rejected: ' else 'Step approved: ' end || r.title,
          coalesce(new.reason, ''), '/approvals?open=' || r.id);
  return new;
end $$;
create trigger approval_decisions_apply after insert on public.approval_decisions for each row execute function app.apply_decision();

-- Goods receipt: never more than ordered; PO and requisition status follow.
create or replace function app.apply_receipt() returns trigger language plpgsql security definer set search_path = public as $$
declare pl po_lines; po uuid; open_lines int;
begin
  select * into pl from po_lines where id = new.po_line_id and company_id = new.company_id for update;
  if pl.qty_received + new.qty_received > pl.qty_ordered then
    raise exception 'receiving % would exceed the % ordered; record the difference as rejected or a discrepancy', new.qty_received, pl.qty_ordered;
  end if;
  update po_lines set qty_received = qty_received + new.qty_received where id = pl.id;
  po := pl.po_id;
  select count(*) into open_lines from po_lines where po_id = po and qty_received < qty_ordered;
  update purchase_orders set status = case when open_lines = 0 then 'received' else 'partially_received' end where id = po;
  if open_lines = 0 then
    update requisitions set status = 'closed' where id = (select requisition_id from purchase_orders where id = po);
  end if;
  return new;
end $$;
create trigger receipt_lines_apply after insert on public.receipt_lines for each row execute function app.apply_receipt();

-- Corrective actions drive the finding status.
create or replace function app.sync_finding() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'done' then update findings set status = 'fixed_pending_verification' where id = new.finding_id;
  elsif new.status = 'verified' then update findings set status = 'verified' where id = new.finding_id;
  elsif new.status = 'open' and old.status = 'done' then update findings set status = 'reopened' where id = new.finding_id;
  end if;
  return new;
end $$;
create trigger corrective_actions_sync after update of status on public.corrective_actions for each row execute function app.sync_finding();

-- Whoever verifies a correction is recorded as the signed-in user, never client-supplied.
create or replace function app.stamp_verification() returns trigger language plpgsql as $$
begin
  if new.status = 'verified' and old.status <> 'verified' then new.verified_by := auth.uid(); new.verified_at := now(); end if;
  if new.status = 'done' and old.status = 'open' then new.completed_at := now(); end if;
  return new;
end $$;
create trigger corrective_actions_stamp before update on public.corrective_actions for each row execute function app.stamp_verification();

-- Workflow-controlled statuses can only be set by the workflow's own triggers (nested trigger depth),
-- never by a direct UPDATE from a client.
create or replace function app.guard_requisition() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.status not in ('draft','submitted') then raise exception 'a new requisition starts as draft or submitted'; end if;
    return new;
  end if;
  if new.status = old.status then return new; end if;
  if new.status in ('approved','rejected','closed') and pg_trigger_depth() < 2 then
    raise exception 'requisition status "%" is set by the approval and receiving workflow', new.status;
  end if;
  if new.status = 'ordered' and old.status <> 'approved' then raise exception 'only an approved requisition can be ordered'; end if;
  if new.status = 'submitted' and old.status not in ('draft','rejected') then raise exception 'this requisition was already submitted'; end if;
  return new;
end $$;
create trigger requisitions_guard before insert or update on public.requisitions for each row execute function app.guard_requisition();

create or replace function app.guard_approval_request() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'pending' or new.current_step <> 0 or new.requester_id <> auth.uid() then
      raise exception 'a new approval request starts pending, at step 1, in your name';
    end if;
    return new;
  end if;
  if (new.status, new.current_step) is distinct from (old.status, old.current_step) then
    if new.status = 'cancelled' and old.status = 'pending' and old.requester_id = auth.uid() then return new; end if;
    if pg_trigger_depth() < 2 then raise exception 'approval status changes only through decisions'; end if;
  end if;
  if (new.amount_minor, new.steps, new.requester_id, new.kind, new.subject_id) is distinct from (old.amount_minor, old.steps, old.requester_id, old.kind, old.subject_id) then
    raise exception 'a submitted approval request cannot be altered';
  end if;
  return new;
end $$;
create trigger approval_requests_guard before insert or update on public.approval_requests for each row execute function app.guard_approval_request();

create or replace function app.guard_po() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from requisitions r where r.id = new.requisition_id and r.company_id = new.company_id and r.status in ('approved')) then
      raise exception 'a purchase order needs an approved requisition';
    end if;
    update requisitions set status = 'ordered' where id = new.requisition_id;
    return new;
  end if;
  if new.status <> old.status and new.status in ('partially_received','received') and pg_trigger_depth() < 2 then
    raise exception 'order status follows goods receipts';
  end if;
  return new;
end $$;
create trigger purchase_orders_guard before insert or update on public.purchase_orders for each row execute function app.guard_po();

-- Statements: allowed transitions only; issued/void are immutable; approver differs from preparer.
create or replace function app.guard_statement() returns trigger language plpgsql as $$
declare ok boolean;
begin
  if old.status in ('issued','void') then raise exception 'a % statement cannot be changed; use a credit note or adjustment', old.status; end if;
  if new.status <> old.status then
    ok := (old.status, new.status) in (('draft','in_review'),('draft','void'),('in_review','draft'),('in_review','approved'),('in_review','void'),('approved','issued'),('approved','void'));
    if not ok then raise exception 'a statement cannot go from % to %', old.status, new.status; end if;
    if new.status = 'draft' and length(trim(coalesce(new.review_reason, ''))) < 3 then raise exception 'say what needs fixing when sending a statement back'; end if;
    if new.status = 'approved' then
      new.approved_by := auth.uid();
      if new.approved_by = old.prepared_by and not app.sole_member(old.company_id) then raise exception 'a different person must approve this statement'; end if;
    end if;
    if new.status = 'issued' then new.issued_at := now(); end if;
  elsif (new.base_minor, new.royalty_minor, new.rule_id, new.period, new.branch_id) is distinct from (old.base_minor, old.royalty_minor, old.rule_id, old.period, old.branch_id) and old.status <> 'draft' then
    raise exception 'amounts can only change while the statement is a draft';
  end if;
  return new;
end $$;
create trigger statements_guard before update on public.statements for each row execute function app.guard_statement();

-- Allocation: only to issued statements, never beyond what is owed or what was paid.
create or replace function app.check_allocation() returns trigger language plpgsql security definer set search_path = public as $$
declare s statements; p partner_payments; owed bigint; used bigint;
begin
  select * into s from statements where id = new.statement_id and company_id = new.company_id;
  select * into p from partner_payments where id = new.payment_id and company_id = new.company_id;
  if s.status <> 'issued' then raise exception 'payments can only be applied to issued statements'; end if;
  if s.partner_id <> p.partner_id then raise exception 'payment and statement belong to different partners'; end if;
  select s.royalty_minor - coalesce(sum(amount_minor), 0) into owed from payment_allocations where statement_id = s.id;
  if new.amount_minor > owed then raise exception 'that is more than the % still owed on this statement', owed; end if;
  select coalesce(sum(amount_minor), 0) into used from payment_allocations where payment_id = p.id;
  if used + new.amount_minor > p.amount_minor then raise exception 'that is more than the % left on this payment', p.amount_minor - used; end if;
  return new;
end $$;
create trigger payment_allocations_check before insert on public.payment_allocations for each row execute function app.check_allocation();

create or replace function app.statement_outstanding(p_statement uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select s.royalty_minor - coalesce((select sum(amount_minor) from payment_allocations where statement_id = s.id), 0)
  from statements s where s.id = p_statement and app.is_member(s.company_id)
$$;

-- Completed task timestamp.
create or replace function app.task_done() returns trigger language plpgsql as $$
begin
  if new.status = 'done' and old.status <> 'done' then new.completed_at := now(); end if;
  if new.status <> 'done' then new.completed_at := null; end if;
  return new;
end $$;
create trigger tasks_done before update on public.tasks for each row execute function app.task_done();

-- Training: pass sets expiry.
-- (computed in the app from courses.validity_days when grading)

-- ============================================================ RLS
select app.secure('tasks', 'tasks', 'branch_id', 'assignee_id');
select app.secure_child('task_comments', 'tasks', 'task_id', 'tasks');
select app.secure('checklist_templates', 'tasks');
select app.secure('checklist_runs', 'tasks', 'branch_id');
select app.secure('approval_rules', 'approvals');
select app.secure('approval_requests', 'approvals', 'branch_id');
drop policy approval_requests_ins on public.approval_requests;
drop policy approval_requests_upd on public.approval_requests;
-- Anyone in the company may ask for approval in their own name; the subject record's own RLS governs what they can submit.
create policy approval_requests_ins on public.approval_requests for insert with check (requester_id = auth.uid() and app.is_member(company_id));
create policy approval_requests_upd on public.approval_requests for update
  using (requester_id = auth.uid() and status = 'pending') with check (requester_id = auth.uid());
select app.secure('suppliers', 'purchasing');
select app.secure('catalog_items', 'purchasing');
select app.secure('requisitions', 'purchasing', 'branch_id');
select app.secure_child('requisition_lines', 'requisitions', 'requisition_id', 'purchasing');
select app.secure('purchase_orders', 'purchasing', 'branch_id');
select app.secure_child('po_lines', 'purchase_orders', 'po_id', 'purchasing');
select app.secure_child('goods_receipts', 'purchase_orders', 'po_id', 'purchasing');
select app.secure_child('receipt_lines', 'goods_receipts', 'receipt_id', 'purchasing');
select app.secure('inspection_templates', 'inspections');
select app.secure('inspections', 'inspections', 'branch_id');
select app.secure('findings', 'inspections', 'branch_id');
select app.secure('corrective_actions', 'actions', 'branch_id');
select app.secure('tickets', 'tickets', 'branch_id');
select app.secure_child('ticket_comments', 'tickets', 'ticket_id', 'tickets');
select app.secure('documents', 'documents');
select app.secure_child('document_versions', 'documents', 'document_id', 'documents');
select app.secure('courses', 'training');
select app.secure('royalty_rules', 'royalties');
select app.secure('sales_reports', 'sales', 'branch_id');
select app.secure('statements', 'royalties', 'branch_id');
select app.secure('partner_payments', 'royalties');
select app.secure('assets', 'assets', 'branch_id');
select app.secure('licences', 'assets', 'branch_id');
select app.secure('invitations', 'users');

alter table public.approval_decisions enable row level security;
create policy approval_decisions_sel on public.approval_decisions for select
  using (exists (select 1 from public.approval_requests r where r.id = request_id and r.company_id = approval_decisions.company_id));
create policy approval_decisions_ins on public.approval_decisions for insert
  with check (decided_by = auth.uid() and app.has_perm(company_id, 'approvals', 'approve')
              and exists (select 1 from public.approval_requests r where r.id = request_id and r.company_id = approval_decisions.company_id));

alter table public.payment_allocations enable row level security;
create policy payment_allocations_sel on public.payment_allocations for select using (app.has_perm(company_id, 'royalties', 'view'));
create policy payment_allocations_ins on public.payment_allocations for insert with check (app.has_perm(company_id, 'royalties', 'pay'));

alter table public.notifications enable row level security;
create policy notifications_sel on public.notifications for select using (user_id = auth.uid());
create policy notifications_upd on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_ins on public.notifications for insert with check (app.is_member(company_id));

-- Acknowledgements and enrolments: a person acts on their own; managers see everyone's.
alter table public.acknowledgements enable row level security;
create policy ack_sel on public.acknowledgements for select using (user_id = auth.uid() or app.has_perm(company_id, 'documents', 'view') and app.has_perm(company_id, 'documents', 'edit'));
create policy ack_ins on public.acknowledgements for insert with check (user_id = auth.uid() and app.is_member(company_id));
alter table public.enrolments enable row level security;
create policy enrol_sel on public.enrolments for select using (user_id = auth.uid() or app.has_perm(company_id, 'training', 'edit'));
create policy enrol_ins on public.enrolments for insert with check (app.has_perm(company_id, 'training', 'assign'));
create policy enrol_upd on public.enrolments for update using (user_id = auth.uid() or app.has_perm(company_id, 'training', 'edit')) with check (user_id = auth.uid() or app.has_perm(company_id, 'training', 'edit'));

-- Members can read each other's names (needed for assignment pickers).
create or replace function app.shares_company(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from memberships a join memberships b on a.company_id = b.company_id
                 where a.user_id = auth.uid() and a.status = 'active' and b.user_id = p_user)
$$;
create policy profiles_peers on public.profiles for select using (app.shares_company(id));

-- ============================================================ audit + grants
do $$ declare t text; begin
  foreach t in array array['invitations','tasks','checklist_runs','approval_rules','approval_requests','approval_decisions','suppliers','catalog_items',
    'requisitions','purchase_orders','goods_receipts','inspections','findings','corrective_actions','tickets','documents','document_versions',
    'courses','enrolments','royalty_rules','sales_reports','statements','partner_payments','payment_allocations','assets','licences']
  loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app.audit()', 'audit_' || t, t);
  end loop;
end $$;

grant select, insert, update on all tables in schema public to authenticated;
revoke update, delete on public.audit_log from authenticated;
revoke all on public.company_counters from authenticated;
revoke insert, update on public.plans, public.plan_versions, public.subscriptions, public.platform_staff from authenticated;
revoke insert on public.companies from authenticated;
revoke update on public.approval_decisions, public.payment_allocations, public.receipt_lines, public.goods_receipts from authenticated;
grant execute on all functions in schema app to authenticated;
