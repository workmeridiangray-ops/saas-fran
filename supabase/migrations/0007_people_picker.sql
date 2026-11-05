-- Anyone in a company can pick a colleague to assign work to, without being able to read
-- memberships (which carry branch scope and approval limits). Exposes the display name only.
create or replace function public.company_people(p_company uuid) returns table (user_id uuid, name text)
language sql stable security definer set search_path = public as $$
  select m.user_id, coalesce(nullif(p.display_name, ''), p.email)
    from memberships m join profiles p on p.id = m.user_id
   where m.company_id = p_company and m.status = 'active' and app.is_member(p_company)
   order by 2
$$;
grant execute on function public.company_people(uuid) to authenticated;

-- ---------------------------------------------------------------------------------------------
-- Memberships are only readable by people who may manage users. These functions give everyone else
-- exactly the facts they need (counts, notifications, closure), each checked against their permissions.
-- ---------------------------------------------------------------------------------------------

create or replace function public.company_usage(p_company uuid) returns table (branches int, users int, pending_invites int, storage_bytes bigint)
language sql stable security definer set search_path = public as $$
  select (select count(*)::int from branches b where b.company_id = p_company and b.status <> 'closed'),
         (select count(*)::int from memberships m where m.company_id = p_company and m.status in ('active','invited')),
         (select count(*)::int from invitations i where i.company_id = p_company and i.status = 'pending' and i.expires_at > now()),
         (select coalesce(sum(size_bytes), 0) from attachments a where a.company_id = p_company)
   where app.is_member(p_company)
$$;
grant execute on function public.company_usage(uuid) to authenticated;

-- Notify everyone holding a role (for example the first approver). The caller is never notified.
create or replace function public.notify_role(p_company uuid, p_role uuid, p_title text, p_body text, p_href text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not app.is_member(p_company) then raise exception 'not a member of this company' using errcode = '42501'; end if;
  if p_href is not null and left(p_href, 1) <> '/' then raise exception 'links must stay inside the app'; end if;
  insert into notifications(company_id, user_id, title, body, href)
  select p_company, m.user_id, left(p_title, 200), left(coalesce(p_body, ''), 500), p_href
    from memberships m join membership_roles mr on mr.membership_id = m.id
   where m.company_id = p_company and m.status = 'active' and mr.role_id = p_role and m.user_id <> auth.uid();
  get diagnostics n = row_count; return n;
end $$;
grant execute on function public.notify_role(uuid, uuid, text, text, text) to authenticated;

-- Tell the whole company about a published document. Needs permission to edit documents.
create or replace function public.notify_all(p_company uuid, p_title text, p_body text, p_href text) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not app.has_perm(p_company, 'documents', 'edit') then raise exception 'you cannot notify the company' using errcode = '42501'; end if;
  if p_href is not null and left(p_href, 1) <> '/' then raise exception 'links must stay inside the app'; end if;
  insert into notifications(company_id, user_id, title, body, href)
  select p_company, m.user_id, left(p_title, 200), left(coalesce(p_body, ''), 500), p_href
    from memberships m where m.company_id = p_company and m.status = 'active' and m.user_id <> auth.uid();
  get diagnostics n = row_count; return n;
end $$;
grant execute on function public.notify_all(uuid, text, text, text) to authenticated;

-- People limited to a branch, for the closure review. Needs permission to close branches.
create or replace function public.branch_people(p_company uuid, p_branch uuid) returns table (user_id uuid, name text, keeps_other_branches boolean)
language sql stable security definer set search_path = public as $$
  select m.user_id, coalesce(nullif(p.display_name, ''), p.email), cardinality(m.branch_ids) > 1
    from memberships m join profiles p on p.id = m.user_id
   where m.company_id = p_company and m.status = 'active' and p_branch = any (m.branch_ids)
     and app.has_perm(p_company, 'branches', 'archive')
$$;
grant execute on function public.branch_people(uuid, uuid) to authenticated;

-- Close a branch. The database re-checks the outstanding work itself, so a bypassed screen can't skip it.
create or replace function public.close_branch(p_branch uuid) returns void
language plpgsql security definer set search_path = public as $$
declare b branches;
begin
  select * into b from branches where id = p_branch for update;
  if b.id is null or not app.has_perm(b.company_id, 'branches', 'archive', b.brand_id, b.region_id, b.id) then
    raise exception 'you cannot close this branch' using errcode = '42501';
  end if;
  if b.status = 'closed' then raise exception 'this branch is already closed'; end if;
  if exists (select 1 from purchase_orders where branch_id = p_branch and status in ('sent', 'partially_received')) then raise exception 'there are purchase orders still open at this branch'; end if;
  if exists (select 1 from tasks where branch_id = p_branch and status in ('open', 'in_progress', 'blocked')) then raise exception 'there are open tasks at this branch'; end if;
  if exists (select 1 from assets where branch_id = p_branch and status <> 'disposed') then raise exception 'there are assets still assigned to this branch'; end if;
  if exists (select 1 from statements s where s.branch_id = p_branch and s.status = 'issued' and app.statement_outstanding(s.id) > 0) then raise exception 'there are unpaid royalty statements for this branch'; end if;
  -- Access removal comes last. Scope is kept on suspended people so reactivating them can never widen it.
  update memberships set branch_ids = array_remove(branch_ids, p_branch) where company_id = b.company_id and p_branch = any (branch_ids) and cardinality(branch_ids) > 1;
  update memberships set status = 'suspended' where company_id = b.company_id and branch_ids = array[p_branch]::uuid[] and user_id <> auth.uid();
  update branches set status = 'closed', closed_at = now() where id = p_branch;
end $$;
grant execute on function public.close_branch(uuid) to authenticated;

-- Changing someone's role replaces their role link. The row-level policy still limits this to people who may assign roles.
grant delete on public.membership_roles to authenticated;
