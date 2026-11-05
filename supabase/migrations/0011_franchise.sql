-- Franchise pipeline: applicants -> checks -> territory -> approval -> agreement -> active partner.

create table public.territories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(trim(name)) >= 2), region_id uuid, notes text not null default '',
  status text not null default 'available' check (status in ('available','reserved','assigned')),
  reserved_for uuid, reserved_until date, partner_id uuid,
  unique (id, company_id), unique (company_id, name),
  foreign key (region_id, company_id) references public.regions(id, company_id),
  foreign key (partner_id, company_id) references public.franchise_partners(id, company_id),
  check ((status = 'reserved') = (reserved_for is not null))
);
create table public.applicants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(trim(name)) >= 2), email citext, phone text, source text not null default 'manual',
  stage text not null default 'enquiry' check (stage in ('enquiry','qualified','meeting','proposal','review','approved','rejected','withdrawn')),
  territory_id uuid, owner_id uuid, notes text not null default '',
  proposal_fee_minor bigint check (proposal_fee_minor >= 0), proposal_note text not null default '',
  decision_reason text, partner_id uuid, created_at timestamptz not null default now(),
  unique (id, company_id),
  foreign key (territory_id, company_id) references public.territories(id, company_id),
  foreign key (partner_id, company_id) references public.franchise_partners(id, company_id)
);
alter table public.territories add constraint territories_reserved_for_fk foreign key (reserved_for, company_id) references public.applicants(id, company_id);
create table public.applicant_checks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, applicant_id uuid not null,
  kind text not null check (kind in ('qualification','document')), label text not null check (length(trim(label)) >= 2),
  status text not null default 'open' check (status in ('open','received','verified','rejected')), note text,
  foreign key (applicant_id, company_id) references public.applicants(id, company_id) on delete cascade,
  check (status <> 'rejected' or length(trim(coalesce(note, ''))) >= 3)
);
create table public.agreements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  number text not null, partner_id uuid not null, applicant_id uuid, territory_id uuid not null,
  version int not null default 1, renewal_of uuid,
  start_date date not null, end_date date not null, reminder_days int not null default 90 check (reminder_days between 7 and 365),
  franchise_fee_minor bigint not null default 0 check (franchise_fee_minor >= 0), deposit_minor bigint not null default 0 check (deposit_minor >= 0),
  status text not null default 'draft' check (status in ('draft','in_review','signed','active','expired','terminated')),
  signed_on date, terminated_on date, termination_reason text, reminded_at timestamptz,
  created_by uuid not null, created_at timestamptz not null default now(),
  unique (id, company_id), unique (company_id, number),
  foreign key (partner_id, company_id) references public.franchise_partners(id, company_id),
  foreign key (territory_id, company_id) references public.territories(id, company_id),
  foreign key (renewal_of, company_id) references public.agreements(id, company_id),
  check (end_date > start_date),
  check (status <> 'terminated' or length(trim(coalesce(termination_reason, ''))) >= 3),
  -- a territory can't have two live agreements at once
  exclude using gist (territory_id with =, daterange(start_date, end_date, '[]') with &&) where (status in ('signed', 'active'))
);
-- What a partner owes the brand at signing: separate from SaaS invoices and from monthly royalties.
create table public.agreement_fees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, agreement_id uuid not null,
  kind text not null check (kind in ('franchise_fee','deposit','training','other')), due_on date not null, amount_minor bigint not null check (amount_minor > 0),
  status text not null default 'due' check (status in ('due','paid','waived')), paid_on date, note text,
  foreign key (agreement_id, company_id) references public.agreements(id, company_id) on delete cascade,
  check (status <> 'paid' or paid_on is not null), check (status <> 'waived' or length(trim(coalesce(note, ''))) >= 3)
);

-- Signed terms are history. Only status, dates of record and reminders move.
create or replace function app.guard_agreement() returns trigger language plpgsql as $$
begin
  if old.status in ('signed','active','expired','terminated') and
     (new.start_date, new.end_date, new.franchise_fee_minor, new.deposit_minor, new.territory_id, new.partner_id) is distinct from (old.start_date, old.end_date, old.franchise_fee_minor, old.deposit_minor, old.territory_id, old.partner_id)
     and not (old.status = 'active' and new.partner_id is distinct from old.partner_id and new.start_date = old.start_date) then
    raise exception 'signed terms can''t be edited; renew or amend with a new version';
  end if;
  if old.status in ('expired','terminated') and new.status <> old.status then raise exception 'a % agreement is final', old.status; end if;
  return new;
end $$;
create trigger agreements_guard before update on public.agreements for each row execute function app.guard_agreement();

select app.secure('territories', 'franchise');
select app.secure('applicants', 'franchise');
select app.secure_child('applicant_checks', 'applicants', 'applicant_id', 'franchise');
select app.secure('agreements', 'franchise');
select app.secure_child('agreement_fees', 'agreements', 'agreement_id', 'franchise');
do $$ declare t text; begin foreach t in array array['territories','applicants','applicant_checks','agreements','agreement_fees'] loop
  execute format('create trigger %I after insert or update or delete on public.%I for each row execute function app.audit()', 'audit_' || t, t); end loop; end $$;

create or replace function public.reserve_territory(p_territory uuid, p_applicant uuid, p_days int default 30) returns void
language plpgsql security definer set search_path = public as $$
declare t territories; a applicants;
begin
  select * into t from territories where id = p_territory for update; select * into a from applicants where id = p_applicant for update;
  if t.id is null or a.id is null or t.company_id <> a.company_id then raise exception 'choose a territory and applicant from this company'; end if;
  if not app.has_perm(t.company_id, 'franchise', 'edit') then raise exception 'you cannot reserve territories' using errcode = '42501'; end if;
  if a.stage in ('rejected','withdrawn') then raise exception 'this applicant is no longer in the pipeline'; end if;
  if t.status = 'assigned' then raise exception '% is already assigned to a partner', t.name; end if;
  if t.status = 'reserved' and t.reserved_for <> p_applicant then raise exception '% is already reserved for another applicant until %', t.name, t.reserved_until; end if;
  if p_days < 1 or p_days > 365 then raise exception 'reserve for between 1 and 365 days'; end if;
  if a.territory_id is not null and a.territory_id <> p_territory then update territories set status = 'available', reserved_for = null, reserved_until = null where id = a.territory_id and reserved_for = p_applicant; end if;
  update territories set status = 'reserved', reserved_for = p_applicant, reserved_until = current_date + p_days where id = p_territory;
  update applicants set territory_id = p_territory where id = p_applicant;
end $$;
grant execute on function public.reserve_territory(uuid, uuid, int) to authenticated;

create or replace function public.approve_applicant(p_applicant uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare a applicants; pid uuid; open_checks int; bad int; total int; nm text;
begin
  select * into a from applicants where id = p_applicant for update;
  if a.id is null or not app.has_perm(a.company_id, 'franchise', 'approve') then raise exception 'you cannot approve franchise applications' using errcode = '42501'; end if;
  if a.stage <> 'review' then raise exception 'only an application in review can be approved'; end if;
  if a.territory_id is null then raise exception 'reserve a territory first'; end if;
  select count(*), count(*) filter (where status in ('open','received')), count(*) filter (where status = 'rejected') into total, open_checks, bad from applicant_checks where applicant_id = p_applicant;
  if total = 0 then raise exception 'add the qualification and document checks first'; end if;
  if open_checks > 0 then raise exception '% check(s) are not yet verified', open_checks; end if;
  if bad > 0 then raise exception '% check(s) were rejected', bad; end if;
  nm := a.name; if exists (select 1 from franchise_partners where company_id = a.company_id and name = nm) then nm := a.name || ' (' || to_char(now(), 'YYYY') || ')'; end if;
  insert into franchise_partners(company_id, name, stage) values (a.company_id, nm, 'approved') returning id into pid;
  update applicants set stage = 'approved', partner_id = pid, decision_reason = null where id = p_applicant;
  return pid;
end $$;
grant execute on function public.approve_applicant(uuid) to authenticated;

create or replace function public.decide_applicant(p_applicant uuid, p_outcome text, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare a applicants;
begin
  select * into a from applicants where id = p_applicant for update;
  if a.id is null or not app.has_perm(a.company_id, 'franchise', 'edit') then raise exception 'you cannot change this application' using errcode = '42501'; end if;
  if p_outcome not in ('rejected','withdrawn') then raise exception 'unknown outcome'; end if;
  if a.stage in ('approved','rejected','withdrawn') then raise exception 'this application is already %', a.stage; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'record the reason'; end if;
  update applicants set stage = p_outcome, decision_reason = p_reason where id = p_applicant;
  update territories set status = 'available', reserved_for = null, reserved_until = null where reserved_for = p_applicant;
end $$;
grant execute on function public.decide_applicant(uuid, text, text) to authenticated;

-- Signing activates the partner and assigns the territory (immediately, or on the start date via housekeeping).
create or replace function public.sign_agreement(p_agreement uuid) returns void
language plpgsql security definer set search_path = public as $$
declare g agreements;
begin
  select * into g from agreements where id = p_agreement for update;
  if g.id is null or not app.has_perm(g.company_id, 'franchise', 'approve') then raise exception 'you cannot sign agreements' using errcode = '42501'; end if;
  if g.status not in ('draft','in_review') then raise exception 'this agreement is already %', g.status; end if;
  update agreements set status = case when start_date <= current_date then 'active' else 'signed' end, signed_on = current_date where id = p_agreement;
  if g.start_date <= current_date then perform app.activate_agreement(p_agreement); end if;
end $$;
grant execute on function public.sign_agreement(uuid) to authenticated;

create or replace function app.activate_agreement(p_agreement uuid) returns void language plpgsql security definer set search_path = public as $$
declare g agreements;
begin
  select * into g from agreements where id = p_agreement;
  update agreements set status = 'active' where id = p_agreement and status = 'signed';
  update territories set status = 'assigned', partner_id = g.partner_id, reserved_for = null, reserved_until = null where id = g.territory_id;
  update franchise_partners set stage = 'active' where id = g.partner_id and stage in ('approved','renewing');
  -- a renewal supersedes the term before it
  if g.renewal_of is not null then update agreements set status = 'expired' where id = g.renewal_of and status = 'active'; end if;
end $$;
revoke execute on function app.activate_agreement(uuid) from public, authenticated;

create or replace function public.terminate_agreement(p_agreement uuid, p_reason text) returns int
language plpgsql security definer set search_path = public as $$
declare g agreements; branches int;
begin
  select * into g from agreements where id = p_agreement for update;
  if g.id is null or not app.has_perm(g.company_id, 'franchise', 'approve') then raise exception 'you cannot terminate agreements' using errcode = '42501'; end if;
  if g.status not in ('signed','active') then raise exception 'only a signed or active agreement can be terminated'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'record the reason for termination'; end if;
  update agreements set status = 'terminated', terminated_on = current_date, termination_reason = p_reason where id = p_agreement;
  update territories set status = 'available', partner_id = null where id = g.territory_id and partner_id = g.partner_id;
  if not exists (select 1 from agreements where partner_id = g.partner_id and status in ('signed','active') and id <> p_agreement) then update franchise_partners set stage = 'terminated' where id = g.partner_id; end if;
  select count(*) into branches from branches where partner_id = g.partner_id and status <> 'closed';
  return branches;      -- branches still operating under the ended agreement, for the offboarding checklist
end $$;
grant execute on function public.terminate_agreement(uuid, text) to authenticated;

create or replace function public.renew_agreement(p_agreement uuid, p_new_end date) returns uuid
language plpgsql security definer set search_path = public as $$
declare g agreements; nid uuid;
begin
  select * into g from agreements where id = p_agreement for update;
  if g.id is null or not app.has_perm(g.company_id, 'franchise', 'edit') then raise exception 'you cannot renew agreements' using errcode = '42501'; end if;
  if g.status <> 'active' then raise exception 'only an active agreement can be renewed'; end if;
  if exists (select 1 from agreements where renewal_of = p_agreement and status <> 'terminated') then raise exception 'a renewal already exists'; end if;
  if p_new_end <= g.end_date then raise exception 'the renewal must run beyond %', g.end_date; end if;
  insert into agreements(company_id, number, partner_id, applicant_id, territory_id, version, renewal_of, start_date, end_date, reminder_days, franchise_fee_minor, deposit_minor, created_by)
  values (g.company_id, app.next_number(g.company_id, 'agreement', 'AGR'), g.partner_id, g.applicant_id, g.territory_id, g.version + 1, g.id, g.end_date + 1, p_new_end, g.reminder_days, 0, 0, auth.uid()) returning id into nid;
  update franchise_partners set stage = 'renewing' where id = g.partner_id and stage = 'active';
  return nid;
end $$;
grant execute on function public.renew_agreement(uuid, date) to authenticated;

-- Moves the agreement, and the partner's branches, to a new operator. History keeps the move.
create or replace function public.transfer_ownership(p_agreement uuid, p_new_partner uuid, p_reason text) returns int
language plpgsql security definer set search_path = public as $$
declare g agreements; moved int;
begin
  select * into g from agreements where id = p_agreement for update;
  if g.id is null or not app.has_perm(g.company_id, 'franchise', 'approve') then raise exception 'you cannot transfer ownership' using errcode = '42501'; end if;
  if g.status <> 'active' then raise exception 'only an active agreement can be transferred'; end if;
  if not exists (select 1 from franchise_partners where id = p_new_partner and company_id = g.company_id and stage in ('approved','active')) then raise exception 'the new partner must be an approved partner'; end if;
  if p_new_partner = g.partner_id then raise exception 'choose a different partner'; end if;
  if length(trim(coalesce(p_reason, ''))) < 3 then raise exception 'record the reason for the transfer'; end if;
  update branches set partner_id = p_new_partner where partner_id = g.partner_id and status <> 'closed' and company_id = g.company_id;
  get diagnostics moved = row_count;
  update agreements set partner_id = p_new_partner where id = p_agreement;
  update territories set partner_id = p_new_partner where id = g.territory_id;
  update franchise_partners set stage = 'active' where id = p_new_partner;
  if not exists (select 1 from agreements where partner_id = g.partner_id and status in ('signed','active')) then update franchise_partners set stage = 'terminated' where id = g.partner_id; end if;
  return moved;
end $$;
grant execute on function public.transfer_ownership(uuid, uuid, text) to authenticated;

-- Daily housekeeping: release lapsed reservations, activate agreements that start today, expire those that ended, send renewal reminders.
create or replace function app.run_franchise_housekeeping(p_today date default current_date) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; g record; c int;
begin
  update territories set status = 'available', reserved_for = null, reserved_until = null where status = 'reserved' and reserved_until < p_today; get diagnostics c = row_count; n := n + c;
  for g in select id from agreements where status = 'signed' and start_date <= p_today loop perform app.activate_agreement(g.id); n := n + 1; end loop;
  update agreements set status = 'expired' where status = 'active' and end_date < p_today; get diagnostics c = row_count; n := n + c;
  update franchise_partners fp set stage = 'terminated' where fp.stage in ('active','renewing') and exists (select 1 from agreements a where a.partner_id = fp.id) and not exists (select 1 from agreements a where a.partner_id = fp.id and a.status in ('signed','active','draft','in_review'));
  for g in select a.* from agreements a where a.status = 'active' and a.reminded_at is null and a.end_date - p_today between 0 and a.reminder_days loop
    insert into notifications(company_id, user_id, title, body, href)
    select g.company_id, m.user_id, 'Agreement ' || g.number || ' ends ' || g.end_date, 'Start the renewal or plan the exit.', '/franchise/agreements/' || g.id
      from memberships m join membership_roles mr on mr.membership_id = m.id join roles r on r.id = mr.role_id
     where m.company_id = g.company_id and m.status = 'active' and r.name = 'Company owner';
    update agreements set reminded_at = now() where id = g.id; n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function app.run_franchise_housekeeping(date) from public, authenticated;
grant select, insert, update on public.territories, public.applicants, public.applicant_checks, public.agreements, public.agreement_fees to authenticated;
