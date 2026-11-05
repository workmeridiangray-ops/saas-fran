import Link from "next/link";
import { notFound } from "next/navigation";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { addTaskComment, setTaskStatus } from "../actions";
import { Field, TextArea } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { CustomValuesList } from "@/components/studio/CustomValuesList";
import { PageHeader, Panel, Status, type Tone } from "@/components/ui";
import { fmtDateTime, titleCase } from "@/lib/format";

const TONE: Record<string, Tone> = { open: "info", in_progress: "info", blocked: "warn", done: "ok", cancelled: "neutral" };

export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "tasks", { module: "tasks", what: "tasks" }); if (denied) return denied;
  const { id } = await params; const { ok, err } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await asUser(ctx.user.id, async (db) => {
    const t = await db.one<{ id: string; title: string; description: string; status: string; priority: string; due_at: string | null; requires_evidence: boolean; evidence_note: string | null; completed_at: string | null; branch: string | null; tz: string | null; assignee: string | null; creator: string | null }>(
      `select t.*, b.name branch, b.timezone tz, coalesce(nullif(pa.display_name,''), pa.email) assignee, coalesce(nullif(pc.display_name,''), pc.email) creator
         from tasks t left join branches b on b.id = t.branch_id left join profiles pa on pa.id = t.assignee_id left join profiles pc on pc.id = t.created_by where t.id = $1`, [id]);
    return t ? { t, comments: await db.q<{ body: string; created_at: string; author: string }>("select c.body, c.created_at, coalesce(nullif(p.display_name,''), p.email) author from task_comments c join profiles p on p.id = c.author_id where c.task_id = $1 order by c.created_at", [id]) } : null;
  });
  if (!d) notFound(); const { t } = d; const closed = t.status === "done" || t.status === "cancelled";
  const btn = (to: string, label: string, variant: "primary" | "secondary" | "danger" = "secondary") => <form key={to} action={setTaskStatus}><input type="hidden" name="id" value={id} /><input type="hidden" name="to" value={to} /><SubmitButton variant={variant} pending="…">{label}</SubmitButton></form>;
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-1 text-sm text-muted"><Link href="/tasks" className="text-brand">Tasks</Link> / {t.title}</nav>
      <PageHeader title={t.title} description={`${t.branch ?? "Company-wide"} · assigned to ${t.assignee ?? "nobody"} · created by ${t.creator ?? "—"}`} actions={<Status tone={TONE[t.status] ?? "neutral"}>{titleCase(t.status)}</Status>} />
      <Flash ok={ok} err={err} />
      <CustomValuesList entity="tasks" id={t.id} userId={ctx.user.id} companyId={ctx.companyId} />
      <div className="grid gap-3 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-2">
          <Panel title="Details"><p className="whitespace-pre-wrap text-sm">{t.description || "No details."}</p>
            <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-3"><div><dt className="text-xs text-muted">Due</dt><dd>{fmtDateTime(t.due_at, t.tz ?? ctx.company.timezone)}</dd></div><div><dt className="text-xs text-muted">Priority</dt><dd>{titleCase(t.priority)}</dd></div><div><dt className="text-xs text-muted">Completed</dt><dd>{fmtDateTime(t.completed_at, t.tz ?? ctx.company.timezone)}</dd></div></dl>
            {t.evidence_note && <p className="mt-2 text-sm"><span className="text-xs text-muted">Proof of completion</span><br />{t.evidence_note}</p>}</Panel>
          <Panel title="Comments">
            {d.comments.length === 0 ? <p className="text-sm text-muted">No comments yet.</p> : <ul className="space-y-1.5">{d.comments.map((c, i) => <li key={i} className="text-sm"><strong className="font-medium">{c.author}</strong> <span className="text-xs text-muted">{fmtDateTime(c.created_at, ctx.company.timezone)}</span><br />{c.body}</li>)}</ul>}
            <form action={addTaskComment} className="mt-2 space-y-1"><input type="hidden" name="id" value={id} /><TextArea label="Add a comment" name="body" rows={2} /><SubmitButton variant="secondary" pending="Posting…">Post comment</SubmitButton></form>
          </Panel>
        </div>
        <Panel title="Update">
          {closed ? <><p className="mb-1 text-sm text-muted">This task is {t.status}. Reopen it to continue.</p>{btn("open", "Reopen")}</> : (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-1">{t.status !== "in_progress" && btn("in_progress", "Start")}{t.status !== "blocked" && btn("blocked", "Mark blocked")}{btn("cancelled", "Cancel task", "danger")}</div>
              <form action={setTaskStatus} className="space-y-1.5 border-t border-line pt-2"><input type="hidden" name="id" value={id} /><input type="hidden" name="to" value="done" />
                <Field label={t.requires_evidence ? "Proof of completion (required)" : "Completion note"} name="evidence_note" required={t.requires_evidence} hint={t.requires_evidence ? "Say what was done and where the evidence is." : undefined} />
                <SubmitButton pending="Completing…">Mark done</SubmitButton></form>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
