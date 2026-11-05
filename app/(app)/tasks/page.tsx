import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { Flash } from "@/components/ui/flash";
import { Button, ButtonLink, PageHeader, StateMessage, Status, TableWrap, Td, Th, type Tone } from "@/components/ui";
import { fmtDateTime, titleCase } from "@/lib/format";

export const metadata = { title: "Tasks" };
const TONE: Record<string, Tone> = { open: "info", in_progress: "info", blocked: "warn", done: "ok", cancelled: "neutral" };

export default async function Tasks({ searchParams }: { searchParams: Promise<{ filter?: string; status?: string; q?: string; ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "tasks", { module: "tasks", what: "tasks" }); if (denied) return denied;
  const { filter = "all", status = "", q = "", ok, err } = await searchParams;
  const rows = await asUser(ctx.user.id, (db) => db.q<{ id: string; title: string; status: string; priority: string; due_at: string | null; branch: string | null; tz: string | null; assignee: string | null; mine: boolean }>(
    `select t.id, t.title, t.status, t.priority, t.due_at, b.name branch, b.timezone tz, coalesce(nullif(p.display_name,''), p.email) assignee, t.assignee_id = $2 mine
       from tasks t left join branches b on b.id = t.branch_id left join profiles p on p.id = t.assignee_id
      where t.company_id = $1
        and ($3 = 'all' or ($3 = 'mine' and t.assignee_id = $2) or ($3 = 'overdue' and t.status in ('open','in_progress','blocked') and t.due_at < now()))
        and ($4 = '' or t.status = $4) and ($5 = '' or t.title ilike '%'||$5||'%')
      order by (t.status in ('done','cancelled')), t.due_at nulls last, t.created_at desc limit 300`, [ctx.companyId, ctx.user.id, filter, status, q]));
  const tab = (f: string, label: string) => <Link key={f} href={`/tasks?filter=${f}`} aria-current={filter === f ? "page" : undefined} className={`inline-flex min-h-touch items-center rounded-md border px-2 text-sm ${filter === f ? "border-brand bg-brand-soft font-medium" : "border-line bg-surface hover:bg-sunken"}`}>{label}</Link>;
  return (
    <>
      <PageHeader title="Tasks" description="Work assigned across the network. Deadlines show in each branch's own time zone."
        actions={ctx.has("create", "tasks") ? <ButtonLink href="/tasks/new" variant="primary">New task</ButtonLink> : undefined} />
      <Flash ok={ok} err={err} />
      <div className="mb-2 flex flex-wrap items-end gap-1.5">
        {tab("all", "All")}{tab("mine", "Assigned to me")}{tab("overdue", "Overdue")}
        <form className="flex flex-wrap items-end gap-1 sm:ml-auto" role="search" aria-label="Filter tasks"><input type="hidden" name="filter" value={filter} />
          <div><label htmlFor="q" className="mb-0.5 block text-xs font-medium text-muted">Search</label><input id="q" name="q" defaultValue={q} className="min-h-touch rounded-md border border-line-strong bg-surface px-1.5 text-sm" /></div>
          <div><label htmlFor="status" className="mb-0.5 block text-xs font-medium text-muted">Status</label><select id="status" name="status" defaultValue={status} className="min-h-touch rounded-md border border-line-strong bg-surface px-1.5 text-sm"><option value="">Any</option>{Object.keys(TONE).map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</select></div>
          <Button type="submit">Apply</Button></form>
      </div>
      {rows.length === 0 ? <StateMessage title={filter === "all" && !q && !status ? "No tasks yet" : "No tasks match"} actions={ctx.has("create", "tasks") ? <ButtonLink href="/tasks/new" variant="primary">Create a task</ButtonLink> : undefined}>Tasks track who does what by when, with comments and optional proof of completion.</StateMessage> : (
        <TableWrap label="Tasks"><thead><tr><Th>Task</Th><Th>Branch</Th><Th>Assignee</Th><Th>Due</Th><Th>Priority</Th><Th>Status</Th></tr></thead>
          <tbody>{rows.map((t) => {
            const overdue = t.due_at && new Date(t.due_at) < new Date() && !["done", "cancelled"].includes(t.status);
            return <tr key={t.id} className="hover:bg-canvas"><Td><Link href={`/tasks/${t.id}`} className="font-medium text-brand">{t.title}</Link></Td><Td>{t.branch ?? "Company"}</Td><Td>{t.assignee ?? <span className="text-muted">Unassigned</span>}{t.mine && <span className="ml-1 text-xs text-muted">(you)</span>}</Td>
              <Td>{fmtDateTime(t.due_at, t.tz ?? ctx.company.timezone)}{overdue && <> <Status tone="danger">Overdue</Status></>}</Td><Td>{titleCase(t.priority)}</Td><Td><Status tone={TONE[t.status] ?? "neutral"}>{titleCase(t.status)}</Status></Td></tr>;
          })}</tbody></TableWrap>
      )}
    </>
  );
}
