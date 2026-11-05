import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { PageHeader, Panel, StateMessage, Status, TableWrap, Td, Th } from "@/components/ui";
import { addSchedule, removeSchedule } from "./actions";
import { Field, FormCard, Select } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { REPORTS, REPORT_LABEL } from "@/lib/reports";
import { fmtDateTime, titleCase } from "@/lib/format";

export const metadata = { title: "Reports & exports" };
const EXPORTS = [
  ["branches", "Branches", "branches", "branches"], ["tasks", "Tasks", "tasks", "tasks"], ["inspections", "Inspections", "inspections", "inspections"], ["findings", "Findings", "inspections", "inspections"],
  ["purchasing", "Requisitions", "purchasing", "purchasing"], ["tickets", "Tickets", "tickets", "tickets"], ["training", "Training completion", "training", "training"], ["statements", "Royalty statements", "royalties", "royalties"],
] as const;

export default async function Reports({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const { ok, err } = await searchParams; const denied = guard(ctx, "reports", { what: "reports" }); if (denied) return denied;
  const rows = await asUser(ctx.user.id, (db) => db.q<{ id: string; name: string; status: string; open_tasks: string; overdue_tasks: string; score: string | null; open_findings: string; open_tickets: string }>(
    `select b.id, b.name, b.status,
       (select count(*) from tasks t where t.branch_id = b.id and t.status in ('open','in_progress','blocked')) open_tasks,
       (select count(*) from tasks t where t.branch_id = b.id and t.status in ('open','in_progress','blocked') and t.due_at < now()) overdue_tasks,
       (select round(avg(score)) from inspections i where i.branch_id = b.id and i.status = 'completed' and i.completed_at > now() - interval '90 days') score,
       (select count(*) from findings f where f.branch_id = b.id and f.status <> 'verified') open_findings,
       (select count(*) from tickets k where k.branch_id = b.id and k.status in ('open','in_progress')) open_tickets
     from branches b where b.company_id = $1 and b.status <> 'closed' order by b.name`, [ctx.companyId]));
  const hist = await asUser(ctx.user.id, async (db) => ({
    schedules: await db.q<{ id: string; kind: string; frequency: string; weekday: number | null; recipients: string[]; active: boolean; last_run_at: string | null }>("select id, kind, frequency, weekday, recipients, active, last_run_at from report_schedules where company_id = $1 order by created_at", [ctx.companyId]),
    runs: await db.q<{ id: string; kind: string; trigger: string; row_count: number; status: string; detail: string | null; at: string; who: string | null }>("select r.id, r.kind, r.trigger, r.row_count, r.status, r.detail, r.at, coalesce(nullif(p.display_name,''), p.email) who from report_runs r left join profiles p on p.id = r.run_by where r.company_id = $1 order by r.id desc limit 25", [ctx.companyId]),
  }));
  const canSchedule = ctx.has("create", "reports"); const myKinds = Object.entries(REPORTS).filter(([, d]) => ctx.has(d.action as "export", d.resource as "reports")).map(([k]) => ({ value: k, label: REPORT_LABEL[k] ?? k }));
  const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const canExport = (res: string) => ctx.has("export", res as never);
  return (
    <>
      <PageHeader title="Reports & exports" description="Everything here respects your permissions and branch scope. Exports download as CSV." />
      <Flash ok={ok} err={err} />
      <h2 className="mb-1 text-sm font-semibold text-muted">Branch comparison <span className="font-normal">(open items now; inspection score is the 90-day average)</span></h2>
      {rows.length === 0 ? <StateMessage title="No branches to compare">Add branches to see them side by side.</StateMessage> : (
        <TableWrap label="Branch comparison"><thead><tr><Th>Branch</Th><Th num>Open tasks</Th><Th num>Overdue tasks</Th><Th num>Inspection score</Th><Th num>Open findings</Th><Th num>Open tickets</Th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><Td><Link className="font-medium text-brand" href={`/branches/${r.id}`}>{r.name}</Link></Td><Td num>{r.open_tasks}</Td><Td num>{r.overdue_tasks}</Td><Td num>{r.score === null ? "—" : `${r.score}%`}</Td><Td num>{r.open_findings}</Td><Td num>{r.open_tickets}</Td></tr>)}</tbody></TableWrap>)}
      <div className="mt-4 max-w-prose"><Panel title="Export data (CSV)">
        <ul className="grid gap-1 sm:grid-cols-2">{EXPORTS.filter(([, , res]) => canExport(res)).map(([k, l]) => <li key={k}><a className="flex min-h-touch items-center rounded-md border border-line px-2 text-sm font-medium text-brand hover:bg-sunken" href={`/api/export/${k}`}>{l}</a></li>)}</ul>
        <p className="mt-1 text-xs text-muted">Spreadsheet formulas in cells are neutralised, so a file is safe to open.</p></Panel></div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <Panel title="Scheduled reports">{hist.schedules.length === 0 ? <p className="text-sm text-muted">Nothing scheduled.</p> : (
          <ul className="divide-y divide-line">{hist.schedules.map((x) => <li key={x.id} className="flex items-start justify-between gap-2 py-1.5 text-sm"><span><span className="font-medium">{REPORT_LABEL[x.kind] ?? x.kind}</span> · {titleCase(x.frequency)}{x.frequency === "weekly" && x.weekday !== null ? ` on ${days[x.weekday]}` : ""}<span className="block text-xs text-muted">to {x.recipients.join(", ")} · {x.last_run_at ? `last sent ${fmtDateTime(x.last_run_at, ctx.company.timezone)}` : "not sent yet"}{!x.active ? " · switched off" : ""}</span></span>
            {canSchedule && <form action={removeSchedule}><input type="hidden" name="id" value={x.id} /><SubmitButton variant="secondary" pending="…">Remove</SubmitButton></form>}</li>)}</ul>)}</Panel>
        {canSchedule && myKinds.length > 0 && <FormCard title="Email a report on a schedule"><form action={addSchedule} className="space-y-2"><Select label="Report" name="kind" options={myKinds} /><div className="grid grid-cols-2 gap-2"><Select label="How often" name="frequency" options={[{ value: "daily", label: "Every day" }, { value: "weekly", label: "Every week" }, { value: "monthly", label: "1st of the month" }]} /><Select label="Weekly on" name="weekday" defaultValue="1" options={days.map((d, i) => ({ value: String(i), label: d }))} /></div>
          <Field label="Send to (emails, comma separated)" name="recipients" required /><SubmitButton pending="Saving…">Schedule</SubmitButton></form></FormCard>}
      </div>
      <h2 className="mb-1 mt-4 text-sm font-semibold text-muted">Export history</h2>
      {hist.runs.length === 0 ? <p className="text-sm text-muted">No exports yet.</p> : (
        <TableWrap label="Export history"><thead><tr><Th>When</Th><Th>Report</Th><Th>How</Th><Th>By</Th><Th num>Rows</Th><Th>Result</Th></tr></thead>
          <tbody>{hist.runs.map((r) => <tr key={r.id}><Td>{fmtDateTime(r.at, ctx.company.timezone)}</Td><Td>{REPORT_LABEL[r.kind] ?? r.kind}</Td><Td>{r.trigger === "manual" ? "Downloaded" : "Scheduled"}</Td><Td>{r.who ?? "—"}</Td><Td num>{r.row_count}</Td><Td><Status tone={r.status === "ok" ? "ok" : "danger"}>{r.status === "ok" ? "OK" : "Failed"}</Status>{r.detail && <span className="block text-xs text-muted">{r.detail}</span>}</Td></tr>)}</tbody></TableWrap>)}
    </>
  );
}
