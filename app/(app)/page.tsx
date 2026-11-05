import { getT } from "@/lib/i18n";
import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { Flash } from "@/components/ui/flash";
import { Metric, PageHeader, Panel, Status, type Tone } from "@/components/ui";
import { formatMinor } from "@/lib/rules/money";

export const metadata = { title: "Command centre" };

interface Item { tone: Tone; label: string; text: string; href: string }

export default async function CommandCentre({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const { t } = await getT(); const { ok, err } = await searchParams;
  const uid = ctx.user.id;
  const d = await asUser(uid, async (db) => {
    const n = async (sql: string, p: unknown[] = []) => Number((await db.one<{ n: string }>(sql, p))!.n);
    const has = (m: string) => ctx.modules.includes(m);
    const out = {
      overdueTasks: await n("select count(*) n from tasks where company_id=$1 and status in ('open','in_progress','blocked') and due_at < now()", [ctx.companyId]),
      openTasks: await n("select count(*) n from tasks where company_id=$1 and status in ('open','in_progress','blocked')", [ctx.companyId]),
      pending: await db.q<{ id: string; title: string; amount_minor: string; branch: string | null }>("select r.id, r.title, r.amount_minor, b.name branch from approval_requests r left join branches b on b.id = r.branch_id where r.company_id=$1 and r.status='pending' and r.requester_id <> $2 order by r.created_at limit 5", [ctx.companyId, uid]),
      pendingTotal: await n("select coalesce(sum(amount_minor),0) n from approval_requests where company_id=$1 and status='pending'", [ctx.companyId]),
      branches: await db.q<{ status: string }>("select status from branches where company_id=$1", [ctx.companyId]),
      overdueActions: has("inspections") ? await n("select count(*) n from corrective_actions where company_id=$1 and status = 'open' and due_at < current_date", [ctx.companyId]) : 0,
      openActions: has("inspections") ? await n("select count(*) n from corrective_actions where company_id=$1 and status <> 'verified'", [ctx.companyId]) : 0,
      avgScore: has("inspections") ? (await db.one<{ a: string | null }>("select round(avg(score),0) a from inspections where company_id=$1 and status='completed' and completed_at > now() - interval '30 days'", [ctx.companyId]))?.a ?? null : null,
      toVerify: has("inspections") ? await n("select count(*) n from findings where company_id=$1 and status = 'fixed_pending_verification'", [ctx.companyId]) : 0,
      licences: has("assets") ? await db.q<{ name: string; expires_on: string }>("select name, expires_on from licences where company_id=$1 and expires_on < current_date + 30 order by expires_on limit 3", [ctx.companyId]) : [],
      unacked: has("documents") ? await n("select count(*) n from documents d where d.company_id=$1 and d.status='published' and not exists (select 1 from acknowledgements a where a.document_id=d.id and a.version=d.current_version and a.user_id=$2)", [ctx.companyId, uid]) : 0,
      training: has("training") ? await n("select count(*) n from enrolments where company_id=$1 and user_id=$2 and status <> 'passed'", [ctx.companyId, uid]) : 0,
      urgentTickets: has("tickets") ? await n("select count(*) n from tickets where company_id=$1 and status in ('open','in_progress') and priority in ('high','urgent')", [ctx.companyId]) : 0,
      dues: has("royalties") ? await db.q<{ number: string; due_date: string }>("select s.number, s.due_date from statements s where s.company_id=$1 and s.status='issued' and s.due_date < current_date and app.statement_outstanding(s.id) > 0 limit 3", [ctx.companyId]) : [],
      lowStock: has("stock") ? await n("select count(*) n from stock_reorder r left join stock_levels l on l.branch_id = r.branch_id and l.item_id = r.item_id where r.company_id=$1 and coalesce(l.qty,0) <= r.reorder_point", [ctx.companyId]) : 0,
      people: await n("select count(*) n from public.company_people($1)", [ctx.companyId]),
    };
    return out;
  });

  const items: Item[] = [];
  if (d.overdueTasks) items.push({ tone: "danger", label: "Overdue", text: `${d.overdueTasks} task${d.overdueTasks > 1 ? "s are" : " is"} past due`, href: "/tasks?filter=overdue" });
  if (d.overdueActions) items.push({ tone: "danger", label: "Overdue", text: `${d.overdueActions} corrective action${d.overdueActions > 1 ? "s are" : " is"} past due`, href: "/inspections?tab=actions" });
  if (d.toVerify) items.push({ tone: "warn", label: "To verify", text: `${d.toVerify} fix${d.toVerify > 1 ? "es" : ""} waiting for independent verification`, href: "/inspections?tab=actions" });
  for (const x of d.dues) items.push({ tone: "danger", label: "Unpaid", text: `Royalty statement ${x.number} is past its due date`, href: "/royalties?tab=statements" });
  for (const l of d.licences) items.push({ tone: new Date(l.expires_on) < new Date() ? "danger" : "warn", label: new Date(l.expires_on) < new Date() ? "Expired" : "Due soon", text: `${l.name} ${new Date(l.expires_on) < new Date() ? "expired" : "expires"} ${new Date(l.expires_on).toLocaleDateString("en-GB")}`, href: "/assets?tab=licences" });
  if (d.unacked) items.push({ tone: "warn", label: "Read & confirm", text: `${d.unacked} document${d.unacked > 1 ? "s need" : " needs"} your acknowledgement`, href: "/knowledge" });
  if (d.training) items.push({ tone: "info", label: "Training", text: `${d.training} course${d.training > 1 ? "s" : ""} assigned to you`, href: "/training" });
  if (d.urgentTickets) items.push({ tone: "warn", label: "Urgent", text: `${d.urgentTickets} high-priority ticket${d.urgentTickets > 1 ? "s" : ""} open`, href: "/tickets" });
  if (d.lowStock) items.push({ tone: "warn", label: "Reorder", text: `${d.lowStock} stock item${d.lowStock > 1 ? "s are" : " is"} at or below its reorder point`, href: "/stock" });
  if (d.pending.length) items.push({ tone: "info", label: "Needs you", text: `${d.pending.length} request${d.pending.length > 1 ? "s" : ""} waiting for a decision`, href: "/approvals" });

  const active = d.branches.filter((b) => b.status === "active").length;
  const steps = [
    { done: d.branches.length > 0, text: "Add your first branch", href: "/branches/new" },
    { done: d.people > 1, text: "Invite your team", href: "/people" },
    { done: d.openTasks > 0, text: "Create a task or run a checklist", href: "/tasks/new" },
    { done: false, text: "Review your approval rules and roles", href: "/approvals?tab=rules" },
  ];
  const firstUse = d.branches.length === 0;

  return (
    <>
      <PageHeader title={t("Command centre")} description={t("What needs attention across your network, and what to do next.")} updated={new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })} />
      <Flash ok={ok} err={err} />
      {(firstUse || d.people <= 1) && (
        <Panel title={t("Getting started")} className="mb-3 max-w-prose">
          <ol className="space-y-1">
            {steps.map((s, i) => (
              <li key={s.text}><Link href={s.href} className="flex min-h-touch items-center gap-1.5 rounded-md px-1 text-sm hover:bg-sunken">
                <span aria-hidden className={`inline-flex h-3 w-3 items-center justify-center rounded-full text-xs ${s.done ? "bg-ok-bg text-ok" : "bg-sunken text-muted"}`}>{s.done ? "✓" : i + 1}</span>
                <span className={s.done ? "text-muted line-through" : "font-medium"}>{s.text}</span>{s.done && <span className="sr-only">(done)</span>}</Link></li>
            ))}
          </ol>
        </Panel>
      )}
      <div className="grid gap-3 xl:grid-cols-3">
        <Panel title={t("Needs attention")} className="xl:col-span-2" action={<span className="text-xs text-muted">{items.length} item{items.length === 1 ? "" : "s"}</span>}>
          {items.length === 0 ? <p className="py-1 text-sm text-muted">Nothing needs attention right now. Overdue work, approvals and expiries will appear here.</p> : (
            <ul className="divide-y divide-line">
              {items.map((a, i) => (
                <li key={i}><Link href={a.href} className="flex min-h-touch flex-col items-start gap-0.5 py-1 hover:bg-sunken sm:flex-row sm:items-center sm:gap-2">
                  <span className="sm:w-[9.5rem] sm:shrink-0"><Status tone={a.tone}>{a.label}</Status></span><span className="text-sm">{a.text}</span></Link></li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title={t("Waiting for your decision")} action={<Link href="/approvals" className="text-sm font-medium text-brand">{t("Open inbox")}</Link>}>
          {d.pending.length === 0 ? <p className="text-sm text-muted">No requests are waiting for you.</p> : (
            <ul className="space-y-1.5">
              {d.pending.map((a) => (
                <li key={a.id}><Link href={`/approvals?open=${a.id}`} className="block rounded-md border border-line p-1.5 hover:bg-sunken">
                  <span className="flex items-baseline justify-between gap-1"><span className="text-sm font-medium">{a.title}</span><span className="num text-sm font-semibold">{formatMinor(Number(a.amount_minor), ctx.company.currency)}</span></span>
                  <span className="text-xs text-muted">{a.branch ?? "Company"}</span></Link></li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
      <h2 className="mb-1 mt-4 text-sm font-semibold text-muted">{t("Network health")}</h2>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Active branches" value={`${active} of ${d.branches.length}`} href="/branches?status=active" note={d.branches.length ? "Open the branch list" : "Add your first branch"} />
        <Metric label="Open tasks" value={String(d.openTasks)} href="/tasks" note={d.overdueTasks ? `${d.overdueTasks} overdue` : "None overdue"} tone={d.overdueTasks ? "danger" : "neutral"} />
        {ctx.modules.includes("inspections") && <Metric label="Avg inspection score, 30 days" value={d.avgScore === null ? "No data" : `${d.avgScore}%`} href="/inspections" note="Weighted; a critical failure caps at 70%" tone={d.avgScore !== null && Number(d.avgScore) < 85 ? "warn" : "neutral"} />}
        {ctx.modules.includes("inspections") && <Metric label="Open corrective actions" value={String(d.openActions)} href="/inspections?tab=actions" note={d.overdueActions ? `${d.overdueActions} overdue` : "None overdue"} tone={d.overdueActions ? "danger" : "neutral"} />}
        <Metric label="Awaiting approval" value={formatMinor(d.pendingTotal, ctx.company.currency)} href="/approvals" note={`${d.pending.length} request${d.pending.length === 1 ? "" : "s"} for you`} />
      </div>
    </>
  );
}
