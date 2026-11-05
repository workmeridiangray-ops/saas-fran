-- Tenant isolation, scope, audit and immutability. Any failed check raises and aborts the run.
\set ON_ERROR_STOP on
set client_min_messages = warning;

-- ------------------------------------------------------------ fixtures (superuser)
\set alice   '''00000000-0000-0000-0000-00000000000a'''
\set bob     '''00000000-0000-0000-0000-00000000000b'''
\set mgr     '''00000000-0000-0000-0000-0000000000c1'''
\set emp     '''00000000-0000-0000-0000-0000000000e1'''
\set staff   '''00000000-0000-0000-0000-0000000000f1'''
\set sus     '''00000000-0000-0000-0000-0000000000d1'''

insert into companies(id, name, slug) values
  ('a0000000-0000-0000-0000-000000000001', 'Acme Foods', 'acme'),
  ('b0000000-0000-0000-0000-000000000001', 'Beta Print', 'beta');
insert into brands(id, company_id, name) values
  ('a1000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Acme Grill'),
  ('b1000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Beta Press');
insert into regions(id, company_id, name) values
  ('a2000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'East'),
  ('a2000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'West');
insert into branches(id, company_id, name, code, brand_id, region_id, status) values
  ('a3000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Acme Downtown', 'AD1', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000001', 'active'),
  ('a3000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Acme Harbour', 'AH2', 'a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'active'),
  ('b3000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Beta Central', 'BC1', 'b1000000-0000-0000-0000-000000000001', null, 'active');

insert into roles(id, company_id, name, grants) values
  ('a4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'Owner', '[{"resource":"*","actions":"*"}]'),
  ('a4000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Branch manager', '[{"resource":"branches","actions":["view","edit"]}]'),
  ('a4000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'Employee', '[{"resource":"tasks","actions":["view"],"ownOnly":true}]'),
  ('b4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Owner', '[{"resource":"*","actions":"*"}]');

insert into memberships(id, company_id, user_id, status, branch_ids) values
  ('a5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', :alice, 'active', '{}'),
  ('a5000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', :mgr, 'active', '{a3000000-0000-0000-0000-000000000001}'),
  ('a5000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', :emp, 'active', '{}'),
  ('a5000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', :sus, 'suspended', '{}'),
  ('b5000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', :bob, 'active', '{}');
insert into membership_roles(membership_id, role_id, company_id) values
  ('a5000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001'),
  ('a5000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001'),
  ('a5000000-0000-0000-0000-000000000003', 'a4000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001'),
  ('a5000000-0000-0000-0000-000000000004', 'a4000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001'),
  ('b5000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001');

insert into platform_staff(user_id, role) values (:staff, 'support');

-- ------------------------------------------------------------ tenant isolation
select t.as_user(:alice);
select t.check('owner sees both own branches', (select count(*) from branches) = 2);
select t.check('owner sees none of the other company', (select count(*) from branches where company_id = 'b0000000-0000-0000-0000-000000000001') = 0);
select t.check('owner sees only own company row', (select count(*) from companies) = 1);
select t.check('owner cannot see other company brands', (select count(*) from brands) = 1);
select t.denied('insert branch into another company',
  $$insert into branches(company_id, name, code) values ('b0000000-0000-0000-0000-000000000001', 'Sneaky', 'S1')$$);
select t.denied('point own branch at another company brand (composite FK)',
  $$insert into branches(company_id, name, code, brand_id) values ('a0000000-0000-0000-0000-000000000001', 'Cross', 'X1', 'b1000000-0000-0000-0000-000000000001')$$);
select t.denied('hard-delete a branch (archive instead)', $$delete from branches where code = 'AD1'$$);
select t.denied('edit plan_versions', $$update plan_versions set monthly_price_minor = 1$$);
select t.denied('write subscriptions', $$insert into subscriptions(company_id, plan_id, plan_version) values ('a0000000-0000-0000-0000-000000000001','growth',1)$$);
select t.denied('create company directly', $$insert into companies(name, slug) values ('Direct', 'direct')$$);

-- ------------------------------------------------------------ scope & grants
select t.as_user(:mgr);
select t.check('branch manager sees only their branch', (select count(*) from branches) = 1);
select t.check('...the right one', (select code from branches) = 'AD1');
update branches set name = 'Acme Downtown (renamed)' where code = 'AD1';
select t.check('manager can edit own branch', (select name from branches) = 'Acme Downtown (renamed)');
select t.check('manager cannot edit another branch', t.affected($$update branches set name = 'x' where code = 'AH2'$$) = 0);
select t.denied('manager creates a branch', $$insert into branches(company_id, name, code) values ('a0000000-0000-0000-0000-000000000001', 'New', 'N1')$$);
select t.check('manager cannot see billing/brands without grant', (select count(*) from brands) = 0);
select t.check('manager cannot read the audit log', (select count(*) from audit_log) = 0);

select t.as_user(:emp);
select t.check('employee with only tasks grant sees no branches', (select count(*) from branches) = 0);
select t.check('...but can see their own membership', (select count(*) from memberships) = 1);

select t.as_user(:sus);
select t.check('suspended member sees nothing', (select count(*) from branches) = 0 and (select count(*) from companies) = 0);

select t.as_user(:bob);
select t.check('other company sees only theirs', (select count(*) from branches) = 1 and (select code from branches) = 'BC1');

select t.as_user(null);
set role anon;
select t.denied('anon reads branches', $$select * from branches$$);
reset role;

-- ------------------------------------------------------------ audit
select t.as_user(:alice);
select t.check('audit has the rename, field names only',
  exists (select 1 from audit_log where table_name = 'branches' and op = 'UPDATE' and changed_fields = array['name']));
select t.check('audit never stores values', not exists (select 1 from audit_log where changed_fields::text ilike '%renamed%'));
select t.denied('delete audit rows', $$delete from audit_log$$);
select t.denied('update audit rows', $$update audit_log set op = 'X'$$);
select t.as_user(null);
select t.denied('superuser cannot alter audit rows either', $$update audit_log set op = 'X'$$);

-- ------------------------------------------------------------ branch history
select t.as_user(null);
update branches set region_id = 'a2000000-0000-0000-0000-000000000002' where code = 'AD1';
select t.check('branch region change keeps history',
  (select count(*) from branch_history h join branches b on b.id = h.branch_id where b.code = 'AD1') = 2);

-- ------------------------------------------------------------ create_company
select t.as_user('00000000-0000-0000-0000-0000000000aa');
select create_company('Newco', 'newco') is not null as created \gset
select t.check('creator becomes active owner of the new company', (select count(*) from memberships where status = 'active') = 1);
select t.check('creator sees only the new company', (select count(*) from companies) = 1);
select t.as_user(:alice);
select t.check('existing owners cannot see the new company', (select count(*) from companies where slug = 'newco') = 0);
select t.denied('create_company needs sign-in', $$set role anon; select create_company('x','xx')$$);
select t.as_user(null);

-- ------------------------------------------------------------ support access
select t.as_user(:staff);
select t.check('support has no access without a grant', (select count(*) from branches) = 0);
select t.as_user(:alice);
insert into support_access_grants(company_id, staff_user_id, granted_by, reason, expires_at)
  values ('a0000000-0000-0000-0000-000000000001', :staff, :alice, 'Investigate sync failure', now() + interval '2 seconds');
select t.denied('grant without a real reason',
  $$insert into support_access_grants(company_id, staff_user_id, granted_by, reason, expires_at) values ('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-00000000000a', 'x', now() + interval '1 hour')$$);
select t.as_user(:staff);
select t.check('support can read while the grant is live', (select count(*) from branches) = 2);
select t.check('support cannot write (RLS hides rows from updates)', t.affected($$update branches set name = 'support edit'$$) = 0);
select pg_sleep(2.2);
select t.check('support access lapses on its own', (select count(*) from branches) = 0);
select t.as_user(null);

select 'isolation tests passed' as result;
