-- Approval rules are configuration: removing one never affects requests already submitted (they hold a snapshot).
create policy approval_rules_del on public.approval_rules for delete using (app.has_perm(company_id, 'approvals', 'configure'));
grant delete on public.approval_rules to authenticated;
