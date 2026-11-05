import { NextResponse } from "next/server";
import { asUser } from "@/lib/db";
import { currentSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await currentSession();
  const { id } = await params;
  if (!s || s.pending2fa || !/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  // The database applies the parent record's access rules; a person who can't see the record gets no row.
  const row = await asUser(s.id, (db) => db.one<{ filename: string; content_type: string; data: Buffer }>("select filename, content_type, data from attachments where id = $1", [id]));
  if (!row) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(row.data), { headers: {
    "Content-Type": row.content_type, "Content-Disposition": `attachment; filename="${row.filename.replace(/"/g, "")}"`,
    "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store", "Content-Security-Policy": "sandbox",
  } });
}
