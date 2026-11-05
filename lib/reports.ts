import { asUser } from "@/lib/db";
import { toCsv } from "@/lib/csv";

export interface ReportDef { resource: string; action: string; headers: string[]; sql: string; label?: string }
/** CSV reports. Each runs as the person it is for, so row-level security limits what they get. */
export const REPORTS: Record<string, ReportDef> = {
  branches: { resource: "branches", action: "export", headers: ["Code", "Name", "Status", "Ownership", "Region", "Brand", "Time zone"], sql: "select b.code, b.name, b.status, b.ownership, r.name, br.name, b.timezone from branches b left join regions r on r.id = b.region_id left join brands br on br.id = b.brand_id where b.company_id = $1 order by b.name" },
  tasks: { resource: "tasks", action: "export", headers: ["Title", "Branch", "Assignee", "Status", "Priority", "Due", "Completed"], sql: "select t.title, b.name, coalesce(p.display_name, p.email), t.status, t.priority, t.due_at, t.completed_at from tasks t left join branches b on b.id = t.branch_id left join profiles p on p.id = t.assignee_id where t.company_id = $1 order by t.created_at desc" },
  inspections: { resource: "inspections", action: "export", headers: ["Branch", "Template", "Date", "Status", "Score", "Critical failure"], sql: "select b.name, t.name, i.scheduled_for, i.status, i.score, i.critical_failed from inspections i join branches b on b.id = i.branch_id join inspection_templates t on t.id = i.template_id where i.company_id = $1 order by i.scheduled_for desc" },
  findings: { resource: "inspections", action: "export", headers: ["Branch", "Finding", "Severity", "Status", "Raised"], sql: "select b.name, f.text, f.severity, f.status, f.created_at from findings f join branches b on b.id = f.branch_id where f.company_id = $1 order by f.created_at desc" },
  purchasing: { resource: "purchasing", action: "export", headers: ["Number", "Branch", "Supplier", "Status", "Total (minor units)", "Created"], sql: "select r.number, b.name, s.name, r.status, r.total_minor, r.created_at from requisitions r join branches b on b.id = r.branch_id join suppliers s on s.id = r.supplier_id where r.company_id = $1 order by r.created_at desc" },
  tickets: { resource: "tickets", action: "export", headers: ["Number", "Title", "Type", "Branch", "Status", "Priority", "Raised", "Resolved"], sql: "select t.number, t.title, t.kind, b.name, t.status, t.priority, t.created_at, t.resolved_at from tickets t left join branches b on b.id = t.branch_id where t.company_id = $1 order by t.created_at desc" },
  training: { resource: "training", action: "export", headers: ["Person", "Course", "Status", "Score", "Completed", "Expires"], sql: "select coalesce(p.display_name, p.email), c.title, e.status, e.score, e.completed_at, e.expires_at from enrolments e join courses c on c.id = e.course_id join profiles p on p.id = e.user_id where e.company_id = $1 order by 2, 1" },
  statements: { resource: "royalties", action: "export", headers: ["Number", "Partner", "Branch", "Period", "Royalty (minor units)", "Status", "Due"], sql: "select s.number, p.name, b.name, s.period, s.royalty_minor, s.status, s.due_date from statements s join franchise_partners p on p.id = s.partner_id join branches b on b.id = s.branch_id where s.company_id = $1 order by s.period desc" },
  audit: { resource: "organisation", action: "configure", headers: ["When", "Who", "Table", "Operation", "Fields changed"], sql: "select a.at, coalesce(p.display_name, p.email), a.table_name, a.op, array_to_string(a.changed_fields, ' ') from audit_log a left join profiles p on p.id = a.actor where a.company_id = $1 order by a.at desc limit 5000" },
};

export const REPORT_LABEL: Record<string, string> = { branches: "Branches", tasks: "Tasks", inspections: "Inspections", findings: "Findings", purchasing: "Requisitions", tickets: "Tickets", training: "Training completion", statements: "Royalty statements", audit: "Audit log" };

/** Run one report as a user. Returns null if the kind is unknown. */
export async function runReport(userId: string, companyId: string, kind: string): Promise<{ csv: string; rows: number } | null> {
  const r = REPORTS[kind]; if (!r) return null;
  const rows = await asUser(userId, (db) => db.qa(r.sql, [companyId]));
  return { csv: toCsv(r.headers, rows), rows: rows.length };
}
