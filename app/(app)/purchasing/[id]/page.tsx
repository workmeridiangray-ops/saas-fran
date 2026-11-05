import Link from "next/link";
import { notFound } from "next/navigation";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { cancelRequisition, placeOrder, submitRequisition } from "../actions";
import { Attachments } from "@/components/records/Attachments";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { PageHeader, Panel, Status, TableWrap, Td, Th, type Tone } from "@/components/ui";
import { formatMinor } from "@/lib/rules/money";
import { lineTotalMinor } from "@/lib/rules/purchase";
import { fmtDateTime, titleCase } from "@/lib/format";

const TONE: Record<string, Tone> = { draft: "neutral", submitted: "info", approved: "ok", rejected: "danger", ordered: "info", closed: "ok", cancelled: "neutral" };

export default async function RequisitionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "purchasing", { module: "purchasing", what: "purchasing" }); if (denied) return denied;
  const { id } = await params; const { ok, err } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await asUser(ctx.user.id, async (db) => {
    const r = await db.one<{ id: string; number: string; status: string; total_minor: string; note: string; created_at: string; branch: string; supplier: string; requester: string | null; requester_id: string }>(
      "select r.*, b.name branch, s.name supplier, coalesce(nullif(p.display_name,''), p.email) requester from requisitions r join branches b on b.id = r.branch_id join suppliers s on s.id = r.supplier_id left join profiles p on p.id = r.requester_id where r.id = $1", [id]);
    if (!r) return null;
    return { r,
      lines: await db.q<{ name: string; sku: string; qty: string; unit_price_minor: string; tax_bp: number }>("select i.name, i.sku, l.qty, l.unit_price_minor, i.tax_bp from requisition_lines l join catalog_items i on i.id = l.item_id where l.requisition_id = $1", [id]),
      approval: await db.one<{ id: string; status: string }>("select id, status from approval_requests where subject_id = $1 and kind = 'purchase' order by created_at desc limit 1", [id]),
      po: await db.one<{ id: string; number: string }>("select id, number from purchase_orders where requisition_id = $1", [id]) };
  });
  if (!d) notFound(); const { r } = d; const money = (n: number | string) => formatMinor(Number(n), ctx.company.currency);
  const post = (action: (f: FormData) => Promise<never>, label: string, variant: "primary" | "secondary" | "danger" = "primary") => <form action={action}><input type="hidden" name="id" value={id} /><SubmitButton variant={variant} pending="…">{label}</SubmitButton></form>;
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-1 text-sm text-muted"><Link href="/purchasing" className="text-brand">Purchasing</Link> / {r.number}</nav>
      <PageHeader title={r.number} description={`${r.supplier} → ${r.branch} · requested by ${r.requester ?? "—"} on ${fmtDateTime(r.created_at, ctx.company.timezone)}`} actions={<Status tone={TONE[r.status] ?? "neutral"}>{titleCase(r.status)}</Status>} />
      <Flash ok={ok} err={err} />
      <div className="mb-2 flex flex-wrap gap-1">
        {(r.status === "draft" || r.status === "rejected") && r.requester_id === ctx.user.id && <>{post(submitRequisition, r.status === "rejected" ? "Resubmit for approval" : "Submit for approval")}{post(cancelRequisition, "Cancel requisition", "danger")}</>}
        {r.status === "approved" && ctx.has("create", "purchasing") && post(placeOrder, "Place order")}
        {d.approval && <Link className="inline-flex min-h-touch items-center text-sm font-medium text-brand" href={`/approvals?tab=decided&open=${d.approval.id}`}>View approval</Link>}
        {d.po && <Link className="inline-flex min-h-touch items-center text-sm font-medium text-brand" href={`/purchasing/orders/${d.po.id}`}>Order {d.po.number}</Link>}
      </div>
      <TableWrap label="Requested items"><thead><tr><Th>Item</Th><Th num>Qty</Th><Th num>Unit price</Th><Th num>Tax</Th><Th num>Line total</Th></tr></thead>
        <tbody>{d.lines.map((l, i) => <tr key={i}><Td>{l.name}<span className="block text-xs text-muted">{l.sku}</span></Td><Td num>{Number(l.qty)}</Td><Td num>{money(l.unit_price_minor)}</Td><Td num>{(l.tax_bp / 100).toFixed(1)}%</Td><Td num>{money(lineTotalMinor(Number(l.qty), Number(l.unit_price_minor), l.tax_bp))}</Td></tr>)}
          <tr><Td className="font-semibold">Total</Td><Td /><Td /><Td /><Td num className="font-semibold">{money(r.total_minor)}</Td></tr></tbody></TableWrap>
      {r.note && <p className="mt-1 text-sm"><span className="text-xs text-muted">Note</span><br />{r.note}</p>}
      <div className="mt-3 max-w-prose"><Attachments ctx={ctx} table="requisitions" id={id} back={`/purchasing/${id}`} title="Quotes and files" /></div>
    </>
  );
}
