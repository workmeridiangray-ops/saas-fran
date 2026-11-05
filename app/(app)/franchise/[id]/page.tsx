import Link from "next/link";
import { notFound } from "next/navigation";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { addCheck, approveApplicant, createAgreement, moveApplicant, rejectApplicant, reserve, saveProposal, setCheck, withdrawApplicant } from "../actions";
import { Attachments } from "@/components/records/Attachments";
import { Field, FormCard, Select, TextArea } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { Alert, PageHeader, Panel, Status } from "@/components/ui";
import { STAGE_LABEL, approvalBlockers, moves, type Stage } from "@/lib/rules/franchise";
import { formatMinor } from "@/lib/rules/money";
import { fmtDate, titleCase } from "@/lib/format";

export default async function ApplicantPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "franchise", { module: "franchise", what: "the franchise pipeline" }); if (denied) return denied;
  const { id } = await params; const { ok, err } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await asUser(ctx.user.id, async (db) => {
    const a = await db.one<{ id: string; name: string; email: string | null; phone: string | null; source: string; stage: Stage; territory_id: string | null; territory: string | null; reserved_until: string | null; notes: string; proposal_fee_minor: string | null; proposal_note: string; decision_reason: string | null; partner_id: string | null; created_at: string }>(
      "select a.*, t.name territory, t.reserved_until::text from applicants a left join territories t on t.id = a.territory_id where a.id = $1", [id]);
    return a ? { a, checks: await db.q<{ id: string; kind: "qualification" | "document"; label: string; status: "open" | "received" | "verified" | "rejected"; note: string | null }>("select id, kind, label, status, note from applicant_checks where applicant_id = $1 order by kind, label", [id]),
      free: await db.q<{ id: string; name: string }>("select id, name from territories where company_id = $1 and (status = 'available' or reserved_for = $2) order by name", [ctx.companyId, id]),
      agreement: await db.one<{ id: string; number: string }>("select id, number from agreements where applicant_id = $1 order by version limit 1", [id]) } : null;
  });
  if (!d) notFound(); const { a } = d; const blockers = approvalBlockers(a.stage, d.checks, !!a.territory_id);
  const closed = ["approved", "rejected", "withdrawn"].includes(a.stage); const canEdit = ctx.has("edit", "franchise"); const canApprove = ctx.has("approve", "franchise");
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-1 text-sm text-muted"><Link href="/franchise" className="text-brand">Franchise</Link> / {a.name}</nav>
      <PageHeader title={a.name} description={[a.email, a.phone, `via ${a.source}`].filter(Boolean).join(" · ")} actions={<Status tone={a.stage === "approved" ? "ok" : a.stage === "rejected" ? "danger" : "info"}>{STAGE_LABEL[a.stage]}</Status>} />
      <Flash ok={ok} err={err} />
      {a.stage === "approved" && <div className="mb-2 max-w-prose"><Alert tone="ok" title="Approved: an approved partner, not yet active">They become an active partner when their agreement is signed and starts.{d.agreement && <> <Link className="font-medium underline" href={`/franchise/agreements/${d.agreement.id}`}>Open {d.agreement.number}</Link>.</>}</Alert></div>}
      {a.decision_reason && <div className="mb-2 max-w-prose"><Alert tone="warn" title={`${STAGE_LABEL[a.stage]}`}>{a.decision_reason}</Alert></div>}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          {!closed && canEdit && <Panel title="Move along the pipeline"><div className="flex flex-wrap gap-1">{moves(a.stage).filter((s) => s !== "rejected" && s !== "withdrawn").map((s) => <form key={s} action={moveApplicant}><input type="hidden" name="id" value={id} /><input type="hidden" name="to" value={s} /><SubmitButton variant={STAGES_FWD.includes(s) ? "primary" : "secondary"} pending="…">{STAGES_FWD.includes(s) ? `Move to ${STAGE_LABEL[s]}` : `Back to ${STAGE_LABEL[s]}`}</SubmitButton></form>)}</div></Panel>}
          <Panel title="Territory">{a.territory ? <p className="text-sm"><strong>{a.territory}</strong>{a.reserved_until && a.stage !== "approved" ? ` reserved until ${fmtDate(a.reserved_until)}` : ""}</p> : <p className="text-sm text-muted">None reserved.</p>}
            {!closed && canEdit && <form action={reserve} className="mt-1.5 flex flex-wrap items-end gap-1"><input type="hidden" name="id" value={id} /><Select label="Reserve" name="territory_id" options={d.free.map((t) => ({ value: t.id, label: t.name }))} /><Field label="Days" name="days" type="number" defaultValue="30" min={1} /><SubmitButton variant="secondary" pending="Reserving…">Reserve</SubmitButton></form>}
            <p className="mt-1 text-xs text-muted">Two applicants can't hold the same territory. Reservations lapse on their own.</p></Panel>
          <Panel title="Proposal">{!closed && canEdit ? <form action={saveProposal} className="space-y-1.5"><input type="hidden" name="id" value={id} /><Field label={`Franchise fee offered (${ctx.company.currency})`} name="fee" inputMode="decimal" defaultValue={a.proposal_fee_minor ? String(Number(a.proposal_fee_minor) / 100) : ""} /><TextArea label="Terms discussed" name="note" rows={3} defaultValue={a.proposal_note} /><SubmitButton variant="secondary" pending="Saving…">Save proposal</SubmitButton></form> : <p className="text-sm">{a.proposal_fee_minor ? formatMinor(Number(a.proposal_fee_minor), ctx.company.currency) : "—"}<br />{a.proposal_note}</p>}</Panel>
        </div>
        <div className="space-y-2">
          <Panel title="Qualification and document checks">
            {d.checks.length === 0 ? <p className="text-sm text-muted">No checks yet. Add what you need to verify before approving.</p> : (
              <ul className="divide-y divide-line">{d.checks.map((c) => <li key={c.id} className="py-1.5"><div className="flex items-center justify-between gap-2 text-sm"><span><span className="font-medium">{c.label}</span><span className="ml-1 text-xs text-muted">{c.kind === "document" ? "document" : "qualification"}</span></span><Status tone={c.status === "verified" ? "ok" : c.status === "rejected" ? "danger" : c.status === "received" ? "info" : "neutral"}>{titleCase(c.status)}</Status></div>
                {!closed && canEdit && <form action={setCheck} className="mt-1 flex flex-wrap items-end gap-1"><input type="hidden" name="id" value={c.id} /><input type="hidden" name="applicant_id" value={id} /><Select label="Status" name="status" defaultValue={c.status} options={["open", "received", "verified", "rejected"].map((s) => ({ value: s, label: titleCase(s) }))} /><Field label="Note (required if rejected)" name="note" defaultValue={c.note ?? ""} /><SubmitButton variant="secondary" pending="…">Update</SubmitButton></form>}</li>)}</ul>)}
            {!closed && canEdit && <form action={addCheck} className="mt-2 flex flex-wrap items-end gap-1"><input type="hidden" name="id" value={id} /><Select label="Type" name="kind" options={[{ value: "qualification", label: "Qualification" }, { value: "document", label: "Document" }]} /><Field label="What to verify" name="label" required /><SubmitButton variant="secondary" pending="Adding…">Add check</SubmitButton></form>}</Panel>
          <Attachments ctx={ctx} table="applicants" id={id} back={`/franchise/${id}`} title="Documents and meeting notes" canUpload={!closed} />
          {!closed && canApprove && (
            <Panel title="Decision">{blockers.length > 0 && <Alert tone="info" title="Before this can be approved"><ul className="list-disc pl-3">{blockers.map((b) => <li key={b}>{b}</li>)}</ul></Alert>}
              <form className="mt-2 space-y-1.5"><input type="hidden" name="id" value={id} /><TextArea label="Reason (required to reject or withdraw)" name="reason" rows={2} />
                <div className="flex flex-wrap gap-1">{blockers.length === 0 && <button formAction={approveApplicant} className="inline-flex min-h-touch items-center rounded-md bg-brand px-3 text-sm font-medium text-white">Approve application</button>}<button formAction={rejectApplicant} className="inline-flex min-h-touch items-center rounded-md border border-danger px-3 text-sm font-medium text-danger">Reject</button><button formAction={withdrawApplicant} className="inline-flex min-h-touch items-center rounded-md border border-line-strong bg-surface px-3 text-sm font-medium">Applicant withdrew</button></div></form></Panel>)}
          {a.stage === "approved" && !d.agreement && canEdit && (
            <FormCard title="Draft the agreement"><form action={createAgreement} className="space-y-2"><input type="hidden" name="applicant_id" value={id} /><div className="grid gap-2 sm:grid-cols-2"><Field label="Starts" name="start" type="date" required /><Field label="Ends" name="end" type="date" required /></div>
              <div className="grid gap-2 sm:grid-cols-2"><Field label={`Franchise fee (${ctx.company.currency})`} name="fee" inputMode="decimal" defaultValue={a.proposal_fee_minor ? String(Number(a.proposal_fee_minor) / 100) : ""} /><Field label="Deposit" name="deposit" inputMode="decimal" /></div><Field label="Remind me before it ends (days)" name="reminder" type="number" defaultValue="90" min={7} max={365} /><SubmitButton pending="Drafting…">Draft agreement</SubmitButton></form></FormCard>)}
        </div>
      </div>
    </>
  );
}
const STAGES_FWD: Stage[] = ["qualified", "meeting", "proposal", "review"];
