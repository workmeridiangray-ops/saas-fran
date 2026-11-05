import { redirect } from "next/navigation";
import { friendly } from "@/lib/db";

const withParam = (path: string, k: string, v: string) => `${path}${path.includes("?") ? "&" : "?"}${k}=${encodeURIComponent(v)}`;

/**
 * Run a server action body. On success redirect to `okPath` with a message; on failure redirect to
 * `errPath` with a readable error. Nothing is saved on failure (each body is one transaction).
 * `fn` may return a path to override `okPath` (for example, to open the record it created).
 */
export async function run(errPath: string, okPath: string, okMsg: string, fn: () => Promise<string | void>): Promise<never> {
  let err: string | null = null; let dest = okPath;
  try { const r = await fn(); if (typeof r === "string") dest = r; }
  catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    err = e instanceof UserError ? e.message : friendly(e);
  }
  redirect(err ? withParam(errPath, "err", err) : withParam(dest, "ok", okMsg));
}
/** A validation problem we raised ourselves; the message is already user-ready. */
export class UserError extends Error {}
export const fail = (msg: string): never => { throw new UserError(msg); };
export const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
export const num = (f: FormData, k: string) => Number(String(f.get(k) ?? "").trim());
export const uuid = (f: FormData, k: string) => {
  const v = str(f, k); if (!/^[0-9a-f-]{36}$/i.test(v)) fail("A required choice is missing."); return v;
};
