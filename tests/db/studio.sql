-- Configuration studio: custom fields are typed, validated in the database and scoped to the company.
\set ON_ERROR_STOP on
set client_min_messages = warning;
\set own '''66666666-0000-0000-0000-000000000001'''
\set emp '''66666666-0000-0000-0000-000000000002'''
\set oth '''66666666-0000-0000-0000-000000000003'''

select t.as_user(:own);
select create_company('Studio Co', 'studio-test-co') as cid \gset
select t.as_user(:oth);
select create_company('Other Co', 'studio-other-co') as cid2 \gset
select t.as_user(:own);
insert into branches(company_id, name, code, status) values (:'cid', 'Main', 'M1', 'active');
insert into custom_fields(company_id, entity, key, label, kind, required) values (:'cid', 'branches', 'seats', 'Seats', 'number', false);
insert into custom_fields(company_id, entity, key, label, kind, options, required) values (:'cid', 'branches', 'format', 'Format', 'select', array['Kiosk','Dine-in'], true);
insert into custom_fields(company_id, entity, key, label, kind) values (:'cid', 'branches', 'opened', 'Opened on', 'date');

select t.denied('a required field must be filled', $$update branches set custom = '{"seats": 10}' where code = 'M1'$$);
update branches set custom = '{"seats": 40, "format": "Kiosk", "opened": "2026-01-05"}' where code = 'M1';
select t.check('valid values are stored', (select (custom->>'seats')::int from branches where code = 'M1') = 40);
select t.denied('a number field refuses text', $$update branches set custom = '{"seats": "lots", "format": "Kiosk"}' where code = 'M1'$$);
select t.denied('a select field refuses an unknown option', $$update branches set custom = '{"format": "Truck"}' where code = 'M1'$$);
select t.denied('a date field refuses nonsense', $$update branches set custom = '{"format": "Kiosk", "opened": "yesterday"}' where code = 'M1'$$);
select t.denied('an undefined key is refused', $$update branches set custom = '{"format": "Kiosk", "colour": "red"}' where code = 'M1'$$);
select t.denied('a field can''t change type', $$update custom_fields set kind = 'text' where key = 'seats'$$);
select t.denied('select options cannot be removed', $$update custom_fields set options = array['Kiosk'] where key = 'format'$$);
update custom_fields set options = array['Kiosk','Dine-in','Truck'] where key = 'format';
update branches set custom = '{"format": "Truck"}' where code = 'M1';
select t.check('an option added later is accepted', (select custom->>'format' from branches where code = 'M1') = 'Truck');
update custom_fields set archived = true where key = 'seats';
select t.denied('an archived field no longer accepts values', $$update branches set custom = '{"format": "Truck", "seats": 3}' where code = 'M1'$$);

-- Other companies and non-admins
select t.as_user(:oth);
select t.check('another company cannot see these definitions', (select count(*) from custom_fields) = 0);
select t.denied('another company cannot define on ours', format($$insert into custom_fields(company_id, entity, key, label, kind) values (%L, 'tasks', 'x1', 'Sneaky', 'text')$$, :'cid'));
insert into custom_fields(company_id, entity, key, label, kind) values (:'cid2', 'tasks', 'ref', 'Reference', 'text');
select t.as_user(:own);
select t.check('our definitions don''t see theirs', (select count(*) from custom_fields where entity = 'tasks') = 0);

select t.as_user(null);
insert into memberships(id, company_id, user_id, status) values ('66666666-3333-0000-0000-0000000000a1', :'cid', :emp, 'active');
select id as emp_role from roles where company_id = :'cid' and name = 'Employee' \gset
insert into membership_roles(membership_id, role_id, company_id) values ('66666666-3333-0000-0000-0000000000a1', :'emp_role', :'cid');
select t.as_user(:emp);
select t.check('every member can read the definitions to fill forms', (select count(*) from custom_fields) = 3);
select t.denied('but not change them', $$insert into custom_fields(company_id, entity, key, label, kind) values ((select company_id from custom_fields limit 1), 'tasks', 'zz', 'Nope', 'text')$$);

-- Terminology
select t.as_user(:own);
insert into terminology(company_id, term, singular, plural) values (:'cid', 'branch', 'Store', 'Stores');
select t.as_user(:emp);
select t.check('members can read the renamed terms', (select plural from terminology where term = 'branch') = 'Stores');
select t.check('members cannot rename terms', t.affected($$update terminology set plural = 'Shops'$$) = 0);
select t.as_user(:oth);
select t.check('terms are per company', (select count(*) from terminology) = 0);
-- Saved custom reports
select t.as_user(:own);
insert into custom_reports(company_id, name, dataset, columns, created_by) values (:'cid', 'Open tasks', 'tasks', array['title','status'], :own);
select t.denied('a report must name at least one column', format($$insert into custom_reports(company_id, name, dataset, columns, created_by) values (%L, 'Empty', 'tasks', '{}', %L)$$, :'cid', '66666666-0000-0000-0000-000000000001'));
select t.denied('a report can only use known datasets', format($$insert into custom_reports(company_id, name, dataset, columns, created_by) values (%L, 'Bad', 'users', array['x'], %L)$$, :'cid', '66666666-0000-0000-0000-000000000001'));
select t.denied('report names are unique per company', format($$insert into custom_reports(company_id, name, dataset, columns, created_by) values (%L, 'Open tasks', 'tasks', array['title'], %L)$$, :'cid', '66666666-0000-0000-0000-000000000001'));
select t.as_user(:oth);
select t.check('another company cannot see saved reports', (select count(*) from custom_reports) = 0);
select t.check('...or remove them', t.affected($$delete from custom_reports$$) = 0);
select t.as_user(:emp);
select t.check('an employee without reports access sees none', (select count(*) from custom_reports) = 0);
select t.as_user(null);
select 'studio tests passed' as result;
