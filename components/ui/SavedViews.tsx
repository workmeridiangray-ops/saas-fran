import Link from "next/link";
import { asUser } from "@/lib/db";
import type { Ctx } from "@/lib/ctx";
import { deleteView, saveView } from "@/app/(app)/views/actions";
import { SubmitButton } from "@/components/ui/forms";

/** Your saved filters for a table, as one-click links, plus a way to save the current one. Private to you. */
export async function SavedViews({ ctx, page, query }: { ctx: Ctx; page: "/branches" | "/tasks" | "/tickets"; query: string }) {
  const views = await asUser(ctx.user.id, (db) => db.q<{ id: string; name: string; query: string }>("select id, name, query from saved_views where user_id = $1 and company_id = $2 and page = $3 order by name", [ctx.user.id, ctx.companyId, page]));
  return (
    <div className="mb-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="Saved views">
      {views.length > 0 && <span className="text-xs font-medium text-muted">Your views:</span>}
      {views.map((v) => (
        <span key={v.id} className="inline-flex items-center rounded-md border border-line bg-surface">
          <Link href={`${page}${v.query ? `?${v.query}` : ""}`} className={`inline-flex min-h-touch items-center px-2 text-sm hover:bg-sunken ${v.query === query ? "font-semibold text-brand" : ""}`}>{v.name}</Link>
          <form action={deleteView}><input type="hidden" name="id" value={v.id} /><input type="hidden" name="page" value={page} /><button aria-label={`Remove saved view ${v.name}`} className="inline-flex min-h-touch min-w-touch items-center justify-center text-muted hover:text-danger">×</button></form>
        </span>))}
      {query && !views.some((v) => v.query === query) && (
        <form action={saveView} className="inline-flex items-center gap-1"><input type="hidden" name="page" value={page} /><input type="hidden" name="query" value={query} />
          <label className="sr-only" htmlFor={`sv-${page}`}>Name for this view</label><input id={`sv-${page}`} name="name" placeholder="Name this view" required maxLength={60} className="min-h-touch w-[10rem] rounded-md border border-line-strong bg-surface px-1.5 text-sm" /><SubmitButton variant="secondary" pending="…">Save view</SubmitButton></form>)}
    </div>
  );
}
