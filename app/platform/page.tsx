import { asService } from "@/lib/db";
import { Metric, PageHeader, Panel, Status } from "@/components/ui";
import { Flash } from "@/components/ui/flash";
import { formatMinor } from "@/lib/rules/money";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Platform overview" };

export default async function Overview({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const { ok, err } = await searchParams;
  const d = await asService(async (db) => ({
    byStatus: await db.q<{ status: string; n: string }>("select status, count(*) n from companies group by status order by status"),
    mrr: Number((await db.one<{ m: string }>("select coalesce(sum(v.monthly_price_minor),0) m from subscriptions s join plan_versions v on v.plan_id = s.plan_id and v.version = s.plan_version where s.status = 'active'"))!.m),
    open: await db.one<{ n: string; total: string }>("select count(*) n, coalesce(sum(amount_minor),0) total from platform_invoices where status = 'open'"),
    overdue: Number((await db.one<{ n: string }>("select count(*) n from platform_invoices where status = 'open' and due_at < now()"))!.n),
    trials: await db.q<{ id: string; name: string; end: string }>("select c.id, c.name, s.current_period_end \"end\" from subscriptions s join companies c on c.id = s.company_id where s.status = 'trialing' and s.current_period_end < now() + interval '7 days' order by 3 limit 10"),
  }));
  const count = (s: string) => d.byStatus.find((x) => x.status === s)?.n ?? "0";
  return (
    <>
      <PageHeader title="Platform overview" /><Flash ok={ok} err={err} />
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Paying companies" value={count("active")} href="/platform/companies?status=active" note={`${count("trial")} on trial`} />
        <Metric label="Monthly recurring revenue" value={formatMinor(d.mrr, "USD")} href="/platform/companies?status=active" note="Active subscriptions at their plan version's price" />
        <Metric label="Unpaid invoices" value={formatMinor(Number(d.open!.total), "USD")} href="/platform/invoices" note={`${d.open!.n} open · ${d.overdue} overdue`} tone={d.overdue ? "danger" : "neutral"} />
        <Metric label="Past due or suspended" value={String(Number(count("past_due")) + Number(count("suspended")))} href="/platform/companies?status=suspended" note="Need collection follow-up" tone="warn" />
      </div>
      <div className="mt-3 max-w-prose"><Panel title="Trials ending within 7 days">{d.trials.length === 0 ? <p className="text-sm text-muted">None.</p> : <ul className="divide-y divide-line">{d.trials.map((t) => <li key={t.id} className="flex justify-between py-1 text-sm"><a className="font-medium text-brand" href={`/platform/companies/${t.id}`}>{t.name}</a><span>{fmtDate(t.end)}</span></li>)}</ul>}</Panel></div>
    </>
  );
}
