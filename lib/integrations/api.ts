import { NextResponse } from "next/server";
import { asService } from "@/lib/db";
import { keyMatches, parseApiKey } from "./security";

export interface ApiCtx { companyId: string; keyId: string }
/** Authenticate a Bearer API key for one scope, and apply the per-key rate limit. Returns a response to send on failure. */
export async function authenticate(req: Request, scope: string): Promise<ApiCtx | NextResponse> {
  const raw = (req.headers.get("authorization") ?? "").replace(/^Bearer /i, "").trim(); const p = parseApiKey(raw);
  const deny = (status: number, msg: string, extra: Record<string, string> = {}) => NextResponse.json({ error: msg }, { status, headers: { "Cache-Control": "no-store", ...extra } });
  if (!p) return deny(401, "Send your API key as: Authorization: Bearer <key>");
  const row = await asService((db) => db.one<{ id: string; company_id: string; key_hash: string; scopes: string[]; status: string }>("select k.id, k.company_id, k.key_hash, k.scopes, c.status from api_keys k join companies c on c.id = k.company_id where k.prefix = $1 and k.revoked_at is null", [p.prefix]));
  if (!row || !keyMatches(raw, row.key_hash)) return deny(401, "That API key isn't valid.");
  if (["closed"].includes(row.status)) return deny(403, "This company is closed.");
  if (!row.scopes.includes(scope)) return deny(403, `This key doesn't have the ${scope} permission.`);
  const hits = await asService(async (db) => { const h = Number((await db.one<{ h: number }>("select app.api_hit($1) h", [row.id]))!.h); await db.q("update api_keys set last_used_at = now() where id = $1", [row.id]); return h; });
  if (hits > 120) return deny(429, "Too many requests. The limit is 120 per minute per key.", { "Retry-After": "30" });
  return { companyId: row.company_id, keyId: row.id };
}
/** Keyset pagination: newest first, cursor is "<iso>|<id>". */
export function page(req: Request) {
  const u = new URL(req.url); const limit = Math.min(100, Math.max(1, Number(u.searchParams.get("limit") ?? 50) || 50)); const c = u.searchParams.get("after") ?? "";
  const m = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\|([0-9a-f-]{36})$/.exec(c);
  return { limit, afterAt: m?.[1] ?? null, afterId: m?.[2] ?? null };
}
export const cursor = (rows: { created_at: string | Date; id: string }[], limit: number) => rows.length > limit ? `${new Date(rows[limit - 1]!.created_at).toISOString()}|${rows[limit - 1]!.id}` : null;
export const json = (data: unknown[], next: string | null) => NextResponse.json({ data, next }, { headers: { "Cache-Control": "no-store" } });
