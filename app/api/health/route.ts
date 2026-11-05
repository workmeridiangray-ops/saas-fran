import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const dynamic = "force-dynamic";
/** Liveness + database reachability, for load balancers and uptime monitors. Reveals nothing else. */
export async function GET() {
  try { await pool.query("select 1"); return NextResponse.json({ status: "ok" }); }
  catch { return NextResponse.json({ status: "database unavailable" }, { status: 503 }); }
}
