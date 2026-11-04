import Link from "next/link";
import { Search } from "lucide-react";
import { Button, ButtonLink, PageHeader, StateMessage, Status, TableWrap, Td, Th, type Tone } from "@/components/ui";
import { branches, usage, plans, currentPlanId, UPDATED, type BranchStatus } from "@/lib/demo/data";
import { canCreate } from "@/lib/rules/plan-limits";

export const metadata = { title: "Branches" };

const STATUS: Record<BranchStatus, { tone: Tone; label: string }> = {
  active: { tone: "ok", label: "Active" },
  opening: { tone: "info", label: "Opening" },
  suspended: { tone: "warn", label: "Suspended" },
  closing: { tone: "warn", label: "Closing" },
  closed: { tone: "neutral", label: "Closed" },
};

export default async function BranchesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; sort?: string }> }) {
  const { q = "", status = "", sort = "name" } = await searchParams;
  const needle = q.trim().toLowerCase();
  const rows = branches
    .filter((b) => (!status || b.status === status))
    .filter((b) => !needle || [b.name, b.code, b.region, b.brand, b.manager, b.partner ?? ""].some((v) => v.toLowerCase().includes(needle)))
    .sort((a, b) => sort === "score" ? b.complianceScore - a.complianceScore : sort === "items" ? b.openItems - a.openItems : a.name.localeCompare(b.name));

  const plan = plans[currentPlanId]!;
  const canAdd = canCreate(plan, usage, "branches");
  const keep = new URLSearchParams({ ...(q && { q }), ...(status && { status }) });
  const sortHref = (s: string) => `/branches?${new URLSearchParams({ ...Object.fromEntries(keep), sort: s })}`;

  return (
    <>
      <PageHeader
        title="Branches" updated={UPDATED}
        description={`${branches.length} locations across ${new Set(branches.map((b) => b.region)).size} regions. ${usage.branches} of ${plan.limits.branches ?? "unlimited"} included in your ${plan.name} plan.`}
        actions={canAdd ? <ButtonLink href="/m/branches-new" variant="primary">Add branch</ButtonLink> : <Button disabled title="Plan limit reached">Add branch</Button>}
      />

      <form className="mb-2 flex flex-wrap items-end gap-1.5" role="search" aria-label="Filter branches">
        <div className="relative">
          <label htmlFor="q" className="mb-0.5 block text-xs font-medium text-muted">Search</label>
          <Search aria-hidden size={16} className="pointer-events-none absolute bottom-[0.9rem] left-1.5 text-muted" />
          <input id="q" name="q" defaultValue={q} placeholder="Name, code, region, manager" className="min-h-touch w-[16rem] rounded-md border border-line-strong bg-surface pl-4 pr-1.5 text-sm" />
        </div>
        <div>
          <label htmlFor="status" className="mb-0.5 block text-xs font-medium text-muted">Status</label>
          <select id="status" name="status" defaultValue={status} className="min-h-touch rounded-md border border-line-strong bg-surface px-1.5 text-sm">
            <option value="">All statuses</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <input type="hidden" name="sort" value={sort} />
        <Button type="submit">Apply</Button>
        {(q || status) && <Link href="/branches" className="min-h-touch content-center text-sm font-medium text-brand">Clear filters</Link>}
      </form>

      {rows.length === 0 ? (
        <StateMessage title="No branches match" actions={<ButtonLink href="/branches">Clear filters</ButtonLink>}>
          Nothing matched “{q}”{status && ` with status ${STATUS[status as BranchStatus]?.label ?? status}`}. Check the spelling or remove a filter.
        </StateMessage>
      ) : (
        <TableWrap label="Branches">
          <caption className="sr-only">Branches, sortable by name, compliance score and open items</caption>
          <thead>
            <tr>
              <Th><Link href={sortHref("name")}>Branch</Link></Th><Th>Region · brand</Th><Th>Ownership</Th><Th>Status</Th><Th>Manager</Th>
              <Th num><Link href={sortHref("score")}>Score</Link></Th><Th num><Link href={sortHref("items")}>Open items</Link></Th><Th><span className="sr-only">Actions</span></Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.code} className="hover:bg-canvas">
                <Td><span className="font-medium">{b.name}</span><span className="block text-xs text-muted">{b.code}</span></Td>
                <Td>{b.region} · {b.brand}</Td>
                <Td>{b.ownership}{b.partner && <span className="block text-xs text-muted">{b.partner}</span>}</Td>
                <Td><Status tone={STATUS[b.status].tone}>{STATUS[b.status].label}</Status></Td>
                <Td>{b.manager}</Td>
                <Td num>{b.complianceScore ? `${b.complianceScore}%` : "—"}</Td>
                <Td num>{b.openItems}</Td>
                <Td>{b.status === "closing" || b.status === "active" ? <Link className="text-sm font-medium text-brand" href={`/branches/${b.code}/close`}>{b.status === "closing" ? "Continue closure" : "Close…"}</Link> : null}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      <p className="mt-1 text-xs text-muted">Showing {rows.length} of {branches.length}. Filters and sort stay in the address so you return here after opening a record.</p>
    </>
  );
}
