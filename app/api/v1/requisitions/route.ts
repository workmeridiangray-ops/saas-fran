import { asService } from "@/lib/db";
import { authenticate, cursor, json, page } from "@/lib/integrations/api";

export const dynamic = "force-dynamic";
/** GET /api/v1/requisitions?limit=50&after=<cursor>. Read-only and limited to the key's own company. */
export async function GET(req: Request) {
  const a = await authenticate(req, "read:requisitions"); if (!("companyId" in a)) return a;
  const { limit, afterAt, afterId } = page(req);
  const rows = await asService((db) => db.q<{ id: string; created_at: string }>(
    `select t.id, t.number, t.status, t.total_minor, t.branch_id, t.supplier_id, t.created_at from requisitions t where t.company_id = $1 and ($2::timestamptz is null or (t.created_at, t.id) < ($2::timestamptz, $3::uuid)) order by t.created_at desc, t.id desc limit $4`, [a.companyId, afterAt, afterId, limit + 1]));
  return json(rows.slice(0, limit), cursor(rows, limit));
}
