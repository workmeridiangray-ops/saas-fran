import Link from "next/link";
import { revalidatePath } from "next/cache";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { PageHeader, StateMessage } from "@/components/ui";
import { SubmitButton } from "@/components/ui/forms";
import { fmtDateTime } from "@/lib/format";

export const metadata = { title: "Notifications" };

async function markAllRead() {
  "use server";
  const ctx = await requireCtx();
  await asUser(ctx.user.id, (db) => db.q("update notifications set read_at = now() where user_id = $1 and company_id = $2 and read_at is null", [ctx.user.id, ctx.companyId]));
  revalidatePath("/notifications");
}
async function open(f: FormData) {
  "use server";
  const ctx = await requireCtx(); const id = String(f.get("id") ?? "");
  const row = await asUser(ctx.user.id, (db) => db.one<{ href: string | null }>("update notifications set read_at = coalesce(read_at, now()) where id = $1 and user_id = $2 returning href", [id, ctx.user.id]));
  const { redirect } = await import("next/navigation");
  redirect(row?.href && row.href.startsWith("/") ? row.href : "/notifications");
}

export default async function Notifications() {
  const ctx = await requireCtx();
  const rows = await asUser(ctx.user.id, (db) => db.q<{ id: string; title: string; body: string; href: string | null; read_at: string | null; created_at: string }>("select id, title, body, href, read_at, created_at from notifications where user_id = $1 and company_id = $2 order by created_at desc limit 100", [ctx.user.id, ctx.companyId]));
  return (
    <>
      <PageHeader title="Notifications" actions={rows.some((r) => !r.read_at) ? <form action={markAllRead}><SubmitButton variant="secondary" pending="…">Mark all read</SubmitButton></form> : undefined} />
      {rows.length === 0 ? <StateMessage title="You're all caught up">Assignments, approvals and updates for you appear here.</StateMessage> : (
        <ul className="max-w-prose divide-y divide-line rounded-lg border border-line bg-surface">{rows.map((n) => (
          <li key={n.id}><form action={open}><input type="hidden" name="id" value={n.id} /><button className="flex min-h-touch w-full items-start gap-1.5 p-2 text-left hover:bg-sunken">
            <span aria-hidden className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-brand"}`} /><span className="min-w-0"><span className={`block text-sm ${n.read_at ? "" : "font-semibold"}`}>{n.title}{!n.read_at && <span className="sr-only"> (unread)</span>}</span>{n.body && <span className="block text-sm text-muted">{n.body}</span>}<span className="block text-xs text-muted">{fmtDateTime(n.created_at, ctx.company.timezone)}</span></span></button></form></li>))}</ul>)}
      <p className="mt-2 text-sm"><Link className="font-medium text-brand" href="/account">Account and security settings</Link></p>
    </>
  );
}
