import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { cancelPendingChange, changePlan, closeCompany } from "./actions";
import { billing } from "@/lib/billing/provider";
import { Field, FormCard } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { Alert, ButtonLink, PageHeader, Panel, Status, TableWrap, Td, Th, type Tone } from "@/components/ui";
import { evaluatePlanChange, type PlanDef } from "@/lib/rules/plan-limits";
import { formatMinor } from "@/lib/rules/money";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Plan & billing" };
interface PV { plan_id: string; name: string; version: number; monthly_price_minor: string; currency: string; max_branches: number | null; max_users: number | null; storage_mb: number | null; modules: string[] }
const lim = (n: number | null) => (n === null ? "Unlimited" : n.toLocaleString("en"));
const INV_TONE: Record<string, Tone> = { open: "warn", paid: "ok", void: "neutral" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ to?: string; changed?: string; ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "billing", { what: "billing" }); if (denied) return denied;
  const { to, changed, ok, err } = await searchParams;
  const m = (n: number | string, cur = ctx.company.currency) => formatMinor(Number(n), cur);
  const d = await asUser(ctx.user.id, async (db) => {
    const n = async (sql: string) => Number((await db.one<{ n: string }>(sql, [ctx.companyId]))!.n);
    return {
      plans: await db.q<PV>("select p.id plan_id, p.name, v.version, v.monthly_price_minor, v.currency, v.max_branches, v.max_users, v.storage_mb, v.modules from plans p join lateral (select * from plan_versions where plan_id = p.id order by version desc limit 1) v on true where p.is_public order by v.monthly_price_minor", []),
      sub: await db.one<{ plan_id: string; plan_version: number; status: string; current_period_end: string; pending_plan_id: string | null }>("select plan_id, plan_version, status, current_period_end, pending_plan_id from subscriptions where company_id = $1", [ctx.companyId]),
      cur: await db.one<PV>("select p.id plan_id, p.name, v.version, v.monthly_price_minor, v.currency, v.max_branches, v.max_users, v.storage_mb, v.modules from app.current_plan($1) v join plans p on p.id = v.plan_id", [ctx.companyId]),
      usage: await (async () => { const u = (await db.one<{ branches: number; users: number; storage_bytes: string }>("select * from public.company_usage($1)", [ctx.companyId]))!; return { branches: u.branches, users: u.users, storageMb: Math.ceil(Number(u.storage_bytes) / 1_048_576) }; })(),
      open: {
        purchasing: await n("select (select count(*) from requisitions where company_id = $1 and status in ('submitted','approved','ordered')) + (select count(*) from purchase_orders where company_id = $1 and status in ('sent','partially_received')) n"),
        inspections: await n("select count(*) n from findings where company_id = $1 and status <> 'verified'"),
        training: await n("select count(*) n from enrolments where company_id = $1 and status <> 'passed'"),
        royalties: await n("select count(*) n from statements where company_id = $1 and (status in ('draft','in_review','approved') or (status = 'issued' and app.statement_outstanding(id) > 0))"),
        tasks: await n("select count(*) n from tasks where company_id = $1 and status in ('open','in_progress','blocked')"),
        tickets: await n("select count(*) n from tickets where company_id = $1 and status in ('open','in_progress')"),
      } as Record<string, number>,
      invoices: await db.q<{ id: string; number: string; status: string; amount_minor: string; currency: string; period_start: string; period_end: string; due_at: string; paid_at: string | null }>("select id, number, status, amount_minor, currency, period_start, period_end, due_at, paid_at from platform_invoices where company_id = $1 order by period_start desc", [ctx.companyId]),
    };
  });
  const canConfig = ctx.has("configure", "billing"); const cur = d.cur!;
  const target = to ? d.plans.find((p) => p.plan_id === to && p.plan_id !== cur.plan_id) : undefined;
  const asDef = (p: PV): PlanDef => ({ id: p.plan_id, version: p.version, limits: { branches: p.max_branches, users: p.max_users, storageMb: p.storage_mb }, modules: p.modules });
  const ev = target && evaluatePlanChange(asDef(target), { ...d.usage, openWorkByModule: d.open, enabledModules: cur.modules });
  const trial = d.sub?.status === "trialing";
  const openInv = d.invoices.filter((i) => i.status === "open");
  return (
    <>
      <PageHeader title="Plan & billing" description="Your SaaS subscription. Franchise royalties are separate and live under Sales & royalties." />
      <Flash ok={ok} err={err} />
      {changed && <div className="mb-2 max-w-prose"><Alert tone="ok" title={changed === "now" ? "Plan changed" : "Plan change scheduled"}>{changed === "now" ? "It applies now, during your trial." : `It starts at your next renewal on ${fmtDate(d.sub?.current_period_end)}. Nothing was deleted and past invoices are unchanged.`}</Alert></div>}
      {openInv.length > 0 && <div className="mb-2 max-w-prose"><Alert tone="warn" title={`${openInv.length} unpaid invoice${openInv.length > 1 ? "s" : ""}`}>{billing.instructions(openInv[0]!)}</Alert></div>}
      <div className="grid gap-3 xl:grid-cols-3">
        <Panel title="Your plan"><p className="text-lg font-semibold">{cur.name} <Status tone={trial ? "info" : d.sub?.status === "active" ? "ok" : "warn"}>{trial ? "Trial" : d.sub ? d.sub.status.replace("_", " ").replace(/^./, (c) => c.toUpperCase()) : ""}</Status></p>
          <p className="text-sm text-muted">{m(cur.monthly_price_minor, cur.currency)} per month · v{cur.version}</p>
          <p className="mt-1 text-sm">{trial ? `Trial ends ${fmtDate(d.sub?.current_period_end)}.` : `Renews ${fmtDate(d.sub?.current_period_end)}.`}</p>
          {d.sub?.pending_plan_id && d.sub.pending_plan_id !== cur.plan_id && <div className="mt-1 text-sm"><Status tone="info">Scheduled</Status> Moving to {d.plans.find((p) => p.plan_id === d.sub!.pending_plan_id)?.name} at renewal.{canConfig && <form action={cancelPendingChange} className="mt-0.5"><SubmitButton variant="secondary" pending="…">Keep current plan</SubmitButton></form>}</div>}
          <dl className="mt-2 space-y-1 border-t border-line pt-2 text-sm">{([["Branches", d.usage.branches, cur.max_branches], ["Users", d.usage.users, cur.max_users], ["Storage (MB)", d.usage.storageMb, cur.storage_mb]] as const).map(([l, u, x]) => {
            const full = x !== null && u >= x; return <div key={l} className="flex justify-between"><dt className="text-muted">{l}</dt><dd className={`num ${full ? "font-semibold text-warn" : "font-medium"}`}>{u.toLocaleString("en")} of {lim(x)}{full && " · limit reached"}</dd></div>; })}</dl></Panel>
        <div className="xl:col-span-2"><TableWrap label="Compare plans"><thead><tr><Th>Plan</Th><Th num>Per month</Th><Th num>Branches</Th><Th num>Users</Th><Th num>Storage MB</Th><Th>Includes</Th><Th><span className="sr-only">Action</span></Th></tr></thead>
          <tbody>{d.plans.map((p) => <tr key={p.plan_id} className={p.plan_id === to ? "bg-brand-soft" : ""}><Td><span className="font-medium">{p.name}</span> {p.plan_id === cur.plan_id && <Status tone="info">Current</Status>}</Td><Td num>{m(p.monthly_price_minor, p.currency)}</Td><Td num>{lim(p.max_branches)}</Td><Td num>{lim(p.max_users)}</Td><Td num>{lim(p.storage_mb)}</Td><Td className="text-xs text-muted">{p.modules.join(", ")}</Td><Td>{p.plan_id !== cur.plan_id && canConfig && <Link className="text-sm font-medium text-brand" href={`/billing?to=${p.plan_id}`}>Review change</Link>}</Td></tr>)}</tbody></TableWrap></div>
      </div>
      {target && ev && (
        <section aria-labelledby="chg" className="mt-3 max-w-form space-y-2"><h2 id="chg" className="text-lg font-semibold">Change to {target.name}</h2>
          {ev.messages.length === 0 ? <Alert tone="ok" title="Everything fits">You're within every limit of {target.name} and keep all your modules.</Alert> : <Alert tone="warn" title="Check what changes before you confirm"><ul className="list-disc space-y-0.5 pl-3">{ev.messages.map((x) => <li key={x}>{x}</li>)}</ul></Alert>}
          <Panel title="Billing effect"><p className="text-sm">{trial ? `Applies now. You'll be invoiced ${m(target.monthly_price_minor, target.currency)} when your trial ends on ${fmtDate(d.sub?.current_period_end)}.` : `New price ${m(target.monthly_price_minor, target.currency)} per month from ${fmtDate(d.sub?.current_period_end)}. Invoices already issued keep their amounts. ${Number(target.monthly_price_minor) < Number(cur.monthly_price_minor) ? "No refund is issued for the current period." : ""}`}</p></Panel>
          <div className="flex flex-wrap gap-1"><form action={changePlan}><input type="hidden" name="to" value={target.plan_id} /><SubmitButton pending="Confirming…">{ev.requiresChoice ? "Confirm and choose what stays active" : "Confirm change"}</SubmitButton></form><ButtonLink href="/billing">Keep {cur.name}</ButtonLink></div></section>)}
      <h2 className="mb-1 mt-4 text-sm font-semibold text-muted">Invoices</h2>
      {d.invoices.length === 0 ? <p className="text-sm text-muted">No invoices yet. Your first one is issued when the trial ends.</p> : (
        <TableWrap label="Invoices"><thead><tr><Th>Invoice</Th><Th>Period</Th><Th>Due</Th><Th num>Amount</Th><Th>Status</Th></tr></thead>
          <tbody>{d.invoices.map((i) => <tr key={i.id}><Td className="font-medium">{i.number}</Td><Td>{fmtDate(i.period_start)} – {fmtDate(i.period_end)}</Td><Td>{fmtDate(i.due_at)}</Td><Td num>{m(i.amount_minor, i.currency)}</Td><Td><Status tone={INV_TONE[i.status] ?? "neutral"}>{i.status[0]!.toUpperCase() + i.status.slice(1)}</Status>{i.paid_at && <span className="block text-xs text-muted">Paid {fmtDate(i.paid_at)}</span>}</Td></tr>)}</tbody></TableWrap>)}
      {canConfig && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <Panel title="Export your data"><p className="mb-1 text-sm text-muted">Download everything in your workspace as one JSON file. Available any time, including after a suspension or during closure.</p><ButtonLink href="/api/export/company">Download company data (JSON)</ButtonLink></Panel>
          <FormCard title="Close this company"><p className="text-sm text-muted">Closing makes the workspace read-only for everyone except billing and export. Download your data first. After the retention period your data is deleted.</p>
            <form action={closeCompany} className="space-y-2"><Field label={`Type “${ctx.company.name}” to confirm`} name="confirm" autoComplete="off" /><SubmitButton variant="danger" pending="Closing…">Start closure</SubmitButton></form></FormCard>
        </div>)}
    </>
  );
}
