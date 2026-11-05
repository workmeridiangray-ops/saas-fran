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

-- ============================================================ franchise pipeline
\set fm '''55555555-0000-0000-0000-000000000003'''
select t.as_user(:own);
insert into territories(id, company_id, name) values ('55555555-6666-0000-0000-000000000001', :'cid', 'Riverside'), ('55555555-6666-0000-0000-000000000002', :'cid', 'Harbour');
insert into applicants(id, company_id, name, email, stage) values ('55555555-7777-0000-0000-000000000001', :'cid', 'Lakeside Foods LLC', 'a@lake.test', 'review'), ('55555555-7777-0000-0000-000000000002', :'cid', 'Rival Co', 'b@rival.test', 'review');
select reserve_territory('55555555-6666-0000-0000-000000000001', '55555555-7777-0000-0000-000000000001', 30);
select t.denied('a territory reserved for one applicant cannot be reserved for another', $$select reserve_territory('55555555-6666-0000-0000-000000000001', '55555555-7777-0000-0000-000000000002', 30)$$);
select t.denied('approval needs verified checks', $$select approve_applicant('55555555-7777-0000-0000-000000000001')$$);
insert into applicant_checks(company_id, applicant_id, kind, label, status) values (:'cid', '55555555-7777-0000-0000-000000000001', 'document', 'ID verified', 'verified'), (:'cid', '55555555-7777-0000-0000-000000000001', 'qualification', 'Net worth above threshold', 'received');
select t.denied('a check that is only received is not enough', $$select approve_applicant('55555555-7777-0000-0000-000000000001')$$);
update applicant_checks set status = 'verified' where label = 'Net worth above threshold';
select t.denied('a rejected check needs a reason', $$update applicant_checks set status = 'rejected' where label = 'ID verified'$$);
select approve_applicant('55555555-7777-0000-0000-000000000001') as pid \gset
select t.check('approval creates an approved (not active) partner', (select stage from franchise_partners where id = :'pid') = 'approved');
select t.check('...and the applicant stage follows', (select stage from applicants where id = '55555555-7777-0000-0000-000000000001') = 'approved');

-- agreements
insert into agreements(id, company_id, number, partner_id, territory_id, start_date, end_date, created_by) values ('55555555-8888-0000-0000-000000000001', :'cid', 'AGR-1', :'pid', '55555555-6666-0000-0000-000000000001', current_date - 1, current_date + 365, :own);
insert into agreement_fees(company_id, agreement_id, kind, due_on, amount_minor) values (:'cid', '55555555-8888-0000-0000-000000000001', 'franchise_fee', current_date, 2500000);
select t.denied('a paid fee needs the date', $$update agreement_fees set status = 'paid'$$);
select sign_agreement('55555555-8888-0000-0000-000000000001');
select t.check('signing an agreement that has started activates the partner and assigns the territory',
  (select status from franchise_partners where id = :'pid') = 'active' and (select status from territories where id = '55555555-6666-0000-0000-000000000001') = 'assigned');
select t.denied('signed terms cannot be edited', $$update agreements set franchise_fee_minor = 1 where number = 'AGR-1'$$);
insert into agreements(id, company_id, number, partner_id, territory_id, start_date, end_date, created_by) values ('55555555-8888-0000-0000-000000000002', :'cid', 'AGR-2', :'pid', '55555555-6666-0000-0000-000000000001', current_date + 10, current_date + 400, :own);
select t.denied('a second live agreement for the same territory and dates is refused', $$select sign_agreement('55555555-8888-0000-0000-000000000002')$$);

-- renewal
select renew_agreement('55555555-8888-0000-0000-000000000001', current_date + 730) as rid \gset
select t.check('a renewal is a new draft version starting the day after', (select version = 2 and start_date = (select end_date + 1 from agreements where number = 'AGR-1') and status = 'draft' from agreements where id = :'rid'));
select t.denied('only one renewal at a time', $$select renew_agreement('55555555-8888-0000-0000-000000000001', current_date + 800)$$);
select t.as_user(null);
select app.run_franchise_housekeeping(current_date) as hk0 \gset
select t.check('housekeeping sends no reminder yet (ends in a year)', (select reminded_at is null from agreements where number = 'AGR-1'));
select app.run_franchise_housekeeping(current_date + 300) as hk1 \gset
select t.check('inside the reminder window the owners are told once', (select count(*) from notifications where title like 'Agreement AGR-1 ends%') = 1);
select app.run_franchise_housekeeping(current_date + 301) as hk2 \gset
select t.check('...and not again', (select count(*) from notifications where title like 'Agreement AGR-1 ends%') = 1);

-- transfer and termination
select t.as_user(:own);
insert into applicants(id, company_id, name, stage) values ('55555555-7777-0000-0000-000000000003', :'cid', 'New Operator', 'review');
insert into franchise_partners(id, company_id, name, stage) values ('55555555-9999-0000-0000-000000000001', :'cid', 'New Operator Ltd', 'approved');
insert into branches(id, company_id, name, code, ownership, partner_id, status) values ('55555555-2222-0000-0000-000000000009', :'cid', 'Riverside 1', 'RV1', 'franchise', :'pid', 'active');
select transfer_ownership('55555555-8888-0000-0000-000000000001', '55555555-9999-0000-0000-000000000001', 'Sold the business') as moved \gset
select t.check('transferring ownership moves the partner''s branches', :moved = 1 and (select partner_id from branches where code = 'RV1') = '55555555-9999-0000-0000-000000000001');
select t.check('...and the agreement and territory follow', (select partner_id from agreements where number = 'AGR-1') = '55555555-9999-0000-0000-000000000001' and (select partner_id from territories where name = 'Riverside') = '55555555-9999-0000-0000-000000000001');
select t.denied('termination needs a reason', $$select terminate_agreement('55555555-8888-0000-0000-000000000001', '')$$);
select terminate_agreement('55555555-8888-0000-0000-000000000001', 'Repeated breaches') as open_branches \gset
select t.check('termination reports the branches still operating', :open_branches = 1);
select t.check('it frees the territory and ends the partner', (select status from territories where name = 'Riverside') = 'available' and (select stage from franchise_partners where id = '55555555-9999-0000-0000-000000000001') = 'terminated');
select t.denied('a terminated agreement is final', $$update agreements set status = 'active' where number = 'AGR-1'$$);
select t.as_user(:mgr);
select t.denied('a branch manager cannot approve applicants', $$select approve_applicant('55555555-7777-0000-0000-000000000003')$$);
select 'franchise tests passed' as result;

-- ============================================================ webhooks and API keys
select t.as_user(:own);
select create_company('Hooks Co', 'hooks-co') as hcid \gset
select create_company('Other Co', 'other-co') as ocid \gset
insert into webhook_endpoints(id, company_id, url, secret, events, created_by) values
  ('55555555-aaaa-0000-0000-000000000001', :'hcid', 'https://a.example/hook', 'whsec_a', '{ticket.created}', :own),
  ('55555555-aaaa-0000-0000-000000000002', :'hcid', 'https://b.example/hook', 'whsec_b', '{branch.created}', :own),
  ('55555555-aaaa-0000-0000-000000000003', :'ocid', 'https://c.example/hook', 'whsec_c', '{ticket.created}', :own);
select t.denied('a webhook secret can never be read back', $$select secret from webhook_endpoints$$);
select t.check('but the endpoint list is readable without it', (select count(*) from webhook_endpoints) = 3);
insert into tickets(company_id, number, title, created_by) values (:'hcid', 'H-1', 'Printer jam', :own);
select t.check('an event goes only to endpoints subscribed to it, in the same company', (select count(*) from webhook_deliveries where event = 'ticket.created') = 1 and (select endpoint_id from webhook_deliveries where event = 'ticket.created') = '55555555-aaaa-0000-0000-000000000001');
select t.check('the payload carries identifiers, status and a short title, never the description', (select payload->'data'->>'title' from webhook_deliveries where event = 'ticket.created') = 'Printer jam' and not (select (payload->'data') ? 'body' from webhook_deliveries where event = 'ticket.created'));
update webhook_endpoints set active = false where id = '55555555-aaaa-0000-0000-000000000001';
insert into tickets(company_id, number, title, created_by) values (:'hcid', 'H-2', 'Another', :own);
select t.check('a switched-off endpoint gets nothing', (select count(*) from webhook_deliveries where event = 'ticket.created') = 1);
insert into api_keys(company_id, name, prefix, key_hash, scopes, created_by) values (:'hcid', 'Reporting', 'nmk_abcd1234', 'hash', '{read:branches}', :own);
select t.denied('an API key hash can never be read back', $$select key_hash from api_keys$$);
select t.denied('an unknown scope is refused', $$insert into api_keys(company_id, name, prefix, key_hash, scopes, created_by) select company_id, 'x', 'nmk_zzzz9999', 'h', '{write:everything}', created_by from api_keys limit 1$$);
select t.as_user(:mgr);
select t.check('someone without integrations access sees no keys or hooks', (select count(*) from api_keys) = 0 and (select count(*) from webhook_endpoints) = 0);
select 'integration tests passed' as result;

select t.as_user(:own);
select public.send_test_event('55555555-aaaa-0000-0000-000000000002');
select t.check('send_test_event queues a ping for your own endpoint', (select count(*) from webhook_deliveries where event = 'ping') = 1);
select t.denied('customers cannot insert deliveries directly', $$insert into webhook_deliveries(company_id, endpoint_id, event, payload) select company_id, id, 'x', '{}' from webhook_endpoints limit 1$$);
select t.as_user(:mgr);
select t.denied('without integrations access you cannot send test events', $$select public.send_test_event('55555555-aaaa-0000-0000-000000000002')$$);

-- ============================================================ rosters and leave
\set emp '''55555555-0000-0000-0000-000000000004'''
select t.as_user(:own);
select create_company('Roster Co', 'roster-co') as rcid \gset
insert into branches(id, company_id, name, code, status) values ('55555555-2222-0000-0000-0000000000a1', :'rcid', 'Shop', 'SH1', 'active');
insert into memberships(id, company_id, user_id, status) values ('55555555-5555-0000-0000-0000000000a1', :'rcid', :emp, 'active');
insert into membership_roles(membership_id, role_id, company_id) select '55555555-5555-0000-0000-0000000000a1', id, :'rcid' from roles where company_id = :'rcid' and name = 'Employee';
insert into shifts(company_id, branch_id, user_id, starts_at, ends_at, created_by) values (:'rcid', '55555555-2222-0000-0000-0000000000a1', :emp, '2027-03-01 09:00+00', '2027-03-01 17:00+00', :own);
select t.denied('nobody works two overlapping shifts', $$insert into shifts(company_id, branch_id, user_id, starts_at, ends_at, created_by) select company_id, branch_id, user_id, '2027-03-01 16:00+00', '2027-03-01 20:00+00', created_by from shifts limit 1$$);
select t.denied('a shift cannot be longer than 16 hours', $$insert into shifts(company_id, branch_id, user_id, starts_at, ends_at, created_by) select company_id, branch_id, user_id, '2027-03-02 00:00+00', '2027-03-02 20:00+00', created_by from shifts limit 1$$);
select t.as_user(:emp);
select t.check('an employee sees their own shifts', (select count(*) from shifts) = 1);
select t.denied('an employee cannot create shifts', $$insert into shifts(company_id, branch_id, user_id, starts_at, ends_at, created_by) select company_id, branch_id, user_id, '2027-03-05 09:00+00', '2027-03-05 17:00+00', user_id from shifts limit 1$$);
insert into leave_requests(company_id, user_id, from_date, to_date, reason) values (:'rcid', :emp, '2027-03-01', '2027-03-03', 'Family event');
select t.denied('an employee cannot approve their own leave', $$update leave_requests set status = 'approved'$$);
select t.denied('an employee cannot file leave for someone else', $$insert into leave_requests(company_id, user_id, from_date, to_date) values ((select company_id from leave_requests limit 1), '55555555-0000-0000-0000-000000000001', '2027-04-01', '2027-04-02')$$);
select t.as_user(:own);
select t.denied('leave over an existing shift can''t be approved until the shift is moved', $$update leave_requests set status = 'approved' where reason = 'Family event'$$);
delete from shifts where true;
update leave_requests set status = 'approved', decided_by = :own where reason = 'Family event';
select t.denied('a shift can''t be set during approved leave', $$insert into shifts(company_id, branch_id, user_id, starts_at, ends_at, created_by) values ((select company_id from leave_requests limit 1), '55555555-2222-0000-0000-0000000000a1', '55555555-0000-0000-0000-000000000004', '2027-03-02 09:00+00', '2027-03-02 17:00+00', '55555555-0000-0000-0000-000000000001')$$);
select t.denied('a rejection needs a reason', $$update leave_requests set status = 'rejected' where false or reason = 'Family event'$$);
select 'roster tests passed' as result;
