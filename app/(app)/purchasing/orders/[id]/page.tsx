import Link from "next/link";
import { notFound } from "next/navigation";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { receiveGoods } from "../../actions";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { Field } from "@/components/ui/fields";
import { Alert, PageHeader, Panel, Status, TableWrap, Td, Th, type Tone } from "@/components/ui";
import { formatMinor } from "@/lib/rules/money";
import { fmtDateTime, titleCase } from "@/lib/format";

const TONE: Record<string, Tone> = { sent: "info", partially_received: "warn", received: "ok", cancelled: "neutral" };

export default async function OrderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "purchasing", { module: "purchasing", what: "purchasing" }); if (denied) return denied;
  const { id } = await params; const { ok, err } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await asUser(ctx.user.id, async (db) => {
    const o = await db.one<{ id: string; number: string; status: string; total_minor: string; created_at: string; branch: string; supplier: string; requisition_id: string }>("select o.*, b.name branch, s.name supplier from purchase_orders o join branches b on b.id = o.branch_id join suppliers s on s.id = o.supplier_id where o.id = $1", [id]);
    if (!o) return null;
    return { o,
      lines: await db.q<{ id: string; name: string; qty_ordered: string; qty_received: string; unit_price_minor: string }>("select l.id, i.name, l.qty_ordered, l.qty_received, l.unit_price_minor from po_lines l join catalog_items i on i.id = l.item_id where l.po_id = $1 order by i.name", [id]),
      receipts: await db.q<{ id: string; created_at: string; who: string | null; note: string }>("select g.id, g.created_at, g.note, coalesce(nullif(p.display_name,''), p.email) who from goods_receipts g left join profiles p on p.id = g.received_by where g.po_id = $1 order by g.created_at", [id]),
      discrepancies: await db.q<{ name: string; qty_rejected: string; discrepancy_note: string; created_at: string }>("select i.name, rl.qty_rejected, rl.discrepancy_note, g.created_at from receipt_lines rl join goods_receipts g on g.id = rl.receipt_id join po_lines l on l.id = rl.po_line_id join catalog_items i on i.id = l.item_id where g.po_id = $1 and rl.qty_rejected > 0", [id]) };
  });
  if (!d) notFound(); const { o } = d; const money = (n: number | string) => formatMinor(Number(n), ctx.company.currency);
  const open = o.status === "sent" || o.status === "partially_received";
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-1 text-sm text-muted"><Link href="/purchasing?tab=orders" className="text-brand">Orders</Link> / {o.number}</nav>
      <PageHeader title={o.number} description={`${o.supplier} → ${o.branch} · ${money(o.total_minor)} · ordered ${fmtDateTime(o.created_at, ctx.company.timezone)}`} actions={<Status tone={TONE[o.status] ?? "neutral"}>{titleCase(o.status)}</Status>} />
      <Flash ok={ok} err={err} />
      {d.discrepancies.length > 0 && <div className="mb-2 max-w-prose"><Alert tone="warn" title="Discrepancies recorded"><ul className="list-disc pl-3">{d.discrepancies.map((x, i) => <li key={i}>{x.name}: {Number(x.qty_rejected)} rejected, {x.discrepancy_note}</li>)}</ul></Alert></div>}
      {open && ctx.has("create", "purchasing") ? (
        <form action={receiveGoods} className="space-y-2"><input type="hidden" name="po_id" value={id} />
          <TableWrap label="Goods receipt"><caption className="sr-only">Enter what arrived. Leave a line blank if nothing arrived for it.</caption>
            <thead><tr><Th>Item</Th><Th num>Ordered</Th><Th num>Already received</Th><Th num>Arrived now</Th><Th num>Rejected</Th><Th>Reason if rejected</Th></tr></thead>
            <tbody>{d.lines.map((l) => { const left = Number(l.qty_ordered) - Number(l.qty_received); return (
              <tr key={l.id}><Td>{l.name}</Td><Td num>{Number(l.qty_ordered)}</Td><Td num>{Number(l.qty_received)}</Td>
                <Td num>{left > 0 ? <input aria-label={`Arrived now: ${l.name}`} name={`recv:${l.id}`} type="number" min="0" max={left} step="0.001" className="num min-h-touch w-[6rem] rounded-md border border-line-strong bg-surface px-1.5 text-sm" /> : <Status tone="ok">Complete</Status>}</Td>
                <Td num>{left > 0 && <input aria-label={`Rejected: ${l.name}`} name={`rej:${l.id}`} type="number" min="0" step="0.001" className="num min-h-touch w-[6rem] rounded-md border border-line-strong bg-surface px-1.5 text-sm" />}</Td>
                <Td>{left > 0 && <input aria-label={`Reason: ${l.name}`} name={`note:${l.id}`} placeholder="Damaged, wrong item…" className="min-h-touch w-full rounded-md border border-line-strong bg-surface px-1.5 text-sm" />}</Td></tr>); })}</tbody></TableWrap>
          <div className="max-w-form"><Field label="Delivery note" name="note" /></div>
          <SubmitButton pending="Recording…">Record receipt</SubmitButton></form>
      ) : (
        <TableWrap label="Order lines"><thead><tr><Th>Item</Th><Th num>Ordered</Th><Th num>Received</Th><Th num>Unit price</Th></tr></thead><tbody>{d.lines.map((l) => <tr key={l.id}><Td>{l.name}</Td><Td num>{Number(l.qty_ordered)}</Td><Td num>{Number(l.qty_received)}</Td><Td num>{money(l.unit_price_minor)}</Td></tr>)}</tbody></TableWrap>)}
      <div className="mt-3 max-w-prose"><Panel title="Receipts">{d.receipts.length === 0 ? <p className="text-sm text-muted">Nothing received yet.</p> : <ul className="space-y-0.5 text-sm">{d.receipts.map((g) => <li key={g.id}>{fmtDateTime(g.created_at, ctx.company.timezone)} · {g.who ?? "—"}{g.note ? ` — ${g.note}` : ""}</li>)}</ul>}</Panel></div>
    </>
  );
}
