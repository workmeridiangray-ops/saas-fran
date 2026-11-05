import Link from "next/link";
import { notFound } from "next/navigation";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { addItem, launchProject, saveReview, updateItem } from "../actions";
import { memberOptions } from "@/lib/data/pickers";
import { Attachments } from "@/components/records/Attachments";
import { Field, Select, TextArea } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { Alert, PageHeader, Panel, Status } from "@/components/ui";
import { overBudget, readiness, type ProjectItem } from "@/lib/rules/projects";
import { CATEGORY_LABEL, type Category } from "@/lib/templates/opening";
import { formatMinor } from "@/lib/rules/money";
import { fmtDate } from "@/lib/format";

interface Row { id: string; category: Category; title: string; required: boolean; requires_evidence: boolean; assignee_id: string | null; due_on: string | null; status: ProjectItem["status"]; blocker_note: string | null; evidence_note: string | null; cost_minor: string }

export default async function ProjectPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "projects", { module: "projects", what: "opening projects" }); if (denied) return denied;
  const { id } = await params; const { ok, err } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await asUser(ctx.user.id, async (db) => {
    const p = await db.one<{ id: string; name: string; status: string; target_launch: string | null; budget_minor: string; branch: string | null; launched_at: string | null; post_launch_review: string | null }>("select p.id, p.name, p.status, p.target_launch, p.budget_minor, b.name branch, p.launched_at, p.post_launch_review from projects p left join branches b on b.id = p.branch_id where p.id = $1", [id]);
    return p ? { p, items: await db.q<Row>("select id, category, title, required, requires_evidence, assignee_id, due_on::text, status, blocker_note, evidence_note, cost_minor::text from project_items where project_id = $1 order by category, created_at", [id]), people: await memberOptions(db, ctx.companyId) } : null;
  });
  if (!d) notFound(); const { p } = d; const open = p.status === "planning" || p.status === "in_progress";
  const r = readiness(d.items.map((i) => ({ id: i.id, category: i.category, title: i.title, required: i.required, status: i.status, costMinor: Number(i.cost_minor), dueOn: i.due_on })), new Date().toISOString().slice(0, 10));
  const m = (n: number | string) => formatMinor(Number(n), ctx.company.currency); const over = overBudget(Number(p.budget_minor), r.spentMinor);
  const cats = Object.keys(CATEGORY_LABEL) as Category[]; const people = d.people.map((x) => ({ value: x.user_id, label: x.name }));
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-1 text-sm text-muted"><Link href="/projects" className="text-brand">Opening projects</Link> / {p.name}</nav>
      <PageHeader title={p.name} description={`${p.branch ?? "No branch yet"}${p.target_launch ? ` · target ${fmtDate(p.target_launch)}` : ""}`} actions={<Status tone={p.status === "launched" ? "ok" : "info"}>{p.status === "launched" ? "Launched" : "In preparation"}</Status>} />
      <Flash ok={ok} err={err} />
      <div className="mb-3 grid gap-3 lg:grid-cols-3">
        <Panel title="Readiness"><p className="text-3xl font-semibold tabular-nums">{r.pct}%</p><div role="progressbar" aria-valuenow={r.pct} aria-valuemin={0} aria-valuemax={100} aria-label="Required items finished" className="mt-1 h-1 w-full overflow-hidden rounded-full bg-sunken"><div className="h-full bg-brand" style={{ width: `${r.pct}%` }} /></div>
          <p className="mt-1 text-sm text-muted">{r.requiredDone} of {r.requiredTotal} required items finished{r.overdue ? ` · ${r.overdue} overdue` : ""}</p></Panel>
        <Panel title="Budget"><p className="text-2xl font-semibold tabular-nums">{m(r.spentMinor)}</p><p className="text-sm text-muted">of {Number(p.budget_minor) ? m(p.budget_minor) : "no budget set"}</p>{over && <div className="mt-1"><Status tone="danger">Over budget by {m(r.spentMinor - Number(p.budget_minor))}</Status></div>}</Panel>
        <Panel title="Launch">{p.status === "launched" ? <p className="text-sm">Launched {fmtDate(p.launched_at)}.</p> : r.canLaunch ? (ctx.has("approve", "projects") ? <form action={launchProject}><input type="hidden" name="id" value={id} /><SubmitButton pending="Launching…">Approve and launch</SubmitButton><p className="mt-1 text-xs text-muted">Marks the branch active.</p></form> : <p className="text-sm">Ready. Waiting for someone with launch approval.</p>) : <><Alert tone="warn" title="Not ready to launch"><ul className="list-disc pl-3">{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul></Alert></>}</Panel>
      </div>
      <div className="space-y-3">
        {cats.map((c) => { const rows = d.items.filter((i) => i.category === c); if (!rows.length) return null; const s = r.byCategory[c]!; return (
          <Panel key={c} title={`${CATEGORY_LABEL[c]} · ${s.done}/${s.total}`}>
            <ul className="divide-y divide-line">{rows.map((i) => (
              <li key={i.id} className="py-1.5">
                <details><summary className="flex min-h-touch cursor-pointer list-none items-center justify-between gap-2"><span className="text-sm"><span className="font-medium">{i.title}</span>{!i.required && <span className="ml-1 text-xs text-muted">optional</span>}{i.requires_evidence && <span className="ml-1 text-xs text-muted">needs evidence</span>}</span>
                  <Status tone={i.status === "done" ? "ok" : i.status === "blocked" ? "danger" : i.status === "doing" ? "info" : "neutral"}>{{ todo: "To do", doing: "In progress", done: "Done", blocked: "Blocked" }[i.status]}</Status></summary>
                  {open ? <form action={updateItem} className="mt-1.5 grid gap-1.5 sm:grid-cols-2"><input type="hidden" name="id" value={i.id} /><input type="hidden" name="project_id" value={id} />
                    <Select label="Status" name="status" defaultValue={i.status} options={[{ value: "todo", label: "To do" }, { value: "doing", label: "In progress" }, { value: "done", label: "Done" }, { value: "blocked", label: "Blocked" }]} />
                    <Select label="Owner" name="assignee_id" defaultValue={i.assignee_id ?? ""} placeholder="Unassigned" options={people} />
                    <Field label="Due" name="due" type="date" defaultValue={i.due_on ?? ""} /><Field label={`Cost (${ctx.company.currency})`} name="cost" inputMode="decimal" defaultValue={Number(i.cost_minor) ? String(Number(i.cost_minor) / 100) : ""} />
                    <Field label="If blocked: what's in the way" name="note" defaultValue={i.blocker_note ?? ""} /><Field label={i.requires_evidence ? "Evidence (required to finish)" : "Evidence or note"} name="evidence" defaultValue={i.evidence_note ?? ""} />
                    <div className="sm:col-span-2"><SubmitButton pending="Saving…">Save item</SubmitButton></div></form>
                    : <p className="mt-1 text-sm text-muted">{i.evidence_note ?? "—"}</p>}</details></li>))}</ul></Panel>); })}
        {open && ctx.has("edit", "projects") && <Panel title="Add an item"><form action={addItem} className="grid gap-1.5 sm:grid-cols-3"><input type="hidden" name="project_id" value={id} /><Select label="Category" name="category" options={cats.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))} /><div className="sm:col-span-2"><Field label="Item" name="title" required /></div>
          <label className="flex min-h-touch items-center gap-1 text-sm"><input type="checkbox" name="required" defaultChecked /> Required before launch</label><label className="flex min-h-touch items-center gap-1 text-sm"><input type="checkbox" name="evidence" /> Needs evidence</label><SubmitButton variant="secondary" pending="Adding…">Add</SubmitButton></form></Panel>}
        <Attachments ctx={ctx} table="projects" id={id} back={`/projects/${id}`} title="Site photos and documents" canUpload={open} />
        {p.status === "launched" && <Panel title="Post-launch review">{p.post_launch_review ? <p className="whitespace-pre-wrap text-sm">{p.post_launch_review}</p> : ctx.has("edit", "projects") ? <form action={saveReview} className="space-y-1.5"><input type="hidden" name="id" value={id} /><TextArea label="What went well, and what should change next time?" name="review" rows={4} /><SubmitButton pending="Saving…">Save review</SubmitButton></form> : <p className="text-sm text-muted">No review yet.</p>}</Panel>}
      </div>
    </>
  );
}
