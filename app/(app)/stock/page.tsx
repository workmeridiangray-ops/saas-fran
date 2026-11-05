import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { countStock, setReorder, transferStock, useStock } from "./actions";
import { branchOptions } from "@/lib/data/pickers";
import { Field, FormCard, Select } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { PageHeader, StateMessage, Status, TableWrap, Td, Th } from "@/components/ui";
import { fmtDateTime, titleCase } from "@/lib/format";

export const metadata = { title: "Stock" };

export default async function Stock({ searchParams }: { searchParams: Promise<{ branch?: string; tab?: string; ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "inventory", { module: "stock", what: "stock" }); if (denied) return denied;
  const { branch = "", tab = "levels", ok, err } = await searchParams;
  const d = await asUser(ctx.user.id, async (db) => ({
    branches: await branchOptions(db, ctx.companyId),
    items: await db.q<{ id: string; name: string; sku: string; unit: string }>("select id, name, sku, unit from catalog_items where company_id = $1 and status = 'active' order by name", [ctx.companyId]),
    levels: tab === "levels" ? await db.q<{ branch_id: string; branch: string; item_id: string; item: string; sku: string; unit: string; qty: string; point: string | null }>(
      `select b.id branch_id, b.name branch, i.id item_id, i.name item, i.sku, i.unit, coalesce(l.qty, 0) qty, r.reorder_point point
         from branches b cross join catalog_items i left join stock_levels l on l.branch_id = b.id and l.item_id = i.id left join stock_reorder r on r.branch_id = b.id and r.item_id = i.id
        where b.company_id = $1 and b.status <> 'closed' and i.status = 'active' and ($2 = '' or b.id::text = $2) and (l.qty is not null or r.reorder_point is not null)
        order by (coalesce(l.qty, 0) <= coalesce(r.reorder_point, -1)) desc, b.name, i.name`, [ctx.companyId, branch]) : [],
    moves: tab === "moves" ? await db.q<{ id: string; created_at: string; branch: string; item: string; qty: string; kind: string; note: string; ref: string | null; who: string | null }>(
      `select m.id, m.created_at, b.name branch, i.name item, m.qty, m.kind, m.note, m.ref, coalesce(nullif(p.display_name,''), p.email) who from stock_movements m join branches b on b.id = m.branch_id join catalog_items i on i.id = m.item_id left join profiles p on p.id = m.created_by
        where m.company_id = $1 and ($2 = '' or m.branch_id::text = $2) order by m.id desc limit 200`, [ctx.companyId, branch]) : [],
  }));
  const canWrite = ctx.has("create", "inventory"); const brOpts = d.branches.map((b) => ({ value: b.id, label: b.name })); const itOpts = d.items.map((i) => ({ value: i.id, label: `${i.name} (${i.sku})` }));
  const tabLink = (k: string, l: string) => <Link key={k} href={`/stock?tab=${k}${branch ? `&branch=${branch}` : ""}`} aria-current={tab === k ? "page" : undefined} className={`inline-flex min-h-touch items-center rounded-md border px-2 text-sm ${tab === k ? "border-brand bg-brand-soft font-medium" : "border-line bg-surface hover:bg-sunken"}`}>{l}</Link>;
  return (
    <>
      <PageHeader title="Stock" description="What each branch holds, from goods received, use, wastage, transfers and counts. The level is always the sum of what was recorded, and it can't go below zero." />
      <Flash ok={ok} err={err} />
      <form className="mb-2 flex flex-wrap items-end gap-1.5" role="search" aria-label="Choose branch"><input type="hidden" name="tab" value={tab} />
        <Select label="Branch" name="branch" defaultValue={branch} placeholder="All branches" options={brOpts} /><button className="inline-flex min-h-touch items-center rounded-md border border-line-strong bg-surface px-3 text-sm font-medium">Show</button></form>
      <div className="mb-2 flex gap-1">{tabLink("levels", "Levels")}{tabLink("moves", "Movements")}</div>
      {tab === "levels" && (d.levels.length === 0 ? <StateMessage title="No stock recorded yet">Receive goods against a purchase order, or set a reorder point below, and items appear here.</StateMessage> : (
        <TableWrap label="Stock levels"><thead><tr><Th>Branch</Th><Th>Item</Th><Th num>On hand</Th><Th num>Reorder at</Th><Th>Status</Th></tr></thead>
          <tbody>{d.levels.map((l) => { const q = Number(l.qty), p = l.point === null ? null : Number(l.point); return <tr key={l.branch_id + l.item_id}><Td>{l.branch}</Td><Td>{l.item}<span className="block text-xs text-muted">{l.sku}</span></Td><Td num>{q} {l.unit}</Td><Td num>{p ?? "—"}</Td>
            <Td>{q <= 0 ? <Status tone="danger">Out of stock</Status> : p !== null && q <= p ? <Status tone="warn">Reorder now</Status> : <Status tone="ok">OK</Status>}</Td></tr>; })}</tbody></TableWrap>))}
      {tab === "moves" && (d.moves.length === 0 ? <StateMessage title="No movements yet">Every receipt, use, transfer and count is listed here and can't be altered.</StateMessage> : (
        <TableWrap label="Stock movements"><thead><tr><Th>When</Th><Th>Branch</Th><Th>Item</Th><Th num>Change</Th><Th>Type</Th><Th>Note</Th><Th>By</Th></tr></thead>
          <tbody>{d.moves.map((m) => <tr key={m.id}><Td>{fmtDateTime(m.created_at, ctx.company.timezone)}</Td><Td>{m.branch}</Td><Td>{m.item}</Td><Td num>{Number(m.qty) > 0 ? "+" : ""}{Number(m.qty)}</Td><Td>{titleCase(m.kind)}{m.ref ? ` · ${m.ref}` : ""}</Td><Td>{m.note || "—"}</Td><Td>{m.who ?? "System"}</Td></tr>)}</tbody></TableWrap>))}
      {canWrite && d.items.length > 0 && d.branches.length > 0 && tab === "levels" && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <FormCard title="Record use or wastage"><form action={useStock} className="space-y-2"><Select label="Branch" name="branch_id" options={brOpts} /><Select label="Item" name="item_id" options={itOpts} />
            <div className="grid grid-cols-2 gap-2"><Field label="Quantity" name="qty" inputMode="decimal" required /><Select label="Type" name="kind" options={[{ value: "issue", label: "Used" }, { value: "wastage", label: "Wasted" }]} /></div><Field label="Note (required for wastage)" name="note" /><SubmitButton pending="Recording…">Record</SubmitButton></form></FormCard>
          <FormCard title="Transfer between branches"><form action={transferStock} className="space-y-2"><div className="grid grid-cols-2 gap-2"><Select label="From" name="from" options={brOpts} /><Select label="To" name="to" options={brOpts} /></div><Select label="Item" name="item_id" options={itOpts} /><Field label="Quantity" name="qty" inputMode="decimal" required /><Field label="Note" name="note" /><SubmitButton pending="Moving…">Transfer</SubmitButton></form></FormCard>
          <FormCard title="Stock count"><form action={countStock} className="space-y-2"><Select label="Branch" name="branch_id" options={brOpts} /><Select label="Item" name="item_id" options={itOpts} /><Field label="Quantity counted" name="counted" inputMode="decimal" required /><Field label="Reason for any difference" name="note" /><SubmitButton pending="Recording…">Record count</SubmitButton></form></FormCard>
          <FormCard title="Reorder point"><form action={setReorder} className="space-y-2"><Select label="Branch" name="branch_id" options={brOpts} /><Select label="Item" name="item_id" options={itOpts} /><Field label="Warn when on hand falls to" name="point" inputMode="decimal" required /><SubmitButton pending="Saving…">Save</SubmitButton></form></FormCard>
        </div>)}
    </>
  );
}
