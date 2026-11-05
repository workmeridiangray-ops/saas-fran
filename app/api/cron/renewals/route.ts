import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { asService } from "@/lib/db";

export const dynamic = "force-dynamic";
/** Renews subscriptions, issues invoices, suspends non-payers, and deletes companies past their retention period.
 * Run daily from a scheduler: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/renewals`. Idempotent. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const ok = secret.length >= 16 && got.length === secret.length && timingSafeEqual(Buffer.from(got), Buffer.from(secret));
  if (!ok) return new NextResponse("Unauthorized", { status: 401 });
  const days = Math.max(30, Number(process.env.RETENTION_DAYS ?? 90) || 90);
  const out = await asService(async (db) => ({
    renewals: (await db.one<{ n: number }>("select app.run_renewals() n"))!.n,
    escalations: (await db.one<{ n: number }>("select app.run_escalations() n"))!.n,
    purged: (await db.one<{ n: number }>("select app.purge_closed_companies($1) n", [days]))!.n,   // closed companies past their retention period
  }));
  return NextResponse.json(out);
}
