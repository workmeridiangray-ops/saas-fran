-- Saved table views, scheduled reports with a run history, and rosters with leave.

create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade, user_id uuid not null,
  page text not null check (page in ('/branches','/tasks','/tickets')), name text not null check (length(trim(name)) between 2 and 60),
  query text not null check (length(query) < 500 and query !~ '[\r\n]'), created_at timestamptz not null default now(), unique (user_id, page, name)
);
alter table public.saved_views enable row level security;
create policy views_own on public.saved_views for all using (user_id = auth.uid() and app.is_member(company_id)) with check (user_id = auth.uid() and app.is_member(company_id));
grant select, insert, update, delete on public.saved_views to authenticated;

create table public.report_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null, frequency text not null check (frequency in ('daily','weekly','monthly')), weekday int check (weekday between 0 and 6),
  recipients text[] not null check (cardinality(recipients) between 1 and 10),
  created_by uuid not null, active boolean not null default true, last_run_at timestamptz, created_at timestamptz not null default now(),
  check (frequency <> 'weekly' or weekday is not null)
);
create table public.report_runs (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade, schedule_id uuid references public.report_schedules(id) on delete set null,
  kind text not null, trigger text not null check (trigger in ('manual','scheduled')), run_by uuid, row_count int not null default 0,
  status text not null check (status in ('ok','failed')), detail text, at timestamptz not null default now()
);
select app.secure('report_schedules', 'reports');
alter table public.report_runs enable row level security;
create policy runs_sel on public.report_runs for select using (app.has_perm(company_id, 'reports', 'view'));
create policy runs_ins on public.report_runs for insert with check (run_by = auth.uid() and app.has_perm(company_id, 'reports', 'export'));
grant select, insert, update on public.report_schedules to authenticated; grant select, insert on public.report_runs to authenticated;
create trigger audit_report_schedules after insert or update or delete on public.report_schedules for each row execute function app.audit();
grant delete on public.report_schedules to authenticated;
create policy report_schedules_del on public.report_schedules for delete using (app.has_perm(company_id, 'reports', 'edit'));

-- Rosters and leave
create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade, branch_id uuid not null, user_id uuid not null,
  starts_at timestamptz not null, ends_at timestamptz not null, note text not null default '', created_by uuid not null, created_at timestamptz not null default now(),
  foreign key (branch_id, company_id) references public.branches(id, company_id), foreign key (company_id, user_id) references public.memberships(company_id, user_id),
  check (ends_at > starts_at and ends_at - starts_at <= interval '16 hours'),
  exclude using gist (user_id with =, tstzrange(starts_at, ends_at) with &&)       -- nobody works two places at once
);
create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, user_id uuid not null, from_date date not null, to_date date not null,
  kind text not null default 'annual' check (kind in ('annual','sick','unpaid','other')), reason text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  decided_by uuid, decision_note text, created_at timestamptz not null default now(),
  foreign key (company_id, user_id) references public.memberships(company_id, user_id), check (to_date >= from_date and to_date - from_date <= 60),
  check (status <> 'rejected' or length(trim(coalesce(decision_note, ''))) >= 3)
);
-- A shift can't be set during approved leave.
create or replace function app.shift_vs_leave() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from leave_requests l where l.user_id = new.user_id and l.company_id = new.company_id and l.status = 'approved' and new.starts_at::date <= l.to_date and new.ends_at::date >= l.from_date) then
    raise exception 'that person is on approved leave on that day'; end if;
  return new;
end $$;
create trigger shifts_leave before insert or update on public.shifts for each row execute function app.shift_vs_leave();
-- Approving leave can't strand an existing shift: the manager must move the shift first.
create or replace function app.leave_vs_shifts() returns trigger language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if new.status = 'approved' and old.status <> 'approved' then
    select count(*) into n from shifts s where s.user_id = new.user_id and s.company_id = new.company_id and s.starts_at::date <= new.to_date and s.ends_at::date >= new.from_date;
    if n > 0 then raise exception '% shift(s) fall inside this leave; move or remove them first', n; end if;
  end if;
  return new;
end $$;
create trigger leave_shifts before update on public.leave_requests for each row execute function app.leave_vs_shifts();

select app.secure('shifts', 'people', 'branch_id', 'user_id');
alter table public.leave_requests enable row level security;
create policy leave_sel on public.leave_requests for select using (user_id = auth.uid() or app.has_perm(company_id, 'people', 'view'));
create policy leave_ins on public.leave_requests for insert with check (user_id = auth.uid() and app.is_member(company_id) and status = 'pending');
create policy leave_upd on public.leave_requests for update
  using ((user_id = auth.uid() and status = 'pending') or app.has_perm(company_id, 'people', 'approve'))
  with check ((user_id = auth.uid() and status in ('pending','cancelled')) or (app.has_perm(company_id, 'people', 'approve') and user_id <> auth.uid()));
do $$ declare t text; begin foreach t in array array['shifts','leave_requests'] loop execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app.audit()', 'audit_' || t, t); end loop; end $$;
grant select, insert, update, delete on public.shifts to authenticated; grant select, insert, update on public.leave_requests to authenticated;
-- Employees can see the roster entries that are theirs (the secure() policy passes the owner); managers see their branches.
create policy shifts_del on public.shifts for delete using (app.has_perm(company_id, 'people', 'edit', null, null, branch_id, null, null));
