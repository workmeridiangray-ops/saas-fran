import Link from "next/link";
import { notFound } from "next/navigation";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { commentTicket, updateTicket } from "../actions";
import { Attachments } from "@/components/records/Attachments";
import { memberOptions } from "@/lib/data/pickers";
import { Field, Select, TextArea } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { PageHeader, Panel, Status, type Tone } from "@/components/ui";
import { fmtDateTime, titleCase } from "@/lib/format";

const TONE: Record<string, Tone> = { open: "info", in_progress: "info", resolved: "ok", closed: "neutral" };

export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "tickets", { module: "tickets", what: "tickets" }); if (denied) return denied;
  const { id } = await params; const { ok, err } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await asUser(ctx.user.id, async (db) => {
    const t = await db.one<{ id: string; number: string; title: string; body: string; kind: string; category: string; status: string; priority: string; resolution: string | null; created_at: string; branch: string | null; assignee: string | null; creator: string | null }>(
      "select t.*, b.name branch, coalesce(nullif(pa.display_name,''), pa.email) assignee, coalesce(nullif(pc.display_name,''), pc.email) creator from tickets t left join branches b on b.id = t.branch_id left join profiles pa on pa.id = t.assignee_id left join profiles pc on pc.id = t.created_by where t.id = $1", [id]);
    return t ? { t, people: await memberOptions(db, ctx.companyId), comments: await db.q<{ body: string; created_at: string; author: string }>("select c.body, c.created_at, coalesce(nullif(p.display_name,''), p.email) author from ticket_comments c join profiles p on p.id = c.author_id where c.ticket_id = $1 order by c.created_at", [id]) } : null;
  });
  if (!d) notFound(); const { t } = d; const closed = t.status === "closed";
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-1 text-sm text-muted"><Link href="/tickets" className="text-brand">Tickets</Link> / {t.number}</nav>
      <PageHeader title={t.title} description={`${titleCase(t.kind)} · ${t.category} · ${t.branch ?? "Company-wide"} · by ${t.creator ?? "—"} on ${fmtDateTime(t.created_at, ctx.company.timezone)}`} actions={<Status tone={TONE[t.status] ?? "neutral"}>{titleCase(t.status)}</Status>} />
      <Flash ok={ok} err={err} />
      <div className="grid gap-3 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-2">
          <Panel title="Description"><p className="whitespace-pre-wrap text-sm">{t.body || "No description."}</p>{t.resolution && <p className="mt-2 text-sm"><span className="text-xs text-muted">Resolution</span><br />{t.resolution}</p>}</Panel>
          <Attachments ctx={ctx} table="tickets" id={id} back={`/tickets/${id}`} canUpload={!closed} />
          <Panel title="Conversation">{d.comments.length === 0 ? <p className="text-sm text-muted">No comments yet.</p> : <ul className="space-y-1.5">{d.comments.map((c, i) => <li key={i} className="text-sm"><strong className="font-medium">{c.author}</strong> <span className="text-xs text-muted">{fmtDateTime(c.created_at, ctx.company.timezone)}</span><br />{c.body}</li>)}</ul>}
            {!closed && <form action={commentTicket} className="mt-2 space-y-1"><input type="hidden" name="id" value={id} /><TextArea label="Add a comment" name="body" rows={2} /><SubmitButton variant="secondary" pending="Posting…">Post comment</SubmitButton></form>}</Panel>
        </div>
        {ctx.has("edit", "tickets") && !closed && <Panel title="Update"><form action={updateTicket} className="space-y-2"><input type="hidden" name="id" value={id} />
          <Select label="Status" name="to" defaultValue={t.status} options={["open", "in_progress", "resolved", "closed"].map((s) => ({ value: s, label: titleCase(s) }))} />
          <Select label="Assign to" name="assignee_id" placeholder="Keep as is" options={d.people.map((p) => ({ value: p.user_id, label: p.name }))} />
          <Field label="Resolution (required to resolve or close)" name="resolution" /><SubmitButton pending="Saving…">Save</SubmitButton></form></Panel>}
      </div>
    </>
  );
}
