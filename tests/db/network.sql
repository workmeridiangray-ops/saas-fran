-- Opening projects (and, later in this file, the franchise pipeline).
\set ON_ERROR_STOP on
set client_min_messages = warning;
\set own '''55555555-0000-0000-0000-000000000001'''
\set mgr '''55555555-0000-0000-0000-000000000002'''

select t.as_user(:own);
select create_company('Open Co', 'open-co', 'mixed') as cid \gset
insert into branches(id, company_id, name, code, status) values ('55555555-2222-0000-0000-000000000001', :'cid', 'New Store', 'NS1', 'opening');
insert into projects(id, company_id, branch_id, name) values ('55555555-3333-0000-0000-000000000001', :'cid', '55555555-2222-0000-0000-000000000001', 'Open New Store');
insert into project_items(id, company_id, project_id, category, title, requires_evidence) values
  ('55555555-4444-0000-0000-000000000001', :'cid', '55555555-3333-0000-0000-000000000001', 'licences', 'Business licence', true),
  ('55555555-4444-0000-0000-000000000002', :'cid', '55555555-3333-0000-0000-000000000001', 'site', 'Utilities connected', false);
select t.denied('blocked needs a reason', $$update project_items set status = 'blocked' where title = 'Utilities connected'$$);
select t.denied('an item needing evidence cannot be done without it', $$update project_items set status = 'done' where title = 'Business licence'$$);
select t.denied('launch is refused with unfinished work', $$select launch_project('55555555-3333-0000-0000-000000000001')$$);
update project_items set status = 'done', evidence_note = 'Licence no. 4471 filed' where title = 'Business licence';
update project_items set status = 'blocked', blocker_note = 'Waiting for the electricity provider' where title = 'Utilities connected';
select t.denied('launch is refused while anything is blocked', $$select launch_project('55555555-3333-0000-0000-000000000001')$$);
update project_items set status = 'done', blocker_note = null where title = 'Utilities connected';
insert into memberships(id, company_id, user_id, status) values ('55555555-5555-0000-0000-000000000001', :'cid', :mgr, 'active');
insert into membership_roles(membership_id, role_id, company_id) select '55555555-5555-0000-0000-000000000001', id, :'cid' from roles where name = 'Branch manager' and company_id = :'cid';
select t.as_user(:mgr);
select t.denied('a branch manager cannot approve a launch', $$select launch_project('55555555-3333-0000-0000-000000000001')$$);
select t.check('but can see and update the checklist', t.affected($$update project_items set cost_minor = 2500 where title = 'Utilities connected'$$) = 1);
select t.as_user(:own);
select launch_project('55555555-3333-0000-0000-000000000001');
select t.check('launch opens the branch', (select status from branches where id = '55555555-2222-0000-0000-000000000001') = 'active' and (select status from projects where id = '55555555-3333-0000-0000-000000000001') = 'launched');
select t.denied('a launched checklist cannot be reopened', $$update project_items set status = 'todo' where title = 'Business licence'$$);
select t.denied('a project cannot be launched twice', $$select launch_project('55555555-3333-0000-0000-000000000001')$$);
select 'project tests passed' as result;
