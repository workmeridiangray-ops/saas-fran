import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/** HMAC signature over `${timestamp}.${body}`; receivers reject old timestamps to block replays. */
export function signPayload(secret: string, body: string, timestampSec: number): string {
  return `t=${timestampSec},v1=${createHmac("sha256", secret).update(`${timestampSec}.${body}`).digest("hex")}`;
}
/** For receivers (and our tests): verify a signature header, with a tolerance window. */
export function verifySignature(secret: string, body: string, header: string, nowSec = Math.floor(Date.now() / 1000), toleranceSec = 300): boolean {
  const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header); if (!m) return false;
  if (Math.abs(nowSec - Number(m[1])) > toleranceSec) return false;
  const expected = Buffer.from(signPayload(secret, body, Number(m[1])).split("v1=")[1]!, "hex"), got = Buffer.from(m[2]!, "hex");
  return expected.length === got.length && timingSafeEqual(expected, got);
}

export const hashKey = (raw: string) => createHash("sha256").update(raw).digest("hex");
/** nmk_<8 char id>_<secret>: the id lets us find the key row; only the hash of the whole key is stored. */
export function newApiKey() {
  const id = randomBytes(6).toString("hex").slice(0, 8), secret = randomBytes(24).toString("base64url");
  const raw = `nmk_${id}_${secret}`; return { raw, prefix: `nmk_${id}`, hash: hashKey(raw) };
}
export function parseApiKey(raw: string): { prefix: string } | null { const m = /^(nmk_[0-9a-f]{8})_[A-Za-z0-9_-]{20,}$/.exec(raw); return m ? { prefix: m[1]! } : null; }
export function keyMatches(raw: string, storedHash: string): boolean {
  const a = Buffer.from(hashKey(raw)), b = Buffer.from(storedHash); return a.length === b.length && timingSafeEqual(a, b);
}

/** True for addresses a webhook must never reach: loopback, private, link-local (cloud metadata), CGNAT, multicast, unspecified. */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip); if (!v) return true;
  if (v === 6) {
    const x = ip.toLowerCase();
    if (x === "::1" || x === "::" || x.startsWith("fe80:") || x.startsWith("fc") || x.startsWith("fd") || x.startsWith("ff")) return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(x); return mapped ? isPrivateAddress(mapped[1]!) : false;
  }
  const [a, b] = ip.split(".").map(Number) as [number, number];
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
}
export function urlProblem(u: string): string | null {
  let url: URL; try { url = new URL(u); } catch { return "Enter a full web address, such as https://example.com/hooks."; }
  if (url.protocol !== "https:" && !(process.env.WEBHOOK_ALLOW_PRIVATE === "1" && url.protocol === "http:")) return "Webhook addresses must start with https://.";
  if (url.username || url.password) return "Don't put a username or password in the address.";
  if (!url.hostname || url.hostname === "localhost" && process.env.WEBHOOK_ALLOW_PRIVATE !== "1") return "That address can't be reached from the internet.";
  return null;
}
/** Resolve the host now and refuse private targets. Called before every delivery, not just when the endpoint is saved. */
export async function assertPublicHost(u: string): Promise<void> {
  const p = urlProblem(u); if (p) throw new Error(p);
  if (process.env.WEBHOOK_ALLOW_PRIVATE === "1") return;
  const host = new URL(u).hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) throw new Error("That address resolves to a private network and can't be used.");
}
/** Seconds to wait before attempt n+1 (n = attempts so far): 1m, 5m, 30m, 2h, 12h. */
export const BACKOFF_SEC = [60, 300, 1800, 7200, 43200];
export const MAX_ATTEMPTS = 6;
export const nextDelay = (attemptsSoFar: number) => BACKOFF_SEC[Math.min(attemptsSoFar - 1, BACKOFF_SEC.length - 1)]!;
