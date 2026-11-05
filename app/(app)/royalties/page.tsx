import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { addRule, prepareStatement, recordPayment, submitSales } from "./actions";
import { branchOptions } from "@/lib/data/pickers";
import { Field, FormCard, Select } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { Alert, PageHeader, Panel, StateMessage, Status, TableWrap, Td, Th, type Tone } from "@/components/ui";
import { formatMinor } from "@/lib/rules/money";
import { fmtDate, titleCase } from "@/lib/format";

export const metadata = { title: "Sales & royalties" };
const TONE: Record<string, Tone> = { draft: "neutral", in_review: "info", approved: "ok", issued: "warn", void: "neutral" };

export default async function Royalties({ searchParams }: { searchParams: Promise<{ tab?: string; ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "royalties", { module: "royalties", what: "sales and royalties" }); if (denied) return denied;
  const { tab = "statements", ok, err } = await searchParams;
  const m = (n: number | string) => formatMinor(Number(n), ctx.company.currency);
  const d = await asUser(ctx.user.id, async (db) => ({
    branches: await branchOptions(db, ctx.companyId),
    partners: await db.q<{ id: string; name: string }>("select id, name from franchise_partners where company_id = $1 and status = 'active' order by name", [ctx.companyId]),
    rules: await db.q<{ id: string; partner: string | null; version: number; type: string; rate_bp: number | null; fixed_minor: string | null; minimum_minor: string | null; effective_from: string; effective_to: string | null }>("select r.id, p.name partner, r.version, r.type, r.rate_bp, r.fixed_minor::text, r.minimum_minor::text, r.effective_from::text, r.effective_to::text from royalty_rules r left join franchise_partners p on p.id = r.partner_id where r.company_id = $1 order by p.name nulls first, r.effective_from desc", [ctx.companyId]),
    sales: await db.q<{ id: string; branch: string; period: string; gross_minor: string; exclusions_minor: string; adjustments_minor: string; partner: string | null; stmt: string | null }>("select s.id, b.name branch, s.period::text, s.gross_minor, s.exclusions_minor, s.adjustments_minor, p.name partner, (select id::text from statements t where t.branch_id = s.branch_id and t.period = s.period and t.status <> 'void') stmt from sales_reports s join branches b on b.id = s.branch_id left join franchise_partners p on p.id = b.partner_id where s.company_id = $1 order by s.period desc, b.name limit 200", [ctx.companyId]),
    statements: await db.q<{ id: string; number: string | null; period: string; status: string; royalty_minor: string; due_date: string | null; branch: string; partner: string; outstanding: string }>("select s.id, s.number, s.period::text, s.status, s.royalty_minor, s.due_date::text, b.name branch, p.name partner, case when s.status = 'issued' then app.statement_outstanding(s.id) else s.royalty_minor end::text outstanding from statements s join branches b on b.id = s.branch_id join franchise_partners p on p.id = s.partner_id where s.company_id = $1 order by s.period desc, b.name limit 200", [ctx.companyId]),
    payments: await db.q<{ id: string; partner: string; amount_minor: string; received_on: string; reference: string; allocated: string }>("select pp.id, p.name partner, pp.amount_minor, pp.received_on::text, pp.reference, coalesce((select sum(amount_minor) from payment_allocations a where a.payment_id = pp.id),0)::text allocated from partner_payments pp join franchise_partners p on p.id = pp.partner_id where pp.company_id = $1 order by pp.received_on desc limit 100", [ctx.companyId]),
  }));
  const today = new Date().toISOString().slice(0, 10);
  const aged = { current: 0, d30: 0, d60: 0, d90: 0 };
  for (const s of d.statements) if (s.status === "issued" && Number(s.outstanding) > 0 && s.due_date) {
    const late = Math.floor((new Date(today).getTime() - new Date(s.due_date).getTime()) / 86_400_000);
    aged[late <= 0 ? "current" : late <= 30 ? "d30" : late <= 60 ? "d60" : "d90"] += Number(s.outstanding);
  }
  const tabLink = (k: string, l: string) => <Link key={k} href={`/royalties?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={`inline-flex min-h-touch items-center rounded-md border px-2 text-sm ${tab === k ? "border-brand bg-brand-soft font-medium" : "border-line bg-surface hover:bg-sunken"}`}>{l}</Link>;
  const ruleText = (r: (typeof d.rules)[number]) => r.type === "fixed" ? `Fixed ${m(r.fixed_minor!)}` : r.type === "percent" ? `${(r.rate_bp! / 100).toFixed(2)}% of net sales` : `${(r.rate_bp! / 100).toFixed(2)}% of net sales, minimum ${m(r.minimum_minor!)}`;
  const month = new Date().toISOString().slice(0, 7);
  return (
    <>
      <PageHeader title="Sales & royalties" description="Franchise partners pay your brand. This is separate from your own SaaS subscription." /><Flash ok={ok} err={err} />
      <div className="mb-2 flex flex-wrap gap-1">{tabLink("statements", "Statements")}{tabLink("sales", "Sales reports")}{tabLink("payments", "Payments")}{tabLink("rules", "Rules")}</div>
      {tab === "statements" && (<>
        <div className="mb-2 grid gap-2 sm:grid-cols-4">{[["Not yet due", aged.current], ["1–30 days late", aged.d30], ["31–60 days late", aged.d60], ["Over 60 days late", aged.d90]].map(([l, v]) => <Panel key={String(l)}><p className="text-xs text-muted">{l}</p><p className="num !text-left text-xl font-semibold">{m(Number(v))}</p></Panel>)}</div>
        {d.statements.length === 0 ? <StateMessage title="No statements yet">Submit a franchise branch's monthly sales, then draft its royalty statement from the Sales reports tab.</StateMessage> : (
          <TableWrap label="Statements"><thead><tr><Th>Statement</Th><Th>Partner · branch</Th><Th>Period</Th><Th num>Royalty</Th><Th num>Outstanding</Th><Th>Due</Th><Th>Status</Th></tr></thead>
            <tbody>{d.statements.map((s) => { const late = s.status === "issued" && Number(s.outstanding) > 0 && s.due_date && s.due_date < today; return <tr key={s.id}><Td><Link className="font-medium text-brand" href={`/royalties/${s.id}`}>{s.number ?? "Draft"}</Link></Td><Td>{s.partner}<span className="block text-xs text-muted">{s.branch}</span></Td><Td>{s.period.slice(0, 7)}</Td><Td num>{m(s.royalty_minor)}</Td><Td num>{s.status === "issued" ? m(s.outstanding) : "—"}</Td><Td>{s.due_date ? fmtDate(s.due_date) : "—"}</Td><Td><Status tone={TONE[s.status] ?? "neutral"}>{titleCase(s.status)}</Status>{late && <> <Status tone="danger">Overdue</Status></>}{s.status === "issued" && Number(s.outstanding) === 0 && <> <Status tone="ok">Paid</Status></>}</Td></tr>; })}</tbody></TableWrap>)}
      </>)}
      {tab === "sales" && (<div className="space-y-3">
        {d.sales.length === 0 ? <StateMessage title="No sales reports yet">Each branch reports gross sales per month. Franchise branches' reports become royalty statements.</StateMessage> : (
          <TableWrap label="Sales reports"><thead><tr><Th>Branch</Th><Th>Month</Th><Th num>Gross</Th><Th num>Exclusions</Th><Th num>Adjustments</Th><Th>Statement</Th></tr></thead>
            <tbody>{d.sales.map((s) => <tr key={s.id}><Td>{s.branch}{s.partner && <span className="block text-xs text-muted">{s.partner}</span>}</Td><Td>{s.period.slice(0, 7)}</Td><Td num>{m(s.gross_minor)}</Td><Td num>{m(s.exclusions_minor)}</Td><Td num>{m(s.adjustments_minor)}</Td>
              <Td>{s.stmt ? <Link className="font-medium text-brand" href={`/royalties/${s.stmt}`}>Open</Link> : s.partner && ctx.has("create", "royalties") ? <form action={prepareStatement}><input type="hidden" name="sales_id" value={s.id} /><SubmitButton variant="secondary" pending="Drafting…">Draft statement</SubmitButton></form> : <span className="text-muted">{s.partner ? "—" : "No royalty"}</span>}</Td></tr>)}</tbody></TableWrap>)}
        {ctx.has("create", "sales") && d.branches.length > 0 && <FormCard title="Submit monthly sales"><form action={submitSales} className="space-y-2"><Select label="Branch" name="branch_id" options={d.branches.map((b) => ({ value: b.id, label: b.name }))} /><Field label="Month" name="period" type="month" defaultValue={month} required />
          <div className="grid gap-2 sm:grid-cols-3"><Field label={`Gross sales (${ctx.company.currency})`} name="gross" inputMode="decimal" required /><Field label="Exclusions" name="exclusions" inputMode="decimal" defaultValue="0" hint="Taxes, refunds excluded by agreement" /><Field label="Adjustments (+/−)" name="adjustments" inputMode="decimal" defaultValue="0" /></div><Field label="Note" name="note" /><SubmitButton pending="Submitting…">Submit sales</SubmitButton></form></FormCard>}
      </div>)}
      {tab === "payments" && (<div className="space-y-3">
        {d.payments.length === 0 ? <StateMessage title="No payments recorded">Record money received from a franchise partner. It is applied to their oldest issued statements first.</StateMessage> : (
          <TableWrap label="Payments"><thead><tr><Th>Partner</Th><Th>Received</Th><Th>Reference</Th><Th num>Amount</Th><Th num>Applied</Th><Th num>Unapplied</Th></tr></thead>
            <tbody>{d.payments.map((p) => <tr key={p.id}><Td>{p.partner}</Td><Td>{fmtDate(p.received_on)}</Td><Td>{p.reference || "—"}</Td><Td num>{m(p.amount_minor)}</Td><Td num>{m(p.allocated)}</Td><Td num>{m(Number(p.amount_minor) - Number(p.allocated))}</Td></tr>)}</tbody></TableWrap>)}
        {ctx.has("pay", "royalties") && d.partners.length > 0 && <FormCard title="Record a payment"><form action={recordPayment} className="space-y-2"><Select label="Partner" name="partner_id" options={d.partners.map((p) => ({ value: p.id, label: p.name }))} /><div className="grid gap-2 sm:grid-cols-2"><Field label={`Amount (${ctx.company.currency})`} name="amount" inputMode="decimal" required /><Field label="Received on" name="received_on" type="date" defaultValue={today} required /></div><Field label="Reference" name="reference" /><SubmitButton pending="Recording…">Record and apply</SubmitButton></form></FormCard>}
      </div>)}
      {tab === "rules" && (<div className="grid gap-3 lg:grid-cols-2">
        <Panel title="Rules">{d.rules.length === 0 ? <p className="text-sm text-muted">No rules yet. Add a company-wide default, or one per partner.</p> : <ul className="divide-y divide-line">{d.rules.map((r) => <li key={r.id} className="py-1 text-sm"><span className="font-medium">{r.partner ?? "Company default"}</span> <span className="text-xs text-muted">v{r.version}</span><span className="block text-xs text-muted">{ruleText(r)} · {fmtDate(r.effective_from)} to {r.effective_to ? fmtDate(r.effective_to) : "open-ended"}</span></li>)}</ul>}
          <p className="mt-1 text-xs text-muted">A statement keeps the rule version it was calculated with.</p></Panel>
        {ctx.has("configure", "royalties") ? <FormCard title="Add a rule"><form action={addRule} className="space-y-2"><Select label="Applies to" name="partner_id" placeholder="Company default" options={d.partners.map((p) => ({ value: p.id, label: p.name }))} />
          <Select label="Type" name="type" options={[{ value: "percent", label: "Percentage of net sales" }, { value: "percent_with_minimum", label: "Percentage with a minimum guarantee" }, { value: "fixed", label: "Fixed monthly fee" }]} />
          <div className="grid gap-2 sm:grid-cols-3"><Field label="Rate %" name="rate" inputMode="decimal" /><Field label="Minimum" name="minimum" inputMode="decimal" /><Field label="Fixed fee" name="fixed" inputMode="decimal" /></div>
          <div className="grid gap-2 sm:grid-cols-2"><Field label="Effective from" name="from" type="date" required /><Field label="Until (optional)" name="to" type="date" /></div><SubmitButton pending="Saving…">Add rule</SubmitButton></form></FormCard> : <Alert tone="info" title="You can view rules but not change them" />}
      </div>)}
    </>
  );
}
