import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { deliverDue } from "@/lib/integrations/deliver";

export const dynamic = "force-dynamic";
/** Run every minute: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" $APP_URL/api/cron/webhooks`. */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET ?? ""; const got = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  if (!(secret.length >= 16 && got.length === secret.length && timingSafeEqual(Buffer.from(got), Buffer.from(secret)))) return new NextResponse("Unauthorized", { status: 401 });
  return NextResponse.json(await deliverDue());
}
