import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { addItem, addSupplier } from "./actions";
import { Field, FormCard, Select } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { ButtonLink, PageHeader, Panel, StateMessage, Status, TableWrap, Td, Th, type Tone } from "@/components/ui";
import { formatMinor } from "@/lib/rules/money";
import { fmtDate, titleCase } from "@/lib/format";

export const metadata = { title: "Purchasing" };
const TONE: Record<string, Tone> = { draft: "neutral", submitted: "info", approved: "ok", rejected: "danger", ordered: "info", closed: "ok", cancelled: "neutral", sent: "info", partially_received: "warn", received: "ok" };

export default async function Purchasing({ searchParams }: { searchParams: Promise<{ tab?: string; ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "purchasing", { module: "purchasing", what: "purchasing" }); if (denied) return denied;
  const { tab = "requisitions", ok, err } = await searchParams;
  const money = (n: number | string) => formatMinor(Number(n), ctx.company.currency);
  const d = await asUser(ctx.user.id, async (db) => ({
    reqs: tab === "requisitions" ? await db.q<{ id: string; number: string; status: string; total_minor: string; branch: string; supplier: string; created_at: string }>("select r.id, r.number, r.status, r.total_minor, b.name branch, s.name supplier, r.created_at from requisitions r join branches b on b.id = r.branch_id join suppliers s on s.id = r.supplier_id where r.company_id = $1 order by r.created_at desc limit 200", [ctx.companyId]) : [],
    orders: tab === "orders" ? await db.q<{ id: string; number: string; status: string; total_minor: string; branch: string; supplier: string; created_at: string; recv: string }>("select o.id, o.number, o.status, o.total_minor, b.name branch, s.name supplier, o.created_at, (select round(100 * coalesce(sum(qty_received),0) / nullif(sum(qty_ordered),0)) from po_lines l where l.po_id = o.id) recv from purchase_orders o join branches b on b.id = o.branch_id join suppliers s on s.id = o.supplier_id where o.company_id = $1 order by o.created_at desc limit 200", [ctx.companyId]) : [],
    suppliers: tab === "suppliers" ? await db.q<{ id: string; name: string; contact_email: string | null; items: string }>("select s.id, s.name, s.contact_email, (select count(*) from catalog_items i where i.supplier_id = s.id and i.status='active') items from suppliers s where s.company_id = $1 and s.status <> 'archived' order by s.name", [ctx.companyId]) : [],
    items: tab === "suppliers" ? await db.q<{ sku: string; name: string; unit: string; unit_price_minor: string; tax_bp: number; supplier: string }>("select i.sku, i.name, i.unit, i.unit_price_minor, i.tax_bp, s.name supplier from catalog_items i join suppliers s on s.id = i.supplier_id where i.company_id = $1 and i.status='active' order by s.name, i.name", [ctx.companyId]) : [],
  }));
  const tabLink = (k: string, l: string) => <Link key={k} href={`/purchasing?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={`inline-flex min-h-touch items-center rounded-md border px-2 text-sm ${tab === k ? "border-brand bg-brand-soft font-medium" : "border-line bg-surface hover:bg-sunken"}`}>{l}</Link>;
  return (
    <>
      <PageHeader title="Purchasing" description="Request, approve, order and receive, with partial deliveries and discrepancies recorded."
        actions={ctx.has("create", "purchasing") ? <ButtonLink href="/purchasing/new" variant="primary">New requisition</ButtonLink> : undefined} />
      <Flash ok={ok} err={err} />
      <div className="mb-2 flex gap-1">{tabLink("requisitions", "Requisitions")}{tabLink("orders", "Orders")}{tabLink("suppliers", "Suppliers & items")}</div>
      {tab === "requisitions" && (d.reqs.length === 0 ? <StateMessage title="No requisitions yet" actions={<ButtonLink href="/purchasing/new" variant="primary">Create one</ButtonLink>}>Add a supplier and catalogue items first (Suppliers & items), then request what a branch needs.</StateMessage> : (
        <TableWrap label="Requisitions"><thead><tr><Th>Number</Th><Th>Branch</Th><Th>Supplier</Th><Th>Date</Th><Th num>Total</Th><Th>Status</Th></tr></thead>
          <tbody>{d.reqs.map((r) => <tr key={r.id}><Td><Link className="font-medium text-brand" href={`/purchasing/${r.id}`}>{r.number}</Link></Td><Td>{r.branch}</Td><Td>{r.supplier}</Td><Td>{fmtDate(r.created_at, ctx.company.timezone)}</Td><Td num>{money(r.total_minor)}</Td><Td><Status tone={TONE[r.status] ?? "neutral"}>{titleCase(r.status)}</Status></Td></tr>)}</tbody></TableWrap>))}
      {tab === "orders" && (d.orders.length === 0 ? <StateMessage title="No purchase orders yet">Approved requisitions become purchase orders. Open an approved requisition and choose “Place order”.</StateMessage> : (
        <TableWrap label="Purchase orders"><thead><tr><Th>Order</Th><Th>Branch</Th><Th>Supplier</Th><Th>Date</Th><Th num>Total</Th><Th num>Received</Th><Th>Status</Th></tr></thead>
          <tbody>{d.orders.map((r) => <tr key={r.id}><Td><Link className="font-medium text-brand" href={`/purchasing/orders/${r.id}`}>{r.number}</Link></Td><Td>{r.branch}</Td><Td>{r.supplier}</Td><Td>{fmtDate(r.created_at, ctx.company.timezone)}</Td><Td num>{money(r.total_minor)}</Td><Td num>{Number(r.recv ?? 0)}%</Td><Td><Status tone={TONE[r.status] ?? "neutral"}>{titleCase(r.status)}</Status></Td></tr>)}</tbody></TableWrap>))}
      {tab === "suppliers" && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Approved suppliers">{d.suppliers.length === 0 ? <p className="text-sm text-muted">No suppliers yet. Add your first below.</p> : <ul className="divide-y divide-line">{d.suppliers.map((s) => <li key={s.id} className="py-1 text-sm"><span className="font-medium">{s.name}</span><span className="block text-xs text-muted">{s.contact_email ?? "No contact"} · {s.items} item{s.items === "1" ? "" : "s"}</span></li>)}</ul>}</Panel>
          {ctx.has("create", "purchasing") && <FormCard title="Add a supplier"><form action={addSupplier} className="space-y-2"><Field label="Name" name="name" required /><Field label="Contact email" name="email" type="email" /><SubmitButton pending="Adding…">Add supplier</SubmitButton></form></FormCard>}
          <Panel title="Item catalogue" className="lg:col-span-2">{d.items.length === 0 ? <p className="text-sm text-muted">No items yet.</p> : (
            <TableWrap label="Catalogue"><thead><tr><Th>Code</Th><Th>Item</Th><Th>Supplier</Th><Th>Unit</Th><Th num>Price</Th><Th num>Tax</Th></tr></thead><tbody>{d.items.map((i) => <tr key={i.sku}><Td>{i.sku}</Td><Td>{i.name}</Td><Td>{i.supplier}</Td><Td>{i.unit}</Td><Td num>{money(i.unit_price_minor)}</Td><Td num>{(i.tax_bp / 100).toFixed(2)}%</Td></tr>)}</tbody></TableWrap>)}</Panel>
          {ctx.has("create", "purchasing") && d.suppliers.length > 0 && <FormCard title="Add a catalogue item"><form action={addItem} className="space-y-2">
            <Select label="Supplier" name="supplier_id" options={d.suppliers.map((s) => ({ value: s.id, label: s.name }))} /><div className="grid grid-cols-2 gap-2"><Field label="Code" name="sku" required /><Field label="Unit" name="unit" defaultValue="each" /></div>
            <Field label="Item name" name="name" required /><div className="grid grid-cols-2 gap-2"><Field label={`Price (${ctx.company.currency})`} name="price" inputMode="decimal" required hint="Exact amount, for example 40.00" /><Field label="Tax %" name="tax" inputMode="decimal" defaultValue="0" /></div><SubmitButton pending="Adding…">Add item</SubmitButton></form></FormCard>}
        </div>)}
    </>
  );
}
