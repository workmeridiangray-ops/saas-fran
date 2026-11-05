import { asService, asUser } from "@/lib/db";
import { REPORTS, REPORT_LABEL, runReport } from "@/lib/reports";
import { sendMail } from "@/lib/mail";

/** A schedule is due if it hasn't run in its current day / week-day / month. Pure so it can be tested. */
export function isDue(s: { frequency: string; weekday: number | null; last_run_at: Date | null }, now: Date): boolean {
  const day = (d: Date) => d.toISOString().slice(0, 10); const last = s.last_run_at;
  if (last && day(last) === day(now)) return false;
  if (s.frequency === "daily") return true;
  if (s.frequency === "weekly") return now.getUTCDay() === s.weekday;
  if (s.frequency === "monthly") return now.getUTCDate() === 1;
  return false;
}

/** Run every due scheduled report as the person who set it up, then email the CSV. Failures are logged, never silent. */
export async function runDueReports(now = new Date()): Promise<{ sent: number; failed: number }> {
  const out = { sent: 0, failed: 0 };
  const list = await asService((db) => db.q<{ id: string; company_id: string; kind: string; frequency: string; weekday: number | null; recipients: string[]; created_by: string; last_run_at: Date | null; company: string }>(
    "select s.id, s.company_id, s.kind, s.frequency, s.weekday, s.recipients, s.created_by, s.last_run_at, c.name company from report_schedules s join companies c on c.id = s.company_id where s.active and c.status in ('trial','active','past_due')"));
  for (const s of list) {
    if (!isDue(s, now)) continue;
    const log = (status: "ok" | "failed", rows: number, detail?: string) => asService((db) => db.q("insert into report_runs(company_id, schedule_id, kind, trigger, run_by, row_count, status, detail) values ($1,$2,$3,'scheduled',$4,$5,$6,$7)", [s.company_id, s.id, s.kind, s.created_by, rows, status, detail ?? null]));
    try {
      const def = REPORTS[s.kind]; if (!def) throw new Error("This report no longer exists.");
      // Permission is checked every run, as the creator: if they lost access, the schedule stops instead of leaking data.
      const allowed = await asUser(s.created_by, async (db) => (await db.one<{ ok: boolean }>("select app.has_perm($1, $2, $3) ok", [s.company_id, def.resource, def.action]))!.ok);
      if (!allowed) { await asService((db) => db.q("update report_schedules set active = false where id = $1", [s.id])); throw new Error("The person who scheduled this no longer has permission, so it was switched off."); }
      const r = (await runReport(s.created_by, s.company_id, s.kind))!;
      for (const to of s.recipients) await sendMail(to, `${REPORT_LABEL[s.kind] ?? s.kind} report: ${s.company}`, `Your scheduled ${REPORT_LABEL[s.kind] ?? s.kind} report is attached (${r.rows} rows).`, [{ filename: `${s.kind}-${now.toISOString().slice(0, 10)}.csv`, content: r.csv }]);
      await log("ok", r.rows); out.sent++;
    } catch (e) { await log("failed", 0, (e as Error).message.slice(0, 300)); out.failed++; }
    await asService((db) => db.q("update report_schedules set last_run_at = $2 where id = $1", [s.id, now]));
  }
  return out;
}
