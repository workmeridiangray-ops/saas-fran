-- Closure and deletion schedule.
\set ON_ERROR_STOP on
set client_min_messages = warning;
\set u '''22222222-0000-0000-0000-000000000001'''

select t.as_user(:u);
select create_company('Gone Co', 'gone-co') as cid \gset
insert into branches(company_id, name, code, status) values (:'cid', 'Main', 'G1', 'active');
insert into tasks(company_id, title, created_by) values (:'cid', 'Close the till', :u);
select close_company(:'cid');
select t.check('closing is recorded with a timestamp', (select status = 'closing' and closing_at is not null from companies where id = :'cid'));
select t.check('a closing workspace is still readable', (select count(*) from branches) = 1);

select t.as_user(null);
insert into platform_invoices(company_id, subscription_id, number, plan_id, plan_version, amount_minor, currency, period_start, period_end, due_at)
  select company_id, id, 'INV-GONE-1', plan_id, plan_version, 29900, 'USD', now(), now() + interval '1 month', now() from subscriptions where company_id = :'cid';
select t.check('nothing is purged inside the retention period', app.purge_closed_companies(90) = 0);
select t.denied('retention under 30 days', $$select app.purge_closed_companies(5)$$);
update companies set closing_at = now() - interval '91 days' where id = :'cid';
select t.check('after the retention period the company is purged', app.purge_closed_companies(90) = 1);
select t.check('tenant data is gone', (select count(*) from branches where company_id = :'cid') = 0 and (select count(*) from tasks where company_id = :'cid') = 0 and (select count(*) from companies where id = :'cid') = 0);
select t.check('the invoice is retained for accounting', (select count(*) from retained_invoices where number = 'INV-GONE-1' and company_name = 'Gone Co') = 1);
select t.check('the audit trail survives, field names only', (select count(*) from audit_log where company_id = :'cid' and op = 'PURGE') = 1 and (select count(*) from audit_log where company_id = :'cid') > 3);
select t.as_user(:u);
select t.denied('customers cannot call the purge', $$select app.purge_closed_companies(90)$$);
select 'lifecycle tests passed' as result;
