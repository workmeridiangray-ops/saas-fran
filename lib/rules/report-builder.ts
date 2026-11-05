/**
 * Custom reports. People pick a dataset, columns and simple filters; the SQL is assembled only from the
 * whitelists below, never from user text, and always runs as the person (row-level security applies).
 */
import type { FieldDef } from "./studio";

export type Dataset = "branches" | "tasks" | "tickets";
export interface Col { id: string; label: string; sql: string }
interface DatasetDef { label: string; resource: "branches" | "tasks" | "tickets"; from: string; alias: string; statuses: string[]; created: string; cols: Col[] }

export const DATASETS: Record<Dataset, DatasetDef> = {
  branches: {
    label: "Branches", resource: "branches", alias: "b", created: "b.created_at", statuses: ["planned", "opening", "active", "suspended", "closing", "closed"],
    from: "branches b left join regions r on r.id = b.region_id left join brands br on br.id = b.brand_id",
    cols: [
      { id: "code", label: "Code", sql: "b.code" }, { id: "name", label: "Name", sql: "b.name" }, { id: "status", label: "Status", sql: "b.status" },
      { id: "ownership", label: "Ownership", sql: "b.ownership" }, { id: "region", label: "Region", sql: "r.name" }, { id: "brand", label: "Brand", sql: "br.name" },
      { id: "timezone", label: "Time zone", sql: "b.timezone" }, { id: "created", label: "Added", sql: "b.created_at" },
    ],
  },
  tasks: {
    label: "Tasks", resource: "tasks", alias: "t", created: "t.created_at", statuses: ["open", "in_progress", "blocked", "done", "cancelled"],
    from: "tasks t left join branches b on b.id = t.branch_id left join profiles p on p.id = t.assignee_id",
    cols: [
      { id: "title", label: "Title", sql: "t.title" }, { id: "branch", label: "Branch", sql: "b.name" }, { id: "assignee", label: "Assignee", sql: "coalesce(p.display_name, p.email)" },
      { id: "status", label: "Status", sql: "t.status" }, { id: "priority", label: "Priority", sql: "t.priority" }, { id: "due", label: "Due", sql: "t.due_at" },
      { id: "completed", label: "Completed", sql: "t.completed_at" }, { id: "created", label: "Created", sql: "t.created_at" },
    ],
  },
  tickets: {
    label: "Tickets", resource: "tickets", alias: "t", created: "t.created_at", statuses: ["open", "in_progress", "resolved", "closed"],
    from: "tickets t left join branches b on b.id = t.branch_id",
    cols: [
      { id: "number", label: "Number", sql: "t.number" }, { id: "title", label: "Title", sql: "t.title" }, { id: "kind", label: "Type", sql: "t.kind" }, { id: "branch", label: "Branch", sql: "b.name" },
      { id: "status", label: "Status", sql: "t.status" }, { id: "priority", label: "Priority", sql: "t.priority" }, { id: "raised", label: "Raised", sql: "t.created_at" },
      { id: "due", label: "Respond by", sql: "t.due_at" }, { id: "resolved", label: "Resolved", sql: "t.resolved_at" },
    ],
  },
};
export const isDataset = (d: string): d is Dataset => d in DATASETS;

export interface Filters { status?: string; from?: string; to?: string }
export interface ReportSpec { dataset: Dataset; columns: string[]; filters: Filters; sort?: string; desc?: boolean }
export const MAX_COLUMNS = 14;

/** The selectable columns for a dataset, including the company's own fields (ids look like "cf:seats"). */
export function columnCatalog(dataset: Dataset, custom: FieldDef[] = []): Col[] {
  const d = DATASETS[dataset];
  return [...d.cols, ...custom.map((f) => ({ id: `cf:${f.key}`, label: f.label, sql: `${d.alias}.custom ->> '${f.key.replace(/[^a-z0-9_]/g, "")}'` }))];
}

export function validateSpec(spec: ReportSpec, custom: FieldDef[] = []): string | null {
  if (!isDataset(spec.dataset)) return "Choose what the report is about.";
  const cat = columnCatalog(spec.dataset, custom).map((c) => c.id);
  if (spec.columns.length === 0) return "Pick at least one column.";
  if (spec.columns.length > MAX_COLUMNS) return `Pick ${MAX_COLUMNS} columns at most.`;
  if (new Set(spec.columns).size !== spec.columns.length) return "A column is listed twice.";
  if (spec.columns.some((c) => !cat.includes(c))) return "One of the columns isn't available.";
  if (spec.sort && !spec.columns.includes(spec.sort)) return "Sort by one of the chosen columns.";
  const { status, from, to } = spec.filters;
  if (status && !DATASETS[spec.dataset].statuses.includes(status)) return "That status isn't valid for this report.";
  for (const d of [from, to]) if (d && (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d)))) return "Dates must look like 2026-03-31.";
  if (from && to && from > to) return "The start date is after the end date.";
  return null;
}

/** Build the parameterised query. $1 is the company id; filters add $2.. as needed. */
export function buildQuery(spec: ReportSpec, custom: FieldDef[] = [], limit?: number): { sql: string; params: unknown[]; headers: string[] } {
  const err = validateSpec(spec, custom); if (err) throw new Error(err);
  const d = DATASETS[spec.dataset]; const cat = columnCatalog(spec.dataset, custom); const byId = new Map(cat.map((c) => [c.id, c]));
  const cols = spec.columns.map((id) => byId.get(id)!);
  const where = [`${d.alias}.company_id = $1`]; const params: unknown[] = [];
  const p = (v: unknown) => { params.push(v); return `$${params.length + 1}`; };
  if (spec.filters.status) where.push(`${d.alias}.status = ${p(spec.filters.status)}`);
  if (spec.filters.from) where.push(`${d.created} >= ${p(spec.filters.from)}::date`);
  if (spec.filters.to) where.push(`${d.created} < ${p(spec.filters.to)}::date + 1`);
  const sortCol = spec.sort ? byId.get(spec.sort) : undefined;
  const order = sortCol ? `${sortCol.sql} ${spec.desc ? "desc" : "asc"} nulls last` : `${d.created} desc`;
  return { sql: `select ${cols.map((c) => c.sql).join(", ")} from ${d.from} where ${where.join(" and ")} order by ${order}${limit ? ` limit ${Math.floor(limit)}` : ""}`, params, headers: cols.map((c) => c.label) };
}
