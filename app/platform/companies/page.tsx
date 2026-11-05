import Link from "next/link";
import { asService } from "@/lib/db";
import { PageHeader, StateMessage, Status, TableWrap, Td, Th, type Tone } from "@/components/ui";
import { fmtDate, titleCase } from "@/lib/format";

export const metadata = { title: "Companies" };
const TONE: Record<string, Tone> = { trial: "info", active: "ok", past_due: "warn", suspended: "danger", closing: "warn", closed: "neutral" };

export default async function Companies({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const { q = "", status = "" } = await searchParams;
  const rows = await asService((db) => db.q<{ id: string; name: string; status: string; plan: string | null; created_at: string; branches: string; users: string }>(
    `select c.id, c.name, c.status, s.plan_id plan, c.created_at, (select count(*) from branches b where b.company_id = c.id and b.status <> 'closed') branches, (select count(*) from memberships m where m.company_id = c.id and m.status = 'active') users
       from companies c left join subscriptions s on s.company_id = c.id where ($1 = '' or c.name ilike '%'||$1||'%' or c.slug ilike '%'||$1||'%') and ($2 = '' or c.status = $2) order by c.created_at desc limit 200`, [q, status]));
  return (
    <>
      <PageHeader title="Companies" />
      <form className="mb-2 flex items-end gap-1" role="search" aria-label="Filter companies"><div><label htmlFor="q" className="mb-0.5 block text-xs font-medium text-muted">Search</label><input id="q" name="q" defaultValue={q} className="min-h-touch rounded-md border border-line-strong bg-surface px-1.5 text-sm" /></div>
        <div><label htmlFor="status" className="mb-0.5 block text-xs font-medium text-muted">Status</label><select id="status" name="status" defaultValue={status} className="min-h-touch rounded-md border border-line-strong bg-surface px-1.5 text-sm"><option value="">All</option>{Object.keys(TONE).map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}</select></div>
        <button className="inline-flex min-h-touch items-center rounded-md border border-line-strong bg-surface px-3 text-sm font-medium">Apply</button></form>
      {rows.length === 0 ? <StateMessage title="No companies match">Try a different search.</StateMessage> : (
        <TableWrap label="Companies"><thead><tr><Th>Company</Th><Th>Plan</Th><Th>Status</Th><Th num>Branches</Th><Th num>Users</Th><Th>Created</Th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.id}><Td><Link className="font-medium text-brand" href={`/platform/companies/${r.id}`}>{r.name}</Link></Td><Td>{r.plan ?? "—"}</Td><Td><Status tone={TONE[r.status] ?? "neutral"}>{titleCase(r.status)}</Status></Td><Td num>{r.branches}</Td><Td num>{r.users}</Td><Td>{fmtDate(r.created_at)}</Td></tr>)}</tbody></TableWrap>)}
    </>
  );
}
