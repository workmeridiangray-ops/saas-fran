"use server";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { fail, run, str, uuid } from "@/lib/flash";
import { zonedToIso } from "@/lib/format";

export async function addShift(f: FormData) {
  const ctx = await requireCtx(); const branch = uuid(f, "branch_id"), user = uuid(f, "user_id"); const day = str(f, "day"), from = str(f, "from"), to = str(f, "to");
  return run("/roster", "/roster", "Shift added.", async () => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to)) fail("Set the day and the start and end times.");
    await asUser(ctx.user.id, async (db) => {
      const tz = (await db.one<{ timezone: string }>("select timezone from branches where id = $1", [branch]))?.timezone ?? ctx.company.timezone;
      let end = zonedToIso(`${day}T${to}`, tz); const start = zonedToIso(`${day}T${from}`, tz);
      if (end <= start) end = new Date(new Date(end).getTime() + 86_400_000).toISOString();   // a shift that finishes after midnight
      await db.q("insert into shifts(company_id, branch_id, user_id, starts_at, ends_at, note, created_by) values ($1,$2,$3,$4,$5,$6,$7)", [ctx.companyId, branch, user, start, end, str(f, "note"), ctx.user.id]);
    });
  });
}
export async function removeShift(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id");
  return run("/roster", "/roster", "Shift removed.", async () => { await asUser(ctx.user.id, (db) => db.q("delete from shifts where id = $1", [id])); });
}
export async function requestLeave(f: FormData) {
  const ctx = await requireCtx();
  return run("/roster?tab=leave", "/roster?tab=leave", "Leave requested. Your manager has been asked to decide.", async () => {
    const from = str(f, "from"), to = str(f, "to"); if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) fail("Choose the first and last day.");
    const kind = ["annual", "sick", "unpaid", "other"].includes(str(f, "kind")) ? str(f, "kind") : "annual";
    await asUser(ctx.user.id, async (db) => {
      await db.q("insert into leave_requests(company_id, user_id, from_date, to_date, kind, reason) values ($1,$2,$3,$4,$5,$6)", [ctx.companyId, ctx.user.id, from, to, kind, str(f, "reason")]);
      const roles = await db.q<{ id: string }>("select id from roles where company_id = $1 and (grants @> '[{\"resource\":\"people\",\"actions\":[\"approve\"]}]'::jsonb or name = 'Company owner')", [ctx.companyId]);
      for (const r of roles) await db.q("select public.notify_role($1,$2,$3,$4,$5)", [ctx.companyId, r.id, "Leave request", `${ctx.user.displayName || ctx.user.email}: ${from} to ${to}`, "/roster?tab=approvals"]);
    });
  });
}
export async function cancelLeave(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id");
  return run("/roster?tab=leave", "/roster?tab=leave", "Request cancelled.", async () => { const n = await asUser(ctx.user.id, (db) => db.q("update leave_requests set status = 'cancelled' where id = $1 and user_id = $2 and status = 'pending' returning id", [id, ctx.user.id])); if (!n.length) fail("Only a pending request can be cancelled."); });
}
async function decide(f: FormData, ok: boolean) {
  const ctx = await requireCtx(); const id = uuid(f, "id"); const note = str(f, "note");
  return run("/roster?tab=approvals", "/roster?tab=approvals", ok ? "Leave approved." : "Leave declined. The person has been told why.", async () => {
    if (!ok && note.length < 3) fail("Give a reason so they know why.");
    await asUser(ctx.user.id, async (db) => {
      const r = await db.one<{ user_id: string }>("update leave_requests set status = $2, decided_by = $3, decision_note = nullif($4,'') where id = $1 and status = 'pending' returning user_id", [id, ok ? "approved" : "rejected", ctx.user.id, note]);
      if (!r) fail("That request isn't waiting for a decision, or you can't decide it.");
      await db.q("insert into notifications(company_id, user_id, title, body, href) values ($1,$2,$3,$4,'/roster?tab=leave')", [ctx.companyId, r!.user_id, ok ? "Leave approved" : "Leave declined", note]);
    });
  });
}
export async function approveLeave(f: FormData) { return decide(f, true); }
export async function declineLeave(f: FormData) { return decide(f, false); }
