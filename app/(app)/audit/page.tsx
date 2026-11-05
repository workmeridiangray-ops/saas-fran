import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { PageHeader, StateMessage, Status, TableWrap, Td, Th } from "@/components/ui";
import { fmtDateTime, titleCase } from "@/lib/format";

export const metadata = { title: "Audit log" };

export default async function Audit({ searchParams }: { searchParams: Promise<{ table?: string; page?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "organisation", { action: "configure", what: "the audit log" }); if (denied) return denied;
  const { table = "", page = "1" } = await searchParams; const p = Math.max(1, Number(page) || 1); const size = 50;
  const d = await asUser(ctx.user.id, async (db) => ({
    rows: await db.q<{ at: string; who: string | null; table_name: string; op: string; row_id: string | null; changed_fields: string[] | null }>("select a.at, coalesce(nullif(p.display_name,''), p.email) who, a.table_name, a.op, a.row_id, a.changed_fields from audit_log a left join profiles p on p.id = a.actor where a.company_id = $1 and ($2 = '' or a.table_name = $2) order by a.id desc limit $3 offset $4", [ctx.companyId, table, size + 1, (p - 1) * size]),
    tables: await db.q<{ table_name: string }>("select distinct table_name from audit_log where company_id = $1 order by 1", [ctx.companyId]),
  }));
  const more = d.rows.length > size; const rows = d.rows.slice(0, size);
  const link = (n: number) => `/audit?${new URLSearchParams({ ...(table && { table }), page: String(n) })}`;
  return (
    <>
      <PageHeader title="Audit log" description="Who changed what, and when. Field names are recorded, never the values. It can't be edited or deleted." actions={ctx.has("export", "organisation") && <a href="/api/export/audit" className="inline-flex min-h-touch items-center text-sm font-medium text-brand">Export CSV</a>} />
      <form className="mb-2 flex items-end gap-1" role="search" aria-label="Filter audit log"><div><label htmlFor="table" className="mb-0.5 block text-xs font-medium text-muted">Record type</label><select id="table" name="table" defaultValue={table} className="min-h-touch rounded-md border border-line-strong bg-surface px-1.5 text-sm"><option value="">All</option>{d.tables.map((t) => <option key={t.table_name} value={t.table_name}>{titleCase(t.table_name)}</option>)}</select></div><button className="inline-flex min-h-touch items-center rounded-md border border-line-strong bg-surface px-3 text-sm font-medium">Apply</button></form>
      {rows.length === 0 ? <StateMessage title="Nothing recorded">Changes to records appear here as they happen.</StateMessage> : (
        <TableWrap label="Audit log"><thead><tr><Th>When</Th><Th>Who</Th><Th>Record</Th><Th>Action</Th><Th>Fields changed</Th></tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}><Td>{fmtDateTime(r.at, ctx.company.timezone)}</Td><Td>{r.who ?? <span className="text-muted">System</span>}</Td><Td>{titleCase(r.table_name)}</Td><Td><Status tone={r.op === "DELETE" ? "danger" : r.op === "INSERT" ? "ok" : "info"}>{r.op === "INSERT" ? "Created" : r.op === "UPDATE" ? "Changed" : "Deleted"}</Status></Td><Td className="text-xs text-muted">{r.changed_fields?.join(", ") ?? "—"}</Td></tr>)}</tbody></TableWrap>)}
      <div className="mt-2 flex gap-2 text-sm">{p > 1 && <Link className="font-medium text-brand" href={link(p - 1)}>Newer</Link>}{more && <Link className="font-medium text-brand" href={link(p + 1)}>Older</Link>}</div>
    </>
  );
}
