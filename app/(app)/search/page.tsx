import Link from "next/link";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { PageHeader, StateMessage } from "@/components/ui";

export const metadata = { title: "Search" };

export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const ctx = await requireCtx(); const { q = "" } = await searchParams; const term = q.trim().slice(0, 80);
  const groups = term.length < 2 ? [] : await asUser(ctx.user.id, async (db) => {
    const like = `%${term.replace(/[%_\\]/g, "\\$&")}%`; const c = ctx.companyId;
    const g = async (label: string, sql: string, href: (id: string) => string) => ({ label, rows: (await db.q<{ id: string; t: string; s: string | null }>(sql, [c, like])).map((r) => ({ ...r, href: href(r.id) })) });
    return [
      await g("Branches", "select id, name t, code s from branches where company_id = $1 and (name ilike $2 or code ilike $2) limit 8", (id) => `/branches/${id}`),
      ctx.modules.includes("tasks") ? await g("Tasks", "select id, title t, status s from tasks where company_id = $1 and title ilike $2 limit 8", (id) => `/tasks/${id}`) : null,
      ctx.modules.includes("tickets") ? await g("Tickets", "select id, title t, number s from tickets where company_id = $1 and (title ilike $2 or number ilike $2) limit 8", (id) => `/tickets/${id}`) : null,
      ctx.modules.includes("documents") ? await g("Documents", "select id, title t, kind s from documents where company_id = $1 and title ilike $2 limit 8", (id) => `/knowledge/${id}`) : null,
      ctx.modules.includes("purchasing") ? await g("Requisitions", "select id, number t, status s from requisitions where company_id = $1 and number ilike $2 limit 8", (id) => `/purchasing/${id}`) : null,
    ].filter((x): x is NonNullable<typeof x> => !!x);
  });
  const total = groups.reduce((n, g) => n + g.rows.length, 0);
  return (
    <>
      <PageHeader title="Search" description={term ? `Results for “${term}”` : "Type at least two characters in the search box."} />
      {term.length >= 2 && total === 0 ? <StateMessage title="No results">Nothing matched “{term}” in the records you can see. Check the spelling or try fewer words.</StateMessage> : (
        <div className="max-w-prose space-y-3">{groups.filter((g) => g.rows.length).map((g) => <section key={g.label}><h2 className="mb-0.5 text-sm font-semibold text-muted">{g.label}</h2>
          <ul className="divide-y divide-line rounded-lg border border-line bg-surface">{g.rows.map((r) => <li key={r.id}><Link href={r.href} className="flex min-h-touch items-center justify-between gap-2 px-2 text-sm hover:bg-sunken"><span className="font-medium text-brand">{r.t}</span><span className="text-xs text-muted">{r.s}</span></Link></li>)}</ul></section>)}</div>)}
    </>
  );
}
