-- Connected workflows against the real schema: purchasing, inspections, royalties, billing.
\set ON_ERROR_STOP on
set client_min_messages = warning;

\set owner '''11111111-0000-0000-0000-000000000001'''
\set mgr   '''11111111-0000-0000-0000-000000000002'''
\set insp  '''11111111-0000-0000-0000-000000000003'''
\set fin   '''11111111-0000-0000-0000-000000000004'''

select t.as_user(:owner);
select create_company('Flow Co', 'flow-co', 'mixed') as cid \gset

-- ============================================================ company seed
select t.check('seeds five roles', (select count(*) from roles where company_id = :'cid') = 5);
select t.check('seeds purchase approval rules', (select count(*) from approval_rules where company_id = :'cid') = 2);
select t.check('starts a 14-day trial on Growth', (select status || plan_id from subscriptions where company_id = :'cid') = 'trialinggrowth');
select t.check('seeds checklist and inspection templates', (select count(*) from checklist_templates) = 2 and (select count(*) from inspection_templates) = 1);

insert into branches(company_id, name, code, status) values (:'cid', 'Main', 'M1', 'active') returning id as bid \gset
select id as mgr_role from roles where name = 'Branch manager' \gset
select id as insp_role from roles where name = 'Auditor / inspector' \gset
select id as fin_role from roles where name = 'Finance' \gset
select id as owner_role from roles where name = 'Company owner' \gset

insert into memberships(id, company_id, user_id, status, approval_limit_minor) values
  ('11111111-1111-0000-0000-000000000002', :'cid', :mgr, 'active', 100000),
  ('11111111-1111-0000-0000-000000000003', :'cid', :insp, 'active', null),
  ('11111111-1111-0000-0000-000000000004', :'cid', :fin, 'active', 100000000);
insert into membership_roles(membership_id, role_id, company_id) values
  ('11111111-1111-0000-0000-000000000002', :'mgr_role', :'cid'),
  ('11111111-1111-0000-0000-000000000003', :'insp_role', :'cid'),
  ('11111111-1111-0000-0000-000000000004', :'fin_role', :'cid');

-- ============================================================ flow 3: purchase -> approval -> order -> partial receipt

insert into suppliers(company_id, name) values (:'cid', 'ColdTech') returning id as sup \gset
insert into catalog_items(company_id, supplier_id, sku, name, unit_price_minor) values (:'cid', :'sup', 'FRZ-1', 'Freezer part', 4000) returning id as item \gset

select t.as_user(:mgr);
select app.next_number(:'cid', 'requisition', 'REQ') as reqno \gset
insert into requisitions(company_id, branch_id, supplier_id, number, requester_id, status, total_minor)
  values (:'cid', :'bid', :'sup', :'reqno', :mgr, 'submitted', 40000) returning id as req \gset
insert into requisition_lines(company_id, requisition_id, item_id, qty, unit_price_minor) values (:'cid', :'req', :'item', 10, 4000);
select t.check('numbers are sequential per company', :'reqno' = 'REQ-0001' and app.next_number(:'cid', 'requisition', 'REQ') = 'REQ-0002');
insert into approval_requests(company_id, branch_id, kind, subject_id, title, amount_minor, requester_id, steps)
  values (:'cid', :'bid', 'purchase', :'req', 'Freezer parts', 40000, :mgr,
          jsonb_build_array(jsonb_build_object('role_id', :'mgr_role', 'label', 'Branch manager'))) returning id as areq \gset

select t.denied('requester decides their own request', format($$insert into approval_decisions(company_id, request_id, step, decided_by, outcome) values (%L, %L, 0, %L, 'approved')$$, :'cid', :'areq', :'mgr'));
select t.as_user(:insp);
select t.denied('someone without approval permission decides', format($$insert into approval_decisions(company_id, request_id, step, decided_by, outcome) values (%L, %L, 0, %L, 'approved')$$, :'cid', :'areq', :'insp'));
select t.as_user(:owner);
select t.denied('reject without a reason', format($$insert into approval_decisions(company_id, request_id, step, decided_by, outcome) values (%L, %L, 0, %L, 'rejected')$$, :'cid', :'areq', :'owner'));
select t.denied('decide as someone else', format($$insert into approval_decisions(company_id, request_id, step, decided_by, outcome) values (%L, %L, 0, %L, 'approved')$$, :'cid', :'areq', :'mgr'));
insert into approval_decisions(company_id, request_id, step, decided_by, outcome) values (:'cid', :'areq', 0, :owner, 'approved');
select t.check('approval moves the requisition to approved', (select status from requisitions where id = :'req') = 'approved');
select t.as_user(:mgr);
select t.check('the requester is notified of the decision', (select count(*) from notifications where title like 'Approved:%') = 1);
select t.check('...and nobody else can read it', (select count(*) from notifications where user_id <> :mgr) = 0);
select t.as_user(:owner);
select t.denied('decide an already-decided request', format($$insert into approval_decisions(company_id, request_id, step, decided_by, outcome) values (%L, %L, 0, %L, 'approved')$$, :'cid', :'areq', :'owner'));

-- over the approver's limit: manager (limit 1,000.00) cannot approve 20,000.00
select t.as_user(:owner);
insert into requisitions(company_id, branch_id, supplier_id, number, requester_id, status, total_minor) values (:'cid', :'bid', :'sup', 'REQ-X', :owner, 'submitted', 2000000) returning id as req2 \gset
insert into approval_requests(company_id, branch_id, kind, subject_id, title, amount_minor, requester_id, steps)
  values (:'cid', :'bid', 'purchase', :'req2', 'Big order', 2000000, :owner, jsonb_build_array(jsonb_build_object('role_id', :'mgr_role', 'label', 'Branch manager'))) returning id as areq2 \gset
select t.as_user(:mgr);
select t.denied('approve above own limit', format($$insert into approval_decisions(company_id, request_id, step, decided_by, outcome) values (%L, %L, 0, %L, 'approved')$$, :'cid', :'areq2', :'mgr'));
select t.denied('set a requisition to approved directly', format($$update requisitions set status = 'approved' where id = %L$$, :'req2'));
select t.check('another user cannot even touch a pending request', t.affected(format($$update approval_requests set status = 'approved' where id = %L$$, :'areq2')) = 0);
select t.as_user(:owner);
select t.denied('requester approves their own pending request by direct update', format($$update approval_requests set status = 'approved' where id = %L$$, :'areq2'));
select t.as_user(:mgr);
select t.denied('order something that was never approved', format($$insert into purchase_orders(company_id, branch_id, supplier_id, requisition_id, number, total_minor, created_by) values (%L,%L,%L,%L,'PO-X',1,%L)$$, :'cid', :'bid', :'sup', :'req2', :'mgr'));

-- order, then partial receipt
select t.as_user(:mgr);
insert into purchase_orders(company_id, branch_id, supplier_id, requisition_id, number, total_minor, created_by) values (:'cid', :'bid', :'sup', :'req', 'PO-1', 40000, :mgr) returning id as po \gset
insert into po_lines(company_id, po_id, item_id, qty_ordered, unit_price_minor) values (:'cid', :'po', :'item', 10, 4000) returning id as pol \gset
insert into goods_receipts(company_id, po_id, received_by) values (:'cid', :'po', :mgr) returning id as gr \gset
insert into receipt_lines(company_id, receipt_id, po_line_id, qty_received) values (:'cid', :'gr', :'pol', 6);
select t.check('partial receipt: PO partially received', (select status from purchase_orders where id = :'po') = 'partially_received');
select t.check('...and 6 of 10 counted', (select qty_received from po_lines where id = :'pol') = 6);
select t.denied('receive more than ordered', format($$insert into receipt_lines(company_id, receipt_id, po_line_id, qty_received) values (%L, %L, %L, 5)$$, :'cid', :'gr', :'pol'));
select t.denied('reject goods without a note', format($$insert into receipt_lines(company_id, receipt_id, po_line_id, qty_received, qty_rejected) values (%L, %L, %L, 1, 1)$$, :'cid', :'gr', :'pol'));
insert into receipt_lines(company_id, receipt_id, po_line_id, qty_received, qty_rejected, discrepancy_note) values (:'cid', :'gr', :'pol', 3, 1, '1 unit arrived damaged');
select t.check('still partial after 9 of 10', (select status from purchase_orders where id = :'po') = 'partially_received');
insert into receipt_lines(company_id, receipt_id, po_line_id, qty_received) values (:'cid', :'gr', :'pol', 1);
select t.check('complete: PO received and requisition closed',
  (select status from purchase_orders where id = :'po') = 'received' and (select status from requisitions where id = :'req') = 'closed');
select t.denied('receipts cannot be edited', $$update receipt_lines set qty_received = 0$$);

-- ============================================================ flow 2: inspection -> finding -> action -> verification
select t.as_user(:insp);
select id as tpl from inspection_templates limit 1 \gset
insert into inspections(company_id, branch_id, template_id, inspector_id, scheduled_for, status, score, critical_failed)
  values (:'cid', :'bid', :'tpl', :insp, current_date, 'completed', 62.5, true) returning id as insp_id \gset
insert into findings(company_id, inspection_id, branch_id, item_id, text, severity) values (:'cid', :'insp_id', :'bid', 'i2', 'Fire extinguisher out of date', 'critical') returning id as fnd \gset
insert into corrective_actions(company_id, finding_id, branch_id, assignee_id, due_at, description)
  values (:'cid', :'fnd', :'bid', :mgr, current_date + 7, 'Replace extinguisher') returning id as ca \gset

select t.as_user(:mgr);
select t.denied('mark done without proof', format($$update corrective_actions set status = 'done' where id = %L$$, :'ca'));
update corrective_actions set status = 'done', proof_note = 'New extinguisher fitted, photo on file' where id = :'ca';
select t.check('finding awaits verification', (select status from findings where id = :'fnd') = 'fixed_pending_verification');
select t.denied('assignee verifies their own work', format($$update corrective_actions set status = 'verified' where id = %L$$, :'ca'));
select t.as_user(:insp);
update corrective_actions set status = 'verified', verified_by = :mgr where id = :'ca';
select t.check('verifier is recorded as the signed-in user, not client-supplied',
  (select verified_by from corrective_actions where id = :'ca') = :insp);
select t.check('finding verified', (select status from findings where id = :'fnd') = 'verified');

-- ============================================================ flow 4: royalty -> review -> statement -> payment
select t.as_user(:owner);
insert into franchise_partners(company_id, name, stage) values (:'cid', 'Lakeside LLC', 'active') returning id as ptn \gset
insert into branches(company_id, name, code, status, ownership, partner_id) values (:'cid', 'Lakeside 1', 'L1', 'active', 'franchise', :'ptn') returning id as fbid \gset
insert into royalty_rules(company_id, partner_id, type, rate_bp, effective_from, effective_to) values (:'cid', :'ptn', 'percent', 500, '2026-01-01', '2026-12-31') returning id as rule \gset
select t.denied('overlapping rule for the same partner',
  format($$insert into royalty_rules(company_id, partner_id, type, rate_bp, effective_from) values (%L, %L, 'percent', 600, '2026-06-01')$$, :'cid', :'ptn'));
insert into royalty_rules(company_id, partner_id, type, rate_bp, effective_from) values (:'cid', :'ptn', 'percent', 600, '2027-01-01');
select t.as_user(:fin);
insert into statements(company_id, partner_id, branch_id, period, rule_id, rule_version, base_minor, royalty_minor, prepared_by)
  values (:'cid', :'ptn', :'fbid', '2026-10-01', :'rule', 1, 2000000, 100000, :fin) returning id as stm \gset
select t.denied('second live statement for the same branch and month',
  format($$insert into statements(company_id, partner_id, branch_id, period, rule_id, rule_version, base_minor, royalty_minor, prepared_by) values (%L,%L,%L,'2026-10-01',%L,1,1,1,%L)$$, :'cid', :'ptn', :'fbid', :'rule', :'fin'));
select t.denied('skip review and issue', format($$update statements set status = 'issued' where id = %L$$, :'stm'));
update statements set status = 'in_review' where id = :'stm';
select t.denied('preparer approves their own statement', format($$update statements set status = 'approved' where id = %L$$, :'stm'));
select t.as_user(:owner);
update statements set status = 'draft', review_reason = 'Check exclusions for October' where id = :'stm';
update statements set status = 'in_review' where id = :'stm';
update statements set status = 'approved' where id = :'stm';
update statements set status = 'issued', number = 'ROY-0001', due_date = '2026-11-15' where id = :'stm';
select t.denied('change amounts on an issued statement', format($$update statements set royalty_minor = 1 where id = %L$$, :'stm'));
select t.denied('void an issued statement', format($$update statements set status = 'void' where id = %L$$, :'stm'));

insert into partner_payments(company_id, partner_id, amount_minor, received_on, recorded_by) values (:'cid', :'ptn', 60000, '2026-11-10', :owner) returning id as pay \gset
select t.denied('allocate more than was paid', format($$insert into payment_allocations(company_id, payment_id, statement_id, amount_minor) values (%L,%L,%L,70000)$$, :'cid', :'pay', :'stm'));
insert into payment_allocations(company_id, payment_id, statement_id, amount_minor) values (:'cid', :'pay', :'stm', 60000);
select t.check('40,000 still outstanding', app.statement_outstanding(:'stm') = 40000);
insert into partner_payments(company_id, partner_id, amount_minor, received_on, recorded_by) values (:'cid', :'ptn', 50000, '2026-11-12', :owner) returning id as pay2 \gset
select t.denied('allocate more than is owed', format($$insert into payment_allocations(company_id, payment_id, statement_id, amount_minor) values (%L,%L,%L,50000)$$, :'cid', :'pay2', :'stm'));
insert into payment_allocations(company_id, payment_id, statement_id, amount_minor) values (:'cid', :'pay2', :'stm', 40000);
select t.check('statement settled', app.statement_outstanding(:'stm') = 0);
select t.denied('payments cannot be edited', $$update payment_allocations set amount_minor = 1$$);

-- ============================================================ flow 5: plan limits, renewals, lifecycle
select t.as_user(null);
update subscriptions set plan_id = 'starter', plan_version = 1 where company_id = :'cid';  -- service-side change for the test
select t.as_user(:owner);
insert into branches(company_id, name, code) values (:'cid', 'Third', 'T3');   -- 3rd of 3
select t.denied('4th branch on a 3-branch plan', format($$insert into branches(company_id, name, code) values (%L, 'Fourth', 'F4')$$, :'cid'));
select t.check('existing branches untouched by the limit', (select count(*) from branches where company_id = :'cid') = 3);
select t.check('plan change during trial applies now', request_plan_change(:'cid', 'growth') = 'now');

select t.as_user(null);
update subscriptions set current_period_end = now() - interval '1 day' where company_id = :'cid';
select app.run_renewals(now()) >= 1 as ran \gset
select t.check('renewal invoices the trial conversion', (select count(*) from platform_invoices where company_id = :'cid' and status = 'open') = 1);
select t.check('invoice carries the plan version price at that time', (select amount_minor from platform_invoices where company_id = :'cid') = 29900);
select t.check('renewal is idempotent', (select app.run_renewals(now())) is not null and (select count(*) from platform_invoices where company_id = :'cid') = 1);
select t.denied('rewrite an issued invoice', $$update platform_invoices set amount_minor = 1$$);

select app.run_renewals(now() + interval '5 days');
select t.check('unpaid after the due date: past_due', (select status from companies where id = :'cid') = 'past_due');
select app.run_renewals(now() + interval '12 days');
select t.check('long unpaid: suspended', (select status from companies where id = :'cid') = 'suspended');

select t.as_user(:owner);
select t.check('suspended company stays readable', (select count(*) from branches) >= 3);
select t.denied('suspended company cannot write', format($$insert into tasks(company_id, title, created_by) values (%L, 'Nope', %L)$$, :'cid', :'owner'));
select t.check('billing remains reachable while suspended', (select count(*) from platform_invoices) = 1);

select t.as_user(null);
select app.mark_invoice_paid(id) from platform_invoices where company_id = :'cid';
select t.check('payment reactivates the company and subscription',
  (select status from companies where id = :'cid') = 'active' and (select status from subscriptions where company_id = :'cid') = 'active');
select t.as_user(:owner);
insert into tasks(company_id, title, created_by) values (:'cid', 'Back in business', :owner);
select t.check('paid-up company can write again', (select count(*) from tasks) = 1);
select t.check('later plan change waits for renewal', request_plan_change(:'cid', 'starter') = 'renewal');
select t.check('...and is stored as pending', (select pending_plan_id from subscriptions where company_id = :'cid') = 'starter');

select 'workflow tests passed' as result;
