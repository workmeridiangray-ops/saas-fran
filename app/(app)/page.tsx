import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Metric, PageHeader, Panel, Status } from "@/components/ui";
import { approvals, attention, branches, UPDATED } from "@/lib/demo/data";
import { formatMinor } from "@/lib/rules/money";

export const metadata = { title: "Command centre" };

export default function CommandCentre() {
  const active = branches.filter((b) => b.status === "active");
  const avg = Math.round(active.reduce((n, b) => n + b.complianceScore, 0) / Math.max(1, active.length));
  const pending = approvals.reduce((n, a) => n + a.amountMinor, 0);

  return (
    <>
      <PageHeader title="Command centre" description="What needs attention across your network, and what to do next." updated={UPDATED} />

      {/* Priorities first: approvals, overdue work, exceptions. */}
      <div className="grid gap-3 xl:grid-cols-3">
        <Panel title="Needs attention" className="xl:col-span-2" action={<span className="text-xs text-muted">{attention.length} items</span>}>
          <ul className="divide-y divide-line">
            {attention.map((a) => (
              <li key={a.id}>
                <Link href={a.href} className="flex min-h-touch flex-col items-start gap-0.5 py-1 hover:bg-sunken sm:flex-row sm:items-center sm:gap-2">
                  <span className="sm:w-[9.5rem] sm:shrink-0"><Status tone={a.tone}>{a.label}</Status></span>
                  <span className="text-sm">{a.text}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Waiting for your decision" action={<Link href="/approvals" className="text-sm font-medium text-brand">Open inbox</Link>}>
          <ul className="space-y-1.5">
            {approvals.map((a) => (
              <li key={a.id}>
                <Link href={`/approvals?open=${a.id}`} className="block rounded-md border border-line p-1.5 hover:bg-sunken">
                  <span className="flex items-baseline justify-between gap-1">
                    <span className="text-sm font-medium">{a.title}</span>
                    <span className="num text-sm font-semibold">{formatMinor(a.amountMinor, "USD")}</span>
                  </span>
                  <span className="text-xs text-muted">{a.branch} · {a.requester} · due in {a.dueIn}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <h2 className="mb-1 mt-4 text-sm font-semibold text-muted">Network health (selected metrics)</h2>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Active branches" value={`${active.length} of ${branches.length}`} href="/branches?status=active" note="1 opening · 1 suspended · 1 closing" />
        <Metric label="Avg inspection score, last 30 days" value={`${avg}%`} href="/m/inspections" note="Target 85% · Harbour below target" tone="warn" />
        <Metric label="Open corrective actions" value="14" href="/m/inspections" note="5 overdue" tone="danger" />
        <Metric label="Awaiting approval" value={formatMinor(pending, "USD")} href="/approvals" note={`${approvals.length} requests`} />
      </div>
      <p className="mt-1 text-xs text-muted">
        Definitions: score = weighted average of completed inspections in the period; critical failures cap a branch at 70%.
      </p>

      <h2 className="mb-1 mt-4 text-sm font-semibold text-muted">Branches below target</h2>
      <Panel>
        <ul className="divide-y divide-line">
          {branches.filter((b) => b.status === "active" && b.complianceScore < 85).map((b) => (
            <li key={b.code} className="flex items-center justify-between gap-2 py-1">
              <span className="flex items-center gap-1 text-sm"><AlertTriangle aria-hidden size={14} className="text-warn" />{b.name} <span className="text-muted">({b.region})</span></span>
              <span className="num text-sm font-medium">{b.complianceScore}%</span>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}
