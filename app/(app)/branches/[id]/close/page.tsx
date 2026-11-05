import Link from "next/link";
import { notFound } from "next/navigation";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { closeBranch } from "../../actions";
import { loadClosureSnapshot } from "@/lib/data/branches";
import { accessRemovalPlan, canClose, closureChecklist } from "@/lib/rules/branch-closure";
import { formatMinor } from "@/lib/rules/money";
import { Field } from "@/components/ui/fields";
import { SubmitButton } from "@/components/ui/forms";
import { Flash } from "@/components/ui/flash";
import { Alert, ButtonLink, PageHeader, Panel, Status, TableWrap, Td, Th } from "@/components/ui";

export const metadata = { title: "Close branch" };
const LINK: Record<string, string> = { orders: "/purchasing?tab=orders", dues: "/royalties?tab=statements", assets: "/assets", tasks: "/tasks" };

export default async function CloseBranch({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "branches", { action: "archive", what: "closing branches" }); if (denied) return denied;
  const { id } = await params; const { err } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const d = await asUser(ctx.user.id, async (db) => {
    const b = await db.one<{ name: string; status: string }>("select name, status from branches where id = $1", [id]);
    return b ? { b, snap: await loadClosureSnapshot(db, ctx.companyId, id) } : null;
  });
  if (!d) notFound();
  const items = closureChecklist(d.snap).filter((i) => !["stock", "integrations", "users"].includes(i.id));
  const ready = canClose(items); const plan = accessRemovalPlan(d.snap);
  const unresolved = items.filter((i) => !i.resolved);
  if (d.b.status === "closed") return <Alert tone="info" title={`${d.b.name} is already closed`} />;
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-1 text-sm text-muted"><Link href="/branches" className="text-brand">Branches</Link> / <Link href={`/branches/${id}`} className="text-brand">{d.b.name}</Link> / Close</nav>
      <PageHeader title={`Close ${d.b.name}`} description="Resolve everything outstanding first. Access is removed last, and history stays available for reporting." />
      <Flash err={err} />
      {!ready && <div className="mb-2 max-w-form"><Alert tone="warn" title={`${unresolved.length} item${unresolved.length > 1 ? "s" : ""} still outstanding`}>Nothing has been closed or deleted. Resolve these, then return here.</Alert></div>}
      <TableWrap label="Outstanding work">
        <thead><tr><Th>Item</Th><Th num>Outstanding</Th><Th>Status</Th><Th>What to do</Th></tr></thead>
        <tbody>{items.map((i) => (
          <tr key={i.id}><Td className="font-medium">{i.label}</Td><Td num>{i.id === "dues" ? formatMinor(i.outstanding, ctx.company.currency) : i.outstanding}</Td>
            <Td>{i.resolved ? <Status tone="ok">Resolved</Status> : <Status tone="warn">Needs action</Status>}</Td>
            <Td>{i.action}{!i.resolved && LINK[i.id] && <> · <Link className="font-medium text-brand" href={LINK[i.id]!}>Open</Link></>}</Td></tr>
        ))}</tbody>
      </TableWrap>
      <div className="mt-3 max-w-form space-y-2">
        <Panel title="Access removal (happens last)">
          {plan.length === 0 ? <p className="text-sm text-muted">No one is limited to this branch.</p> : (
            <ul className="divide-y divide-line">{plan.map((p) => <li key={p.userId} className="flex justify-between gap-2 py-1 text-sm"><span>{p.name}</span><span className="text-muted">{p.action === "remove_branch_scope" ? "Keeps account and other branches" : "Access suspended"}</span></li>)}</ul>
          )}
        </Panel>
        {ready ? (
          <form action={closeBranch} className="space-y-2 rounded-lg border border-danger bg-surface p-2">
            <input type="hidden" name="id" value={id} />
            <p className="text-sm">This is final. Records are kept under your retention policy and stay in reports.</p>
            <Field label={`Type “${d.b.name}” to confirm`} name="confirm" required autoComplete="off" />
            <SubmitButton variant="danger" pending="Closing…">Close branch and remove access</SubmitButton>
          </form>
        ) : <p className="text-sm text-muted">Closing becomes available once the items above are resolved.</p>}
        <ButtonLink href={`/branches/${id}`}>Back to branch</ButtonLink>
      </div>
    </>
  );
}
