import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, Button, ButtonLink, PageHeader, Panel, Status, TableWrap, Td, Th } from "@/components/ui";
import { branches, closureSnapshot } from "@/lib/demo/data";
import { accessRemovalPlan, canClose, closureChecklist } from "@/lib/rules/branch-closure";
import { formatMinor } from "@/lib/rules/money";

export const metadata = { title: "Close branch" };

export default async function CloseBranch({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const branch = branches.find((b) => b.code === code);
  if (!branch) notFound();

  const items = closureChecklist(closureSnapshot);
  const ready = canClose(items);
  const unresolved = items.filter((i) => i.id !== "users" && !i.resolved);
  const plan = accessRemovalPlan(closureSnapshot);
  const show = (id: string, n: number) => (id === "dues" ? formatMinor(n, "USD") : n.toLocaleString());

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-1 text-sm text-muted"><Link href="/branches" className="text-brand">Branches</Link> / {branch.name}</nav>
      <PageHeader title={`Close ${branch.name}`} description="Resolve everything outstanding first. Access is removed last, and history stays available for reporting." />

      {!ready && <div className="mb-2 max-w-form"><Alert tone="warn" title={`${unresolved.length} item${unresolved.length > 1 ? "s" : ""} still outstanding`}>Nothing has been closed or deleted. Resolve these, or carry an item over with a reason, then return here. Your progress is saved.</Alert></div>}

      <TableWrap label="Outstanding work">
        <thead><tr><Th>Item</Th><Th num>Outstanding</Th><Th>Status</Th><Th>What to do</Th></tr></thead>
        <tbody>
          {items.filter((i) => i.id !== "users").map((i) => (
            <tr key={i.id}>
              <Td className="font-medium">{i.label}</Td><Td num>{show(i.id, i.outstanding)}</Td>
              <Td>{i.resolved ? <Status tone="ok">Resolved</Status> : <Status tone="warn">Needs action</Status>}</Td>
              <Td>{i.action}</Td>
            </tr>
          ))}
        </tbody>
      </TableWrap>

      <div className="mt-3 max-w-form">
        <Panel title="Step 2 · Access removal (happens last)">
          <ul className="divide-y divide-line">
            {plan.map((p) => (
              <li key={p.userId} className="flex justify-between gap-2 py-1 text-sm">
                <span>{p.name}</span>
                <span className="text-muted">{p.action === "remove_branch_scope" ? "Keeps account; loses this branch" : "Account deactivated"}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <div className="mt-2 flex flex-wrap gap-1">
          <Button variant="danger" disabled={!ready} aria-describedby="why">Close branch and remove access</Button>
          <ButtonLink href="/branches">Save and return later</ButtonLink>
        </div>
        <p id="why" className="mt-1 text-xs text-muted">{ready ? "You'll be asked to confirm. Records are retained under your retention policy." : "Available once the outstanding items above are resolved."}</p>
      </div>
    </>
  );
}
