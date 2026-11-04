import Link from "next/link";
import { Alert, ButtonLink, PageHeader, Panel, Status, TableWrap, Td, Th } from "@/components/ui";
import { currentPlanId, plans, usage, UPDATED } from "@/lib/demo/data";
import { evaluatePlanChange } from "@/lib/rules/plan-limits";
import { formatMinor } from "@/lib/rules/money";

export const metadata = { title: "Plan & billing" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ to?: string; confirmed?: string }> }) {
  const { to, confirmed } = await searchParams;
  const current = plans[currentPlanId]!;
  const target = to && to !== currentPlanId ? plans[to] : undefined;
  const ev = target ? evaluatePlanChange(target, usage) : undefined;
  const lim = (n: number | null) => (n === null ? "Unlimited" : n.toLocaleString());

  return (
    <>
      <PageHeader title="Plan & billing" description="Your SaaS subscription. Franchise royalties are separate and appear under Finance." updated={UPDATED} />

      {confirmed && <div className="mb-2"><Alert tone="ok" title="Plan change scheduled">It starts at your next renewal on 1 Dec 2026. Nothing was deleted, and past invoices are unchanged.</Alert></div>}

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel title="Usage" className="xl:col-span-1">
          <dl className="space-y-1.5 text-sm">
            {[["Branches", usage.branches, current.limits.branches], ["Users", usage.users, current.limits.users], ["Storage (MB)", usage.storageMb, current.limits.storageMb]].map(([l, u, m]) => (
              <div key={String(l)} className="flex justify-between"><dt className="text-muted">{l}</dt><dd className="num font-medium">{Number(u).toLocaleString()} of {lim(m as number | null)}</dd></div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-muted">Current plan: <strong>{current.name}</strong> · v{current.version} · {formatMinor(current.priceMinor, "USD")}/month</p>
        </Panel>

        <div className="xl:col-span-2">
          <TableWrap label="Compare plans">
            <thead><tr><Th>Plan</Th><Th num>Per month</Th><Th num>Branches</Th><Th num>Users</Th><Th num>Storage MB</Th><Th><span className="sr-only">Action</span></Th></tr></thead>
            <tbody>
              {Object.values(plans).map((p) => (
                <tr key={p.id} className={p.id === to ? "bg-brand-soft" : ""}>
                  <Td><span className="font-medium">{p.name}</span> {p.id === currentPlanId && <Status tone="info">Current</Status>}</Td>
                  <Td num>{formatMinor(p.priceMinor, "USD")}</Td><Td num>{lim(p.limits.branches)}</Td><Td num>{lim(p.limits.users)}</Td><Td num>{lim(p.limits.storageMb)}</Td>
                  <Td>{p.id !== currentPlanId && <Link className="text-sm font-medium text-brand" href={`/billing?to=${p.id}`}>Review change</Link>}</Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </div>
      </div>

      {target && ev && (
        <section aria-labelledby="chg" className="mt-3 max-w-form space-y-2">
          <h2 id="chg" className="text-lg font-semibold">Change to {target.name}</h2>
          {ev.messages.length === 0
            ? <Alert tone="ok" title="Everything fits">You're within every limit of {target.name} and keep all your modules.</Alert>
            : <Alert tone="warn" title="Check what changes before you confirm">
                <ul className="list-disc space-y-0.5 pl-3">{ev.messages.map((m) => <li key={m}>{m}</li>)}</ul>
              </Alert>}
          <Panel title="Billing effect">
            <p className="text-sm">New price {formatMinor(target.priceMinor, "USD")}/month from <strong>1 Dec 2026</strong>. Invoices already issued keep their amounts. {target.priceMinor < current.priceMinor ? "No refund is issued for the current period." : "Any extra for the rest of this period is prorated on your next invoice."}</p>
          </Panel>
          <div className="flex flex-wrap gap-1">
            <ButtonLink href={`/billing?confirmed=1`} variant="primary">{ev.requiresChoice ? "Confirm and choose what stays active" : "Confirm change"}</ButtonLink>
            <ButtonLink href="/billing">Keep {current.name}</ButtonLink>
          </div>
        </section>
      )}
    </>
  );
}
