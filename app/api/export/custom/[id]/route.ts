import { NextResponse } from "next/server";
import { asUser } from "@/lib/db";
import { currentSession, activeWorkspaceId } from "@/lib/auth/session";
import { myWorkspaces } from "@/lib/ctx";
import { DATASETS } from "@/lib/rules/report-builder";
import { runSpecCsv, toSpec, type SavedReport } from "@/lib/reports-custom";

export const dynamic = "force-dynamic";

/** Download a saved custom report as CSV, run as the signed-in person (row-level security applies). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await currentSession(); const { id } = await params;
  if (!s || s.pending2fa) return new NextResponse("Sign in required", { status: 401 });
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Unknown report", { status: 404 });
  const wanted = await activeWorkspaceId(); const ws = (await myWorkspaces(s.id)).find((w) => w.company_id === wanted);
  if (!ws) return new NextResponse("Choose a workspace first", { status: 400 });
  const rep = await asUser(s.id, (db) => db.one<SavedReport>("select id, name, dataset, columns, filters, sort, descending from custom_reports where id = $1 and company_id = $2", [id, ws.company_id]));
  if (!rep) return new NextResponse("Unknown report", { status: 404 });
  const spec = toSpec(rep); const res = DATASETS[spec.dataset].resource;
  const ok = ws.grants.flat().some((g) => (g.resource === "*" || g.resource === res) && (g.actions === "*" || g.actions.includes("export")));
  if (!ok) return new NextResponse("You don't have permission to export this", { status: 403 });
  const out = await runSpecCsv(s.id, ws.company_id, spec);
  await asUser(s.id, (db) => db.q("insert into report_runs(company_id, kind, trigger, run_by, row_count, status) values ($1,$2,'manual',$3,$4,'ok')", [ws.company_id, `custom:${rep.name}`.slice(0, 80), s.id, out.rows])).catch(() => undefined);
  const file = rep.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "report";
  return new NextResponse(out.csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${file}-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store" } });
}
