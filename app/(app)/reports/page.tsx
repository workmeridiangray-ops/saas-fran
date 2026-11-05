import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { PageHeader, Panel, StateMessage, TableWrap, Td, Th } from "@/components/ui";

export const metadata = { title: "Reports & exports" };
const EXPORTS = [
  ["branches", "Branches", "branches", "branches"], ["tasks", "Tasks", "tasks", "tasks"], ["inspections", "Inspections", "inspections", "inspections"], ["findings", "Findings", "inspections", "inspections"],
  ["purchasing", "Requisitions", "purchasing", "purchasing"], ["tickets", "Tickets", "tickets", "tickets"], ["training", "Training completion", "training", "training"], ["statements", "Royalty statements", "royalties", "royalties"],
] as const;

export default async function Reports() {
  const ctx = await requireCtx(); const denied = guard(ctx, "reports", { what: "reports" }); if (denied) return denied;
  const rows = await asUser(ctx.user.id, (db) => db.q<{ id: string; name: string; status: string; open_tasks: string; overdue_tasks: string; score: string | null; open_findings: string; open_tickets: string }>(
    `select b.id, b.name, b.status,
       (select count(*) from tasks t where t.branch_id = b.id and t.status in ('open','in_progress','blocked')) open_tasks,
       (select count(*) from tasks t where t.branch_id = b.id and t.status in ('open','in_progress','blocked') and t.due_at < now()) overdue_tasks,
       (select round(avg(score)) from inspections i where i.branch_id = b.id and i.status = 'completed' and i.completed_at > now() - interval '90 days') score,
       (select count(*) from findings f where f.branch_id = b.id and f.status <> 'verified') open_findings,
       (select count(*) from tickets k where k.branch_id = b.id and k.status in ('open','in_progress')) open_tickets
     from branches b where b.company_id = $1 and b.status <> 'closed' order by b.name`, [ctx.companyId]));
  const canExport = (res: string) => ctx.has("export", res as never);
  return (
    <>
      <PageHeader title="Reports & exports" description="Everything here respects your permissions and branch scope. Exports download as CSV." />
      <h2 className="mb-1 text-sm font-semibold text-muted">Branch comparison <span className="font-normal">(open items now; inspection score is the 90-day average)</span></h2>
      {rows.length === 0 ? <StateMessage title="No branches to compare">Add branches to see them side by side.</StateMessage> : (
        <TableWrap label="Branch comparison"><thead><tr><Th>Branch</Th><Th num>Open tasks</Th><Th num>Overdue tasks</Th><Th num>Inspection score</Th><Th num>Open findings</Th><Th num>Open tickets</Th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><Td><Link className="font-medium text-brand" href={`/branches/${r.id}`}>{r.name}</Link></Td><Td num>{r.open_tasks}</Td><Td num>{r.overdue_tasks}</Td><Td num>{r.score === null ? "—" : `${r.score}%`}</Td><Td num>{r.open_findings}</Td><Td num>{r.open_tickets}</Td></tr>)}</tbody></TableWrap>)}
      <div className="mt-4 max-w-prose"><Panel title="Export data (CSV)">
        <ul className="grid gap-1 sm:grid-cols-2">{EXPORTS.filter(([, , res]) => canExport(res)).map(([k, l]) => <li key={k}><a className="flex min-h-touch items-center rounded-md border border-line px-2 text-sm font-medium text-brand hover:bg-sunken" href={`/api/export/${k}`}>{l}</a></li>)}</ul>
        <p className="mt-1 text-xs text-muted">Spreadsheet formulas in cells are neutralised, so a file is safe to open.</p></Panel></div>
    </>
  );
}
