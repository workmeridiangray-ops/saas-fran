import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { createTemplate } from "./actions";
import { FormCard, Field, TextArea } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { ButtonLink, PageHeader, Panel, StateMessage, Status, TableWrap, Td, Th, type Tone } from "@/components/ui";
import { fmtDate, titleCase } from "@/lib/format";

export const metadata = { title: "Inspections" };
const SEV: Record<string, Tone> = { minor: "neutral", major: "warn", critical: "danger" };
const FST: Record<string, Tone> = { open: "danger", fixed_pending_verification: "warn", verified: "ok", reopened: "danger" };

export default async function Inspections({ searchParams }: { searchParams: Promise<{ tab?: string; ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "inspections", { module: "inspections", what: "inspections" }); if (denied) return denied;
  const { tab = "inspections", ok, err } = await searchParams;
  const d = await asUser(ctx.user.id, async (db) => ({
    ins: tab === "inspections" ? await db.q<{ id: string; branch: string; template: string; scheduled_for: string; status: string; score: string | null; critical_failed: boolean; inspector: string | null }>("select i.id, b.name branch, t.name template, i.scheduled_for, i.status, i.score, i.critical_failed, coalesce(nullif(p.display_name,''), p.email) inspector from inspections i join branches b on b.id = i.branch_id join inspection_templates t on t.id = i.template_id left join profiles p on p.id = i.inspector_id where i.company_id = $1 order by (i.status = 'scheduled') desc, i.scheduled_for desc limit 200", [ctx.companyId]) : [],
    templates: tab === "templates" ? await db.q<{ id: string; name: string; items: unknown[] }>("select id, name, items from inspection_templates where company_id = $1 and status = 'active' order by name", [ctx.companyId]) : [],
    findings: tab === "findings" ? await db.q<{ id: string; text: string; severity: string; status: string; branch: string; created_at: string }>("select f.id, f.text, f.severity, f.status, b.name branch, f.created_at from findings f join branches b on b.id = f.branch_id where f.company_id = $1 order by (f.status = 'verified'), f.created_at desc limit 200", [ctx.companyId]) : [],
    actions: tab === "actions" ? await db.q<{ id: string; finding_id: string; description: string; status: string; due_at: string; assignee: string | null; branch: string; mine: boolean }>("select a.id, a.finding_id, a.description, a.status, a.due_at, b.name branch, coalesce(nullif(p.display_name,''), p.email) assignee, a.assignee_id = $2 mine from corrective_actions a join branches b on b.id = a.branch_id left join profiles p on p.id = a.assignee_id where a.company_id = $1 order by (a.status = 'verified'), a.due_at limit 200", [ctx.companyId, ctx.user.id]) : [],
  }));
  const tabLink = (k: string, l: string) => <Link key={k} href={`/inspections?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={`inline-flex min-h-touch items-center rounded-md border px-2 text-sm ${tab === k ? "border-brand bg-brand-soft font-medium" : "border-line bg-surface hover:bg-sunken"}`}>{l}</Link>;
  return (
    <>
      <PageHeader title="Inspections" description="Scheduled audits with weighted scoring, findings and verified corrections."
        actions={ctx.has("create", "inspections") ? <ButtonLink href="/inspections/new" variant="primary">Schedule inspection</ButtonLink> : undefined} />
      <Flash ok={ok} err={err} />
      <div className="mb-2 flex flex-wrap gap-1">{tabLink("inspections", "Inspections")}{tabLink("findings", "Findings")}{tabLink("actions", "Corrective actions")}{tabLink("templates", "Templates")}</div>
      {tab === "inspections" && (d.ins.length === 0 ? <StateMessage title="No inspections yet" actions={ctx.has("create", "inspections") ? <ButtonLink href="/inspections/new" variant="primary">Schedule one</ButtonLink> : undefined}>A starter template, “General branch inspection”, is ready to use. Schedule it for a branch and assign an inspector.</StateMessage> : (
        <TableWrap label="Inspections"><thead><tr><Th>Branch</Th><Th>Template</Th><Th>Date</Th><Th>Inspector</Th><Th num>Score</Th><Th>Status</Th></tr></thead>
          <tbody>{d.ins.map((i) => <tr key={i.id}><Td><Link className="font-medium text-brand" href={`/inspections/${i.id}`}>{i.branch}</Link></Td><Td>{i.template}</Td><Td>{fmtDate(i.scheduled_for)}</Td><Td>{i.inspector ?? "—"}</Td>
            <Td num>{i.score === null ? "—" : `${Number(i.score)}%`}{i.critical_failed && <span className="block text-xs text-danger">Critical failure</span>}</Td><Td><Status tone={i.status === "completed" ? "ok" : "info"}>{titleCase(i.status)}</Status></Td></tr>)}</tbody></TableWrap>))}
      {tab === "findings" && (d.findings.length === 0 ? <StateMessage title="No findings">Failed inspection items appear here and must be fixed and independently verified.</StateMessage> : (
        <TableWrap label="Findings"><thead><tr><Th>Finding</Th><Th>Branch</Th><Th>Severity</Th><Th>Raised</Th><Th>Status</Th></tr></thead>
          <tbody>{d.findings.map((f) => <tr key={f.id}><Td><Link className="font-medium text-brand" href={`/inspections/findings/${f.id}`}>{f.text}</Link></Td><Td>{f.branch}</Td><Td><Status tone={SEV[f.severity]!}>{titleCase(f.severity)}</Status></Td><Td>{fmtDate(f.created_at, ctx.company.timezone)}</Td><Td><Status tone={FST[f.status] ?? "neutral"}>{titleCase(f.status)}</Status></Td></tr>)}</tbody></TableWrap>))}
      {tab === "actions" && (d.actions.length === 0 ? <StateMessage title="No corrective actions">Assign a corrective action from a finding.</StateMessage> : (
        <TableWrap label="Corrective actions"><thead><tr><Th>Action</Th><Th>Branch</Th><Th>Assignee</Th><Th>Due</Th><Th>Status</Th></tr></thead>
          <tbody>{d.actions.map((a) => { const late = a.status === "open" && new Date(a.due_at) < new Date(new Date().toDateString()); return <tr key={a.id}><Td><Link className="font-medium text-brand" href={`/inspections/findings/${a.finding_id}`}>{a.description}</Link></Td><Td>{a.branch}</Td><Td>{a.assignee ?? "—"}{a.mine && " (you)"}</Td><Td>{fmtDate(a.due_at)}{late && <> <Status tone="danger">Overdue</Status></>}</Td><Td><Status tone={a.status === "verified" ? "ok" : a.status === "done" ? "warn" : "info"}>{a.status === "done" ? "Awaiting verification" : titleCase(a.status)}</Status></Td></tr>; })}</tbody></TableWrap>))}
      {tab === "templates" && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel title="Templates"><ul className="divide-y divide-line">{d.templates.map((t) => <li key={t.id} className="py-1 text-sm"><span className="font-medium">{t.name}</span><span className="block text-xs text-muted">{t.items.length} items</span></li>)}</ul></Panel>
          {ctx.has("create", "inspections") && <FormCard title="New template"><form action={createTemplate} className="space-y-2"><Field label="Name" name="name" required />
            <TextArea label="Items" name="items" rows={7} required hint="One per line: Item text | weight 1-5 | critical (optional). A critical failure caps the score at 70%." placeholder={"Premises clean | 2\nFire extinguisher in date | 3 | critical"} /><SubmitButton>Save template</SubmitButton></form></FormCard>}
        </div>)}
    </>
  );
}
