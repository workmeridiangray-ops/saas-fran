"use server";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { fail, run, str, uuid } from "@/lib/flash";

const PAGES = ["/branches", "/tasks", "/tickets"];
const clean = (q: string) => { const u = new URLSearchParams(q); u.delete("ok"); u.delete("err"); return u.toString(); };
export async function saveView(f: FormData) {
  const ctx = await requireCtx(); const page = str(f, "page"); const query = clean(str(f, "query"));
  const back = `${PAGES.includes(page) ? page : "/"}${query ? `?${query}` : ""}`;
  return run(back, back, "View saved. Find it above the table.", async () => {
    if (!PAGES.includes(page)) fail("That page doesn't support saved views.");
    const name = str(f, "name"); if (name.length < 2 || name.length > 60) fail("Name the view (2 to 60 characters).");
    await asUser(ctx.user.id, (db) => db.q("insert into saved_views(company_id, user_id, page, name, query) values ($1,$2,$3,$4,$5) on conflict (user_id, page, name) do update set query = excluded.query", [ctx.companyId, ctx.user.id, page, name, query]));
  });
}
export async function deleteView(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id"); const page = str(f, "page"); const back = PAGES.includes(page) ? page : "/";
  return run(back, back, "View removed.", async () => { await asUser(ctx.user.id, (db) => db.q("delete from saved_views where id = $1 and user_id = $2", [id, ctx.user.id])); });
}
