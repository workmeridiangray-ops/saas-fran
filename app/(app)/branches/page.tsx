import Link from "next/link";
import { Search } from "lucide-react";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { guard } from "@/lib/guard";
import { Flash } from "@/components/ui/flash";
import { Button, ButtonLink, PageHeader, StateMessage, Status, TableWrap, Td, Th, type Tone } from "@/components/ui";
import { BRANCH_LABEL, type BranchStatus } from "@/lib/rules/branch-lifecycle";

export const metadata = { title: "Branches" };
const TONE: Record<BranchStatus, Tone> = { planned: "neutral", opening: "info", active: "ok", suspended: "warn", closing: "warn", closed: "neutral" };

export default async function BranchesPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; sort?: string; ok?: string; err?: string }> }) {
  const ctx = await requireCtx(); const denied = guard(ctx, "branches", { what: "branches" }); if (denied) return denied;
  const { q = "", status = "", sort = "name", ok, err } = await searchParams;
  const order = { name: "b.name", code: "b.code", tasks: "open_tasks desc", score: "last_score desc nulls last" }[sort] ?? "b.name";
  const rows = await asUser(ctx.user.id, (db) => db.q<{ id: string; name: string; code: string; status: BranchStatus; ownership: string; region: string | null; brand: string | null; partner: string | null; open_tasks: string; last_score: string | null }>(
    `select b.id, b.name, b.code, b.status, b.ownership, r.name region, br.name brand, p.name partner,
            (select count(*) from tasks t where t.branch_id = b.id and t.status in ('open','in_progress','blocked')) open_tasks,
            (select score from inspections i where i.branch_id = b.id and i.status = 'completed' order by completed_at desc limit 1) last_score
       from branches b left join regions r on r.id = b.region_id left join brands br on br.id = b.brand_id left join franchise_partners p on p.id = b.partner_id
      where b.company_id = $1 and ($2 = '' or b.status = $2)
        and ($3 = '' or b.name ilike '%'||$3||'%' or b.code ilike '%'||$3||'%' or coalesce(r.name,'') ilike '%'||$3||'%' or coalesce(br.name,'') ilike '%'||$3||'%' or coalesce(p.name,'') ilike '%'||$3||'%')
      order by ${order} limit 300`, [ctx.companyId, status, q]));
  const total = await asUser(ctx.user.id, async (db) => Number((await db.one<{ n: string }>("select count(*) n from branches where company_id = $1", [ctx.companyId]))!.n));
  const sortHref = (s: string) => `/branches?${new URLSearchParams({ ...(q && { q }), ...(status && { status }), sort: s })}`;
  const canAdd = ctx.has("create", "branches");

  return (
    <>
      <PageHeader title="Branches" description={`${total} location${total === 1 ? "" : "s"} in ${ctx.company.name}.`}
        actions={canAdd ? <ButtonLink href="/branches/new" variant="primary">Add branch</ButtonLink> : undefined} />
      <Flash ok={ok} err={err} />
      <form className="mb-2 flex flex-wrap items-end gap-1.5" role="search" aria-label="Filter branches">
        <div className="relative">
          <label htmlFor="q" className="mb-0.5 block text-xs font-medium text-muted">Search</label>
          <Search aria-hidden size={16} className="pointer-events-none absolute bottom-[0.9rem] left-1.5 text-muted" />
          <input id="q" name="q" defaultValue={q} placeholder="Name, code, region, partner" className="min-h-touch w-[16rem] rounded-md border border-line-strong bg-surface pl-4 pr-1.5 text-sm" />
        </div>
        <div>
          <label htmlFor="status" className="mb-0.5 block text-xs font-medium text-muted">Status</label>
          <select id="status" name="status" defaultValue={status} className="min-h-touch rounded-md border border-line-strong bg-surface px-1.5 text-sm">
            <option value="">All statuses</option>{Object.entries(BRANCH_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <input type="hidden" name="sort" value={sort} />
        <Button type="submit">Apply</Button>
        {(q || status) && <Link href="/branches" className="min-h-touch content-center text-sm font-medium text-brand">Clear filters</Link>}
      </form>
      {rows.length === 0 ? (
        total === 0 ? <StateMessage title="No branches yet" actions={canAdd ? <ButtonLink href="/branches/new" variant="primary">Add your first branch</ButtonLink> : undefined}>Branches are the locations you manage: outlets, kitchens, offices or service centres. Add one to start assigning tasks, inspections and purchasing.</StateMessage>
          : <StateMessage title="No branches match" actions={<ButtonLink href="/branches">Clear filters</ButtonLink>}>Nothing matched{q && ` “${q}”`}{status && ` with status ${status}`}. Check the spelling or remove a filter.</StateMessage>
      ) : (
        <TableWrap label="Branches">
          <caption className="sr-only">Branches, sortable by name, code, open tasks and last inspection score</caption>
          <thead><tr><Th><Link href={sortHref("name")}>Branch</Link></Th><Th>Region · brand</Th><Th>Ownership</Th><Th>Status</Th><Th num><Link href={sortHref("tasks")}>Open tasks</Link></Th><Th num><Link href={sortHref("score")}>Last score</Link></Th></tr></thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="hover:bg-canvas">
                <Td><Link href={`/branches/${b.id}`} className="font-medium text-brand">{b.name}</Link><span className="block text-xs text-muted">{b.code}</span></Td>
                <Td>{[b.region, b.brand].filter(Boolean).join(" · ") || "—"}</Td>
                <Td>{b.ownership === "franchise" ? "Franchise" : "Company"}{b.partner && <span className="block text-xs text-muted">{b.partner}</span>}</Td>
                <Td><Status tone={TONE[b.status]}>{BRANCH_LABEL[b.status]}</Status></Td>
                <Td num>{b.open_tasks}</Td><Td num>{b.last_score === null ? "—" : `${Number(b.last_score)}%`}</Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      <p className="mt-1 text-xs text-muted">Showing {rows.length} of {total}. Search, filter and sort live in the address, so you return here after opening a record.</p>
    </>
  );
}
