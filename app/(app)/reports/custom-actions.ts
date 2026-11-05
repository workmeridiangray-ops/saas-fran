"use server";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { fail, run, str, uuid } from "@/lib/flash";
import { DATASETS, isDataset, validateSpec, type ReportSpec } from "@/lib/rules/report-builder";
import { loadFields } from "@/lib/studio";

function specFromForm(f: FormData): ReportSpec {
  const dataset = str(f, "dataset");
  return { dataset: isDataset(dataset) ? dataset : "branches", columns: f.getAll("col").map(String), filters: { status: str(f, "status") || undefined, from: str(f, "from") || undefined, to: str(f, "to") || undefined }, sort: str(f, "sort") || undefined, desc: str(f, "dir") === "desc" };
}

export async function saveCustomReport(f: FormData) {
  const ctx = await requireCtx(); const spec = specFromForm(f); const name = str(f, "name");
  const back = `/reports/builder?${new URLSearchParams([["dataset", spec.dataset], ...spec.columns.map((c) => ["col", c]), ["status", spec.filters.status ?? ""], ["from", spec.filters.from ?? ""], ["to", spec.filters.to ?? ""], ["sort", spec.sort ?? ""], ["dir", spec.desc ? "desc" : "asc"]])}`;
  return run(back, "/reports", "Report saved.", async () => {
    if (!ctx.has("create", "reports")) fail("You don't have permission to save reports.");
    if (!ctx.has("export", DATASETS[spec.dataset].resource)) fail("You don't have permission to export that data.");
    if (name.length < 2) fail("Give the report a name.");
    await asUser(ctx.user.id, async (db) => {
      const err = validateSpec(spec, await loadFields(db, ctx.companyId, spec.dataset)); if (err) fail(err);
      await db.q("insert into custom_reports(company_id, name, dataset, columns, filters, sort, descending, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8)",
        [ctx.companyId, name, spec.dataset, spec.columns, JSON.stringify(Object.fromEntries(Object.entries(spec.filters).filter(([, v]) => v))), spec.sort ?? null, !!spec.desc, ctx.user.id]);
    });
  });
}
export async function deleteCustomReport(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id");
  return run("/reports", "/reports", "Report removed.", async () => {
    const n = await asUser(ctx.user.id, (db) => db.q("delete from custom_reports where id = $1 returning id", [id]));
    if (n.length === 0) fail("You can't remove that report.");
  });
}
