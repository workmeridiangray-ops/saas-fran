import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { addTerritory } from "./actions";
import { Field, FormCard, Select } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { ButtonLink, PageHeader, StateMessage, Status, TableWrap, Td, Th, type Tone } from "@/components/ui";
import { STAGES, STAGE_LABEL, daysUntil, type Stage } from "@/lib/rules/franchise";
import { formatMinor } from "@/lib/rules/money";
import { fmtDate, titleCase } from "@/lib/format";

export const metadata = { title: "Franchise" };
const ATONE: Record<string, Tone> = { draft: "neutral", in_review: "info", signed: "info", active: "ok", expired: "neutral", terminated: "danger" };

export default async function Franchise({ searchParams }: { searchParams: Promise<{ tab?: string; ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "franchise", { module: "franchise", what: "the franchise pipeline" }); if (denied) return denied;
  const { tab = "pipeline", ok, err } = await searchParams; const today = new Date().toISOString().slice(0, 10);
  const d = await asUser(ctx.user.id, async (db) => ({
    apps: await db.q<{ id: string; name: string; stage: Stage; territory: string | null; created_at: string; blocked: string }>("select a.id, a.name, a.stage, t.name territory, a.created_at, (select count(*) from applicant_checks c where c.applicant_id = a.id and c.status in ('open','received','rejected')) blocked from applicants a left join territories t on t.id = a.territory_id where a.company_id = $1 order by a.created_at desc", [ctx.companyId]),
    territories: await db.q<{ id: string; name: string; status: string; reserved_until: string | null; applicant: string | null; partner: string | null; region: string | null }>("select t.id, t.name, t.status, t.reserved_until::text, a.name applicant, p.name partner, r.name region from territories t left join applicants a on a.id = t.reserved_for left join franchise_partners p on p.id = t.partner_id left join regions r on r.id = t.region_id where t.company_id = $1 order by t.name", [ctx.companyId]),
    agreements: await db.q<{ id: string; number: string; version: number; status: string; start_date: string; end_date: string; reminder_days: number; partner: string; territory: string; fee: string }>("select g.id, g.number, g.version, g.status, g.start_date::text, g.end_date::text, g.reminder_days, p.name partner, t.name territory, g.franchise_fee_minor::text fee from agreements g join franchise_partners p on p.id = g.partner_id join territories t on t.id = g.territory_id where g.company_id = $1 order by g.end_date", [ctx.companyId]),
    regions: await db.q<{ id: string; name: string }>("select id, name from regions where company_id = $1 and status = 'active' order by name", [ctx.companyId]),
  }));
  const tabLink = (k: string, l: string) => <Link key={k} href={`/franchise?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={`inline-flex min-h-touch items-center rounded-md border px-2 text-sm ${tab === k ? "border-brand bg-brand-soft font-medium" : "border-line bg-surface hover:bg-sunken"}`}>{l}</Link>;
  const renewals = d.agreements.filter((g) => g.status === "active" && daysUntil(g.end_date, today) <= Math.max(g.reminder_days, 120) && daysUntil(g.end_date, today) >= 0);
  return (
    <>
      <PageHeader title="Franchise" description="Applicants stay prospects until an agreement is signed and active. Only then do they become partners." actions={ctx.has("create", "franchise") ? <ButtonLink href="/franchise/new" variant="primary">Add applicant</ButtonLink> : undefined} />
      <Flash ok={ok} err={err} />
      <div className="mb-2 flex flex-wrap gap-1">{tabLink("pipeline", "Pipeline")}{tabLink("territories", "Territories")}{tabLink("agreements", "Agreements")}{tabLink("renewals", `Renewals (${renewals.length})`)}</div>
      {tab === "pipeline" && (d.apps.length === 0 ? <StateMessage title="No applicants yet" actions={<ButtonLink href="/franchise/new" variant="primary">Add one</ButtonLink>}>Applicants can also apply on your public page: <code>/apply/&lt;your company address&gt;</code>. Share it from your website.</StateMessage> : (
        <div className="grid gap-2 overflow-x-auto lg:grid-cols-6">{STAGES.map((s) => { const rows = d.apps.filter((a) => a.stage === s); return (
          <section key={s} aria-label={STAGE_LABEL[s]} className="min-w-[11rem] rounded-lg border border-line bg-sunken p-1.5"><h2 className="mb-1 flex justify-between text-xs font-semibold text-muted"><span>{STAGE_LABEL[s]}</span><span>{rows.length}</span></h2>
            <ul className="space-y-1">{rows.map((a) => <li key={a.id}><Link href={`/franchise/${a.id}`} className="block rounded-md border border-line bg-surface p-1.5 text-sm hover:border-line-strong"><span className="font-medium">{a.name}</span><span className="block text-xs text-muted">{a.territory ?? "No territory"}{Number(a.blocked) > 0 ? ` · ${a.blocked} check${a.blocked === "1" ? "" : "s"} open` : ""}</span></Link></li>)}</ul></section>); })}
          {d.apps.some((a) => a.stage === "rejected" || a.stage === "withdrawn") && <p className="text-xs text-muted lg:col-span-6">{d.apps.filter((a) => a.stage === "rejected").length} rejected and {d.apps.filter((a) => a.stage === "withdrawn").length} withdrawn are kept on record.</p>}</div>))}
      {tab === "territories" && (<div className="space-y-3">
        {d.territories.length === 0 ? <StateMessage title="No territories yet">Define the areas you franchise. A territory can be reserved for one applicant at a time and assigned to one partner.</StateMessage> : (
          <TableWrap label="Territories"><thead><tr><Th>Territory</Th><Th>Region</Th><Th>Status</Th><Th>Held by</Th></tr></thead><tbody>{d.territories.map((t) => <tr key={t.id}><Td className="font-medium">{t.name}</Td><Td>{t.region ?? "—"}</Td><Td><Status tone={t.status === "available" ? "ok" : t.status === "reserved" ? "warn" : "info"}>{titleCase(t.status)}</Status></Td><Td>{t.status === "reserved" ? `${t.applicant} until ${fmtDate(t.reserved_until)}` : t.partner ?? "—"}</Td></tr>)}</tbody></TableWrap>)}
        {ctx.has("create", "franchise") && <FormCard title="Add a territory"><form action={addTerritory} className="space-y-2"><Field label="Name" name="name" required /><Select label="Region" name="region_id" placeholder="None" options={d.regions.map((r) => ({ value: r.id, label: r.name }))} /><Field label="Notes" name="notes" /><SubmitButton pending="Adding…">Add territory</SubmitButton></form></FormCard>}</div>)}
      {tab === "agreements" && (d.agreements.length === 0 ? <StateMessage title="No agreements yet">Approve an applicant, then draft their agreement from the applicant's page.</StateMessage> : (
        <TableWrap label="Agreements"><thead><tr><Th>Agreement</Th><Th>Partner</Th><Th>Territory</Th><Th>Term</Th><Th num>Franchise fee</Th><Th>Status</Th></tr></thead>
          <tbody>{d.agreements.map((g) => <tr key={g.id}><Td><Link className="font-medium text-brand" href={`/franchise/agreements/${g.id}`}>{g.number}</Link><span className="block text-xs text-muted">version {g.version}</span></Td><Td>{g.partner}</Td><Td>{g.territory}</Td><Td>{fmtDate(g.start_date)} – {fmtDate(g.end_date)}</Td><Td num>{formatMinor(Number(g.fee), ctx.company.currency)}</Td><Td><Status tone={ATONE[g.status] ?? "neutral"}>{titleCase(g.status)}</Status></Td></tr>)}</tbody></TableWrap>))}
      {tab === "renewals" && (renewals.length === 0 ? <StateMessage title="No renewals coming up">Active agreements appear here when they come within their reminder window.</StateMessage> : (
        <TableWrap label="Renewals"><thead><tr><Th>Agreement</Th><Th>Partner</Th><Th>Ends</Th><Th num>Days left</Th></tr></thead><tbody>{renewals.map((g) => <tr key={g.id}><Td><Link className="font-medium text-brand" href={`/franchise/agreements/${g.id}`}>{g.number}</Link></Td><Td>{g.partner}</Td><Td>{fmtDate(g.end_date)}</Td><Td num>{daysUntil(g.end_date, today)}</Td></tr>)}</tbody></TableWrap>))}
    </>
  );
}
