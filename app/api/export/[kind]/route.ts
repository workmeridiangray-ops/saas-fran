import { NextResponse } from "next/server";
import { asUser } from "@/lib/db";
import { currentSession, activeWorkspaceId } from "@/lib/auth/session";
import { myWorkspaces } from "@/lib/ctx";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

/** CSV reports. Each query runs as the signed-in user, so row-level security limits what they can export. */
const REPORTS: Record<string, { resource: string; action: string; headers: string[]; sql: string }> = {
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
const COMPANY_TABLES = ["branches", "brands", "regions", "legal_entities", "franchise_partners", "departments", "tasks", "checklist_runs", "approval_requests", "approval_decisions", "suppliers", "catalog_items", "requisitions", "requisition_lines", "purchase_orders", "po_lines", "goods_receipts", "receipt_lines", "inspections", "findings", "corrective_actions", "tickets", "ticket_comments", "documents", "document_versions", "acknowledgements", "courses", "enrolments", "royalty_rules", "sales_reports", "statements", "partner_payments", "payment_allocations", "assets", "licences", "platform_invoices"];

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const s = await currentSession(); const { kind } = await params;
  if (!s || s.pending2fa) return new NextResponse("Sign in required", { status: 401 });
  const wanted = await activeWorkspaceId(); const ws = (await myWorkspaces(s.id)).find((w) => w.company_id === wanted);
  if (!ws) return new NextResponse("Choose a workspace first", { status: 400 });
  const roleHas = (res: string, act: string) => ws.grants.flat().some((g) => (g.resource === "*" || g.resource === res) && (g.actions === "*" || g.actions.includes(act as never)));
  const stamp = new Date().toISOString().slice(0, 10);

  if (kind === "company") {
    if (!roleHas("billing", "configure")) return new NextResponse("Only a billing owner can export everything", { status: 403 });
    const out: Record<string, unknown> = { exported_at: new Date().toISOString(), company: ws.name };
    await asUser(s.id, async (db) => { for (const t of COMPANY_TABLES) out[t] = await db.q(`select * from ${t} where company_id = $1`, [ws.company_id]); });
    return new NextResponse(JSON.stringify(out, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="company-export-${stamp}.json"`, "Cache-Control": "private, no-store" } });
  }
  const r = REPORTS[kind];
  if (!r) return new NextResponse("Unknown report", { status: 404 });
  if (!roleHas(r.resource, r.action)) return new NextResponse("You don't have permission to export this", { status: 403 });
  const rows = await asUser(s.id, (db) => db.qa(r.sql, [ws.company_id]));
  return new NextResponse(toCsv(r.headers, rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${kind}-${stamp}.csv"`, "Cache-Control": "private, no-store" } });
}
