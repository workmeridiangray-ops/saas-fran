import Link from "next/link";
import { FileText } from "lucide-react";
import { Alert, Button, Panel, PageHeader, Status, StateMessage } from "@/components/ui";
import { approvals, me, UPDATED } from "@/lib/demo/data";
import { canApprove } from "@/lib/rules/permissions";
import { formatMinor } from "@/lib/rules/money";
import { routeApproval, type ApprovalRule } from "@/lib/rules/approval";

export const metadata = { title: "Approvals" };

const RULES: ApprovalRule[] = [
  { id: "any", priority: 1, when: { kind: "Purchase request" }, steps: [{ roleId: "branch_manager", reasonRequiredOnReject: true }] },
  { id: "big", priority: 1, when: { kind: "Purchase request", minAmountMinor: 500_000 }, steps: [{ roleId: "branch_manager", reasonRequiredOnReject: true }, { roleId: "owner", reasonRequiredOnReject: true }] },
  { id: "refund", priority: 1, when: { kind: "Refund" }, steps: [{ roleId: "branch_manager", reasonRequiredOnReject: true }] },
];

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ open?: string }> }) {
  const { open } = await searchParams;
  const sel = approvals.find((a) => a.id === open) ?? approvals[0];
  if (!sel) return <StateMessage title="Nothing waiting for you">New requests that need your decision appear here.</StateMessage>;

  const rule = routeApproval(RULES, { kind: sel.kind, amountMinor: sel.amountMinor });
  const decision = canApprove(me, "approvals", { companyId: me.companyId }, sel.amountMinor, "someone-else");

  return (
    <>
      <PageHeader title="Approvals" description="Review the request, evidence and impact together, then decide." updated={UPDATED} />
      <div className="grid gap-3 lg:grid-cols-[20rem_1fr]">
        <nav aria-label="Approval requests">
          <ul className="space-y-1">
            {approvals.map((a) => (
              <li key={a.id}>
                <Link href={`/approvals?open=${a.id}`} aria-current={a.id === sel.id ? "page" : undefined}
                  className={`block rounded-md border p-1.5 ${a.id === sel.id ? "border-brand bg-brand-soft" : "border-line bg-surface hover:bg-sunken"}`}>
                  <span className="flex items-baseline justify-between gap-1"><span className="text-sm font-medium">{a.title}</span><span className="num text-sm">{formatMinor(a.amountMinor, "USD")}</span></span>
                  <span className="text-xs text-muted">{a.id} · {a.branch} · due in {a.dueIn}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <article aria-labelledby="req-title" className="space-y-2">
          <Panel>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs text-muted">{sel.id} · {sel.kind}</p>
                <h2 id="req-title" className="text-xl font-semibold">{sel.title}</h2>
                <p className="text-sm text-muted">{sel.branch} · requested by {sel.requester} on {sel.submitted}</p>
              </div>
              <Status tone="info">Pending your decision</Status>
            </div>
            <dl className="mt-2 grid gap-2 sm:grid-cols-3">
              <div><dt className="text-xs text-muted">Amount</dt><dd className="num text-left text-lg font-semibold">{formatMinor(sel.amountMinor, "USD")}</dd></div>
              <div><dt className="text-xs text-muted">Financial impact</dt><dd className="text-sm">{sel.budgetNote}</dd></div>
              <div><dt className="text-xs text-muted">Route</dt><dd className="text-sm">{rule.steps.length} step{rule.steps.length > 1 ? "s" : ""}: {rule.steps.map((s) => s.roleId.replace("_", " ")).join(" → ")}</dd></div>
            </dl>
          </Panel>

          <Panel title="Supporting evidence">
            <ul className="grid gap-1 sm:grid-cols-2">
              {sel.evidence.map((e) => (
                <li key={e} className="flex min-h-touch items-center gap-1 rounded-md border border-line px-1.5 text-sm"><FileText aria-hidden size={16} className="text-muted" />{e}</li>
              ))}
            </ul>
          </Panel>

          <Panel title="Previous decisions">
            <ol className="space-y-1">
              {sel.history.map((h, i) => (
                <li key={i} className="flex justify-between gap-2 text-sm"><span><strong className="font-medium">{h.by}</strong>: {h.what}</span><span className="text-muted">{h.at}</span></li>
              ))}
            </ol>
          </Panel>

          <Panel title="Your decision">
            {decision.ok ? (
              <form className="space-y-2">
                <div>
                  <label htmlFor="reason" className="mb-0.5 block text-sm font-medium">Reason <span className="font-normal text-muted">(required to reject; kept in the audit trail)</span></label>
                  <textarea id="reason" name="reason" rows={3} placeholder="e.g. Quote expired; get a current quote from the supplier" className="w-full rounded-md border border-line-strong bg-surface p-1.5 text-sm" />
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button type="button" variant="primary">Approve</Button>
                  <Button type="button" variant="danger">Reject with reason</Button>
                  <Button type="button">Ask a question</Button>
                </div>
              </form>
            ) : (
              <Alert tone="warn" title="You can't decide this request">
                {decision.reason === "over_limit" ? "It is above your approval limit. It will be passed to the next approver." : "You don't have approval authority for it."}
              </Alert>
            )}
          </Panel>
        </article>
      </div>
    </>
  );
}
