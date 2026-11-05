-- Company closure and deletion schedule. Closing keeps the workspace readable/exportable; after the
-- retention period the tenant's data is deleted. SaaS invoices are copied to retained_invoices first
-- (accounting records outlive the customer), and the audit log (field names only) is never deleted.

alter table public.companies add column closing_at timestamptz;

create table public.retained_invoices (like public.platform_invoices, company_name text not null, purged_at timestamptz not null default now());
alter table public.retained_invoices drop constraint if exists retained_invoices_pkey;
alter table public.retained_invoices enable row level security;   -- no policies: platform-only

create or replace function public.close_company(p_company uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not app.has_perm(p_company, 'billing', 'configure') then raise exception 'only an owner can close the company' using errcode = '42501'; end if;
  update companies set status = 'closing', closing_at = coalesce(closing_at, now()) where id = p_company and status not in ('closed');
end $$;

create or replace function app.purge_closed_companies(p_retention_days int default 90) returns int
language plpgsql security definer set search_path = public as $$
declare c record; n int := 0; t text;
begin
  if p_retention_days < 30 then raise exception 'retention must be at least 30 days'; end if;
  perform set_config('app.purging', 'on', true);   -- lets append-only ledgers be deleted by this routine only
  for c in select id, name from companies where status = 'closing' and closing_at < now() - make_interval(days => p_retention_days) loop
    insert into retained_invoices select i.*, c.name, now() from platform_invoices i where i.company_id = c.id;
    -- Child tables without a cascade path, in dependency order. (The audit log is deliberately kept.)
    foreach t in array array['payment_allocations','partner_payments','statements','sales_reports','corrective_actions','findings','inspections','checklist_runs',
      'enrolments','acknowledgements','notifications','task_comments','ticket_comments','document_versions','receipt_lines','goods_receipts','po_lines','requisition_lines',
      'approval_decisions','membership_roles','branch_history','attachments']
    loop execute format('delete from public.%I where company_id = $1', t) using c.id; end loop;
    delete from platform_invoices where company_id = c.id;
    delete from subscriptions where company_id = c.id;
    insert into audit_log(company_id, actor, table_name, op, row_id, changed_fields) values (c.id, null, 'companies', 'PURGE', c.id::text, '{retention}');
    delete from companies where id = c.id;        -- cascades to every tenant table
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function app.purge_closed_companies(int) from public, authenticated;
