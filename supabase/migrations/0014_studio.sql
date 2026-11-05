-- Configuration studio: company-defined fields on branches, tasks and tickets, and renamed terminology.

create table public.custom_fields (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entity text not null check (entity in ('branches','tasks','tickets')),
  key text not null check (key ~ '^[a-z][a-z0-9_]{1,30}$'),
  label text not null check (length(trim(label)) between 2 and 60),
  kind text not null check (kind in ('text','number','date','select','checkbox')),
  options text[] not null default '{}', required boolean not null default false,
  position int not null default 0, archived boolean not null default false,
  created_at timestamptz not null default now(),
  unique (company_id, entity, key),
  check (kind <> 'select' or cardinality(options) between 2 and 30),
  check (kind = 'select' or cardinality(options) = 0)
);
select app.secure('custom_fields', 'studio');
-- Everyone in the company needs to read definitions to see and fill the forms.
create policy custom_fields_members on public.custom_fields for select using (app.is_member(company_id));
grant select, insert, update on public.custom_fields to authenticated;
create trigger audit_custom_fields after insert or update or delete on public.custom_fields for each row execute function app.audit();

-- The key and kind of a field never change after values may exist.
create or replace function app.custom_field_guard() returns trigger language plpgsql as $$
begin
  if new.key <> old.key or new.kind <> old.kind or new.entity <> old.entity then raise exception 'a field''s key, type and record type can''t change; archive it and add a new one'; end if;
  if new.kind = 'select' and exists (select 1 from unnest(old.options) o where o <> all(new.options)) then raise exception 'options can be added but not removed; archive the field instead'; end if;
  return new;
end $$;
create trigger custom_field_guard before update on public.custom_fields for each row execute function app.custom_field_guard();

alter table public.branches add column custom jsonb not null default '{}' check (jsonb_typeof(custom) = 'object' and pg_column_size(custom) < 8000);
alter table public.tasks    add column custom jsonb not null default '{}' check (jsonb_typeof(custom) = 'object' and pg_column_size(custom) < 8000);
alter table public.tickets  add column custom jsonb not null default '{}' check (jsonb_typeof(custom) = 'object' and pg_column_size(custom) < 8000);

create or replace function app.check_custom() returns trigger language plpgsql security definer set search_path = public as $$
declare k text; v jsonb; f custom_fields%rowtype;
begin
  if tg_op = 'UPDATE' and new.custom = old.custom then return new; end if;
  for k, v in select * from jsonb_each(new.custom) loop
    select * into f from custom_fields where company_id = new.company_id and entity = tg_table_name and key = k and not archived;
    if not found then raise exception 'unknown field "%"', k; end if;
    if f.kind = 'number' and (jsonb_typeof(v) <> 'number') then raise exception '% must be a number', f.label; end if;
    if f.kind = 'checkbox' and (jsonb_typeof(v) <> 'boolean') then raise exception '% must be yes or no', f.label; end if;
    if f.kind in ('text','date','select') and jsonb_typeof(v) <> 'string' then raise exception '% must be text', f.label; end if;
    if f.kind = 'date' and (v #>> '{}') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception '% must be a date', f.label; end if;
    if f.kind = 'select' and not ((v #>> '{}') = any (f.options)) then raise exception '% has an option that isn''t allowed', f.label; end if;
    if f.kind = 'text' and length(v #>> '{}') > 500 then raise exception '% is too long', f.label; end if;
  end loop;
  for f in select * from custom_fields where company_id = new.company_id and entity = tg_table_name and required and not archived loop
    if not (new.custom ? f.key) or (new.custom -> f.key) = '""'::jsonb then raise exception '% is required', f.label; end if;
  end loop;
  return new;
end $$;
create trigger check_custom before insert or update on public.branches for each row execute function app.check_custom();
create trigger check_custom before insert or update on public.tasks    for each row execute function app.check_custom();
create trigger check_custom before insert or update on public.tickets  for each row execute function app.check_custom();

create table public.terminology (
  company_id uuid not null references public.companies(id) on delete cascade,
  term text not null check (term in ('branch','task','ticket','region','brand')),
  singular text not null check (length(trim(singular)) between 2 and 30), plural text not null check (length(trim(plural)) between 2 and 30),
  primary key (company_id, term)
);
alter table public.terminology enable row level security;
create policy term_sel on public.terminology for select using (app.is_member(company_id));
create policy term_ins on public.terminology for insert with check (app.has_perm(company_id, 'studio', 'configure'));
create policy term_upd on public.terminology for update using (app.has_perm(company_id, 'studio', 'configure')) with check (app.has_perm(company_id, 'studio', 'configure'));
create policy term_del on public.terminology for delete using (app.has_perm(company_id, 'studio', 'configure'));
grant select, insert, update, delete on public.terminology to authenticated;
