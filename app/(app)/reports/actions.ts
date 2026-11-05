"use server";
import { asUser } from "@/lib/db";
import { requireCtx } from "@/lib/ctx";
import { fail, run, str, uuid } from "@/lib/flash";
import { REPORTS } from "@/lib/reports";

export async function addSchedule(f: FormData) {
  const ctx = await requireCtx(); const kind = str(f, "kind"), freq = str(f, "frequency");
  return run("/reports", "/reports", "Schedule saved. It runs as you, so it only ever includes what you can see.", async () => {
    const def = REPORTS[kind]; if (!def) return fail("Choose a report.");
    if (!ctx.has(def.action as "export", def.resource as "reports")) fail("You can't export that report, so you can't schedule it.");
    if (!["daily", "weekly", "monthly"].includes(freq)) fail("Choose how often.");
    const recipients = str(f, "recipients").split(/[,\s;]+/).map((x) => x.toLowerCase()).filter(Boolean);
    if (recipients.length === 0 || recipients.length > 10 || recipients.some((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))) fail("Enter between 1 and 10 valid email addresses, separated by commas.");
    await asUser(ctx.user.id, (db) => db.q("insert into report_schedules(company_id, kind, frequency, weekday, recipients, created_by) values ($1,$2,$3,$4,$5,$6)", [ctx.companyId, kind, freq, freq === "weekly" ? Number(str(f, "weekday") || "1") : null, recipients, ctx.user.id]));
  });
}
export async function removeSchedule(f: FormData) {
  const ctx = await requireCtx(); const id = uuid(f, "id");
  return run("/reports", "/reports", "Schedule removed.", async () => { await asUser(ctx.user.id, (db) => db.q("delete from report_schedules where id = $1", [id])); });
}
