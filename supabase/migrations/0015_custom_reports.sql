-- Saved custom reports (dataset, chosen columns, simple filters). The query is built in the app from whitelists.
create table public.custom_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 80),
  dataset text not null check (dataset in ('branches','tasks','tickets')),
  columns text[] not null check (cardinality(columns) between 1 and 14),
  filters jsonb not null default '{}' check (jsonb_typeof(filters) = 'object'),
  sort text, descending boolean not null default false,
  created_by uuid not null, created_at timestamptz not null default now(),
  unique (company_id, name)
);
select app.secure('custom_reports', 'reports');
grant select, insert, update, delete on public.custom_reports to authenticated;
create policy custom_reports_del on public.custom_reports for delete using (app.has_perm(company_id, 'reports', 'edit'));
create trigger audit_custom_reports after insert or update or delete on public.custom_reports for each row execute function app.audit();
