-- Stock ledger: every change is an append-only movement; the level is the sum. It can never go negative.

create table public.stock_movements (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null, item_id uuid not null,
  qty numeric(12,3) not null check (qty <> 0),
  kind text not null check (kind in ('receipt','issue','transfer_out','transfer_in','adjustment','wastage','count')),
  ref text, note text not null default '',
  created_by uuid, created_at timestamptz not null default now(),
  foreign key (branch_id, company_id) references public.branches(id, company_id),
  foreign key (item_id, company_id) references public.catalog_items(id, company_id),
  check (kind not in ('receipt','transfer_in') or qty > 0),
  check (kind not in ('issue','transfer_out','wastage') or qty < 0),
  check (kind not in ('wastage','adjustment','count') or length(trim(note)) >= 3)
);
create index on public.stock_movements(branch_id, item_id);

create table public.stock_reorder (
  company_id uuid not null references public.companies(id) on delete cascade,
  branch_id uuid not null, item_id uuid not null,
  reorder_point numeric(12,3) not null check (reorder_point >= 0),
  primary key (branch_id, item_id),
  foreign key (branch_id, company_id) references public.branches(id, company_id),
  foreign key (item_id, company_id) references public.catalog_items(id, company_id)
);

create view public.stock_levels with (security_invoker = true) as
  select company_id, branch_id, item_id, sum(qty) as qty from public.stock_movements group by company_id, branch_id, item_id;

create or replace function app.stock_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare cur numeric;
begin
  if tg_op = 'DELETE' and current_setting('app.purging', true) = 'on' then return old; end if;   -- only the scheduled company purge sets this
  if tg_op <> 'INSERT' then raise exception 'stock movements are a ledger and cannot be changed; record an adjustment instead' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(new.branch_id::text || new.item_id::text, 0));   -- serialise per branch and item
  select coalesce(sum(qty), 0) into cur from stock_movements where branch_id = new.branch_id and item_id = new.item_id;
  if cur + new.qty < 0 then raise exception 'not enough stock: % on hand, % requested', cur, -new.qty; end if;
  new.created_by := coalesce(new.created_by, auth.uid());
  return new;
end $$;
create trigger stock_movements_guard before insert on public.stock_movements for each row execute function app.stock_guard();
create trigger stock_movements_immutable before update or delete on public.stock_movements for each row execute function app.stock_guard();

select app.secure('stock_movements', 'inventory', 'branch_id');
select app.secure('stock_reorder', 'inventory', 'branch_id');
create trigger audit_stock_reorder after insert or update or delete on public.stock_reorder for each row execute function app.audit();

-- Goods received against a purchase order also arrive in stock.
create or replace function app.apply_receipt() returns trigger language plpgsql security definer set search_path = public as $$
declare pl po_lines; po uuid; open_lines int; p purchase_orders;
begin
  select * into pl from po_lines where id = new.po_line_id and company_id = new.company_id for update;
  if pl.qty_received + new.qty_received > pl.qty_ordered then
    raise exception 'receiving % would exceed the % ordered; record the difference as rejected or a discrepancy', new.qty_received, pl.qty_ordered;
  end if;
  update po_lines set qty_received = qty_received + new.qty_received where id = pl.id;
  po := pl.po_id;
  select * into p from purchase_orders where id = po;
  if new.qty_received > 0 then
    insert into stock_movements(company_id, branch_id, item_id, qty, kind, ref, created_by)
    values (new.company_id, p.branch_id, pl.item_id, new.qty_received, 'receipt', p.number, auth.uid());
  end if;
  select count(*) into open_lines from po_lines where po_id = po and qty_received < qty_ordered;
  update purchase_orders set status = case when open_lines = 0 then 'received' else 'partially_received' end where id = po;
  if open_lines = 0 then update requisitions set status = 'closed' where id = p.requisition_id; end if;
  return new;
end $$;

-- Move stock between branches in one step. Needs permission at the source; the destination may be any live branch.
create or replace function public.transfer_stock(p_from uuid, p_to uuid, p_item uuid, p_qty numeric, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare f branches; t branches;
begin
  select * into f from branches where id = p_from; select * into t from branches where id = p_to;
  if f.id is null or t.id is null or f.company_id <> t.company_id then raise exception 'choose two branches in this company'; end if;
  if p_from = p_to then raise exception 'choose a different destination branch'; end if;
  if not app.has_perm(f.company_id, 'inventory', 'create', null, null, p_from) then raise exception 'you cannot move stock out of this branch' using errcode = '42501'; end if;
  if t.status in ('closed','closing') then raise exception 'the destination branch is closing or closed'; end if;
  if p_qty is null or p_qty <= 0 then raise exception 'enter a quantity above zero'; end if;
  insert into stock_movements(company_id, branch_id, item_id, qty, kind, ref, note) values (f.company_id, p_from, p_item, -p_qty, 'transfer_out', t.code, coalesce(p_note, ''));
  insert into stock_movements(company_id, branch_id, item_id, qty, kind, ref, note) values (f.company_id, p_to, p_item, p_qty, 'transfer_in', f.code, coalesce(p_note, ''));
end $$;
grant execute on function public.transfer_stock(uuid, uuid, uuid, numeric, text) to authenticated;

-- A stock count records the difference to the book level, with a reason when it differs.
create or replace function public.record_count(p_branch uuid, p_item uuid, p_counted numeric, p_note text default '') returns numeric
language plpgsql security definer set search_path = public as $$
declare b branches; cur numeric; diff numeric;
begin
  select * into b from branches where id = p_branch;
  if b.id is null or not app.has_perm(b.company_id, 'inventory', 'create', null, null, p_branch) then raise exception 'you cannot count stock here' using errcode = '42501'; end if;
  if p_counted is null or p_counted < 0 then raise exception 'enter the counted quantity'; end if;
  select coalesce(sum(qty), 0) into cur from stock_movements where branch_id = p_branch and item_id = p_item;
  diff := p_counted - cur;
  if diff <> 0 then insert into stock_movements(company_id, branch_id, item_id, qty, kind, note) values (b.company_id, p_branch, p_item, diff, 'count', coalesce(p_note, '')); end if;
  return diff;
end $$;
grant execute on function public.record_count(uuid, uuid, numeric, text) to authenticated;

grant select, insert on public.stock_movements to authenticated;
grant select, insert, update, delete on public.stock_reorder to authenticated;
grant select on public.stock_levels to authenticated;
