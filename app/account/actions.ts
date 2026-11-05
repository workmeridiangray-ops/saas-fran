"use server";
import { asService } from "@/lib/db";
import { fail, run, str } from "@/lib/flash";
import { hashPassword, newRecoveryCodes, passwordProblem, sha256, verifyPassword } from "@/lib/auth/password";
import { newSecret, verifyTotp } from "@/lib/auth/totp";
import { requireUser } from "@/lib/auth/session";
import { revalidatePath } from "next/cache";

export async function updateProfile(f: FormData) {
  const u = await requireUser(); const name = str(f, "name");
  return run("/account", "/account", "Profile saved.", async () => {
    if (name.length < 2) fail("Enter your name.");
    await asService(async (db) => { await db.q("update identity.users set display_name = $2 where id = $1", [u.id, name]); await db.q("update public.profiles set display_name = $2 where id = $1", [u.id, name]); });
  });
}

export async function changePassword(f: FormData) {
  const u = await requireUser(); const cur = String(f.get("current") ?? ""), next = String(f.get("next") ?? "");
  return run("/account", "/account", "Password changed. Your other devices were signed out.", async () => {
    const problem = passwordProblem(next, u.email); if (problem) fail(problem);
    const err = await asService(async (db) => {
      const row = (await db.one<{ password_hash: string }>("select password_hash from identity.users where id = $1", [u.id]))!;
      if (!(await verifyPassword(cur, row.password_hash))) return "Your current password isn't right.";
      await db.q("update identity.users set password_hash = $2 where id = $1", [u.id, await hashPassword(next)]);
      await db.q("delete from identity.sessions where user_id = $1 and id <> $2", [u.id, u.sessionId]);
      return null;
    });
    if (err) fail(err);
  });
}

export async function beginTotp() {
  const u = await requireUser();
  await asService((db) => db.q("update identity.users set totp_secret = $2 where id = $1 and totp_enabled = false", [u.id, newSecret()]));
  revalidatePath("/account");
}

export type TotpState = { error?: string; codes?: string[] };
export async function confirmTotp(_prev: TotpState, f: FormData): Promise<TotpState> {
  const u = await requireUser(); const code = str(f, "code").replace(/\s/g, "");
  return asService(async (db) => {
    const row = await db.one<{ totp_secret: string | null }>("select totp_secret from identity.users where id = $1", [u.id]);
    if (!row?.totp_secret || !verifyTotp(row.totp_secret, code)) return { error: "That code isn't right. Check the time on your phone and try the next code." };
    const codes = newRecoveryCodes();
    await db.q("update identity.users set totp_enabled = true, recovery_code_hashes = $2 where id = $1", [u.id, codes.map((c) => sha256(c.toLowerCase()))]);
    return { codes };
  });
}

export async function disableTotp(f: FormData) {
  const u = await requireUser(); const pw = String(f.get("password") ?? "");
  return run("/account", "/account", "Two-factor authentication is off.", async () => {
    const err = await asService(async (db) => {
      const row = (await db.one<{ password_hash: string }>("select password_hash from identity.users where id = $1", [u.id]))!;
      if (!(await verifyPassword(pw, row.password_hash))) return "Your password isn't right.";
      await db.q("update identity.users set totp_enabled = false, totp_secret = null, recovery_code_hashes = '{}' where id = $1", [u.id]);
      return null;
    });
    if (err) fail(err);
  });
}

export async function revokeSession(f: FormData) {
  const u = await requireUser(); const id = str(f, "id");
  return run("/account", "/account", "That device was signed out.", async () => {
    await asService((db) => db.q("delete from identity.sessions where id = $1 and user_id = $2 and id <> $3", [id, u.id, u.sessionId]));
  });
}
export async function revokeOthers() {
  const u = await requireUser();
  return run("/account", "/account", "All other devices were signed out.", async () => {
    await asService((db) => db.q("delete from identity.sessions where user_id = $1 and id <> $2", [u.id, u.sessionId]));
  });
}
