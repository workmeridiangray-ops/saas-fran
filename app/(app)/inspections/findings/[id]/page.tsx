import Link from "next/link";
import { notFound } from "next/navigation";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { assignAction, completeAction, verifyAccept, verifyReject } from "../../actions";
import { branchOptions, memberOptions } from "@/lib/data/pickers";
import { Attachments } from "@/components/records/Attachments";
import { Field, FormCard, Select, TextArea } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { PageHeader, Panel, Status, type Tone } from "@/components/ui";
import { fmtDate, fmtDateTime, titleCase } from "@/lib/format";

const SEV: Record<string, Tone> = { minor: "neutral", major: "warn", critical: "danger" };

export default async function FindingPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "inspections", { module: "inspections", what: "findings" }); if (denied) return denied;
  const { id } = await params; const { ok, err } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await asUser(ctx.user.id, async (db) => {
    const f = await db.one<{ id: string; text: string; severity: string; status: string; comment: string | null; created_at: string; branch: string; inspection_id: string }>("select f.*, b.name branch from findings f join branches b on b.id = f.branch_id where f.id = $1", [id]);
    if (!f) return null;
    return { f, people: await memberOptions(db, ctx.companyId),
      actions: await db.q<{ id: string; description: string; status: string; due_at: string; proof_note: string | null; verify_note: string | null; assignee_id: string; assignee: string | null; verifier: string | null; verified_at: string | null }>(
        "select a.id, a.description, a.status, a.due_at, a.proof_note, a.verify_note, a.assignee_id, coalesce(nullif(p.display_name,''), p.email) assignee, coalesce(nullif(v.display_name,''), v.email) verifier, a.verified_at from corrective_actions a left join profiles p on p.id = a.assignee_id left join profiles v on v.id = a.verified_by where a.finding_id = $1 order by a.created_at", [id]) };
  });
  if (!d) notFound(); const { f } = d;
  const hasOpen = d.actions.some((a) => a.status !== "verified");
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-1 text-sm text-muted"><Link href="/inspections?tab=findings" className="text-brand">Findings</Link> / {f.text}</nav>
      <PageHeader title={f.text} description={`${f.branch} · raised ${fmtDateTime(f.created_at, ctx.company.timezone)}`} actions={<span className="flex gap-1"><Status tone={SEV[f.severity]!}>{titleCase(f.severity)}</Status><Status tone={f.status === "verified" ? "ok" : "warn"}>{titleCase(f.status)}</Status></span>} />
      <Flash ok={ok} err={err} />
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-2">
          <Panel title="What the inspector found"><p className="text-sm">{f.comment}</p><p className="mt-1 text-sm"><Link className="font-medium text-brand" href={`/inspections/${f.inspection_id}`}>Open the inspection</Link></p></Panel>
          <Attachments ctx={ctx} table="findings" id={id} back={`/inspections/findings/${id}`} title="Photos and evidence" canUpload={f.status !== "verified"} />
        </div>
        <div className="space-y-2">
          {d.actions.map((a) => (
            <Panel key={a.id} title={`Corrective action · due ${fmtDate(a.due_at)}`}>
              <p className="text-sm">{a.description}</p><p className="mt-0.5 text-xs text-muted">Assigned to {a.assignee ?? "—"}</p>
              {a.proof_note && <p className="mt-1 text-sm"><span className="text-xs text-muted">Proof of correction</span><br />{a.proof_note}</p>}
              {a.verify_note && <p className="mt-1 text-sm"><span className="text-xs text-muted">Verifier's note</span><br />{a.verify_note}</p>}
              {a.status === "verified" && <p className="mt-1 text-sm text-ok">Verified by {a.verifier} on {fmtDate(a.verified_at)}.</p>}
              {a.status === "open" && a.assignee_id === ctx.user.id && <form action={completeAction} className="mt-2 space-y-1.5"><input type="hidden" name="id" value={a.id} /><input type="hidden" name="finding_id" value={id} /><TextArea label="What did you do? Where's the proof?" name="proof" rows={2} /><p className="text-xs text-muted">Attach photos in “Photos and evidence”.</p><SubmitButton pending="Saving…">Mark as fixed</SubmitButton></form>}
              {a.status === "done" && (a.assignee_id === ctx.user.id ? <p className="mt-1 text-sm text-muted">Waiting for someone else to verify. You can't verify your own work.</p> : ctx.has("approve", "inspections") && (
                <form className="mt-2 space-y-1.5"><input type="hidden" name="id" value={a.id} /><input type="hidden" name="finding_id" value={id} /><Field label="Note (required if sending back)" name="note" />
                  <div className="flex gap-1"><button formAction={verifyAccept} className="inline-flex min-h-touch items-center rounded-md bg-brand px-3 text-sm font-medium text-white">Verify and close</button><button formAction={verifyReject} className="inline-flex min-h-touch items-center rounded-md border border-danger px-3 text-sm font-medium text-danger">Not fixed: reopen</button></div></form>))}
            </Panel>))}
          {!hasOpen && f.status !== "verified" && ctx.has("create", "actions") && (
            <FormCard title="Assign a corrective action"><form action={assignAction} className="space-y-2"><input type="hidden" name="finding_id" value={id} />
              <Select label="Assign to" name="assignee_id" options={d.people.map((p) => ({ value: p.user_id, label: p.name }))} /><Field label="Due" name="due" type="date" required /><TextArea label="What must be fixed" name="description" rows={2} /><SubmitButton pending="Assigning…">Assign action</SubmitButton></form></FormCard>)}
        </div>
      </div>
    </>
  );
}
