import { asUser, type Db } from "@/lib/db";
import { toCsv } from "@/lib/csv";
import { buildQuery, isDataset, type ReportSpec } from "@/lib/rules/report-builder";
import { loadFields } from "@/lib/studio";

export interface SavedReport { id: string; name: string; dataset: string; columns: string[]; filters: ReportSpec["filters"]; sort: string | null; descending: boolean }

export const toSpec = (r: SavedReport): ReportSpec => ({ dataset: (isDataset(r.dataset) ? r.dataset : "branches"), columns: r.columns, filters: r.filters ?? {}, sort: r.sort ?? undefined, desc: r.descending });

/** Run a spec as a person: row-level security decides which rows they get. */
export async function runSpec(userId: string, companyId: string, spec: ReportSpec, limit?: number): Promise<{ headers: string[]; rows: unknown[][] }> {
  return asUser(userId, async (db: Db) => {
    const custom = await loadFields(db, companyId, spec.dataset);
    const q = buildQuery(spec, custom, limit);
    return { headers: q.headers, rows: await db.qa(q.sql, [companyId, ...q.params]) };
  });
}
export async function runSpecCsv(userId: string, companyId: string, spec: ReportSpec) {
  const r = await runSpec(userId, companyId, spec); return { csv: toCsv(r.headers, r.rows), rows: r.rows.length };
}
