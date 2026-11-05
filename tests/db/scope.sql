-- Region/brand scope on every branch-owned record, and SLA escalation.
\set ON_ERROR_STOP on
set client_min_messages = warning;
\set own '''44444444-0000-0000-0000-000000000001'''
\set reg '''44444444-0000-0000-0000-000000000002'''

select t.as_user(:own);
select create_company('Scope Co', 'scope-co') as cid \gset
insert into regions(id, company_id, name) values ('44444444-1111-0000-0000-000000000001', :'cid', 'North'), ('44444444-1111-0000-0000-000000000002', :'cid', 'South');
insert into regions(id, company_id, name, parent_region_id) values ('44444444-1111-0000-0000-000000000003', :'cid', 'North-East', '44444444-1111-0000-0000-000000000001');
insert into branches(id, company_id, name, code, region_id, status) values
  ('44444444-2222-0000-0000-000000000001', :'cid', 'N1', 'N1', '44444444-1111-0000-0000-000000000001', 'active'),
  ('44444444-2222-0000-0000-000000000002', :'cid', 'NE1', 'NE1', '44444444-1111-0000-0000-000000000003', 'active'),
  ('44444444-2222-0000-0000-000000000003', :'cid', 'S1', 'S1', '44444444-1111-0000-0000-000000000002', 'active');
insert into tasks(company_id, branch_id, title, created_by) values (:'cid', '44444444-2222-0000-0000-000000000001', 'North task', :own), (:'cid', '44444444-2222-0000-0000-000000000003', 'South task', :own);
select id as mgr_role from roles where name = 'Branch manager' \gset
insert into memberships(id, company_id, user_id, status, region_ids) values ('44444444-3333-0000-0000-000000000001', :'cid', :reg, 'active', array['44444444-1111-0000-0000-000000000001']::uuid[]);
insert into membership_roles(membership_id, role_id, company_id) values ('44444444-3333-0000-0000-000000000001', :'mgr_role', :'cid');

select t.as_user(:reg);
select t.check('a North regional manager sees North and its sub-region, not South', (select count(*) from branches) = 2 and not exists (select 1 from branches where code = 'S1'));
select t.check('...and only the tasks of those branches', (select count(*) from tasks) = 1 and (select title from tasks) = 'North task');
select t.denied('...cannot create a task in South', $$insert into tasks(company_id, branch_id, title, created_by) values ((select company_id from branches limit 1), '44444444-2222-0000-0000-000000000003', 'sneaky', '44444444-0000-0000-0000-000000000002')$$);

-- SLA
select t.as_user(:own);
insert into tickets(company_id, number, title, priority, created_by) values (:'cid', 'T-1', 'Walk-in freezer down', 'urgent', :own) returning id as tk \gset
select t.check('an urgent ticket gets a 4 hour deadline by default', (select due_at - created_at from tickets where id = :'tk') = interval '4 hours');
insert into sla_policies(company_id, priority, resolve_hours) values (:'cid', 'normal', 10);
insert into tickets(company_id, number, title, created_by) values (:'cid', 'T-2', 'Menu printing', :own) returning id as tk2 \gset
select t.check('a company SLA overrides the default', (select due_at - created_at from tickets where id = :'tk2') = interval '10 hours');
select t.as_user(null);
select t.check('nothing escalates before the deadline', app.run_escalations(now()) = 0);
select app.run_escalations(now() + interval '5 hours') as n1 \gset
select t.check('past the deadline: level 1', :n1 = 1 and (select escalation_level from tickets where id = :'tk') = 1);
select t.check('running again does not repeat it', app.run_escalations(now() + interval '5 hours') = 0);
select app.run_escalations(now() + interval '30 hours') as n2 \gset
select t.check('a day later: level 2 to owners', :n2 >= 1 and (select escalation_level from tickets where id = :'tk') = 2);
select t.as_user(:own);
select t.check('the owner was told', (select count(*) from notifications where title like 'Escalated:%') = 1);
select 'scope and SLA tests passed' as result;

-- ============================================================ stock ledger
select t.as_user(:own);
insert into suppliers(id, company_id, name) values ('44444444-4444-0000-0000-000000000001', :'cid', 'Beans Ltd');
insert into catalog_items(id, company_id, supplier_id, sku, name, unit_price_minor) values ('44444444-5555-0000-0000-000000000001', :'cid', '44444444-4444-0000-0000-000000000001', 'BEAN', 'Beans', 500);
insert into stock_movements(company_id, branch_id, item_id, qty, kind) values (:'cid', '44444444-2222-0000-0000-000000000001', '44444444-5555-0000-0000-000000000001', 10, 'receipt');
select t.check('level is the sum of movements', (select qty from stock_levels where branch_id = '44444444-2222-0000-0000-000000000001') = 10);
select t.denied('stock cannot go negative', $$insert into stock_movements(company_id, branch_id, item_id, qty, kind) select company_id, id, '44444444-5555-0000-0000-000000000001', -11, 'issue' from branches where code = 'N1'$$);
select t.denied('wastage needs a reason', $$insert into stock_movements(company_id, branch_id, item_id, qty, kind) select company_id, id, '44444444-5555-0000-0000-000000000001', -1, 'wastage' from branches where code = 'N1'$$);
select t.denied('movements cannot be edited', $$update stock_movements set qty = 999$$);
select t.denied('movements cannot be deleted', $$delete from stock_movements$$);
select transfer_stock('44444444-2222-0000-0000-000000000001', '44444444-2222-0000-0000-000000000003', '44444444-5555-0000-0000-000000000001', 4, 'restock South');
select t.check('a transfer moves stock between branches', (select qty from stock_levels where branch_id = '44444444-2222-0000-0000-000000000001') = 6 and (select qty from stock_levels where branch_id = '44444444-2222-0000-0000-000000000003') = 4);
select t.denied('cannot transfer more than is there', $$select transfer_stock('44444444-2222-0000-0000-000000000001', '44444444-2222-0000-0000-000000000003', '44444444-5555-0000-0000-000000000001', 50, '')$$);
select t.check('a count records only the difference', record_count('44444444-2222-0000-0000-000000000001', '44444444-5555-0000-0000-000000000001', 5, 'one spilt') = -1);
select t.denied('a differing count needs a reason', $$select record_count('44444444-2222-0000-0000-000000000001', '44444444-5555-0000-0000-000000000001', 1, '')$$);
select t.as_user(:reg);   -- North-region manager: no inventory grant for transfers out of South
select t.denied('a regional manager cannot move stock out of a branch outside their region', $$select transfer_stock('44444444-2222-0000-0000-000000000003', '44444444-2222-0000-0000-000000000001', '44444444-5555-0000-0000-000000000001', 1, '')$$);
select t.check('and cannot read South stock', (select count(*) from stock_levels where branch_id = '44444444-2222-0000-0000-000000000003') = 0);
select 'stock tests passed' as result;
