import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { Flash } from "@/components/ui/flash";
import { Button, ButtonLink, PageHeader, StateMessage, Status, TableWrap, Td, Th, type Tone } from "@/components/ui";
import { fmtDate, titleCase } from "@/lib/format";

export const metadata = { title: "Tickets" };
const TONE: Record<string, Tone> = { open: "info", in_progress: "info", resolved: "ok", closed: "neutral" };

export default async function Tickets({ searchParams }: { searchParams: Promise<{ kind?: string; status?: string; q?: string; ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "tickets", { module: "tickets", what: "tickets" }); if (denied) return denied;
  const { kind = "", status = "", q = "", ok, err } = await searchParams;
  const rows = await asUser(ctx.user.id, (db) => db.q<{ id: string; number: string; title: string; kind: string; status: string; priority: string; branch: string | null; created_at: string; assignee: string | null }>(
    `select t.id, t.number, t.title, t.kind, t.status, t.priority, b.name branch, t.created_at, coalesce(nullif(p.display_name,''), p.email) assignee from tickets t left join branches b on b.id = t.branch_id left join profiles p on p.id = t.assignee_id
      where t.company_id = $1 and ($2 = '' or t.kind = $2) and ($3 = '' or t.status = $3) and ($4 = '' or t.title ilike '%'||$4||'%' or t.number ilike '%'||$4||'%')
      order by (t.status in ('resolved','closed')), array_position(array['urgent','high','normal','low'], t.priority), t.created_at desc limit 300`, [ctx.companyId, kind, status, q]));
  return (
    <>
      <PageHeader title="Tickets" description="Internal requests, customer complaints and incidents, kept separate by type." actions={ctx.has("create", "tickets") ? <ButtonLink href="/tickets/new" variant="primary">Raise a ticket</ButtonLink> : undefined} />
      <Flash ok={ok} err={err} />
      <form className="mb-2 flex flex-wrap items-end gap-1.5" role="search" aria-label="Filter tickets">
        <div><label htmlFor="q" className="mb-0.5 block text-xs font-medium text-muted">Search</label><input id="q" name="q" defaultValue={q} className="min-h-touch rounded-md border border-line-strong bg-surface px-1.5 text-sm" /></div>
        <div><label htmlFor="kind" className="mb-0.5 block text-xs font-medium text-muted">Type</label><select id="kind" name="kind" defaultValue={kind} className="min-h-touch rounded-md border border-line-strong bg-surface px-1.5 text-sm"><option value="">All types</option>{["internal", "customer_complaint", "incident"].map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}</select></div>
        <div><label htmlFor="status" className="mb-0.5 block text-xs font-medium text-muted">Status</label><select id="status" name="status" defaultValue={status} className="min-h-touch rounded-md border border-line-strong bg-surface px-1.5 text-sm"><option value="">Any</option>{Object.keys(TONE).map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}</select></div>
        <Button type="submit">Apply</Button>{(q || kind || status) && <Link href="/tickets" className="min-h-touch content-center text-sm font-medium text-brand">Clear filters</Link>}</form>
      {rows.length === 0 ? <StateMessage title={q || kind || status ? "No tickets match" : "No tickets yet"} actions={<ButtonLink href="/tickets/new" variant="primary">Raise a ticket</ButtonLink>}>Raise a ticket for equipment failures, purchasing queries, complaints or safety incidents.</StateMessage> : (
        <TableWrap label="Tickets"><thead><tr><Th>Ticket</Th><Th>Type</Th><Th>Branch</Th><Th>Assignee</Th><Th>Priority</Th><Th>Raised</Th><Th>Status</Th></tr></thead>
          <tbody>{rows.map((t) => <tr key={t.id}><Td><Link className="font-medium text-brand" href={`/tickets/${t.id}`}>{t.title}</Link><span className="block text-xs text-muted">{t.number}</span></Td><Td>{titleCase(t.kind)}</Td><Td>{t.branch ?? "—"}</Td><Td>{t.assignee ?? "Unassigned"}</Td><Td>{titleCase(t.priority)}</Td><Td>{fmtDate(t.created_at, ctx.company.timezone)}</Td><Td><Status tone={TONE[t.status] ?? "neutral"}>{titleCase(t.status)}</Status></Td></tr>)}</tbody></TableWrap>)}
    </>
  );
}
