"use server";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { fail, run, str, uuid } from "@/lib/flash";

const KINDS = ["internal", "customer_complaint", "incident"], PRI = ["low", "normal", "high", "urgent"];
export async function createTicket(f: FormData) {
  const ctx = await requireCtx(); const kind = str(f, "kind"), pri = str(f, "priority");
  return run("/tickets/new", "/tickets", "Ticket raised.", async () => {
    const title = str(f, "title"); if (title.length < 3) fail("Give the ticket a short title.");
    if (!KINDS.includes(kind) || !PRI.includes(pri)) fail("Choose a type and priority.");
    const id = await asUser(ctx.user.id, async (db) => {
      const number = (await db.one<{ n: string }>("select app.next_number($1,'ticket','TCK') n", [ctx.companyId]))!.n;
      return (await db.one<{ id: string }>("insert into tickets(company_id, branch_id, number, kind, category, title, body, priority, assignee_id, created_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id",
        [ctx.companyId, str(f, "branch_id") || null, number, kind, str(f, "category") || "general", title, str(f, "body"), pri, str(f, "assignee_id") || null, ctx.user.id]))!.id;
    });
    return `/tickets/${id}`;
  });
}
export async function updateTicket(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id"); const to = str(f, "to"); const resolution = str(f, "resolution"); const assignee = str(f, "assignee_id");
  return run(`/tickets/${id}`, `/tickets/${id}`, "Ticket updated.", async () => {
    if (!["open", "in_progress", "resolved", "closed"].includes(to)) fail("Unknown status.");
    if ((to === "resolved" || to === "closed") && resolution.length < 3) fail("Say how it was resolved.");
    const n = await asUser(ctx.user.id, (db) => db.q("update tickets set status = $2, resolution = coalesce(nullif($3,''), resolution), resolved_at = case when $2 in ('resolved','closed') then now() else null end, assignee_id = coalesce(nullif($4,'')::uuid, assignee_id) where id = $1 returning id", [id, to, resolution, assignee]));
    if (n.length === 0) fail("You can't update that ticket.");
  });
}
export async function commentTicket(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id");
  return run(`/tickets/${id}`, `/tickets/${id}`, "Comment added.", async () => {
    const body = str(f, "body"); if (!body) fail("Write a comment first.");
    await asUser(ctx.user.id, (db) => db.q("insert into ticket_comments(company_id, ticket_id, author_id, body) values ($1,$2,$3,$4)", [ctx.companyId, id, ctx.user.id, body]));
  });
}

export async function saveSla(f: FormData) {
  const ctx = await requireCtx();
  return run("/tickets?tab=sla", "/tickets?tab=sla", "Response deadlines saved. They apply to tickets raised from now on.", async () => {
    await asUser(ctx.user.id, async (db) => {
      for (const p of PRI) {
        const h = str(f, `h:${p}`); if (h === "") { await db.q("delete from sla_policies where company_id = $1 and priority = $2", [ctx.companyId, p]); continue; }
        const n = Number(h); if (!Number.isInteger(n) || n < 1 || n > 8760) fail(`${p}: enter whole hours between 1 and 8760.`);
        await db.q("insert into sla_policies(company_id, priority, resolve_hours) values ($1,$2,$3) on conflict (company_id, priority) do update set resolve_hours = excluded.resolve_hours", [ctx.companyId, p, n]);
      }
    });
  });
}
