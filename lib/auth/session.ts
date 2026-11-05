import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { asService } from "@/lib/db";
import { env } from "@/lib/env";
import { randomToken, sha256 } from "./password";

export const SESSION_COOKIE = "nm_sid";
export const WORKSPACE_COOKIE = "nm_ws";
const DAYS = 14;

export interface SessionUser { id: string; email: string; displayName: string; totpEnabled: boolean; sessionId: string; pending2fa: boolean }

const cookieOpts = (maxAge?: number) => ({ httpOnly: true, sameSite: "lax" as const, secure: env().PROD, path: "/", ...(maxAge ? { maxAge } : {}) });

export async function createSession(userId: string, pending2fa: boolean): Promise<void> {
  const token = randomToken();
  const h = await headers();
  await asService((db) => db.q(
    `insert into identity.sessions(user_id, token_hash, pending_2fa, user_agent, ip, expires_at) values ($1,$2,$3,$4,$5, now() + $6::interval)`,
    [userId, sha256(token), pending2fa, (h.get("user-agent") ?? "").slice(0, 300), (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ?? null, pending2fa ? "10 minutes" : `${DAYS} days`]));
  (await cookies()).set(SESSION_COOKIE, token, cookieOpts(DAYS * 86400));
}

export async function currentSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const row = await asService((db) => db.one<{ id: string; email: string; display_name: string; totp_enabled: boolean; sid: string; pending_2fa: boolean }>(
    `update identity.sessions s set last_seen_at = now() from identity.users u
      where s.token_hash = $1 and s.expires_at > now() and u.id = s.user_id and u.status = 'active'
      returning u.id, u.email, u.display_name, u.totp_enabled, s.id as sid, s.pending_2fa`, [sha256(token)]));
  return row ? { id: row.id, email: row.email, displayName: row.display_name, totpEnabled: row.totp_enabled, sessionId: row.sid, pending2fa: row.pending_2fa } : null;
}

/** For pages and actions that need a fully signed-in user. */
export async function requireUser(): Promise<SessionUser> {
  const s = await currentSession();
  if (!s) {
    const had = !!(await cookies()).get(SESSION_COOKIE)?.value;   // a cookie that no longer works means the session ended
    const path = (await headers()).get("x-nm-path") ?? "/";
    const next = path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/signin") ? `next=${encodeURIComponent(path)}` : "";
    redirect(`/signin?${[next, had ? "expired=1" : ""].filter(Boolean).join("&")}`);
  }
  if (s.pending2fa) redirect("/2fa");
  return s;
}

export async function endSession(): Promise<void> {
  const c = await cookies(); const token = c.get(SESSION_COOKIE)?.value;
  if (token) await asService((db) => db.q("delete from identity.sessions where token_hash = $1", [sha256(token)]));
  c.delete(SESSION_COOKIE); c.delete(WORKSPACE_COOKIE);
}
export async function setWorkspace(companyId: string) { (await cookies()).set(WORKSPACE_COOKIE, companyId, cookieOpts(DAYS * 86400)); }
export async function activeWorkspaceId() { return (await cookies()).get(WORKSPACE_COOKIE)?.value ?? null; }
