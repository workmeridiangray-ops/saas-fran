import { asService } from "@/lib/db";
import { randomToken, sha256 } from "./password";

export type TokenKind = "verify_email" | "reset_password" | "invitation";

export async function issueToken(kind: TokenKind, userId: string | null, ttl: string, payload: object = {}): Promise<string> {
  const raw = randomToken();
  await asService((db) => db.q(
    "insert into identity.tokens(user_id, kind, token_hash, payload, expires_at) values ($1,$2,$3,$4, now() + $5::interval)",
    [userId, kind, sha256(raw), JSON.stringify(payload), ttl]));
  return raw;
}
/** Single use: returns the token row once, then it is spent. */
export async function consumeToken(kind: TokenKind, raw: string) {
  return asService((db) => db.one<{ user_id: string | null; payload: Record<string, any> }>(
    `update identity.tokens set used_at = now() where token_hash = $1 and kind = $2 and used_at is null and expires_at > now() returning user_id, payload`,
    [sha256(raw), kind]));
}
export async function peekToken(kind: TokenKind, raw: string) {
  return asService((db) => db.one<{ user_id: string | null; payload: Record<string, any> }>(
    `select user_id, payload from identity.tokens where token_hash = $1 and kind = $2 and used_at is null and expires_at > now()`, [sha256(raw), kind]));
}
