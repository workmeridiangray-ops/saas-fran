import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { approveRun, rejectRun } from "./actions";
import { Field } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { PageHeader, Panel, StateMessage, Status, TableWrap, Td, Th, type Tone } from "@/components/ui";
import { fmtDateTime, titleCase } from "@/lib/format";

export const metadata = { title: "Checklists" };
const TONE: Record<string, Tone> = { none: "neutral", draft: "info", submitted: "warn", approved: "ok", rejected: "danger" };

export default async function Checklists({ searchParams }: { searchParams: Promise<{ tab?: string; ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "tasks", { module: "tasks", what: "checklists" }); if (denied) return denied;
  const { tab = "today", ok, err } = await searchParams;
  const d = await asUser(ctx.user.id, async (db) => ({
    today: await db.q<{ branch_id: string; branch: string; template_id: string; template: string; kind: string; status: string | null; note: string | null }>(
      `select b.id branch_id, b.name branch, t.id template_id, t.name template, t.kind, r.status, r.review_note note
         from branches b cross join checklist_templates t
         left join checklist_runs r on r.branch_id = b.id and r.template_id = t.id and r.run_date = (now() at time zone b.timezone)::date
        where b.company_id = $1 and b.status = 'active' and t.status = 'active' order by b.name, t.kind`, [ctx.companyId]),
    review: await db.q<{ id: string; branch: string; template: string; submitted_at: string; submitter: string | null; run_date: string; answers: Record<string, string> }>(
      `select r.id, b.name branch, t.name template, r.submitted_at, r.run_date, r.answers, coalesce(nullif(p.display_name,''), p.email) submitter
         from checklist_runs r join branches b on b.id = r.branch_id join checklist_templates t on t.id = r.template_id left join profiles p on p.id = r.submitted_by
        where r.company_id = $1 and r.status = 'submitted' order by r.submitted_at`, [ctx.companyId]),
  }));
  const canReview = ctx.has("edit", "tasks") && ctx.has("assign", "tasks");
  const tabLink = (k: string, label: string) => <Link key={k} href={`/checklists?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={`inline-flex min-h-touch items-center rounded-md border px-2 text-sm ${tab === k ? "border-brand bg-brand-soft font-medium" : "border-line bg-surface hover:bg-sunken"}`}>{label}</Link>;
  return (
    <>
      <PageHeader title="Checklists" description="Opening and closing checks, per branch, per day in the branch's own time zone." />
      <Flash ok={ok} err={err} />
      <div className="mb-2 flex gap-1">{tabLink("today", "Today")}{canReview && tabLink("review", `To review (${d.review.length})`)}</div>
      {tab === "review" && canReview ? (
        d.review.length === 0 ? <StateMessage title="Nothing to review">Submitted checklists appear here for approval.</StateMessage> : (
          <div className="space-y-2">{d.review.map((r) => (
            <Panel key={r.id} title={`${r.template} · ${r.branch}`}>
              <p className="text-sm text-muted">Submitted by {r.submitter ?? "—"} · {fmtDateTime(r.submitted_at, ctx.company.timezone)}</p>
              <ul className="my-1 text-sm">{Object.entries(r.answers).filter(([k]) => !k.endsWith(":note")).map(([k, v]) => <li key={k}>{titleCase(v)}{r.answers[`${k}:note`] ? ` — ${r.answers[`${k}:note`]}` : ""}</li>)}</ul>
              <form className="flex flex-wrap items-end gap-1"><input type="hidden" name="id" value={r.id} />
                <div className="min-w-[14rem] flex-1"><Field label="Note (required to send back)" name="note" /></div>
                <button formAction={approveRun} className="inline-flex min-h-touch items-center rounded-md bg-brand px-3 text-sm font-medium text-white">Approve</button>
                <button formAction={rejectRun} className="inline-flex min-h-touch items-center rounded-md border border-danger px-3 text-sm font-medium text-danger">Send back</button></form>
            </Panel>))}</div>)
      ) : d.today.length === 0 ? <StateMessage title="No checklists to show">Checklists appear once you have an active branch and a checklist template.</StateMessage> : (
        <TableWrap label="Today's checklists"><thead><tr><Th>Branch</Th><Th>Checklist</Th><Th>Status</Th><Th><span className="sr-only">Open</span></Th></tr></thead>
          <tbody>{d.today.map((r) => { const s = r.status ?? "none"; return (
            <tr key={r.branch_id + r.template_id}><Td className="font-medium">{r.branch}</Td><Td>{r.template}</Td>
              <Td><Status tone={TONE[s]!}>{s === "none" ? "Not started" : s === "rejected" ? "Sent back" : titleCase(s)}</Status>{r.note && s === "rejected" && <span className="block text-xs text-muted">{r.note}</span>}</Td>
              <Td><Link className="text-sm font-medium text-brand" href={`/checklists/${r.branch_id}/${r.template_id}`}>{s === "none" ? "Start" : s === "draft" || s === "rejected" ? "Continue" : "View"}</Link></Td></tr>); })}</tbody></TableWrap>
      )}
    </>
  );
}
