-- Opening projects: one engine for every industry; templates only differ in their items.

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid, name text not null check (length(trim(name)) >= 3), industry text not null default 'general',
  status text not null default 'planning' check (status in ('planning','in_progress','launched','cancelled')),
  target_launch date, budget_minor bigint not null default 0 check (budget_minor >= 0),
  owner_id uuid, launched_at timestamptz, post_launch_review text,
  created_at timestamptz not null default now(),
  unique (id, company_id), foreign key (branch_id, company_id) references public.branches(id, company_id)
);
create table public.project_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, project_id uuid not null,
  category text not null check (category in ('site','fitout','equipment','recruitment','licences','training','other')),
  title text not null check (length(trim(title)) >= 2), required boolean not null default true, requires_evidence boolean not null default false,
  assignee_id uuid, due_on date, status text not null default 'todo' check (status in ('todo','doing','done','blocked')),
  blocker_note text, evidence_note text, cost_minor bigint not null default 0 check (cost_minor >= 0), done_at timestamptz,
  created_at timestamptz not null default now(), unique (id, company_id),
  foreign key (project_id, company_id) references public.projects(id, company_id) on delete cascade,
  check (status <> 'blocked' or length(trim(coalesce(blocker_note, ''))) >= 3),
  check (status <> 'done' or not requires_evidence or length(trim(coalesce(evidence_note, ''))) >= 3)
);
create or replace function app.project_item_done() returns trigger language plpgsql as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status <> 'done') then new.done_at := now(); end if;
  if new.status <> 'done' then new.done_at := null; end if;
  return new;
end $$;
create trigger project_items_done before insert or update on public.project_items for each row execute function app.project_item_done();
-- A launched project is history: its checklist can't be reopened.
create or replace function app.project_locked() returns trigger language plpgsql as $$
begin
  if exists (select 1 from projects p where p.id = coalesce(new.project_id, old.project_id) and p.status in ('launched','cancelled')) then raise exception 'this project is closed; its checklist is a record and can''t be changed'; end if;
  return coalesce(new, old);
end $$;
create trigger project_items_locked before insert or update on public.project_items for each row execute function app.project_locked();

select app.secure('projects', 'projects', 'branch_id');
select app.secure_child('project_items', 'projects', 'project_id', 'projects');
create trigger audit_projects after insert or update on public.projects for each row execute function app.audit();
create trigger audit_project_items after insert or update on public.project_items for each row execute function app.audit();

-- Evidence can now be attached to more kinds of record.
alter table public.attachments drop constraint attachments_subject_table_check;
alter table public.attachments add constraint attachments_subject_table_check check (subject_table in ('tasks','approval_requests','findings','corrective_actions','tickets','goods_receipts','requisitions','projects','project_items','applicants','agreements'));
create or replace function app.can_see_subject(p_table text, p_id uuid, p_company uuid) returns boolean
language plpgsql stable security invoker set search_path = public as $$
declare ok boolean;
begin
  if p_table not in ('tasks','approval_requests','findings','corrective_actions','tickets','goods_receipts','requisitions','projects','project_items','applicants','agreements') then return false; end if;
  execute format('select exists (select 1 from public.%I where id = $1 and company_id = $2)', p_table) into ok using p_id, p_company;
  return ok;
end $$;

-- Launch needs approval authority and finished required work; the database repeats the screen's check.
create or replace function public.launch_project(p_project uuid) returns void language plpgsql security definer set search_path = public as $$
declare p projects; req int; undone int; blocked int;
begin
  select * into p from projects where id = p_project for update;
  if p.id is null or not app.has_perm(p.company_id, 'projects', 'approve', null, null, p.branch_id) then raise exception 'you cannot approve this launch' using errcode = '42501'; end if;
  if p.status <> 'planning' and p.status <> 'in_progress' then raise exception 'this project is already %', p.status; end if;
  select count(*) filter (where required), count(*) filter (where required and status <> 'done'), count(*) filter (where status = 'blocked') into req, undone, blocked from project_items where project_id = p_project;
  if req = 0 then raise exception 'add the items that must be done before opening'; end if;
  if undone > 0 then raise exception '% required item(s) are not finished', undone; end if;
  if blocked > 0 then raise exception '% item(s) are blocked', blocked; end if;
  update projects set status = 'launched', launched_at = now() where id = p_project;
  if p.branch_id is not null then update branches set status = 'active' where id = p.branch_id and status in ('planned', 'opening'); end if;
end $$;
grant execute on function public.launch_project(uuid) to authenticated;
grant select, insert, update on public.projects, public.project_items to authenticated;
