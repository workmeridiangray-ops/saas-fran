-- Evidence and documents attached to records. Stored in Postgres (<= 5 MB each) so backups cover them.
-- A file is readable only by someone who can see the record it is attached to: visibility is checked
-- with the caller's own row-level security on the parent table.

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  subject_table text not null check (subject_table in ('tasks','approval_requests','findings','corrective_actions','tickets','goods_receipts','requisitions')),
  subject_id uuid not null,
  filename text not null check (length(filename) between 1 and 200),
  content_type text not null,
  size_bytes int not null check (size_bytes between 1 and 5242880),
  data bytea not null,
  uploaded_by uuid not null,
  created_at timestamptz not null default now(),
  check (octet_length(data) = size_bytes)
);
create index on public.attachments(subject_table, subject_id);

-- SECURITY INVOKER on purpose: the parent's RLS decides.
create or replace function app.can_see_subject(p_table text, p_id uuid, p_company uuid) returns boolean
language plpgsql stable security invoker set search_path = public as $$
declare ok boolean;
begin
  if p_table not in ('tasks','approval_requests','findings','corrective_actions','tickets','goods_receipts','requisitions') then return false; end if;
  execute format('select exists (select 1 from public.%I where id = $1 and company_id = $2)', p_table) into ok using p_id, p_company;
  return ok;
end $$;

alter table public.attachments enable row level security;
create policy attachments_sel on public.attachments for select using (app.can_see_subject(subject_table, subject_id, company_id));
create policy attachments_ins on public.attachments for insert
  with check (uploaded_by = auth.uid() and app.is_member(company_id) and app.can_see_subject(subject_table, subject_id, company_id));
create trigger audit_attachments after insert or update or delete on public.attachments for each row execute function app.audit();

grant select, insert on public.attachments to authenticated;
