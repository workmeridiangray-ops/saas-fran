import { NextResponse } from "next/server";
import { asUser } from "@/lib/db";
import { currentSession, activeWorkspaceId } from "@/lib/auth/session";
import { myWorkspaces } from "@/lib/ctx";
import { REPORTS, runReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

/** CSV reports. Each query runs as the signed-in user, so row-level security limits what they can export. */
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
  const out = (await runReport(s.id, ws.company_id, kind))!;
  await asUser(s.id, (db) => db.q("insert into report_runs(company_id, kind, trigger, run_by, row_count, status) values ($1,$2,'manual',$3,$4,'ok')", [ws.company_id, kind, s.id, out.rows])).catch(() => undefined);   // export history
  return new NextResponse(out.csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${kind}-${stamp}.csv"`, "Cache-Control": "private, no-store" } });
}
