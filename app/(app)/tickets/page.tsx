import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { Flash } from "@/components/ui/flash";
import { Field, FormCard } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { saveSla } from "./actions";
import { Button, ButtonLink, PageHeader, StateMessage, Status, TableWrap, Td, Th, type Tone } from "@/components/ui";
import { fmtDate, titleCase } from "@/lib/format";

export const metadata = { title: "Tickets" };
const TONE: Record<string, Tone> = { open: "info", in_progress: "info", resolved: "ok", closed: "neutral" };

export default async function Tickets({ searchParams }: { searchParams: Promise<{ kind?: string; status?: string; q?: string; tab?: string; ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "tickets", { module: "tickets", what: "tickets" }); if (denied) return denied;
  const { kind = "", status = "", q = "", tab = "list", ok, err } = await searchParams;
  if (tab === "sla") {
    const pol = await asUser(ctx.user.id, (db) => db.q<{ priority: string; resolve_hours: number }>("select priority, resolve_hours from sla_policies where company_id = $1", [ctx.companyId]));
    const defaults: Record<string, number> = { urgent: 4, high: 24, normal: 72, low: 168 };
    return (<>
      <PageHeader title="Response deadlines" description="How long each priority has before it counts as late. Late tickets escalate: first to people who manage tickets, a day later to the owners." actions={<Link href="/tickets" className="inline-flex min-h-touch items-center text-sm font-medium text-brand">Back to tickets</Link>} />
      <Flash ok={ok} err={err} />
      <FormCard title="Hours to resolve">{ctx.has("configure", "tickets") ? <form action={saveSla} className="space-y-2">{["urgent", "high", "normal", "low"].map((p) => <Field key={p} label={titleCase(p)} name={`h:${p}`} type="number" min={1} defaultValue={String(pol.find((x) => x.priority === p)?.resolve_hours ?? "")} hint={`Leave blank for the default of ${defaults[p]} hours.`} />)}<SubmitButton>Save deadlines</SubmitButton></form> : <p className="text-sm text-muted">Only people who configure tickets can change these.</p>}</FormCard>
    </>);
  }
  const rows = await asUser(ctx.user.id, (db) => db.q<{ id: string; number: string; title: string; kind: string; status: string; priority: string; branch: string | null; created_at: string; assignee: string | null; due_at: string | null; escalation_level: number }>(
    `select t.id, t.number, t.title, t.kind, t.status, t.priority, b.name branch, t.created_at, t.due_at, t.escalation_level, coalesce(nullif(p.display_name,''), p.email) assignee from tickets t left join branches b on b.id = t.branch_id left join profiles p on p.id = t.assignee_id
      where t.company_id = $1 and ($2 = '' or t.kind = $2) and ($3 = '' or t.status = $3) and ($4 = '' or t.title ilike '%'||$4||'%' or t.number ilike '%'||$4||'%')
      order by (t.status in ('resolved','closed')), array_position(array['urgent','high','normal','low'], t.priority), t.created_at desc limit 300`, [ctx.companyId, kind, status, q]));
  return (
    <>
      <PageHeader title="Tickets" description="Internal requests, customer complaints and incidents, kept separate by type." actions={<>{ctx.has("configure", "tickets") && <ButtonLink href="/tickets?tab=sla">Deadlines</ButtonLink>}{ctx.has("create", "tickets") && <ButtonLink href="/tickets/new" variant="primary">Raise a ticket</ButtonLink>}</>} />
      <Flash ok={ok} err={err} />
      <form className="mb-2 flex flex-wrap items-end gap-1.5" role="search" aria-label="Filter tickets">
        <div><label htmlFor="q" className="mb-0.5 block text-xs font-medium text-muted">Search</label><input id="q" name="q" defaultValue={q} className="min-h-touch rounded-md border border-line-strong bg-surface px-1.5 text-sm" /></div>
        <div><label htmlFor="kind" className="mb-0.5 block text-xs font-medium text-muted">Type</label><select id="kind" name="kind" defaultValue={kind} className="min-h-touch rounded-md border border-line-strong bg-surface px-1.5 text-sm"><option value="">All types</option>{["internal", "customer_complaint", "incident"].map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}</select></div>
        <div><label htmlFor="status" className="mb-0.5 block text-xs font-medium text-muted">Status</label><select id="status" name="status" defaultValue={status} className="min-h-touch rounded-md border border-line-strong bg-surface px-1.5 text-sm"><option value="">Any</option>{Object.keys(TONE).map((k) => <option key={k} value={k}>{titleCase(k)}</option>)}</select></div>
        <Button type="submit">Apply</Button>{(q || kind || status) && <Link href="/tickets" className="min-h-touch content-center text-sm font-medium text-brand">Clear filters</Link>}</form>
      {rows.length === 0 ? <StateMessage title={q || kind || status ? "No tickets match" : "No tickets yet"} actions={<ButtonLink href="/tickets/new" variant="primary">Raise a ticket</ButtonLink>}>Raise a ticket for equipment failures, purchasing queries, complaints or safety incidents.</StateMessage> : (
        <TableWrap label="Tickets"><thead><tr><Th>Ticket</Th><Th>Type</Th><Th>Branch</Th><Th>Assignee</Th><Th>Priority</Th><Th>Due</Th><Th>Status</Th></tr></thead>
          <tbody>{rows.map((t) => <tr key={t.id}><Td><Link className="font-medium text-brand" href={`/tickets/${t.id}`}>{t.title}</Link><span className="block text-xs text-muted">{t.number}</span></Td><Td>{titleCase(t.kind)}</Td><Td>{t.branch ?? "—"}</Td><Td>{t.assignee ?? "Unassigned"}</Td><Td>{titleCase(t.priority)}</Td><Td>{t.due_at ? fmtDate(t.due_at, ctx.company.timezone) : "—"}</Td><Td><Status tone={TONE[t.status] ?? "neutral"}>{titleCase(t.status)}</Status>{["open", "in_progress"].includes(t.status) && t.due_at && new Date(t.due_at) < new Date() && <> <Status tone={t.escalation_level >= 2 ? "danger" : "warn"}>{t.escalation_level >= 2 ? "Escalated to owners" : t.escalation_level === 1 ? "Late, escalated" : "Late"}</Status></>}</Td></tr>)}</tbody></TableWrap>)}
    </>
  );
}
