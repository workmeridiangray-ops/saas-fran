import Link from "next/link";
import { notFound } from "next/navigation";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { markFeePaid, renewAgreement, sendAgreementForReview, signAgreement, terminateAgreement, transferAgreement, waiveFee } from "../../actions";
import { Attachments } from "@/components/records/Attachments";
import { Field, FormCard, Select } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { Alert, PageHeader, Panel, Status, TableWrap, Td, Th, type Tone } from "@/components/ui";
import { daysUntil, nextStart } from "@/lib/rules/franchise";
import { formatMinor } from "@/lib/rules/money";
import { fmtDate, titleCase } from "@/lib/format";

const TONE: Record<string, Tone> = { draft: "neutral", in_review: "info", signed: "info", active: "ok", expired: "neutral", terminated: "danger" };

export default async function AgreementPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "franchise", { module: "franchise", what: "agreements" }); if (denied) return denied;
  const { id } = await params; const { ok, err } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await asUser(ctx.user.id, async (db) => {
    const g = await db.one<{ id: string; number: string; version: number; status: string; start_date: string; end_date: string; reminder_days: number; franchise_fee_minor: string; deposit_minor: string; signed_on: string | null; terminated_on: string | null; termination_reason: string | null; partner: string; partner_id: string; territory: string; renewal_of: string | null }>(
      "select g.id, g.number, g.version, g.status, g.start_date::text, g.end_date::text, g.reminder_days, g.franchise_fee_minor, g.deposit_minor, g.signed_on::text, g.terminated_on::text, g.termination_reason, g.renewal_of, p.name partner, p.id partner_id, t.name territory from agreements g join franchise_partners p on p.id = g.partner_id join territories t on t.id = g.territory_id where g.id = $1", [id]);
    return g ? { g, fees: await db.q<{ id: string; kind: string; due_on: string; amount_minor: string; status: string; paid_on: string | null; note: string | null }>("select id, kind, due_on::text, amount_minor, status, paid_on::text, note from agreement_fees where agreement_id = $1 order by due_on, kind", [id]),
      branches: await db.q<{ id: string; name: string; status: string }>("select id, name, status from branches where partner_id = $1 and status <> 'closed' order by name", [g.partner_id]),
      others: await db.q<{ id: string; name: string }>("select id, name from franchise_partners where company_id = $1 and id <> $2 and stage in ('approved','active') order by name", [ctx.companyId, g.partner_id]),
      versions: await db.q<{ id: string; number: string; version: number; status: string }>("select id, number, version, status from agreements where (renewal_of = $1 or id = (select renewal_of from agreements where id = $1)) order by version", [id]) } : null;
  });
  if (!d) notFound(); const { g } = d; const today = new Date().toISOString().slice(0, 10); const approve = ctx.has("approve", "franchise"); const edit = ctx.has("edit", "franchise");
  const m = (n: number | string) => formatMinor(Number(n), ctx.company.currency); const left = daysUntil(g.end_date, today);
  const act = (a: (f: FormData) => Promise<never>, label: string, variant: "primary" | "secondary" | "danger" = "primary") => <form action={a}><input type="hidden" name="id" value={id} /><SubmitButton variant={variant} pending="…">{label}</SubmitButton></form>;
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-1 text-sm text-muted"><Link href="/franchise?tab=agreements" className="text-brand">Agreements</Link> / {g.number}</nav>
      <PageHeader title={`${g.partner}: ${g.number}`} description={`${g.territory} · version ${g.version} · ${fmtDate(g.start_date)} to ${fmtDate(g.end_date)}`} actions={<Status tone={TONE[g.status] ?? "neutral"}>{titleCase(g.status)}</Status>} />
      <Flash ok={ok} err={err} />
      {g.status === "active" && left <= g.reminder_days && <div className="mb-2 max-w-prose"><Alert tone="warn" title={`Ends in ${left} day${left === 1 ? "" : "s"}`}>Start the renewal below, or plan the exit.</Alert></div>}
      {g.status === "terminated" && <div className="mb-2 max-w-prose"><Alert tone="danger" title={`Terminated ${fmtDate(g.terminated_on)}`}>{g.termination_reason}</Alert></div>}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          <Panel title="Terms"><dl className="grid grid-cols-2 gap-1 text-sm"><dt className="text-muted">Franchise fee</dt><dd className="num">{m(g.franchise_fee_minor)}</dd><dt className="text-muted">Deposit</dt><dd className="num">{m(g.deposit_minor)}</dd><dt className="text-muted">Signed</dt><dd>{g.signed_on ? fmtDate(g.signed_on) : "—"}</dd><dt className="text-muted">Renewal reminder</dt><dd>{g.reminder_days} days before the end</dd></dl>
            <p className="mt-1 text-xs text-muted">Signed terms can't be edited. Changes are a new version.</p>
            {d.versions.length > 0 && <p className="mt-1 text-sm">Versions: {d.versions.map((v) => <Link key={v.id} className="mr-1 font-medium text-brand" href={`/franchise/agreements/${v.id}`}>{v.number} v{v.version} ({v.status})</Link>)}</p>}</Panel>
          <Panel title="Fees due to the brand"><p className="mb-1 text-xs text-muted">Separate from your own subscription and from monthly royalties.</p>
            <TableWrap label="Fee schedule"><thead><tr><Th>Fee</Th><Th>Due</Th><Th num>Amount</Th><Th>Status</Th><Th><span className="sr-only">Record</span></Th></tr></thead>
              <tbody>{d.fees.map((x) => <tr key={x.id}><Td>{titleCase(x.kind)}</Td><Td>{fmtDate(x.due_on)}</Td><Td num>{m(x.amount_minor)}</Td><Td><Status tone={x.status === "paid" ? "ok" : x.status === "waived" ? "neutral" : new Date(x.due_on) < new Date() ? "danger" : "warn"}>{titleCase(x.status)}</Status>{x.note && <span className="block text-xs text-muted">{x.note}</span>}</Td>
                <Td>{x.status === "due" && ctx.has("pay", "royalties") && <form className="flex flex-wrap gap-0.5"><input type="hidden" name="id" value={x.id} /><input type="hidden" name="agreement_id" value={id} /><input type="date" name="paid_on" defaultValue={today} aria-label="Date paid" className="min-h-touch rounded-md border border-line-strong bg-surface px-1 text-xs" /><input name="note" placeholder="Reason if waived" aria-label="Reason if waived" className="min-h-touch w-[8rem] rounded-md border border-line-strong bg-surface px-1 text-xs" /><button formAction={markFeePaid} className="inline-flex min-h-touch items-center rounded-md border border-line-strong px-2 text-xs font-medium">Paid</button><button formAction={waiveFee} className="inline-flex min-h-touch items-center rounded-md border border-line-strong px-2 text-xs font-medium">Waive</button></form>}</Td></tr>)}</tbody></TableWrap></Panel>
          <Attachments ctx={ctx} table="agreements" id={id} back={`/franchise/agreements/${id}`} title="Signed copy and amendments" canUpload={g.status !== "terminated"} />
        </div>
        <div className="space-y-2">
          <Panel title="Actions"><div className="flex flex-wrap gap-1">{g.status === "draft" && edit && act(sendAgreementForReview, "Send for review", "secondary")}{["draft", "in_review"].includes(g.status) && approve && act(signAgreement, "Record as signed")}</div>
            {g.status === "active" && edit && <form action={renewAgreement} className="mt-2 flex flex-wrap items-end gap-1"><input type="hidden" name="id" value={id} /><Field label={`Renew from ${fmtDate(nextStart(g.end_date))} until`} name="end" type="date" required /><SubmitButton variant="secondary" pending="Drafting…">Draft renewal</SubmitButton></form>}
            {["draft", "in_review"].includes(g.status) && <p className="mt-1 text-sm text-muted">Signing assigns the territory and makes {g.partner} an active partner from the start date.</p>}</Panel>
          {g.status === "active" && approve && (<>
            <FormCard title="Transfer ownership"><form action={transferAgreement} className="space-y-2"><input type="hidden" name="id" value={id} /><Select label="New partner" name="partner_id" options={d.others.map((p) => ({ value: p.id, label: p.name }))} /><Field label="Reason" name="reason" required /><SubmitButton variant="secondary" pending="Transferring…">Transfer agreement and branches</SubmitButton></form></FormCard>
            <FormCard title="Terminate"><form action={terminateAgreement} className="space-y-2"><input type="hidden" name="id" value={id} /><Field label="Reason (recorded permanently)" name="reason" required /><SubmitButton variant="danger" pending="Terminating…">Terminate agreement</SubmitButton></form></FormCard></>)}
          {(g.status === "terminated" || g.status === "expired") && d.branches.length > 0 && <Panel title="Branches still operating"><p className="mb-1 text-sm">These need to be transferred, or closed with the usual outstanding-work review:</p><ul className="divide-y divide-line">{d.branches.map((b) => <li key={b.id} className="flex justify-between py-1 text-sm"><Link className="font-medium text-brand" href={`/branches/${b.id}`}>{b.name}</Link><Link className="text-brand" href={`/branches/${b.id}/close`}>Review and close</Link></li>)}</ul></Panel>}
        </div>
      </div>
    </>
  );
}
