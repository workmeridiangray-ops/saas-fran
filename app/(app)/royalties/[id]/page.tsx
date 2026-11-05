import Link from "next/link";
import { notFound } from "next/navigation";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { moveStatement } from "../actions";
import { Field } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { Alert, PageHeader, Panel, Status, TableWrap, Td, Th, type Tone } from "@/components/ui";
import { formatMinor } from "@/lib/rules/money";
import { fmtDate, fmtDateTime, titleCase } from "@/lib/format";

const TONE: Record<string, Tone> = { draft: "neutral", in_review: "info", approved: "ok", issued: "warn", void: "neutral" };

export default async function StatementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "royalties", { module: "royalties", what: "royalty statements" }); if (denied) return denied;
  const { id } = await params; const { ok, err } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await asUser(ctx.user.id, async (db) => {
    const s = await db.one<{ id: string; number: string | null; period: string; status: string; base_minor: string; royalty_minor: string; minimum_applied: boolean; due_date: string | null; review_reason: string | null; issued_at: string | null; rule_version: number; rule_type: string; rate_bp: number | null; minimum_minor: string | null; fixed_minor: string | null; branch: string; partner: string; preparer: string | null; approver: string | null; prepared_by: string; outstanding: string }>(
      `select s.id, s.number, s.period::text, s.status, s.base_minor, s.royalty_minor, s.minimum_applied, s.due_date::text, s.review_reason, s.issued_at, s.rule_version, r.type rule_type, r.rate_bp, r.minimum_minor::text, r.fixed_minor::text, b.name branch, p.name partner, s.prepared_by,
              coalesce(nullif(pp.display_name,''), pp.email) preparer, coalesce(nullif(pa.display_name,''), pa.email) approver, case when s.status = 'issued' then app.statement_outstanding(s.id) else s.royalty_minor end::text outstanding
         from statements s join royalty_rules r on r.id = s.rule_id join branches b on b.id = s.branch_id join franchise_partners p on p.id = s.partner_id left join profiles pp on pp.id = s.prepared_by left join profiles pa on pa.id = s.approved_by where s.id = $1`, [id]);
    const solo = Number((await db.one<{ n: string }>("select count(*) n from memberships where company_id = $1 and status = 'active'", [ctx.companyId]))!.n) < 2;
    return s ? { solo, s, alloc: await db.q<{ amount_minor: string; received_on: string; reference: string }>("select a.amount_minor, pp.received_on::text, pp.reference from payment_allocations a join partner_payments pp on pp.id = a.payment_id where a.statement_id = $1 order by pp.received_on", [id]) } : null;
  });
  if (!d) notFound(); const { s } = d; const m = (n: number | string) => formatMinor(Number(n), ctx.company.currency);
  const approve = ctx.has("approve", "royalties") && (s.prepared_by !== ctx.user.id || d.solo);   // a different person must approve, unless there is only one member
  const act = (to: string, label: string, variant: "primary" | "secondary" | "danger" = "primary", extra?: React.ReactNode) => <form key={to} action={moveStatement} className="flex flex-wrap items-end gap-1"><input type="hidden" name="id" value={id} /><input type="hidden" name="to" value={to} />{extra}<SubmitButton variant={variant} pending="…">{label}</SubmitButton></form>;
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-1 text-sm text-muted"><Link href="/royalties" className="text-brand">Sales & royalties</Link> / {s.number ?? "Draft statement"}</nav>
      <PageHeader title={`${s.partner} · ${s.period.slice(0, 7)}`} description={`${s.branch}${s.number ? ` · ${s.number}` : ""}`} actions={<Status tone={TONE[s.status] ?? "neutral"}>{titleCase(s.status)}</Status>} />
      <Flash ok={ok} err={err} />
      {s.review_reason && s.status === "draft" && <div className="mb-2 max-w-prose"><Alert tone="warn" title="Sent back for correction">{s.review_reason}</Alert></div>}
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Calculation"><dl className="space-y-1 text-sm"><div className="flex justify-between"><dt className="text-muted">Net sales (after exclusions and adjustments)</dt><dd className="num">{m(s.base_minor)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted">Rule v{s.rule_version}</dt><dd>{s.rule_type === "fixed" ? `Fixed ${m(s.fixed_minor!)}` : `${(s.rate_bp! / 100).toFixed(2)}%${s.rule_type === "percent_with_minimum" ? `, minimum ${m(s.minimum_minor!)}` : ""}`}</dd></div>
          {s.minimum_applied && <p className="text-xs text-warn">The minimum guarantee applied.</p>}
          <div className="flex justify-between border-t border-line pt-1 text-base font-semibold"><dt>Royalty due</dt><dd className="num">{m(s.royalty_minor)}</dd></div></dl>
          <p className="mt-2 text-xs text-muted">Prepared by {s.preparer ?? "—"}{s.approver ? ` · approved by ${s.approver}` : ""}{s.issued_at ? ` · issued ${fmtDateTime(s.issued_at, ctx.company.timezone)}` : ""}</p></Panel>
        <Panel title="Workflow">
          <div className="space-y-2">
            {s.status === "draft" && <>{act("in_review", "Send for review")}{act("void", "Void draft", "danger")}</>}
            {s.status === "in_review" && (approve ? <>{act("approved", "Approve")}{act("draft", "Send back with a reason", "secondary", <Field label="What needs fixing" name="reason" required />)}</> : <p className="text-sm text-muted">Waiting for someone with approval authority. {s.prepared_by === ctx.user.id ? "You prepared this, so someone else must approve it." : ""}</p>)}
            {s.status === "approved" && approve && <>{act("issued", "Issue to partner", "primary", <Field label="Payment terms (days)" name="days" type="number" defaultValue="14" min={1} max={120} />)}{act("void", "Void", "danger")}</>}
            {s.status === "issued" && <p className="text-sm">Issued statements can't be changed. Corrections are made with an adjustment on the next statement.</p>}
          </div></Panel>
        {s.status === "issued" && <Panel title="Payment status" className="lg:col-span-2"><p className="text-sm">Due {fmtDate(s.due_date)} · outstanding <strong className="tabular-nums">{m(s.outstanding)}</strong></p>
          {d.alloc.length > 0 && <TableWrap label="Payments applied"><thead><tr><Th>Received</Th><Th>Reference</Th><Th num>Applied</Th></tr></thead><tbody>{d.alloc.map((a, i) => <tr key={i}><Td>{fmtDate(a.received_on)}</Td><Td>{a.reference || "—"}</Td><Td num>{m(a.amount_minor)}</Td></tr>)}</tbody></TableWrap>}
          {Number(s.outstanding) > 0 && <p className="mt-1 text-sm"><Link className="font-medium text-brand" href="/royalties?tab=payments">Record a payment</Link></p>}</Panel>}
      </div>
    </>
  );
}
