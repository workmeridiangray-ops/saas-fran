import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";
const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const N = 2 ** 15, r = 8, p = 1, LEN = 64;
const opts = { N, r, p, maxmem: 128 * N * r * 2 };

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, LEN, opts);
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${key.toString("base64")}`;
}
export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, rr, pp, salt, hash] = stored.split("$");
  if (alg !== "scrypt" || !salt || !hash) return false;
  const key = await scrypt(pw, Buffer.from(salt, "base64"), LEN, { N: Number(n), r: Number(rr), p: Number(pp), maxmem: 128 * Number(n) * Number(rr) * 2 });
  const expected = Buffer.from(hash, "base64");
  return key.length === expected.length && timingSafeEqual(key, expected);
}
/** Returns an error message, or null when acceptable. */
export function passwordProblem(pw: string, email = ""): string | null {
  if (pw.length < 10) return "Use at least 10 characters.";
  if (pw.length > 200) return "That password is too long.";
  if (/^(.)\1+$/.test(pw)) return "Avoid repeating a single character.";
  const local = email.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && pw.toLowerCase().includes(local)) return "Don't include your email name in the password.";
  if (["password12", "1234567890", "qwertyuiop"].some((c) => pw.toLowerCase().startsWith(c))) return "That password is too common.";
  return null;
}
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export function newRecoveryCodes(n = 8): string[] {
  return Array.from({ length: n }, () => randomBytes(5).toString("hex").replace(/(.{5})(.{5})/, "$1-$2"));
}
