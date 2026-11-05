"use server";
import { redirect } from "next/navigation";
import { asService } from "@/lib/db";
import { fail, run, str } from "@/lib/flash";
import { hashPassword, newRecoveryCodes, passwordProblem, sha256, verifyPassword } from "@/lib/auth/password";
import { consumeToken, issueToken } from "@/lib/auth/tokens";
import { verifyTotp } from "@/lib/auth/totp";
import { createSession, currentSession, endSession, setWorkspace } from "@/lib/auth/session";
import { link, sendMail } from "@/lib/mail";

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const safeNext = (n: string) => (n.startsWith("/") && !n.startsWith("//") && !n.includes("\\") ? n : "/");
const DUMMY_HASH = "scrypt$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==";

export async function signUp(f: FormData) {
  const email = str(f, "email").toLowerCase(), name = str(f, "name"), password = String(f.get("password") ?? ""), next = safeNext(str(f, "next"));
  return run(`/signup?next=${encodeURIComponent(next)}`, `/verify?sent=1&next=${encodeURIComponent(next)}`, "Check your email to confirm your address.", async () => {
    if (!EMAIL.test(email)) fail("Enter a valid email address.");
    if (name.length < 2) fail("Enter your name.");
    const problem = passwordProblem(password, email); if (problem) fail(problem);
    const hash = await hashPassword(password);
    const created = await asService(async (db) => {
      const existing = await db.one("select id from identity.users where email = $1", [email]);
      if (existing) return null;
      const u = (await db.one<{ id: string }>("insert into identity.users(email, password_hash, display_name) values ($1,$2,$3) returning id", [email, hash, name]))!;
      await db.q("insert into public.profiles(id, display_name, email) values ($1,$2,$3)", [u.id, name, email]);
      return u.id;
    });
    // Same response either way, so the form can't be used to discover who has an account.
    if (!created) { await sendMail(email, "You already have an account", `Someone tried to create an account with this address. If it was you, sign in or reset your password: ${link("/signin")}`); return; }
    const token = await issueToken("verify_email", created, "2 days");
    await sendMail(email, "Confirm your email", `Welcome. Confirm your address to finish creating your account:\n\n${link(`/verify?token=${token}&next=${encodeURIComponent(next)}`)}\n\nThis link works for 2 days.`);
  });
}

export async function confirmEmail(f: FormData) {
  const token = str(f, "token"), next = safeNext(str(f, "next"));
  return run(`/verify?token=${token}`, `/signin?next=${encodeURIComponent(next)}`, "Email confirmed. You can sign in.", async () => {
    const t = await consumeToken("verify_email", token);
    if (!t?.user_id) fail("That link has expired or was already used. Request a new one.");
    await asService((db) => db.q("update identity.users set email_verified_at = now() where id = $1", [t!.user_id]));
  });
}

export async function resendVerification(f: FormData) {
  const email = str(f, "email").toLowerCase();
  return run("/verify", "/verify?sent=1", "If that address has an unconfirmed account, we've sent a new link.", async () => {
    const u = await asService((db) => db.one<{ id: string }>("select id from identity.users where email = $1 and email_verified_at is null", [email]));
    if (u) { const t = await issueToken("verify_email", u.id, "2 days"); await sendMail(email, "Confirm your email", `Confirm your address: ${link(`/verify?token=${t}`)}`); }
  });
}

export async function signIn(f: FormData): Promise<never> {
  const email = str(f, "email").toLowerCase(), password = String(f.get("password") ?? ""), next = safeNext(str(f, "next"));
  let needs2fa = false;
  return run(`/signin?next=${encodeURIComponent(next)}`, next, "", async () => {
    const outcome = await asService(async (db) => {
      const u = await db.one<{ id: string; password_hash: string; email_verified_at: string | null; totp_enabled: boolean; failed_attempts: number; locked_until: string | null; status: string }>(
        "select id, password_hash, email_verified_at, totp_enabled, failed_attempts, locked_until, status from identity.users where email = $1", [email]);
      const ok = await verifyPassword(password, u?.password_hash ?? DUMMY_HASH);   // always hash: equal timing whether or not the account exists
      if (!u || u.status !== "active") return { error: "That email and password don't match." };
      if (u.locked_until && new Date(u.locked_until) > new Date()) {
        return { error: `Too many failed attempts. Try again in ${Math.max(1, Math.ceil((new Date(u.locked_until).getTime() - Date.now()) / 60000))} minutes, or reset your password.` };
      }
      if (!ok) {
        await db.q("update identity.users set failed_attempts = failed_attempts + 1, locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end where id = $1", [u.id]);
        return { error: "That email and password don't match." };
      }
      if (!u.email_verified_at) return { error: "Confirm your email first. Use the link we sent, or request a new one on the confirmation page." };
      await db.q("update identity.users set failed_attempts = 0, locked_until = null where id = $1", [u.id]);
      return { userId: u.id, totp: u.totp_enabled };
    });
    if ("error" in outcome && outcome.error) fail(outcome.error);
    needs2fa = !!(outcome as { totp?: boolean }).totp;
    await createSession((outcome as { userId: string }).userId, needs2fa);
    return needs2fa ? `/2fa?next=${encodeURIComponent(next)}` : next;
  });
}

export async function verifySecondFactor(f: FormData) {
  const code = str(f, "code").replace(/\s/g, ""), next = safeNext(str(f, "next"));
  return run(`/2fa?next=${encodeURIComponent(next)}`, next, "", async () => {
    const s = await currentSession(); if (!s || !s.pending2fa) fail("Sign in again.");
    // Errors are returned, not thrown, so the failed-attempt counter commits.
    const error = await asService(async (db) => {
      const u = (await db.one<{ totp_secret: string | null; recovery_code_hashes: string[]; failed_attempts: number; locked_until: string | null }>(
        "select totp_secret, recovery_code_hashes, failed_attempts, locked_until from identity.users where id = $1", [s!.id]))!;
      if (u.locked_until && new Date(u.locked_until) > new Date()) return "Too many attempts. Try again in a few minutes.";
      let ok = !!u.totp_secret && verifyTotp(u.totp_secret, code);
      if (!ok) {
        const h = sha256(code.toLowerCase());
        if (u.recovery_code_hashes.includes(h)) { ok = true; await db.q("update identity.users set recovery_code_hashes = array_remove(recovery_code_hashes, $2) where id = $1", [s!.id, h]); }
      }
      if (!ok) {
        await db.q("update identity.users set failed_attempts = failed_attempts + 1, locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else null end where id = $1", [s!.id]);
        return "That code isn't right. Check your authenticator app, or use a recovery code.";
      }
      await db.q("update identity.users set failed_attempts = 0, locked_until = null where id = $1", [s!.id]);
      await db.q("update identity.sessions set pending_2fa = false, expires_at = now() + interval '14 days' where id = $1", [s!.sessionId]);
      return null;
    });
    if (error) fail(error);
    return next;
  });
}

export async function signOut() { await endSession(); redirect("/signin?out=1"); }

export async function requestReset(f: FormData) {
  const email = str(f, "email").toLowerCase();
  return run("/forgot", "/forgot", "If that address has an account, we've sent a reset link. It works for one hour.", async () => {
    const u = await asService((db) => db.one<{ id: string }>("select id from identity.users where email = $1 and status = 'active'", [email]));
    if (u) { const t = await issueToken("reset_password", u.id, "1 hour"); await sendMail(email, "Reset your password", `Choose a new password: ${link(`/reset?token=${t}`)}\n\nIf you didn't ask for this, ignore this email; your password hasn't changed.`); }
  });
}

export async function resetPassword(f: FormData) {
  const token = str(f, "token"), password = String(f.get("password") ?? "");
  return run(`/reset?token=${token}`, "/signin", "Password changed. Sign in with the new one. All other devices were signed out.", async () => {
    const pre = await asService((db) => db.one<{ email: string }>("select u.email from identity.tokens t join identity.users u on u.id = t.user_id where t.token_hash = $1 and t.kind = 'reset_password' and t.used_at is null and t.expires_at > now()", [sha256(token)]));
    if (!pre) fail("That link has expired or was already used. Request a new one.");
    const problem = passwordProblem(password, pre!.email); if (problem) fail(problem);
    const t = await consumeToken("reset_password", token); if (!t?.user_id) fail("That link has expired or was already used.");
    const hash = await hashPassword(password);
    await asService(async (db) => {
      await db.q("update identity.users set password_hash = $2, failed_attempts = 0, locked_until = null where id = $1", [t!.user_id, hash]);
      await db.q("delete from identity.sessions where user_id = $1", [t!.user_id]);
    });
  });
}

export async function acceptInvitation(f: FormData) {
  const token = str(f, "token");
  return run(`/invite/${token}`, "/", "You've joined the workspace.", async () => {
    const s = await currentSession(); if (!s) redirect(`/signin?next=${encodeURIComponent(`/invite/${token}`)}`);
    const t = await consumeToken("invitation", token);
    if (!t) fail("This invitation has expired or was already used. Ask for a new one.");
    const { invitation_id, company_id } = t!.payload as { invitation_id: string; company_id: string };
    const companyId = await asService(async (db) => {
      const inv = await db.one<{ email: string; role_id: string; branch_ids: string[]; brand_ids: string[]; region_ids: string[]; status: string; expires_at: string }>("select email, role_id, branch_ids, brand_ids, region_ids, status, expires_at from invitations where id = $1 and company_id = $2 for update", [invitation_id, company_id]);
      if (!inv || inv.status !== "pending" || new Date(inv.expires_at) < new Date()) fail("This invitation is no longer valid. Ask for a new one.");
      if (inv!.email.toLowerCase() !== s!.email.toLowerCase()) fail(`This invitation was sent to ${inv!.email}. Sign in with that address to accept it.`);
      const m = await db.one<{ id: string }>(
        `insert into memberships(company_id, user_id, status, branch_ids, brand_ids, region_ids) values ($1,$2,'active',$3,$4,$5)
         on conflict (company_id, user_id) do update set status = 'active', branch_ids = excluded.branch_ids, brand_ids = excluded.brand_ids, region_ids = excluded.region_ids returning id`, [company_id, s!.id, inv!.branch_ids, inv!.brand_ids, inv!.region_ids]);
      await db.q("insert into membership_roles(membership_id, role_id, company_id) values ($1,$2,$3) on conflict do nothing", [m!.id, inv!.role_id, company_id]);
      await db.q("update invitations set status = 'accepted' where id = $1", [invitation_id]);
      return company_id;
    }, s!.id);
    await setWorkspace(companyId);
  });
}
