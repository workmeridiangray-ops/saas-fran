import Link from "next/link";
import { notFound } from "next/navigation";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { saveRunDraft, submitRun } from "../../actions";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { PageHeader, Status } from "@/components/ui";
import type { ChecklistItem } from "@/lib/rules/checklist";

export const metadata = { title: "Checklist" };

export default async function RunPage({ params, searchParams }: { params: Promise<{ branchId: string; templateId: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "tasks", { module: "tasks", what: "checklists" }); if (denied) return denied;
  const { branchId, templateId } = await params; const { ok, err } = await searchParams;
  if (![branchId, templateId].every((x) => /^[0-9a-f-]{36}$/i.test(x))) notFound();
  const d = await asUser(ctx.user.id, async (db) => {
    const t = await db.one<{ name: string; items: ChecklistItem[]; branch: string }>("select t.name, t.items, b.name branch from checklist_templates t, branches b where t.id = $1 and b.id = $2", [templateId, branchId]);
    const r = t && await db.one<{ status: string; answers: Record<string, string>; review_note: string | null }>("select status, answers, review_note from checklist_runs r join branches b on b.id = r.branch_id where r.branch_id = $1 and r.template_id = $2 and r.run_date = (now() at time zone b.timezone)::date", [branchId, templateId]);
    return t ? { t, r } : null;
  });
  if (!d) notFound();
  const locked = d.r && (d.r.status === "submitted" || d.r.status === "approved"); const a = d.r?.answers ?? {};
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-1 text-sm text-muted"><Link href="/checklists" className="text-brand">Checklists</Link> / {d.t.name}</nav>
      <PageHeader title={d.t.name} description={d.t.branch} actions={d.r && <Status tone={d.r.status === "approved" ? "ok" : d.r.status === "rejected" ? "danger" : "info"}>{d.r.status === "rejected" ? "Sent back" : d.r.status[0]!.toUpperCase() + d.r.status.slice(1)}</Status>} />
      <Flash ok={ok} err={err} />
      {d.r?.status === "rejected" && d.r.review_note && <p role="alert" className="mb-2 max-w-prose rounded-md bg-danger-bg p-1.5 text-sm text-danger"><strong>Sent back:</strong> {d.r.review_note}</p>}
      <form className="max-w-prose space-y-1.5">
        <input type="hidden" name="branch_id" value={branchId} /><input type="hidden" name="template_id" value={templateId} />
        <ul className="space-y-1.5">{d.t.items.map((i) => (
          <li key={i.id} className="rounded-lg border border-line bg-surface p-2">
            <fieldset disabled={!!locked}><legend className="text-sm font-medium">{i.text}{i.required && <span className="text-danger"> *</span>}</legend>
              <div className="mt-1 flex flex-wrap gap-1">{[["done", "Done"], ["na", "Not applicable"], ["issue", "Issue"]].map(([v, l]) => (
                <label key={v} className="inline-flex min-h-touch cursor-pointer items-center gap-1 rounded-md border border-line-strong px-2 text-sm has-[:checked]:border-brand has-[:checked]:bg-brand-soft"><input type="radio" name={`a:${i.id}`} value={v} defaultChecked={a[i.id!] === v} className="sr-only" />{l}</label>))}</div>
              <input name={`n:${i.id}`} defaultValue={a[`${i.id}:note`] ?? ""} placeholder="Note (optional)" aria-label={`Note for ${i.text}`} className="mt-1 min-h-touch w-full rounded-md border border-line-strong bg-surface px-1.5 text-sm" /></fieldset></li>))}</ul>
        {!locked ? <div className="flex flex-wrap gap-1 pt-1"><button formAction={saveRunDraft} className="inline-flex min-h-touch items-center rounded-md border border-line-strong bg-surface px-3 text-sm font-medium">Save progress</button>
          <button formAction={submitRun} className="inline-flex min-h-touch items-center rounded-md bg-brand px-3 text-sm font-medium text-white">Submit for review</button></div>
          : <p className="text-sm text-muted">This checklist is {d.r!.status === "approved" ? "approved" : "waiting for review"} and can't be edited.</p>}
      </form>
    </>
  );
}
